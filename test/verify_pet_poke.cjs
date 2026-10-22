/**
 * Behaviour test for the pet's click-to-cycle expressions.
 *
 * Requested behaviour: clicking the pet walks through the expressions, and
 * letting go for a few seconds returns it to the calm face on its own, without
 * fighting the agent-driven states.
 *
 * This drives the REAL handlers (onPointerDown/onPointerUp) through the same
 * fake DOM + virtual clock the state test uses, so a regression in the cycle,
 * the expiry timer, or the sprite mapping is caught here.
 *
 * Run: node verify_pet_poke.cjs
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const CLIENT = path.join(__dirname, '..', 'client.js')
const source = fs.readFileSync(CLIENT, 'utf8')

/* ------------------------------------------------- sprite URIs + clock -- */

const faces = {}
for (const name of ['calm', 'happy', 'think', 'sad']) {
  const m = source.match(new RegExp(`${name}: '(data:image/webp;base64,[^']{64})`))
  if (!m) throw new Error(`sprite ${name} missing`)
  faces[name] = m[1]
}
const faceKeyOf = (src) => Object.keys(faces).find((k) => src && src.startsWith(faces[k]))

let now = 0
let seq = 0
const timers = new Map()
let intervals = []
const setTimeoutFake = (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + (ms || 0) }); return id }
const clearTimeoutFake = (id) => { timers.delete(id) }
const setIntervalFake = (fn, ms) => { const id = ++seq; intervals.push({ id, fn, every: ms || 0, next: now + (ms || 0) }); return id }
const clearIntervalFake = (id) => { intervals = intervals.filter((i) => i.id !== id) }

function advance(ms) {
  const target = now + ms
  for (;;) {
    let next = null
    for (const [id, t] of timers) if (t.at <= target && (!next || t.at < next.t.at)) next = { id, t }
    let nextI = null
    for (const i of intervals) if (i.next <= target && (!nextI || i.next < nextI.next)) nextI = i
    const useTimer = next && (!nextI || next.t.at <= nextI.next)
    if (!useTimer && !nextI) break
    if (useTimer) { now = Math.max(now, next.t.at); timers.delete(next.id); next.t.fn() }
    else { now = Math.max(now, nextI.next); nextI.next += nextI.every; nextI.fn() }
  }
  now = target
}

/* ---------------------------------------------------------------- DOM -- */

const surface = { transcript: '', running: false, alert: false, retry: false }
const transcriptEl = {
  nodeType: 1, tagName: 'DIV', children: [], shadowRoot: null,
  getAttribute: (n) => (n === 'data-conversation-scroll' ? '' : null),
  get textContent() { return surface.transcript },
}
const documentStub = {
  body: { hasAttribute: () => false, style: { setProperty() {} }, appendChild() {} },
  documentElement: {
    nodeType: 1, tagName: 'HTML', shadowRoot: null, getAttribute: () => null,
    classList: { toggle() {}, add() {}, remove() {} },
    children: [transcriptEl],
  },
  head: { appendChild() {}, removeChild() {} },
  createElement: () => ({ dataset: {}, style: {}, textContent: '', remove() {} }),
  createElementNS: () => ({ setAttribute() {}, appendChild() {} }),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
}

/* -------------------------------------------------------- React harness -- */

let hooks = []
let tree = null
const effects = []
const stateSlots = new Map()
const refSlots = new Map()
let slotSeq = 0

const React = {
  createElement(type, props, ...children) {
    const flat = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false)
    return { type, props: props || {}, children: flat }
  },
  useEffect(fn) { const rec = { fn }; hooks.push({ kind: 'effect', rec }); effects.push(rec) },
  useRef(initial) {
    const key = 'ref' + slotSeq++
    if (!refSlots.has(key)) refSlots.set(key, { current: initial === undefined ? null : initial })
    const r = refSlots.get(key)
    hooks.push({ kind: 'ref', r })
    return r
  },
  useState(initial) {
    const key = 'state' + slotSeq++
    if (!stateSlots.has(key)) stateSlots.set(key, typeof initial === 'function' ? initial() : initial)
    const setter = (next) => {
      const cur = stateSlots.get(key)
      stateSlots.set(key, typeof next === 'function' ? next(cur) : next)
    }
    hooks.push({ kind: 'state', v: stateSlots.get(key) })
    return [stateSlots.get(key), setter]
  },
}

