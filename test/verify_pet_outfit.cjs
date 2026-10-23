/**
 * Verify the four-expression 「D老师」 pet bundle without a browser.
 *
 * The bundle is one self-contained artifact: the client module table resolves
 * only package-root specifiers, so every sprite travels inline. This harness
 * reimplements the browser boundary (window.__ModuleLoader__.load + the `react`
 * seed module) and then:
 *   1. decodes all six inlined sprites and checks they are real WebP images;
 *   2. exercises apply(): four slot registrations, theme tokens, disposers;
 *   3. renders every occupant and asserts its chrome - the card must carry no
 *      name tag, and the calm expression must be the one rendered;
 *   4. writes pet_preview.html showing all four expressions on both shells.
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const DIR = __dirname
const CLIENT = path.join(DIR, '..', 'client.js')
const PREVIEW = path.join(DIR, 'pet_preview.html')
const source = fs.readFileSync(CLIENT, 'utf8')

/* -------------------------------------------------------- inlined sprites */

const EXPRESSIONS = ['calm', 'happy', 'think', 'sad']

function webpSize(buf) {
  if (buf.slice(0, 4).toString('ascii') !== 'RIFF' || buf.slice(8, 12).toString('ascii') !== 'WEBP') {
    return null
  }
  if (buf.slice(12, 16).toString('ascii') === 'VP8X') {
    return `${1 + buf.readUIntLE(24, 3)}x${1 + buf.readUIntLE(27, 3)}`
  }
  return '?'
}

function decode(uri, label) {
  const comma = uri.indexOf(',')
  if (!uri.startsWith('data:image/webp;base64,') || comma < 0) throw new Error(`${label} is not a webp data URI`)
  const buf = Buffer.from(uri.slice(comma + 1), 'base64')
  const size = webpSize(buf)
  if (!size) throw new Error(`${label} payload is not a RIFF/WEBP image`)
  return { uri, bytes: buf.length, size }
}

const faces = {}
for (const name of EXPRESSIONS) {
  const m = source.match(new RegExp(`${name}: '(data:image/webp;base64,[^']+)'`))
  if (!m) throw new Error(`expression "${name}" is missing from the bundle`)
  const info = decode(m[1], name)
  faces[name] = info.uri
  console.log(`expression ${name.padEnd(6)} ${info.size.padEnd(10)} ${(info.bytes / 1024).toFixed(1)} KB`)
}
const dock = decode(source.match(/const DOCK = '(data:image\/webp;base64,[^']+)'/)[1], 'DOCK')
const full = decode(source.match(/const FULL = '(data:image\/webp;base64,[^']+)'/)[1], 'FULL')
const dockMaid = decode(source.match(/const DOCK_MAID = '(data:image\/webp;base64,[^']+)'/)[1], 'DOCK_MAID')
const chatBg = decode(source.match(/const CHAT_BG = '(data:image\/webp;base64,[^']+)'/)[1], 'CHAT_BG')
console.log(`surface    DOCK   ${dock.size.padEnd(10)} ${(dock.bytes / 1024).toFixed(1)} KB`)
console.log(`surface    FULL   ${full.size.padEnd(10)} ${(full.bytes / 1024).toFixed(1)} KB`)
console.log(`surface    MAID   ${dockMaid.size.padEnd(10)} ${(dockMaid.bytes / 1024).toFixed(1)} KB`)
console.log(`wallpaper  CHAT   ${chatBg.size.padEnd(10)} ${(chatBg.bytes / 1024).toFixed(1)} KB`)

if (new Set(Object.values(faces)).size !== EXPRESSIONS.length) {
  throw new Error('expression images are not distinct - two states would look the same')
}
console.log(`all ${EXPRESSIONS.length} expression images distinct: yes`)

/* ------------------------------------------------------------- React stub */

