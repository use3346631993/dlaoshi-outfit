/**
 * Behaviour test for the Host half of the maid-outfit standee.
 *
 * The standee shows the current turn's token cost and think latency. Both are
 * computed on the Host from official seams, so this test drives `index.js` with
 * a fake Cordis context and a fake session event stream:
 *
 *   - turn/start resets the accounting and starts the clock;
 *   - every assistant/message adds the provider's exact usage;
 *   - turn/end freezes the totals;
 *   - the llm/stream tap records the first output token (think latency);
 *   - GET /fatfish/stats returns exactly what the browser bubble needs;
 *   - a new turn replaces the previous numbers (no stale carry-over);
 *   - non-loopback requests are refused;
 *   - the stream is passed through untouched for every consumer.
 *
 * Run: node verify_turn_stats.cjs
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const HOST = path.join(__dirname, '..', 'index.js')
const source = fs.readFileSync(HOST, 'utf8')

/* ------------------------------------------------------- fake Cordis ctx -- */

const listeners = new Map()
const routes = []
const effects = []
const promptSections = []

/** Fake account provider: the same outcome shape the platform service returns. */
const accountCalls = []
let accountBalanceOutcome = {
  status: 'ready',
  value: [{ currency: 'CNY', balance: '12.34' }],
  bonusWallets: [{ currency: 'CNY', balance: '0.00' }],
}
const fakeAccount = {
  getBalance(meta) {
    accountCalls.push(meta)
    return Promise.resolve(accountBalanceOutcome)
  },
}

const ctx = {
  on(name, handler) {
    if (!listeners.has(name)) listeners.set(name, [])
    listeners.get(name).push(handler)
    return () => {
      const list = listeners.get(name) || []
      const i = list.indexOf(handler)
      if (i >= 0) list.splice(i, 1)
    }
  },
  effect(factory) {
    const dispose = factory()
    effects.push(dispose)
    return () => { if (typeof dispose === 'function') dispose() }
  },
  /** Lazy dependency: the plugin must load even when the account is absent. */
  inject(deps, callback) {
    if (deps.includes('deepseekAccount') && callback) callback({ deepseekAccount: fakeAccount })
    if (deps.includes('systemPrompt') && callback) {
      callback({ systemPrompt: { section(section) { promptSections.push(section); return () => {} } } })
    }
    return () => {}
  },
  webServer: {
    register(route) { routes.push(route); return () => {} },
  },
}

function emit(name, ...args) {
  for (const handler of listeners.get(name) || []) handler(...args)
}

/* ----------------------------------------------------------- fake session -- */

const SESSION = 'session-test'
let seq = 0
function makeSession(id) { return { id: id || SESSION } }
function event(type, data, time) {
  return { type, seq: seq++, time, data }
}
const T0 = 1_700_000_000_000

/* ------------------------------------------------------------- the plugin -- */

// The Host module is ESM; evaluate it as an ES module via a data: URL import.
// A temporary HOME keeps the persona setting (which the Host persists under
// ~/.dsh/fatfish-outfit) out of the real user profile and makes runs repeatable.
const os = require('os')
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-outfit-home-'))
const realUserProfile = process.env.USERPROFILE
const realHome = process.env.HOME
process.env.USERPROFILE = tmpHome
process.env.HOME = tmpHome
process.on('exit', () => {
  try { fs.rmSync(tmpHome, { recursive: true, force: true }) } catch (err) { /* best effort */ }
  if (realUserProfile === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = realUserProfile
  if (realHome === undefined) delete process.env.HOME
  else process.env.HOME = realHome
})

async function loadHost() {
  const url = 'data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64')
  return import(url)
}

/* ------------------------------------------------------------ assertions -- */

