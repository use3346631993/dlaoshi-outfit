/**
 * Host half of the 「小D」 (dsh-xiaod-pet) outfit.
 *
 * The presentation lives in the Client half; this seat exists to answer one
 * question for the composer standee: how much did THIS turn consume (tokens)
 * and how long did it think?
 *
 * Data sources, both official Harness seams:
 *   - `session/event` carries the durable turn lifecycle. `turn/start` opens a
 *     turn, every `assistant/message` carries the provider's exact
 *     `data.usage` (inputTokens / outputTokens / cacheRead / cacheWrite /
 *     totalTokens), and `turn/end` closes it. Summing the usage samples of one
 *     turn is the same number the Harness' own usage panel shows.
 *   - `llm/stream` is the model-call waterfall: the first token-level delta
 *     after a request begins is the first output token, which gives the
 *     think-latency (time to first token).
 *
 * The Client polls `GET /fatfish/stats?session=<id>`; the route is loopback
 * only and returns the latest tracked turn for that session.
 */

/** The web server is the only service required. */
export const inject = ['webServer']

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BASE = '/fatfish'
const MAX_SESSIONS = 16
const LOOPBACKS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/* ------------------------------------------------------------ persona ----- */

/** Where the "how should it address me" setting lives (survives restarts). */
const PERSONA_PATH = path.join(os.homedir(), '.dsh', 'fatfish-outfit', 'persona.json')
const DEFAULT_PERSONA = { enabled: true, address: '主人', tone: true }

function loadPersona() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PERSONA_PATH, 'utf8'))
    return {
      enabled: parsed.enabled !== false,
      address: typeof parsed.address === 'string' && parsed.address.trim()
        ? parsed.address.trim().slice(0, 24)
        : DEFAULT_PERSONA.address,
      tone: parsed.tone !== false,
    }
  } catch (err) {
    return { ...DEFAULT_PERSONA }
  }
}

function savePersona(persona) {
  try {
    fs.mkdirSync(path.dirname(PERSONA_PATH), { recursive: true })
    fs.writeFileSync(PERSONA_PATH, JSON.stringify(persona, null, 2), 'utf8')
  } catch (err) { /* best effort: the setting still applies for this run */ }
}

/**
 * The prompt section that carries the persona: self-name, how it addresses the
 * user, and the cute sentence-final particles.
 *
 * The two switches are independent:
 *   enabled -> how the assistant addresses the user
 *   tone    -> whether it uses the cute sentence-final particles
 * Both off is the fully neutral state.
 *
 * The off branches never return an empty section: an empty section leaves the
 * model free to imitate the style already present in the conversation history,
 * which is exactly what users saw when they switched it off mid-session. Each
 * disabled half therefore carries an explicit prohibition instead.
 */
function personaPrompt(persona) {
  const address = persona.address || DEFAULT_PERSONA.address
  const addressOn = !!persona.enabled
  const toneOn = !!persona.tone

  if (!addressOn && !toneOn) {
    return [
      '## 称呼与语气（已关闭，优先级高于对话历史）',
      '- 不要使用任何称呼词（例如「主人」「老板」等），也不要使用语气词（例如「喵」「呐」「呀」「唔」「咕」）。',
      '- 使用中性、专业、平实的表达；不要模仿本对话此前出现过的称呼或语气词。',
      '- 本节规则优先于对话历史里已经形成的说话风格：即使前面的回复里出现过称呼或语气词，从现在起也一律不用。',
    ].join('\n')
  }

  const lines = [
    '## 人格设定：小D（只影响措辞，优先级高于对话历史）',
    '- 本节规则优先于本对话历史里已经形成的说话风格；历史与本节冲突时，一律以本节为准。',
    '- 你的名字是「小D」，是住在 DeepSeek Harness 里的桌宠助手。自我介绍或被问到时，自称「小D」。',
  ]
  if (addressOn) {
    lines.push(`- 在称呼用户时使用「${address}」。`)
  } else {
    lines.push(
      '- 称呼开关已关闭：不要使用任何称呼词（例如「主人」「老板」），也不要模仿对话历史里的称呼。',
    )
  }
  if (toneOn) {
    lines.push(
      '- 语气要可爱、有陪伴感：句尾自然使用语气词，常用「喵~」「呐」「呀」「唔」「咕」；',
      '  每次回复至少用 1 个、最多 3 个，分散在不同句子里，不要每句都加。',
      '- 也可以用一点拟声与感叹，例如「唔…」「咕噜」「喵呜」，但不影响语义。',
      '- 代码块、命令行、报错原文、文件路径里不要加语气词；严肃的排错结论可以少加或只加称呼。',
    )
  } else {
    lines.push(
      '- 语气词开关已关闭：不要使用「喵」「呐」「呀」「唔」「咕」这类语气词，也不要模仿对话历史里的语气词。',
    )
  }
  lines.push(
    '- 这条规则只改变称呼和语气词：回答的事实、结论、结构、代码、工具调用、专业程度与长度都保持原样。',
    '- 不要为了使用称呼而重复用户的话，也不要刻意卖萌或降低信息密度。',
    '- 如果用户使用其他语言，请使用该语言里对应的称呼与语气（例如英文用 "Master"）。',
  )
  return lines.join('\n')
}