let hooks = []
const React = {
  createElement(type, props, ...children) {
    const flat = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false)
    return { type, props: props || {}, children: flat }
  },
  useEffect(fn) { hooks.push({ kind: 'effect', fn }) },
  useRef(initial) { const r = { current: initial === undefined ? null : initial }; hooks.push({ kind: 'ref', r }); return r },
  useState(initial) {
    const v = typeof initial === 'function' ? initial() : initial
    hooks.push({ kind: 'state', v })
    return [v, () => {}]
  },
}

/* --------------------------------------------------------------- DOM stub */

function makeNode(tag) {
  return {
    tagName: tag, attributes: {}, children: [], style: {}, dataset: {},
    setAttribute(k, v) { this.attributes[k] = String(v) },
    getAttribute(k) { return this.attributes[k] === undefined ? null : this.attributes[k] },
    removeAttribute(k) { delete this.attributes[k] },
    appendChild(c) { this.children.push(c); return c },
    replaceChildren(...c) { this.children = c },
    remove() {}, addEventListener() {}, removeEventListener() {},
    querySelector() { return null }, querySelectorAll() { return [] },
  }
}
const documentStub = {
  body: { hasAttribute: () => false, style: { setProperty() {} }, appendChild() {}, innerText: '' },
  documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } },
  head: { appendChild() {}, removeChild() {} },
  createElement(tag) { return makeNode(tag) },
  createElementNS(ns, tag) { return makeNode(tag) },
  querySelector() { return null }, querySelectorAll() { return [] }, addEventListener() {},
}

/* -------------------------------------------------------- loader boundary */

let loaded = null
const sandbox = {
  window: {
    __ModuleLoader__: { load(def) { loaded = def } },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    innerWidth: 1440, innerHeight: 900, addEventListener() {},
  },
  document: documentStub,
  MutationObserver: class { constructor(cb) { this.cb = cb } observe() {} disconnect() {} },
  localStorage: { getItem: () => null, setItem() {} },
  setInterval: () => 0, clearInterval() {},
  setTimeout: () => 0, clearTimeout() {},
  console,
}
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

if (!loaded) throw new Error('module never called __ModuleLoader__.load')
const mod = loaded.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require("${name}") - the bundle must be self-contained`)
})
console.log('\nexports:', Object.keys(mod).join(', '), '| inject:', mod.inject.join(', '))

/* --------------------------------------------------------------- apply() */

const registrations = []
const injections = []
const tokenCalls = []
const effects = []
const ctx = {
  slots: {
    inject(name, factory) { injections.push(name); return factory() },
    register(options, component) {
      registrations.push({ options, component })
      return () => {
        const i = registrations.findIndex((r) => r.options === options)
        if (i >= 0) registrations.splice(i, 1)
      }
    },
  },
  theme: { overrideTokens(src, tokens) { tokenCalls.push({ src, tokens }); return () => {} } },
  effect(fn, label) { effects.push({ label, dispose: fn() }) },
}
mod.apply(ctx)

console.log('injections:', injections.join(' | '))
for (const r of registrations) {
  console.log(`  - ${r.options.name}  id=${r.options.id} order=${r.options.order} component=${r.component.name}`)
}
const layer = tokenCalls[0]
if (!layer) throw new Error('no token layer registered')
for (const n of Object.keys(layer.tokens)) {
  const v = layer.tokens[n]
  if (typeof v !== 'object' || typeof v.light !== 'string' || typeof v.dark !== 'string') {
    throw new Error(`token ${n} is not a { light, dark } pair`)
  }
}
console.log(`tokens: ${Object.keys(layer.tokens).length} pairs`)

/* --------------------------------------------------------------- render */

function render(node, depth) {
  const d = depth || 0
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map((c) => render(c, d)).join('')
  if (typeof node.type === 'function') {
    const prev = hooks
    hooks = []
    const out = node.type(Object.assign({}, node.props, { children: node.children }))
    hooks = prev
    return render(out, d + 1)
  }
  const p = node.props || {}
  const attrs = Object.entries(p)
    .filter(([k]) => !['children', 'style', 'className', 'ref'].includes(k))
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${String(v)}"`)).join('')
  const cls = p.className ? ` class="${p.className}"` : ''
  const style = p.style ? ` style="${Object.entries(p.style).map(([k, v]) => `${k}:${v}`).join(';')}"` : ''
  const kids = render(node.children, d + 1)
  return kids ? `<${node.type}${attrs}${cls}${style}>${kids}</${node.type}>` : `<${node.type}${attrs}${cls}${style}/>`
}