let loaded = null
const storeWrites = []
const sandbox = {
  window: {
    __ModuleLoader__: { load(def) { loaded = def } },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    innerWidth: 1440, innerHeight: 900, addEventListener() {},
  },
  document: documentStub,
  MutationObserver: class { observe() {} disconnect() {} },
  localStorage: {
    getItem: () => null,
    setItem(key, value) { if (key === 'dsh.pet.pos') storeWrites.push(String(value)) },
  },
  Date: { now: () => now },
  setInterval: setIntervalFake, clearInterval: clearIntervalFake,
  setTimeout: setTimeoutFake, clearTimeout: clearTimeoutFake,
  console,
}
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

const mod = loaded.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require("${name}")`)
})

const registrations = []
mod.apply({
  slots: {
    inject: (name, factory) => factory(),
    register: (options, component) => { registrations.push({ options, component }); return () => {} },
  },
  theme: { overrideTokens: () => () => {} },
  effect(fn) {
    const cleanup = fn()
    const rec = { fn, cleanup, ran: true }
    effects.push(rec)
    return () => { if (typeof cleanup === 'function') cleanup() }
  },
})

const companion = registrations.find((r) => r.options.name === 'shell.overlay').component

/** Render and expand the tree into plain nodes so attributes can be read. */
function render(props) {
  hooks = []
  slotSeq = 0
  const root = companion(props || {})
  const expand = (node) => {
    if (node === null || node === undefined || typeof node === 'boolean') return null
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(expand)
    if (typeof node.type === 'function') {
      const prev = hooks
      hooks = []
      const out = node.type(Object.assign({}, node.props, { children: node.children }))
      hooks = prev
      return expand(out)
    }
    return { tag: node.type, props: node.props || {}, children: node.children.map(expand) }
  }
  return expand(root)
}

function find(node, predicate) {
  if (!node || typeof node === 'string') return null
  if (Array.isArray(node)) {
    for (const child of node) { const hit = find(child, predicate); if (hit) return hit }
    return null
  }
  if (predicate(node)) return node
  for (const child of node.children) { const hit = find(child, predicate); if (hit) return hit }
  return null
}

const rootNode = (t) => find(t, (n) => n.props.class === 'dlao-pet')
const restNode = (t) => find(t, (n) => n.props.class === 'dlao-rest')
const imgNode = (t) => find(t, (n) => n.props.class === 'dlao-img')

const STATS_SNAPSHOT = {
  sessionId: 'test', turn: 7, running: false, thinkMs: 3200, elapsedMs: 61000,
  endedAt: 0, reason: 'completed', inputTokens: 7608, outputTokens: 308,
  cacheReadTokens: 51200, cacheWriteTokens: 0, totalTokens: 59116, steps: 3,
}

function mount() {
  tree = render({ stats: STATS_SNAPSHOT })
  const pending = hooks.filter((x) => x.kind === 'effect').map((x) => x.rec)
  for (const rec of pending) if (!rec.ran) { rec.ran = true; rec.cleanup = rec.fn() }
}

/** A click: pointer down then up without movement. */
function click() {
  const node = rootNode(tree)
  const target = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 124, height: 104 }),
    setPointerCapture() {},
  }
  node.props.onPointerDown({ clientX: 30, clientY: 30, button: 0, pointerId: 1, currentTarget: target })
  tree = render()
  rootNode(tree).props.onPointerUp({ clientX: 30, clientY: 30, pointerId: 1, currentTarget: target })
  tree = render()
}

/** A drag: down, move, up. */
function dragTo(x, y) {
  const node = rootNode(tree)
  const target = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 124, height: 104 }),
    setPointerCapture() {},
  }
  node.props.onPointerDown({ clientX: 30, clientY: 30, button: 0, pointerId: 1, currentTarget: target })
  tree = render()
  rootNode(tree).props.onPointerMove({ clientX: x, clientY: y, pointerId: 1, currentTarget: target })
  tree = render()
  rootNode(tree).props.onPointerUp({ clientX: x, clientY: y, pointerId: 1, currentTarget: target })
  tree = render()
}

/* ------------------------------------------------------------- scenarios */

let failures = 0
function check(label, expected, actual) {
  const ok = expected === actual
  if (!ok) failures += 1
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}  expected=${expected}  actual=${actual}`)
}

/** Re-render (as React would on a state change) and read what is on screen. */
function snap() {
  tree = render()
  const style = rootNode(tree).props.style || {}
  return {
    face: faceKeyOf(imgNode(tree).props.src),
    state: restNode(tree).props['data-state'],
    dots: !!find(tree, (n) => n.props.class === 'dlao-dots'),
    // free positioning: the inline box is always left/top
    pos: `${style.left || '?'}/${style.top || '?'}`,
    styleKeys: Object.keys(style).sort().join(','),
  }
}