/** One turn's accounting; replaced at every `turn/start`. */
function blank(sessionId) {
  return {
    sessionId,
    turn: null,
    running: false,
    startedAt: 0,        // ms epoch, from the durable event time
    firstTokenAt: 0,     // ms epoch, from the llm/stream tap
    endedAt: 0,
    reason: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    steps: 0,
    updatedAt: 0,
  }
}

/** Add one provider-reported usage sample (defensive: usage may be partial). */
function accumulate(stats, usage) {
  if (!usage || typeof usage !== 'object') return
  const add = (key) => {
    const value = usage[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      stats[key] += value
    }
  }
  add('inputTokens')
  add('outputTokens')
  add('cacheReadTokens')
  add('cacheWriteTokens')
  add('totalTokens')
  stats.steps += 1
  stats.updatedAt = Date.now()
}

/** Whether a stream chunk carries the model's first output token. */
function isTokenDelta(chunk) {
  if (!chunk || typeof chunk !== 'object') return false
  if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') return chunk.text !== ''
  if (chunk.type === 'tool-call-delta') return chunk.argumentsDelta !== '' || chunk.name !== undefined
  return false
}

/** Serialise one turn for the browser, deriving the two display metrics. */
function snapshot(stats, now) {
  if (!stats || stats.turn === null) return null
  const end = stats.running ? now : (stats.endedAt || stats.updatedAt || now)
  const thinkMs = stats.firstTokenAt && stats.startedAt
    ? Math.max(0, stats.firstTokenAt - stats.startedAt)
    : null
  const elapsedMs = stats.startedAt ? Math.max(0, end - stats.startedAt) : 0
  return {
    sessionId: stats.sessionId,
    turn: stats.turn,
    running: stats.running,
    thinkMs,
    elapsedMs,
    endedAt: stats.endedAt || null,
    reason: stats.reason,
    inputTokens: stats.inputTokens,
    outputTokens: stats.outputTokens,
    cacheReadTokens: stats.cacheReadTokens,
    cacheWriteTokens: stats.cacheWriteTokens,
    totalTokens: stats.totalTokens,
    steps: stats.steps,
  }
}

function respondJson(res, status, payload) {
  try {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(JSON.stringify(payload))
  } catch (err) {
    /* the socket may already be gone */
  }
}

function isLoopback(req) {
  const addr = req && req.socket && req.socket.remoteAddress
  return typeof addr === 'string' && (LOOPBACKS.has(addr) || addr.startsWith('127.'))
}