// Per-occupant contract. The floating pet must be a bare cut-out (no card,
// backdrop or halo) and it also carries the pinned corner standee, so the
// outfit depends on exactly one slot occupant - the one proven to render.
const expectedById = {
  'dlaoshi-companion': {
    must: [
      'dlao-pet', 'dlao-floaty', 'dlao-face', 'dlao-bubble',
      'dlao-stats', 'dlao-stats-img', dockMaid.uri.slice(0, 60),
      'right:16px', 'bottom:14px',               // pinned to the bottom-right
      faces.calm.slice(0, 60),
    ],
    forbid: ['dlao-tag', 'D老师', 'dlao-card', 'dlao-bleed', 'dlao-halo'],
  },
  'dlaoshi-sidebar': {
    must: ['borderRadius:50%', dock.uri.slice(0, 60)],
    forbid: [],
  },
  'dlaoshi-hero': {
    must: ['drop-shadow', full.uri.slice(0, 60)],
    forbid: [],
  },
  'dlaoshi-theme': {
    must: ['dlao-settings', 'dlao-switch', 'role="switch"', 'aria-checked', '「D老师」主题'],
    forbid: [],
  },
  'dlaoshi-persona': {
    must: ['dlao-persona-row', 'dlao-input', '「小D」怎么称呼你', 'aria-checked'],
    forbid: [],
  },
}

const STATS_SNAPSHOT = {
  sessionId: 'test', turn: 7, running: false, thinkMs: 3200, elapsedMs: 61000,
  endedAt: Date.now(), reason: 'completed', inputTokens: 7608, outputTokens: 308,
  cacheReadTokens: 51200, cacheWriteTokens: 0, totalTokens: 59116, steps: 3,
}

let failures = 0

/* Reversible mount: the loader may apply this module again (hot recompose).
   That must replace the occupant set, not stack a second pet on top of it. */
const beforeReapply = registrations.length
mod.apply(ctx)
if (registrations.length !== beforeReapply) {
  failures += 1
  console.log(`[FAIL] re-apply duplicated slot occupants (${beforeReapply} -> ${registrations.length})`)
} else {
  console.log(`[PASS] re-apply replaces slot occupants instead of duplicating (${registrations.length})`)
}