let failures = 0
function check(label, expected, actual) {
  const ok = JSON.stringify(expected) === JSON.stringify(actual)
  if (!ok) failures += 1
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}  expected=${JSON.stringify(expected)}  actual=${JSON.stringify(actual)}`)
}

/** Invoke the registered stats route the way the HTTP server would. */
function requestStats({ url = '/fatfish/stats', remote = '127.0.0.1' } = {}) {
  const route = routes.find((r) => r.path === '/fatfish/stats')
  if (!route) throw new Error('stats route was never registered')
  let status = 0
  let body = ''
  const res = {
    writeHead(code) { status = code; return this },
    end(chunk) { body = String(chunk || '') },
  }
  route.handler({ url, socket: { remoteAddress: remote } }, res)
  return { status, body: body ? JSON.parse(body) : null }
}

/** Invoke the mount beacon the way the browser would. */
function requestHello({ remote = '127.0.0.1' } = {}) {
  const route = routes.find((r) => r.path === '/fatfish/hello')
  if (!route) throw new Error('hello route was never registered')
  let status = 0
  const res = {
    writeHead(code) { status = code; return this },
    end() {},
  }
  route.handler({ url: '/fatfish/hello', socket: { remoteAddress: remote } }, res)
  return status
}

/** Invoke the balance route the way the browser would. */
async function requestBalance({ remote = '127.0.0.1' } = {}) {
  const route = routes.find((r) => r.path === '/fatfish/balance')
  if (!route) throw new Error('balance route was never registered')
  let status = 0
  let body = ''
  const res = {
    writeHead(code) { status = code; return this },
    end(chunk) { body = String(chunk || '') },
  }
  await route.handler({ url: '/fatfish/balance', socket: { remoteAddress: remote } }, res)
  return { status, body: body ? JSON.parse(body) : null }
}

/** Invoke the persona route the way the browser would. */
function requestPersona({ method = 'GET', payload = null, remote = '127.0.0.1' } = {}) {
  const route = routes.find((r) => r.path === '/fatfish/persona')
  if (!route) throw new Error('persona route was never registered')
  let status = 0
  let body = ''
  const res = {
    writeHead(code) { status = code; return this },
    end(chunk) { body = String(chunk || '') },
  }
  const req = {
    method,
    url: '/fatfish/persona',
    socket: { remoteAddress: remote },
    on(name, handler) {
      if (name === 'data' && payload !== null) handler(Buffer.from(JSON.stringify(payload)))
      if (name === 'end') handler()
    },
    destroy() {},
  }
  route.handler(req, res)
  return { status, body: body ? JSON.parse(body) : null }
}

/** Drive one llm/stream call through the tap and collect the chunks. */
async function runStream(mutator) {
  const options = { sessionId: SESSION, provider: 'deepseek-official', model: 'deepseek-chat' }
  let returned
  const handler = (listeners.get('llm/stream') || [])[0]
  if (!handler) throw new Error('no llm/stream listener')
  const chunks = [
    { type: 'block-start' },
    { type: 'text-delta', text: '你好' },
    { type: 'usage', usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } },
    { type: 'finish', reason: { kind: 'completed' } },
  ]
  returned = handler(options, () => (async function* () { for (const c of chunks) yield c })())
  const seen = []
  for await (const chunk of returned) {
    seen.push(chunk)
    if (typeof mutator === 'function') mutator(chunk)
  }
  return seen
}

;(async () => {
  const host = await loadHost()
  check('host injects webServer', ['webServer'], host.inject)
  host.apply(ctx)
  check('stats route registered', 1, routes.filter((r) => r.path === '/fatfish/stats').length)
  check('client beacon route registered', 1, routes.filter((r) => r.path === '/fatfish/hello').length)
  check('beacon answers', 200, requestHello())
  check('beacon is loopback only', 403, requestHello({ remote: '10.0.0.7' }))
  check('no turn yet -> null stats', null, requestStats().body.stats)

  const session = makeSession()

  // ---- turn 1: two model steps, exact usage from the durable events -------
  emit('session/event', session, event('turn/start', { turn: 3 }, T0))
  let snapshot = requestStats().body.stats
  check('turn/start opens the turn', 3, snapshot.turn)
  check('turn/start marks it running', true, snapshot.running)
  check('fresh turn has zero tokens', 0, snapshot.totalTokens)

  // the tap measures the first output token of the first model call
  const seen = await runStream()
  check('stream chunks pass through untouched', 4, seen.length)
  check('stream keeps its usage chunk', 'usage', seen[2].type)

  snapshot = requestStats().body.stats
  check('think latency was recorded', true, snapshot.thinkMs !== null && snapshot.thinkMs >= 0)
  check('think latency never exceeds the turn', true, snapshot.thinkMs <= snapshot.elapsedMs + 5)

  emit('session/event', session, event('assistant/message', {
    turn: 3, step: 1,
    usage: { inputTokens: 120, outputTokens: 40, cacheReadTokens: 800, cacheWriteTokens: 0, totalTokens: 960 },
  }, T0 + 900))
  emit('session/event', session, event('assistant/message', {
    turn: 3, step: 2,
    usage: { inputTokens: 30, outputTokens: 210, cacheReadTokens: 1600, cacheWriteTokens: 0, totalTokens: 1840 },
  }, T0 + 2000))
  snapshot = requestStats().body.stats
  check('tokens add up across steps', 2800, snapshot.totalTokens)
  check('input tokens add up', 150, snapshot.inputTokens)
  check('output tokens add up', 250, snapshot.outputTokens)
  check('cache reads add up', 2400, snapshot.cacheReadTokens)
  check('steps counted', 2, snapshot.steps)

  emit('session/event', session, event('turn/end', { turn: 3, reason: { kind: 'completed' } }, T0 + 5000))
  snapshot = requestStats().body.stats
  check('turn/end freezes the turn', false, snapshot.running)
  check('turn/end keeps the totals', 2800, snapshot.totalTokens)
  check('turn end reason is reported', 'completed', snapshot.reason)
  check('elapsed covers the whole turn', 5000, snapshot.elapsedMs)

  // ---- turn 2: a fresh turn must replace the previous numbers -------------
  emit('session/event', session, event('turn/start', { turn: 4 }, T0 + 60_000))
  snapshot = requestStats().body.stats
  check('a new turn resets the counter', 0, snapshot.totalTokens)
  check('a new turn resets the steps', 0, snapshot.steps)
  check('a new turn clears the think latency', null, snapshot.thinkMs)
  check('the new turn number is reported', 4, snapshot.turn)

  emit('session/event', session, event('assistant/message', {
    turn: 4, step: 1,
    usage: { inputTokens: 5, outputTokens: 7, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 12 },
  }, T0 + 61_000))
  snapshot = requestStats().body.stats
  check('previous turn cannot leak into the new one', 12, snapshot.totalTokens)

  // ---- a usage from a different turn is ignored ---------------------------
  emit('session/event', session, event('assistant/message', {
    turn: 99, step: 1,
    usage: { inputTokens: 1000, outputTokens: 1000, totalTokens: 2000 },
  }, T0 + 62_000))
  check('usage from another turn is ignored', 12, requestStats().body.stats.totalTokens)

  // ---- the session parameter selects the right accounting ----------------
  const other = makeSession('session-other')
  emit('session/event', other, event('turn/start', { turn: 1 }, T0 + 70_000))
  emit('session/event', other, event('assistant/message', {
    turn: 1, step: 1,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 42 },
  }, T0 + 70_500))
  check('explicit session targets its own turn', 42,
    requestStats({ url: '/fatfish/stats?session=session-other' }).body.stats.totalTokens)
  check('default reads the latest session', 42,
    requestStats().body.stats.totalTokens)
  check('the first session is still intact', 12,
    requestStats({ url: '/fatfish/stats?session=session-test' }).body.stats.totalTokens)

  // ---- the wallet balance route ------------------------------------------
  check('balance route registered', 1, routes.filter((r) => r.path === '/fatfish/balance').length)
  const wallet = await requestBalance()
  check('balance answers ok', true, wallet.body.ok)
  check('balance currency is CNY', 'CNY', wallet.body.currency)
  check('balance value is the wallet amount', '12.34', wallet.body.balance)
  check('balance reads the official account service', true, accountCalls.length >= 1)
  check('balance sends the client identity', true,
    typeof accountCalls[0].version === 'string'
    && typeof accountCalls[0].locale === 'string'
    && typeof accountCalls[0].timezoneOffsetSeconds === 'number')
  check('balance is loopback only', 403, (await requestBalance({ remote: '10.0.0.7' })).status)

  // the wallet is cached: /stats carries it and does not hit the platform again
  const statsWithBalance = requestStats().body
  check('stats carries the cached wallet', 'CNY', statsWithBalance.balance && statsWithBalance.balance.currency)
  check('stats carries the cached amount', '12.34', statsWithBalance.balance && statsWithBalance.balance.balance)
  const callsAfterCache = accountCalls.length
  requestStats()
  check('the stats poll does not re-hit the platform within the TTL', callsAfterCache, accountCalls.length)

  // a signed-out / not-ready account must answer gracefully, not throw
  accountBalanceOutcome = { status: 'failed' }
  const failed = await requestBalance()
  check('not-ready balance reports a reason', 'not-ready:failed',
    failed.body.ok === false ? failed.body.reason : 'ok')

  // ---- diagnostics: the probe counters prove the browser half ran ---------
  const dbg = requestStats({ url: '/fatfish/stats?debug=1' }).body
  check('debug exposes the client probe', true,
    dbg.debug !== undefined && dbg.debug.hellos >= 1 && dbg.debug.statsRequests >= 1)
  check('debug exposes the balance probe', true, dbg.debug.balanceRequests >= 1)

  // ---- safety: the route is loopback only --------------------------------
  check('non-loopback is refused', 403, requestStats({ remote: '10.0.0.7' }).status)

  // ---- addressing: one prompt section, updated live ----------------------
  const section = promptSections[0]
  check('persona prompt section registered', 'dlaoshi:address', section && section.name)
  const initialText = section ? section.text({}) : ''
  check('default address is 主人', true, initialText.includes('主人'))
  check('the persona introduces itself as 小D', true, initialText.includes('小D'))
  check('cute particles are listed', true,
    initialText.includes('喵') && initialText.includes('呐') && initialText.includes('咕'))
  check('the rule protects answer habits', true, initialText.includes('保持原样'))

  const saved = requestPersona({ method: 'POST', payload: { enabled: true, address: '老板', tone: false } })
  check('persona save answers ok', true, saved.body && saved.body.ok === true)
  check('persona save normalises the address', '老板', saved.body && saved.body.persona.address)
  const updatedText = section ? section.text({}) : ''
  check('prompt uses the new address immediately', true, updatedText.includes('老板'))
  check('tone switch removes the particle rule', false, updatedText.includes('喵~'))

  const readBack = requestPersona()
  check('persona reads back', '老板', readBack.body && readBack.body.persona.address)

  const disabled = requestPersona({ method: 'POST', payload: { enabled: false, address: '老板', tone: true } })
  const offText = section ? section.text({}) : 'x'
  check('disabled persona forbids the style explicitly', true,
    offText.includes('\u4e0d\u8981\u4f7f\u7528\u4efb\u4f55\u79f0\u547c'))
  check('disabled persona still ships a section (so history cannot win)', true, offText.length > 0)

  // ---- dispose releases the route ---------------------------------------
  for (const dispose of effects) if (typeof dispose === 'function') dispose()
  check('effect dispose is callable', true, typeof effects[0] === 'function')

  console.log(failures === 0 ? '\nALL TURN-STATS CHECKS PASSED' : `\n${failures} turn-stats check(s) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
