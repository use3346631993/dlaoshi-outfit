/**
 * Behaviour test for the pet's state machine.
 *
 * The reported defects were timing and detection bugs, not rendering bugs:
 *   A. after an interrupted turn the pet stayed sad through later successes;
 *   B. the thinking expression never appeared.
 *
 * Root causes, now fixed: the outcome was re-judged against the whole page (a
 * stale retry control / interrupt note made later successes look failed), a
 * hold timer from the previous turn fired into the new one, and the only
 * running signal was a stop control that is not reliably visible.
 *
 * The hook now uses two independent signals — the composer's stop control AND
 * the transcript's text growth inside `[data-conversation-scroll]` — and judges
 * the outcome once, on the running → stopped edge, by counting the status
 * markers the turn added.
 *
 * This drives the real hook through a fake DOM and a virtual clock.
 * Run: node verify_pet_states.cjs
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const CLIENT = path.join(__dirname, '..', 'client.js')
const source = fs.readFileSync(CLIENT, 'utf8')

/* ------------------------------------------------- virtual clock + DOM -- */

let now = 0
let seq = 0
const timers = new Map()
let intervals = []

function setTimeoutFake(fn, ms) { const id = ++seq; timers.set(id, { fn, at: now + (ms || 0), kind: 'timeout' }); return id }
function clearTimeoutFake(id) { timers.delete(id) }
function setIntervalFake(fn, ms) { const id = ++seq; intervals.push({ id, fn, every: ms || 0, next: now + (ms || 0) }); return id }
function clearIntervalFake(id) { intervals = intervals.filter((i) => i.id !== id) }

function advance(ms) {
  const target = now + ms
  for (;;) {
    let next = null
    for (const [id, t] of timers) {
      if (t.at <= target && (next === null || t.at < next.t.at)) next = { id, t }
    }
    let nextInterval = null
    for (const i of intervals) if (i.next <= target && (nextInterval === null || i.next < nextInterval.next)) nextInterval = i
    const useTimer = next && (!nextInterval || next.t.at <= nextInterval.next)
    if (!useTimer && !nextInterval) break
    if (useTimer) {
      now = Math.max(now, next.t.at)
      timers.delete(next.id)
      next.t.fn()
    } else {
      now = Math.max(now, nextInterval.next)
      nextInterval.next += nextInterval.every
      nextInterval.fn()
    }
  }
  now = target
}

/** The conversation surface the hook reads. */
const surface = {
  running: false,       // stop control present?
  alert: false,         // live error alert?
  retry: false,         // retry node rendered in the transcript?
  transcript: '',       // text inside [data-conversation-scroll]
}

// A minimal DOM tree the hook's deepFind can walk (nodeType / children /
// getAttribute / className / shadowRoot are all it uses).
const transcriptEl = {
  nodeType: 1, tagName: 'DIV', children: [], shadowRoot: null,
  getAttribute: (n) => (n === 'data-conversation-scroll' ? '' : null),
  get textContent() { return surface.transcript },
}
const stopEl = {
  nodeType: 1, tagName: 'BUTTON', children: [], shadowRoot: null,
  getAttribute: (n) => (n === 'aria-label' ? '停止生成' : null),
}
const alertEl = {
  nodeType: 1, tagName: 'DIV', children: [], shadowRoot: null,
  getAttribute: (n) => (n === 'role' ? 'alert' : null),
}
// the real apps render a RetryNodeView whose class is "<hash>_retry"
const retryEl = {
  nodeType: 1, tagName: 'DIV', children: [], shadowRoot: null,
  className: 'RlGAzG_retry',
  getAttribute: (n) => (n === 'class' ? 'RlGAzG_retry' : null),
}
const documentElement = {
  nodeType: 1, tagName: 'HTML', shadowRoot: null,
  getAttribute: () => null,
  classList: { toggle() {}, add() {}, remove() {} },
  get children() {
    const list = [transcriptEl]
    if (surface.running) list.push(stopEl)
    if (surface.alert) list.push(alertEl)
    if (surface.retry) list.push(retryEl)
    return list
  },
}
const documentStub = {
  body: { hasAttribute: () => false, style: { setProperty() {} }, appendChild() {} },
  documentElement,
  head: { appendChild() {}, removeChild() {} },
  createElement: () => ({ dataset: {}, style: {}, textContent: '', remove() {} }),
  createElementNS: () => ({ setAttribute() {}, appendChild() {} }),
  querySelector(sel) {
    if (/data-conversation-scroll/.test(sel)) return transcriptEl
    if (/stop|停止/i.test(sel)) return surface.running ? stopEl : null
    if (/role="alert"/.test(sel)) return surface.alert ? alertEl : null
    return null
  },
  querySelectorAll: () => [],
  addEventListener() {},
}

/* ------------------------------------------------------- React harness -- */

let hooks = []
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
    const value = stateSlots.get(key)
    hooks.push({ kind: 'state', v: value })
    return [value, setter]
  },
}