for (const r of registrations) {
  const contract = expectedById[r.options.id]
  if (contract === undefined) {
    failures += 1
    console.log(`[FAIL] unexpected occupant id=${r.options.id} (${r.options.name})`)
    continue
  }
  const bare = ['conversation.composer.dock', 'shell.overlay'].includes(r.options.name)
  const props = bare ? {} : { size: r.options.name.includes('hero') ? 34 : 24, className: 'hostClass' }
  if (r.options.id === 'dlaoshi-companion') {
    // 1) before the Host answers, the character must already be on screen
    const idleHtml = render(React.createElement(r.component, {}))
    const idleOk = idleHtml.includes('dlao-stats-img')
      && idleHtml.includes(dockMaid.uri.slice(0, 60))
      && !idleHtml.includes('dlao-stats-bubble')
    if (!idleOk) { failures += 1; console.log('[FAIL] corner standee hides itself before the first poll') }
    else console.log('[PASS] corner standee is visible before the first poll (image only, no bubble)')

    // 2) two independent thought bubbles: the turn report and, on click, the
    //    wallet — the balance is never listed beside the token/think lines.
    const reportHtml = render(React.createElement(r.component, {
      stats: STATS_SNAPSHOT,
      previewReport: { turn: 7, tokens: 59116, thinkMs: 3200 },
    }))
    const reportOk = reportHtml.includes('dlao-stats-bubble')
      && reportHtml.includes('dlao-cloud')
      && reportHtml.includes('dlao-cloud-tail-a') && reportHtml.includes('dlao-cloud-tail-b')
      && reportHtml.includes('这轮用掉')
      && reportHtml.includes('小D想了')
      && reportHtml.includes('59.1k')     // total tokens formatted
      && reportHtml.includes('3.2s')      // think time formatted
      && !reportHtml.includes('余额还有')  // balance lives in its own bubble
      && !reportHtml.includes('\u23f1') && !reportHtml.includes('\u26a1')
    if (!reportOk) { failures += 1; console.log('[FAIL] corner standee does not render the report bubble alone') }
    else console.log('[PASS] report bubble carries only token + think time')

    const balanceHtml = render(React.createElement(r.component, {
      stats: STATS_SNAPSHOT,
      previewReport: { turn: 7, tokens: 59116, thinkMs: 3200 },
      previewBalance: { currency: 'CNY', balance: '12.34' },
    }))
    const balanceOk = balanceHtml.includes('dlao-clouds')
      && balanceHtml.includes("data-kind=\"balance\"")
      && balanceHtml.includes('余额还有')
      && balanceHtml.includes('￥12.34')          // two decimals only
      && (balanceHtml.match(/dlao-stats-bubble/g) || []).length === 2
    if (!balanceOk) { failures += 1; console.log('[FAIL] balance does not render as its own bubble') }
    else console.log('[PASS] balance renders as a separate cloud bubble (￥12.34)')

    // 3) the character is pokeable: the click handler must be wired
    const clickable = render(React.createElement(r.component, { stats: STATS_SNAPSHOT }))
    if (!clickable.includes('onClick')) {
      // the HTML renderer drops function props, so check the source instead
      const src = fs.readFileSync(CLIENT, 'utf8')
      if (!src.includes('onClick: poke')) { failures += 1; console.log('[FAIL] standee has no click handler') }
      else console.log('[PASS] standee click handler is wired (poke)')
    } else console.log('[PASS] standee click handler is wired (poke)')
  }
  const html = render(React.createElement(r.component, props))
  const missing = contract.must.filter((x) => !html.includes(x))
  const present = contract.forbid.filter((x) => html.includes(x))
  const ok = html.length > 120 && missing.length === 0 && present.length === 0
  if (!ok) failures += 1
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${r.options.name} (${r.options.id})  html=${html.length}`
    + `  missing=${missing.map((m) => m.slice(0, 16)).join(',') || 'none'}`
    + `  forbidden=${present.join(',') || 'ok'}`)
}

/* ------------------------------------------------------ chat skin checks -- */

const cssText = mod.assets && mod.assets.css
if (!cssText) {
  failures += 1
  console.log('[FAIL] module does not expose its CSS')
} else {
  const skinChecks = [
    ['chat wallpaper', '[data-conversation-content]'],
    ['transparent transcript', '[data-conversation-scroll]'],
    ['composer glass layer', '[data-composer-card]::before'],
    ['composer backdrop blur', 'backdrop-filter: blur(20px)'],
    ['plain-text user message', '[class*="_bubble"]'],
    ['no glass on messages', 'backdrop-filter: none !important'],
    ['plain-text answer', '[data-turn-process-answer]'],
    ['fluid standee width', 'clamp(84px, 9.2vw, 170px)'],
    ['skin switch gating', 'html.dlao-skin-on'],
    ['wallpaper image embedded', chatBg.uri.slice(0, 80)],
  ]
  for (const [label, needle] of skinChecks) {
    const ok = cssText.includes(needle)
    if (!ok) failures += 1
    console.log(`[${ok ? 'PASS' : 'FAIL'}] chat skin: ${label}`)
  }
  const measuresMargin = source.includes("document.querySelector('[data-conversation-content]')")
    && source.includes('getBoundingClientRect')
    && source.includes('free - 12')
  if (!measuresMargin) failures += 1
  console.log(`[${measuresMargin ? 'PASS' : 'FAIL'}] chat skin: standee measures the free margin`)
}

/* --------------------------------------------------- expression preview -- */

const css = mod.assets && mod.assets.css
if (!css) { console.log('[FAIL] module does not expose its CSS'); failures += 1 }
else {
  const card = (face, state, extra) => `
    <div class="cell"><div class="dlao-pet"><div class="dlao-rest" data-state="${state}" data-alive="true">
      <div class="dlao-floaty"><div class="dlao-face"><img class="dlao-img" src="${faces[face]}" alt=""></div></div>
    </div>${extra || ''}</div></div>`

  // the corner standee: the turn report bubble, plus the balance in its OWN
  // bubble when it is shown (click)
  const standee = (time, tokens, balance) => `
    <div class="cell"><div class="dlao-stats demo">
      ${balance ? `
      <div class="dlao-cloud" data-kind="balance">
        <div class="dlao-stats-bubble">
          <span class="dlao-stats-line">主人，余额还有 <b>${balance}</b> 喵~</span>
        </div>
      </div>` : ''}
      <div class="dlao-cloud" data-kind="report">
        <div class="dlao-stats-bubble">
          <span class="dlao-stats-line">主人，这轮用掉 <b>${tokens}</b> token 呐~</span>
          <span class="dlao-stats-line">小D想了 <b>${time}</b> 哦</span>
        </div>
        <span class="dlao-cloud-tail-a"></span>
        <span class="dlao-cloud-tail-b"></span>
      </div>
      <img class="dlao-stats-img" src="${dockMaid.uri}" alt="">
    </div></div>`

  // mock DSH chat pane using the real data attributes the skin targets
  const mockChat = () => `
    <div class="chat-demo">
      <div class="mock" data-conversation-content data-conversation-region="chat">
        <div class="mock-scroll" data-conversation-scroll>
          <div class="mock-row" data-chat-flow-key="u1" data-chat-flow-kind="user">
            <div class="mock_bubble mock-text">帮我把当前聊天页面换成液态玻璃效果，别影响我其他的插件。</div>
          </div>
          <div class="mock-row" data-chat-flow-key="a1" data-turn-process-answer>
            <div class="mock-text">只通过注入 CSS 实现：背景图铺在会话区域，回复与用户消息用 backdrop-filter 做磨砂玻璃，输入框同样换成液态玻璃。不注册新的槽位、不改动交互，其他插件照常工作。</div>
          </div>
          <div class="mock-composer" data-composer-card>
            <div class="mock-input">给 D 老师发消息…</div>
          </div>
        </div>
      </div>
      <div class="mock-cap">液态玻璃 · 聊天背景图 + 回复玻璃面板 + 输入框</div>
      <div class="settings-demo">
        <div class="dlao-settings">
          <div class="dlao-settings-text">
            <div class="dlao-settings-title">「D老师」主题</div>
            <div class="dlao-settings-desc">开启后显示聊天背景壁纸、液态玻璃输入框、桌面桌宠与右下角立牌；关闭则全部隐藏，恢复 DSH 原始界面。</div>
          </div>
          <button class="dlao-switch" type="button" role="switch" aria-checked="true" aria-label="「D老师」主题开关">
            <span class="dlao-switch-knob"></span>
          </button>
        </div>
        <div class="mock-cap">设置 › 通用 › 主题开关（开 / 关）</div>
      </div>
    </div>`

  const page = `<!DOCTYPE html><html lang="zh-CN" class="dlao-skin-on"><head><meta charset="utf-8"><title>expressions</title>
<style>
  html,body { margin:0; height:100%; }
  body { display:flex; align-items:center; justify-content:center; gap:30px; flex-wrap:wrap;
         font:600 12px/1.4 "Segoe UI","Microsoft YaHei",system-ui,sans-serif; }
  .stage { width:1000px; height:400px; display:flex; flex-direction:column;
           align-items:center; justify-content:center; gap:26px; }
  .row { display:flex; align-items:flex-start; justify-content:center; gap:30px; }
  .cell { text-align:center; }
  .cap { margin-top:8px; opacity:.85; }
  .dark { background:#071A26; color:#6EF0D6; }
  .light { background:#F5FBFC; color:#1E4D8F; }
  .demo.dark-bg { background:#071A26; padding:18px 22px; border-radius:12px; }
  .demo.light-bg { background:#F5FBFC; padding:18px 22px; border-radius:12px; }
  ${css}
  .stage .dlao-pet { position:relative; inset:auto; right:auto; bottom:auto; left:auto; top:auto; width:108px; }
  .stage .dlao-stats { position:relative; inset:auto; right:auto; bottom:auto; left:auto; }
  .dlao-stats.demo .dlao-stats-img { width:150px; }
  .cell { position: relative; }
  .settings-demo { margin: 22px 0 10px; padding: 6px 22px; border-radius: 14px;
                   background: rgba(255,255,255,.06); }
  /* screenshots must not catch the bubble mid fade-in */
  .dlao-cloud { animation: none !important; }
  /* mock DSH chat pane: wallpaper + liquid-glass panes */
  .chat-demo { width: 980px; margin: 18px auto 42px; }
  .mock { position: relative; width: 100%; height: 380px; border-radius: 18px; overflow: hidden;
          border: 1px solid rgba(150,190,255,.18); }
  .mock-scroll { position: absolute; inset: 0; padding: 20px 24px;
                 display: flex; flex-direction: column; gap: 16px; }
  .mock-row { max-width: 78%; }
  .mock-text { font: 500 13.5px/1.65 "Segoe UI","Microsoft YaHei",system-ui,sans-serif;
               color: #eaf3ff; }
  /* the real app renders the user message inside a "_bubble" element */
  .mock_bubble { display: inline-block; max-width: 100%; padding: 10px 16px;
                 border-radius: 14px; }
  .mock-composer { margin-top: auto; }
  .mock-input { color: rgba(226,238,255,.72); font-size: 13px; }
  .mock-cap { margin-top: 8px; opacity: .8; text-align: center; }
</style></head><body data-ds-dark-theme>
  <div class="stage dark">
    <div class="row">
      ${card('calm', 'idle', '')}
      ${card('happy', 'happy', '')}
      ${card('think', 'thinking', '<div class="dlao-dots"><i></i><i></i><i></i></div>')}
      ${card('sad', 'sad', '')}
    </div>
    <div class="row">
      <div class="cell"><div class="demo dark-bg">${standee('3.2s', '8.7k', '￥12.34')}</div></div>
      <div class="cell"><div class="demo dark-bg">${standee('1.8s', '3.1k', '')}</div></div>
    </div>
    <div class="cap">深色主题 · 默认 / 开心 / 思考 / 失望 ＋ 右下角立牌（完成 / 进行中）</div>
  </div>
  <div class="stage light">
    <div class="row">
      ${card('calm', 'idle', '')}
      ${card('happy', 'happy', '')}
      ${card('think', 'thinking', '<div class="dlao-dots"><i></i><i></i><i></i></div>')}
      ${card('sad', 'sad', '')}
    </div>
    <div class="row">
      <div class="cell"><div class="demo light-bg">${standee('3.2s', '8.7k', '￥12.34')}</div></div>
      <div class="cell"><div class="demo light-bg">${standee('1.8s', '3.1k', '')}</div></div>
    </div>
    <div class="cap">浅色主题 · 默认 / 开心 / 思考 / 失望 ＋ 右下角立牌（完成 / 进行中）</div>
  </div>
  ${mockChat()}
</body></html>`
  fs.writeFileSync(PREVIEW, page, 'utf8')
  console.log('wrote', path.basename(PREVIEW), (page.length / 1024).toFixed(1), 'KB')
}

for (const e of effects) if (typeof e.dispose === 'function') e.dispose()
console.log('after dispose -> registrations:', registrations.length)

if (failures > 0) { console.log(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nALL CHECKS PASSED')