export function apply(ctx) {
  /** sessionId -> turn stats */
  const statsBySession = new Map()
  let latestSessionId = null

  const statsFor = (sessionId) => {
    let stats = statsBySession.get(sessionId)
    if (stats === undefined) {
      stats = blank(sessionId)
      statsBySession.set(sessionId, stats)
      while (statsBySession.size > MAX_SESSIONS) {
        let oldest = null
        for (const [id, candidate] of statsBySession) {
          if (id === sessionId) continue
          if (oldest === null || (candidate.updatedAt || 0) < (oldest.stats.updatedAt || 0)) {
            oldest = { id }
          }
        }
        if (oldest === null) break
        statsBySession.delete(oldest.id)
      }
    }
    return stats
  }

  // ---- durable turn lifecycle: exact token accounting --------------------
  ctx.on('session/event', (session, event) => {
    const sessionId = session && session && session.id
    if (typeof sessionId !== 'string') return
    if (!event || typeof event.type !== 'string') return
    const time = typeof event.time === 'number' ? event.time : Date.now()

    if (event.type === 'turn/start') {
      const stats = blank(sessionId)
      stats.turn = event.data && typeof event.data.turn === 'number' ? event.data.turn : 0
      stats.running = true
      stats.startedAt = time
      stats.updatedAt = time
      statsBySession.set(sessionId, stats)
      latestSessionId = sessionId
      return
    }

    const stats = statsBySession.get(sessionId)
    if (stats === undefined) return

    if (event.type === 'assistant/message') {
      const turn = event.data && event.data.turn
      if (typeof turn === 'number' && stats.turn !== null && turn !== stats.turn) return
      if (event.data && event.data.usage !== undefined) {
        accumulate(stats, event.data.usage)
      }
      return
    }

    if (event.type === 'turn/end') {
      const turn = event.data && event.data.turn
      if (typeof turn === 'number' && stats.turn !== null && turn !== stats.turn) return
      stats.running = false
      stats.endedAt = time
      stats.updatedAt = time
      const reason = event.data && event.data.reason
      stats.reason = reason && typeof reason.kind === 'string' ? reason.kind : null
    }
  })

  // ---- first output token: think latency ---------------------------------
  ctx.on('llm/stream', (options, next) => {
    if (!options || options.purpose !== undefined) return next()
    const sessionId = options.sessionId
    if (typeof sessionId !== 'string') return next()
    const inner = next()
    return (async function* tap() {
      let marked = false
      for await (const chunk of inner) {
        if (!marked && isTokenDelta(chunk)) {
          marked = true
          const stats = statsBySession.get(sessionId)
          if (stats !== undefined && stats.running && !stats.firstTokenAt) {
            stats.firstTokenAt = Date.now()
            stats.updatedAt = stats.firstTokenAt
          }
        }
        yield chunk
      }
    })()
  })

  // ---- browser-facing routes ---------------------------------------------
  // The client half pings `/hello` on mount, polls `/stats`, and asks
  // `/balance` when the standee is clicked. Keeping counters here makes "the
  // browser never ran" distinguishable from "stats are empty" without asking
  // the user to open DevTools.
  const clientProbe = {
    hellos: 0, helloAt: 0, statsRequests: 0, statsAt: 0,
    balanceRequests: 0, balanceAt: 0, lastBalance: null,
  }

  // The account service is optional: a lazy dependency keeps the outfit loaded
  // in compositions that have no account provider.
  let accountScope = null
  ctx.inject(['deepseekAccount'], (scope) => {
    accountScope = scope
    return () => { accountScope = null }
  })

  // The balance is NOT real-time on purpose: the wallet is a slow-moving number
  // and a failed platform call must never affect the bubble. One cached read is
  // refreshed at most every 60 s, and every `/stats` poll carries the cache.
  const BALANCE_TTL_MS = 60_000
  const balanceCache = { at: 0, value: null, lastReason: null }
  let balanceRefresh = null

  const refreshBalance = () => {
    if (balanceRefresh !== null) return balanceRefresh
    const account = accountScope && accountScope.deepseekAccount
    if (account === null || account === undefined || typeof account.getBalance !== 'function') {
      balanceCache.lastReason = 'no-account-service'
      return Promise.resolve(null)
    }
    balanceRefresh = Promise.resolve()
      .then(() => account.getBalance({
        version: '0.2.1-rc.2',
        locale: 'zh_CN',
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      }))
      .then((outcome) => {
        if (!outcome || outcome.status !== 'ready' || !Array.isArray(outcome.value) || outcome.value.length === 0) {
          balanceCache.lastReason = 'not-ready:' + (outcome ? outcome.status : 'null')
          return null
        }
        const wallet = outcome.value.find((w) => w && w.currency === 'CNY') || outcome.value[0]
        const value = {
          currency: wallet.currency,
          balance: String(wallet.balance),
          bonus: Array.isArray(outcome.bonusWallets) && outcome.bonusWallets[0]
            ? String(outcome.bonusWallets[0].balance) : null,
        }
        balanceCache.at = Date.now()
        balanceCache.value = value
        balanceCache.lastReason = 'ok'
        clientProbe.lastBalance = value.currency + ':' + value.balance
        return value
      })
      .catch((err) => {
        const message = err && err.message ? String(err.message) : String(err)
        balanceCache.lastReason = 'error:' + message.slice(0, 120)
        clientProbe.lastBalance = balanceCache.lastReason
        return null
      })
      .finally(() => { balanceRefresh = null })
    return balanceRefresh
  }

  /** Cached wallet for the stats payload; kicks a background refresh when stale. */
  const cachedBalance = () => {
    if (Date.now() - balanceCache.at > BALANCE_TTL_MS) refreshBalance()
    return balanceCache.value
  }

  // ---- addressing: one persona section the model sees on every step ------
  // The section text is a function, so changing the setting takes effect on the
  // very next model step without re-registering anything.
  let persona = loadPersona()
  ctx.inject(['systemPrompt'], (scope) => {
    const registry = scope && scope.systemPrompt
    if (!registry || typeof registry.section !== 'function') return
    registry.section({
      name: 'dlaoshi:address',
      order: 9000,
      text: () => personaPrompt(persona),
    })
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${BASE}/persona`,
    handler: (req, res) => {
      if (!isLoopback(req)) {
        respondJson(res, 403, { ok: false, error: 'loopback only' })
        return
      }
      if (req.method === 'POST') {
        let body = ''
        req.on('data', (chunk) => {
          body += chunk
          if (body.length > 4096) req.destroy()
        })
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body || '{}')
            persona = {
              enabled: parsed.enabled !== false,
              address: typeof parsed.address === 'string' && parsed.address.trim()
                ? parsed.address.trim().slice(0, 24)
                : DEFAULT_PERSONA.address,
              tone: parsed.tone !== false,
            }
            savePersona(persona)
            respondJson(res, 200, { ok: true, persona })
          } catch (err) {
            respondJson(res, 400, { ok: false, error: 'invalid json' })
          }
        })
        return
      }
      respondJson(res, 200, { ok: true, persona })
    },
  }), 'fatfish: persona route')

  // Read back exactly what the model is told, for support and for tests: the
  // section text is a function, so this reflects the live setting.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${BASE}/persona/prompt`,
    handler: (req, res) => {
      if (!isLoopback(req)) {
        respondJson(res, 403, { ok: false, error: 'loopback only' })
        return
      }
      respondJson(res, 200, { ok: true, persona, text: personaPrompt(persona) })
    },
  }), 'fatfish: persona prompt preview')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${BASE}/balance`,
    handler: async (req, res) => {
      if (!isLoopback(req)) {
        respondJson(res, 403, { ok: false, error: 'loopback only' })
        return
      }
      clientProbe.balanceRequests += 1
      clientProbe.balanceAt = Date.now()
      const value = await refreshBalance()
      if (value === null) {
        respondJson(res, 200, { ok: false, reason: balanceCache.lastReason || 'unavailable' })
        return
      }
      respondJson(res, 200, { ok: true, ...value })
    },
  }), 'fatfish: balance route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${BASE}/hello`,
    handler: (req, res) => {
      if (!isLoopback(req)) {
        respondJson(res, 403, { ok: false, error: 'loopback only' })
        return
      }
      clientProbe.hellos += 1
      clientProbe.helloAt = Date.now()
      respondJson(res, 200, { ok: true, now: clientProbe.helloAt })
    },
  }), 'fatfish: client beacon')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${BASE}/stats`,
    handler: (req, res) => {
      if (!isLoopback(req)) {
        respondJson(res, 403, { ok: false, error: 'loopback only' })
        return
      }
      let sessionId = null
      let debug = false
      try {
        const url = new URL(req.url || `${BASE}/stats`, 'http://127.0.0.1')
        sessionId = url.searchParams.get('session')
        debug = url.searchParams.get('debug') === '1'
      } catch (err) {
        /* fall through to the latest session */
      }
      clientProbe.statsRequests += 1
      clientProbe.statsAt = Date.now()
      const key = sessionId || latestSessionId
      const stats = key === null ? null : statsBySession.get(key)
      const payload = {
        ok: true,
        now: Date.now(),
        sessionId: key,
        stats: snapshot(stats, Date.now()),
        // cached wallet: rides the same proven channel as the turn numbers
        balance: cachedBalance(),
      }
      if (debug) {
        payload.debug = {
          ...clientProbe,
          trackedSessions: statsBySession.size,
          latestSessionId,
        }
      }
      respondJson(res, 200, payload)
    },
  }), 'fatfish: turn stats route')
}