mount()
check('initial face', 'calm', snap().face)
check('initial state attr', 'idle', snap().state)

click()
check('click 1 -> happy', 'happy', snap().face)
check('click 1 state attr', 'happy', snap().state)

click()
check('click 2 -> think', 'think', snap().face)
check('click 2 shows the thinking dots', true, snap().dots)

click()
check('click 3 -> sad', 'sad', snap().face)
check('click 3 state attr', 'sad', snap().state)

click()
check('click 4 -> back to calm', 'calm', snap().face)

console.log('\n--- letting go returns to calm on its own ---')
click()
check('poked to happy', 'happy', snap().face)
advance(2000)
check('still poked at 2s', 'happy', snap().face)
advance(2000)          // past the 3.5s hold
check('after the hold expires -> calm', 'calm', snap().face)

console.log('\n--- a drag must not cycle the expression, and the pet stays where dropped ---')
const posBefore = snap().pos
dragTo(120, 800)       // drag toward the bottom-left area
const after = snap()
check('drag leaves the face alone', 'calm', after.face)
check('drag moved the pet', true, after.pos !== posBefore)
check('the pet is still free-positioned (left/top)', 'bottom,left,right,top', after.styleKeys)
check('the drop position is remembered', '{"x":90,"y":750}',
  storeWrites[storeWrites.length - 1])

console.log('\n--- the agent state survives underneath a poke ---')
surface.running = true
surface.transcript += '流式文本一…'
advance(700)
check('agent thinking under the hood', 'thinking', snap().state)

click()
check('poke overrides the agent face', 'happy', snap().face)

// keep the turn alive while the poke hold expires
surface.transcript += '流式文本二…'
advance(1200)
surface.transcript += '流式文本三…'
advance(1200)
surface.transcript += '流式文本四…'
advance(1600)
check('poke expiry reveals the agent face again', 'think', snap().face)

console.log('\n--- the corner standee squishes and reveals its report on click ---')
tree = render({ stats: STATS_SNAPSHOT })
const statsRoot = () => find(tree, (n) => n.props.class === 'dlao-stats')
const statsImg = () => find(tree, (n) => n.props.class === 'dlao-stats-img')
check('bubble stays hidden until something happens', false,
  !!find(tree, (n) => n.props.class === 'dlao-stats-bubble'))

const img = statsImg()
check('standee is clickable', 'function', typeof (img && img.props.onClick))
check('standee stops pointer propagation (pet drag cannot swallow the click)', true,
  typeof (img && img.props.onPointerDown) === 'function')
img.props.onClick()
tree = render({ stats: STATS_SNAPSHOT })
check('click squishes the standee', 'true', statsRoot().props['data-popping'])
check('click opens the balance bubble', true,
  !!find(tree, (n) => n.props.class === 'dlao-stats-bubble'))
check('the balance bubble is its own cloud', 'balance',
  (find(tree, (n) => n.props.class === 'dlao-cloud') || { props: {} }).props['data-kind'])
check('the balance bubble says 剩余余额为 only', true,
  JSON.stringify(tree).includes('剩余余额为')
  && !JSON.stringify(tree).includes('本次消耗 token 为'))

// Rapid clicks must restart the spring every time: the animation NAME alternates
// between two identical keyframe sets, which is what makes the browser restart
// it (changing timing or duration alone does not).
const animAfterFirst = (statsImg().props.style || {}).animation
check('the spring is driven by an inline animation', true,
  typeof animAfterFirst === 'string' && animAfterFirst.includes('squish-a'))
statsImg().props.onClick()
tree = render({ stats: STATS_SNAPSHOT })
const animAfterSecond = (statsImg().props.style || {}).animation
check('a rapid second click restarts the spring (animation name flips)', true,
  typeof animAfterSecond === 'string' && animAfterSecond.includes('squish-b'))
statsImg().props.onClick()
tree = render({ stats: STATS_SNAPSHOT })
check('a third click flips the name back and restarts again', true,
  ((statsImg().props.style || {}).animation || '').includes('squish-a'))

advance(1000)
tree = render({ stats: STATS_SNAPSHOT })
check('the squish springs back', 'false', statsRoot().props['data-popping'])

console.log(failures === 0 ? '\nALL POKE CHECKS PASSED' : `\n${failures} poke check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