let loaded = null
const sandbox = {
  window: {
    __ModuleLoader__: { load(def) { loaded = def } },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    innerWidth: 1440, innerHeight: 900, addEventListener() {},
  },
  document: documentStub,
  MutationObserver: class { observe() {} disconnect() {} },
  localStorage: { getItem: () => null, setItem() {} },
  Date: { now: () => now },
  setInterval: setIntervalFake,
  clearInterval: clearIntervalFake,
  setTimeout: setTimeoutFake,
  clearTimeout: clearTimeoutFake,
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
    inject(name, factory) { return factory() },
    register(options, component) { registrations.push({ options, component }); return () => {} },
  },
  theme: { overrideTokens() { return () => {} } },
  effect(fn) {
    const cleanup = fn()
    const rec = { fn, cleanup, ran: true }
    effects.push(rec)
    return () => { if (typeof cleanup === 'function') cleanup() }
  },
})

const companion = registrations.find((r) => r.options.name === 'shell.overlay').component

let reported = 'idle'
function renderCompanion() {
  hooks = []
  slotSeq = 0
  companion({})
  const stateHook = hooks.find((x) => x.kind === 'state')
  reported = stateHook ? stateHook.v : 'idle'
}

function mount() {
  renderCompanion()
  const pending = hooks.filter((x) => x.kind === 'effect').map((x) => x.rec)
  for (const rec of pending) {
    if (!rec.ran) { rec.ran = true; rec.cleanup = rec.fn() }
  }
  return () => { renderCompanion(); return reported }
}

/* ------------------------------------------------------------- scenarios */

let failures = 0
function check(label, expected, actual) {
  const ok = expected === actual
  if (!ok) failures += 1
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}  expected=${expected}  actual=${actual}`)
}

const GROW_QUIET = 3200   // growth quiet threshold (2500ms) + one full poll period

console.log('--- scenario A: a successful turn, then another one ---')
let read = mount()
check('initial', 'idle', read())

surface.running = true
advance(600)
surface.transcript += '回复中…'
advance(600)
check('turn 1 streaming -> thinking', 'thinking', read())

surface.running = false
advance(GROW_QUIET)
check('turn 1 finished ok -> happy', 'happy', read())

advance(3200)
check('happy rests back to idle', 'idle', read())

surface.running = true
advance(600)
surface.transcript += '第二轮回复…'
advance(600)
check('turn 2 streaming -> thinking', 'thinking', read())

surface.running = false
advance(GROW_QUIET)
check('turn 2 finished ok -> happy', 'happy', read())

console.log('\n--- scenario B: an interrupted turn, then a successful one ---')
surface.running = true
advance(600)
surface.transcript += ' 已停止'
surface.running = false
advance(GROW_QUIET)
check('interrupted -> sad', 'sad', read())

// the user retries: the stale "已停止" stays in the transcript
surface.running = true
advance(600)
check('retry starts -> thinking (stale marker must not win)', 'thinking', read())
surface.transcript += '重试后的回复…'
advance(600)
surface.running = false
advance(GROW_QUIET)
check('a success after an interrupt -> happy', 'happy', read())

console.log('\n--- scenario C: a hold timer must not fire into the next turn ---')
surface.running = true
advance(600)
surface.transcript += ' 已停止'
surface.running = false
advance(GROW_QUIET)
check('turn N fails -> sad', 'sad', read())

advance(800)                          // still inside the 4s sad hold
surface.running = true
advance(600)
check('new turn during the hold -> thinking', 'thinking', read())

// keep the turn alive past the moment the old hold timer (t+4000) fires
surface.transcript += '新一轮的回复一…'
advance(1000)
surface.transcript += '新一轮的回复二…'
advance(1000)
surface.transcript += '新一轮的回复三…'
advance(1000)
surface.transcript += '新一轮的回复四…'
advance(2000)

check('the old hold timer did not drop the new turn', 'thinking', read())

surface.running = false
advance(GROW_QUIET)
check('that turn succeeded -> happy', 'happy', read())

console.log('\n--- scenario D: a live error alert ---')
advance(3200)
surface.running = true
advance(600)
surface.alert = true
surface.running = false
advance(GROW_QUIET)
check('live alert -> sad', 'sad', read())
surface.alert = false
advance(4200)
check('alert cleared -> idle', 'idle', read())

console.log('\n--- scenario E: growth signal alone, stop button never visible ---')
advance(500)
surface.running = false            // the stop control is not detected at all
surface.transcript += '只有流式文本增长…'
advance(600)
check('growth alone -> thinking', 'thinking', read())
surface.transcript += '增长停止。'
advance(GROW_QUIET)
check('growth stops -> happy', 'happy', read())

console.log('\n--- scenario F: interrupted, marker glued to prose (no space) ---')
// The exact reported defect: textContent joins elements without whitespace, so
// "回复已停止" defeated a boundary-anchored pattern and looked like success.
advance(500)
surface.running = true
advance(600)
surface.transcript += '回复已停止'      // no leading/trailing space
surface.running = false
advance(GROW_QUIET)
check('glued CJK marker -> sad', 'sad', read())

console.log('\n--- scenario G: interrupted with only a retry node (no status text) ---')
advance(4200)                          // let the sad hold expire
surface.running = true
advance(600)
surface.transcript += '部分回复…'
surface.retry = true                   // RetryNodeView appears during the turn
advance(600)
surface.running = false
advance(GROW_QUIET)
check('structural retry node -> sad', 'sad', read())

// the stale retry node must not poison the next successful turn
surface.running = true
advance(600)
surface.transcript += '重试成功后的回复…'
advance(600)
surface.running = false
advance(GROW_QUIET)
check('success after a retry node -> happy', 'happy', read())
surface.retry = false

console.log(failures === 0 ? '\nALL STATE CHECKS PASSED' : `\n${failures} state check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
