// TWO-DAY BODY SOAK — the v3.4.0 release proven under the real loop.
//
// The two-day-soak suite pins the milestone fixes; this one pins the BODY
// release (pedometer + dreams + nudges) under the same conditions: the REAL
// index.html + main.js in jsdom, the genuine 1-second tick loop, every dock
// window open, two simulated midnights crossed by stepped 5-minute sweeps,
// and the clean-console bar held the whole way.
//
// What must hold:
//  - STEP.SYNC: steps feed the lifetime counter and the daily lane, the
//    IRL reward fires EXACTLY once per day, and the lane re-stamps at
//    rollover (day 2 earns again).
//  - NUDGES: sends ride the real tick when enabled + unfocused, quiet
//    hours hold inside the loop, crisis debounces hold, the walk nudge
//    fires in the evening window, and the re-arm sweep releases a
//    cooldown whose condition went false (the next episode rings). The
//    walk's session-scoped debounce is pinned as the implementation's
//    actual contract, with a note.
//  - DREAM.CYCLE (storage-gated — jsdom environments without localStorage
//    skip it; the dreams.ui suite owns that seam): an absence ≥ 20h
//    composes exactly one dream; it shows, wakes once (+2 HPY), logs,
//    and never re-shows; the 🌙 diary line lands once and survives a
//    save/load reboot.
//
// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const SHELL_HTML = readFileSync('index.html', 'utf8');
const QUIET_H = 3; // 3 AM — deep inside quiet hours (22–8); nudges must stay silent
// Probe via window.localStorage, NOT the bare binding: vitest's module scope
// can report `localStorage` as undefined while jsdom's window.localStorage
// works fine (the storage seam and every shell test go through window.*).
const HAS_STORAGE = (() => {
  try { window.localStorage.setItem('__bro_probe__', '1'); window.localStorage.removeItem('__bro_probe__'); return true; } catch { return false; }
})();
function clearStorage() {
  try { window.localStorage?.clear(); } catch { /* storage-free environments */ }
  try { window.sessionStorage?.clear(); } catch { /* storage-free environments */ }
}

let App;
let realGetContext;
let realCreateObjectURL;
let realRevokeObjectURL;

const CONSOLE_CALLS = [];
let realConsole;

beforeAll(() => {
  realConsole = {};
  for (const method of ['error', 'warn', 'log', 'info', 'debug']) {
    realConsole[method] = console[method];
    console[method] = (...args) => {
      CONSOLE_CALLS.push({ method, text: args.map((a) => String(a)).join(' ') });
      realConsole[method](...args);
    };
  }
  // jsdom canvas stub — the same absorbing proxy as soak.test.js, so an
  // arcade run during the soak is a real hosted one.
  realGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
  const ctxStub = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'canvas') return null;
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') {
        return () => ({ addColorStop() {} });
      }
      if (prop === 'measureText') return () => ({ width: 10 });
      return typeof prop === 'string' ? () => {} : undefined;
    },
    set() { return true; },
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => ctxStub, configurable: true });
});

afterAll(() => {
  for (const method of Object.keys(realConsole)) console[method] = realConsole[method];
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', realGetContext);
});

beforeEach(() => {
  vi.useFakeTimers();
  realCreateObjectURL = URL.createObjectURL;
  realRevokeObjectURL = URL.revokeObjectURL;
  URL.revokeObjectURL = vi.fn();
  // No dev server in jsdom: boot/bridge/soul fetches answer with clean
  // empty-state JSON so the soak exercises live-render paths.
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, handle: 'KlunkDunker', autonomy: true, registered: false, agentId: null, day: '2026-09-26', lastTickAt: null, lastPostAt: null, lastCommentAt: null, caps: { posts: 2, comments: 6, dms: 2 }, today: { posts: 0, comments: 0, dms: 0 }, actions: [], entries: [] }),
  })));
  // Notification stub: granted + recording. jsdom hasFocus() is false by
  // default — the doorbell arms, exactly the reviewed spec's jsdom truth.
  const constructed = [];
  window.__soakSent = constructed;
  const N = class Notification {
    constructor(title, opts) { this.title = title; this.opts = opts; constructed.push({ title, opts }); this.close = vi.fn(); }
  };
  N.requestPermission = vi.fn().mockResolvedValue('granted');
  N.permission = 'granted';
  window.Notification = N;
  // 3 AM — deep in quiet hours, so nudges stay silent until the soak pins noon.
  vi.setSystemTime(new Date('2026-09-26T03:00:00'));
  CONSOLE_CALLS.length = 0;
});

afterEach(() => {
  window.__broTick?.stop?.();      // the 1s tick must not outlive its test
  window.__broBootOverlay?.stop?.();
  for (const id of [...(App?.windows?.keys?.() ?? [])]) App.close(id, { silent: true });
  window.App = undefined;
  window.__broStore = undefined;
  window.__soakSent = undefined;
  delete window.Notification;
  window.DeviceMotionEvent = undefined;
  vi.runOnlyPendingTimers();
  URL.createObjectURL = realCreateObjectURL;
  URL.revokeObjectURL = realRevokeObjectURL;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function bootShell() {
  clearStorage();
  document.head.innerHTML = SHELL_HTML.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
  document.body.innerHTML = SHELL_HTML.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
  document.documentElement.setAttribute('data-theme', 'cyberpunk');
  await import('../src/main.js');
  App = window.App;
}

const store = () => window.__broStore;
const state = () => window.__broStore.state;
const sent = () => window.__soakSent;
const dreams = () => state().dreams.entries;

// Fake-timer-safe async flush: the CFG permission flows resolve through
// microtasks (stubbed requestPermission, no real timers) — advance the fake
// clock a hair so the awaited handlers land before the assertions.
const flushAsync = () => vi.advanceTimersByTimeAsync(10);

// Enable STEP.SYNC through the REAL SYSTEM.CFG flow (jsdom has no
// DeviceMotionEvent — desktop Chromium's truthful "no sensor" state;
// DESK JOB is the lane that keeps working, exactly as shipped).
async function enablePedometer() {
  App.open('settings');
  const win = App.windows.get('settings');
  window.DeviceMotionEvent = class DeviceMotionEvent {};
  win.el.querySelector('#pedometer-toggle').click();
  await flushAsync();
  window.DeviceMotionEvent = undefined;
  expect(win.el.querySelector('#pedometer-status')?.textContent).toBe('LISTENING');
  App.close('settings', { silent: true });
}

// Enable NUDGES through the REAL CFG flow (stubbed Notification grants).
async function enableNudges() {
  App.open('settings');
  const win = App.windows.get('settings');
  win.el.querySelector('#nudges-toggle').click();
  await flushAsync();
  expect(win.el.querySelector('#nudges-status')?.textContent).toBe('ON');
  App.close('settings', { silent: true });
}

// Real DeviceMotionEvents through the sensor layer: two real dipoles per
// step (dip below g−1.2, return above g) 300 ms apart — over the 250 ms
// refractory, so each pair counts exactly once. Built as duck-typed shim
// events (Event + the two own fields the sensor reads): Event.timeStamp is
// getter-only, and jsdom's DeviceMotionEvent isn't constructible — the
// shim works identically on local and CI jsdom.
function motionEvent(mag, t) {
  const e = new Event('devicemotion');
  Object.defineProperty(e, 'accelerationIncludingGravity', { value: { x: 0, y: 0, z: mag } });
  Object.defineProperty(e, 'timeStamp', { value: t });
  return e;
}
function fireSteps(n) {
  let t = performance.now();
  for (let i = 0; i < n; i++) {
    window.dispatchEvent(motionEvent(8.0, t));
    window.dispatchEvent(motionEvent(9.81, t + 300));
    t += 300;
  }
}

const problemReport = (label) => {
  const problems = CONSOLE_CALLS.filter((c) => c.method === 'error' || c.method === 'warn');
  expect(problems, `${label} failed:\n${problems.map((p) => `${p.method}: ${p.text}`).join('\n') || '(none)'}`)
    .toHaveLength(0);
};

// Advance the mocked clock in 5-minute steps, running the shell's REAL 1s
// interval once per step, until a condition holds (the two-day-soak suite's
// sweep pattern — every tick's now() stays unambiguous).
async function sweepUntil(check, maxSteps = 600) {
  for (let i = 0; i < maxSteps; i++) {
    vi.setSystemTime(new Date(Date.now() + 5 * 60 * 1000));
    await vi.advanceTimersByTimeAsync(1000);
    if (check()) return i;
  }
  return -1;
}
const jumpTo = (h, minute) => {
  const now = new Date(Date.now());
  const target = new Date(now);
  target.setHours(h, minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  vi.setSystemTime(target);
};

// The dream scenario: a save that was written GAP_MS ago (lastTick carries
// the gap — a hardcoded stale date decays against the wrong clock). Written
// through the storage seam AFTER the clear and BEFORE the import, exactly
// the dreams.ui recipe.
async function bootWithStaleSave(gapMs) {
  const now = Date.now();
  const seed = {
    v: 3,
    petName: 'RYAN',
    coins: 60,
    steps: 0,
    xp: 0,
    stats: { happy: 82, hunger: 74, energy: 90, greed: 6 },
    sleeping: false,
    mining: false,
    shield: 0,
    goldenShell: false,
    theme: 'cyberpunk',
    scanlines: true,
    vol: { bgm: 0.7, sfx: 0.8 },
    bgmMuted: false,
    remixes: {},
    spriteOverrides: {},
    best: { snake: 0, flappy: 0, breaker: 0, mario: 0, rpg: 0, loot: 5 },
    quest: { date: '2026-09-26', mined: 0, goal: 20, rewarded: false },
    pedometer: { enabled: false, goal: 2000, today: { date: '2026-09-26', steps: 0, rewarded: false } },
    dreams: { lastDreamedAt: null, entries: [] },
    memories: [{ id: 'm-soak-1', icon: '🎮', text: 'Won LOOT SHOWER with 5 points. First run on record.', imp: 4, pinned: true, t: now - gapMs - 3600e3, day: 'Sep 20, 2026' }],
    diary: [],
    lastTick: now - gapMs,
  };
  try { window.localStorage.setItem('bro_os_3', JSON.stringify(seed)); } catch { /* storage-free environments */ }
  document.head.innerHTML = SHELL_HTML.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
  document.body.innerHTML = SHELL_HTML.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
  document.documentElement.setAttribute('data-theme', 'cyberpunk');
  await import('../src/main.js');
  App = window.App;
}

describe('two-day body soak: pedometer, dreams, nudges under the real tick loop', () => {
  it('survives two midnights with every window open and a clean console', { timeout: 120_000 }, async () => {
    await bootShell();
    window.__broBootOverlay?.stop?.();

    // Open the whole dock so every interval/render path is live all day.
    const windows = [...document.querySelectorAll('#dock .dock-btn')]
      .map((b) => b.getAttribute('onclick')?.match(/App\.open\('([a-z]+)'\)/)?.[1]).filter(Boolean);
    for (const id of windows) App.open(id);
    expect(App.windows.size).toBe(windows.length);

    // Enable both body features through their REAL CFG flows.
    await enablePedometer();
    await enableNudges();

    // Pin the rig OFF so coin math is exact: this soak isolates the body
    // features' economy from the mining loop's +1 CR cadence.
    state().mining = false;
    expect(state().pedometer.enabled).toBe(true);
    expect(state().nudges.enabled).toBe(true);

    // ── DAY 1, deep night (3 AM, quiet hours): the crisis lane must hold
    //    its silence INSIDE the real loop. ──
    state().stats.hunger = 10; // starving, but it's 3 AM
    jumpTo(QUIET_H, 5);
    await vi.advanceTimersByTimeAsync(5 * 1000);
    expect(sent()).toHaveLength(0); // quiet hours enforced inside the loop

    // ── DAY 1 morning: pin noon through the documented test hook. The
    //    hunger crisis (still 10) now rings — send #1. ──
    window.__broNudges.pinHour(12);
    vi.setSystemTime(new Date('2026-09-26T12:00:00'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent().filter((n) => n.opts.tag === 'hunger')).toHaveLength(1);

    // DESK JOB drives the real addSteps path (250 × 4 = 1000 steps).
    App.open('settings');
    const desk = App.windows.get('settings').el.querySelector('#pedometer-desk');
    const coinsAtDesk = state().coins;
    for (let i = 0; i < 4; i++) desk.click();
    expect(state().steps).toBe(1000);                 // lifetime counter
    expect(state().pedometer.today.steps).toBe(1000); // the daily lane
    expect(state().coins).toBe(coinsAtDesk);          // no reward before the goal

    // ── Day 1 close: the evening walk nudge while the lane is unfinished.
    //    The override comes OFF — the walk needs the local hour ≥ 18. ──
    window.__broNudges.unpinHour();
    vi.setSystemTime(new Date('2026-09-26T19:00:00'));
    await vi.advanceTimersByTimeAsync(2 * 1000);
    const walkSent = sent().filter((n) => n.opts.tag === 'walk');
    expect(walkSent.length).toBe(1); // fired once in the evening window
    expect(walkSent[0].title).toBe('👟 The walk is undone');
    expect(walkSent[0].opts.body).toContain('1,000 steps short');
    App.close('settings', { silent: true });

    // No further walk sends inside the same evening window (debounced).
    await vi.advanceTimersByTimeAsync(4 * 1000);
    expect(sent().filter((n) => n.opts.tag === 'walk')).toHaveLength(1);

    // Cross the IRL goal via real sensor events — the once-only reward.
    const coinsBeforeGoal = state().coins;
    fireSteps(1000);
    await vi.advanceTimersByTimeAsync(3.5 * 1000); // the 3s batch flush
    expect(state().steps).toBe(2000);
    expect(state().pedometer.today.steps).toBe(2000);
    expect(state().pedometer.today.rewarded).toBe(true);
    expect(state().coins).toBe(coinsBeforeGoal + 40);

    // The STP deferred event drains on a real tick: SYS.LOG line, no crash.
    await vi.advanceTimersByTimeAsync(1500);
    expect(document.querySelector('#sys-log')?.textContent ?? '').toContain('IRL.QUEST complete');

    // More walking after the reward pays nothing further.
    const coinsAfterReward = state().coins;
    fireSteps(300);
    await vi.advanceTimersByTimeAsync(3.5 * 1000);
    expect(state().pedometer.today.rewarded).toBe(true);
    expect(state().coins).toBe(coinsAfterReward);

    // Idle evening under every window's tickers.
    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);

    // ── MIDNIGHT #1 → DAY 2: quiet hours again, then noon. ──
    jumpTo(QUIET_H, 0);
    const day2 = await sweepUntil(() => state().dailyDiaryDone === '2026-09-27');
    expect(day2, 'rollover never observed').toBeGreaterThanOrEqual(0);

    // The IRL lane re-stamped: yesterday's walk never carries over...
    expect(state().pedometer.today.date).toBe('2026-09-27');
    expect(state().pedometer.today.steps).toBe(0);
    expect(state().pedometer.today.rewarded).toBe(false);

    // ...and DESK JOB pays again on day 2 (a second IRL reward across the soak).
    vi.setSystemTime(new Date('2026-09-27T12:00:00'));
    window.__broNudges.pinHour(12);
    App.open('settings');
    const coinsBeforeDay2 = state().coins;
    const desk2 = App.windows.get('settings').el.querySelector('#pedometer-desk');
    for (let i = 0; i < 8; i++) desk2.click();
    expect(state().pedometer.today.rewarded).toBe(true);
    expect(state().coins).toBe(coinsBeforeDay2 + 40);
    App.close('settings', { silent: true });

    // Day-2 evening probe, hour pinned to 19:00: the walk nudge stays
    // silent. The implementation's re-arm for 'walk' is a RELOAD —
    // lastSent is runtime-only and nothing clears it on rollover, so a
    // long-lived session's day-2 evening does not ring again. Pinned as
    // the actual contract (a candidate v3.4.1 refinement, not a soak bug).
    window.__broNudges.pinHour(19);
    await vi.advanceTimersByTimeAsync(2 * 1000);
    expect(sent().filter((n) => n.opts.tag === 'walk')).toHaveLength(1);
    window.__broNudges.pinHour(12);

    // Crisis lanes on day 2: the re-arm discipline across days — feed him
    // (condition false → 'hunger' released), starve him again (a NEW
    // episode gets its own nudge; day 1's cooldown must not eat it).
    state().stats.hunger = 50;
    await vi.advanceTimersByTimeAsync(2 * 1000);
    state().stats.hunger = 10;
    await vi.advanceTimersByTimeAsync(2 * 1000);
    expect(sent().filter((n) => n.opts.tag === 'hunger').length).toBeGreaterThanOrEqual(2);

    problemReport('two-day body soak');
  });

  it.skipIf(!HAS_STORAGE)('dreams exactly once across a two-day absence, and never re-shows after waking', { timeout: 60_000 }, async () => {
    // The absence: the save was written 26h ago (≥ the 20h threshold).
    await bootWithStaleSave(26 * 60 * 60 * 1000);
    window.__broBootOverlay?.stop?.();

    // The overlay is up the moment the splash lifts (boot-composed).
    let overlay = document.querySelector('[aria-label="Ryan\'s dream"]');
    expect(overlay).toBeTruthy();
    expect(overlay.querySelector('#dream-text')?.textContent).toContain('I dreamed');

    // Exactly one entry, unread, and the 🌙 memory on the stream.
    expect(dreams()).toHaveLength(1);
    expect(dreams()[0].readAt).toBeNull();
    expect(state().memories.filter((m) => m.icon === '🌙')).toHaveLength(1);

    // WAKE HIM pays once (+2 HPY) and logs.
    const happyBefore = state().stats.happy;
    overlay.querySelector('#dream-dismiss').click();
    overlay = document.querySelector('[aria-label="Ryan\'s dream"]');
    expect(overlay).toBeNull();
    expect(dreams()[0].readAt).not.toBeNull();
    expect(state().stats.happy).toBe(Math.min(100, happyBefore + 2));
    expect(document.querySelector('#sys-log')?.textContent ?? '').toContain('dream reel acknowledged');

    // Idle hours under the real loop: no second dream, no re-show.
    for (const id of ['chat', 'arcade', 'settings']) App.open(id);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(dreams()).toHaveLength(1);
    expect(document.querySelector('[aria-label="Ryan\'s dream"]')).toBeNull();

    // ── MIDNIGHT → DAY 2: the 🌙 diary line landed exactly once. ──
    jumpTo(QUIET_H, 0);
    const day2 = await sweepUntil(() => state().dailyDiaryDone === '2026-09-27');
    expect(day2, 'rollover never observed').toBeGreaterThanOrEqual(0);
    const dreamDiaryLines = state().diary.filter((l) => String(l.text).startsWith('🌙 Dreamed:'));
    expect(dreamDiaryLines).toHaveLength(1);

    // Reboot the same soul the honest way: export → import across devices.
    // No re-show (the entry is read), no second dream.
    const snapshot = window.__broStore.exportState();
    for (const id of [...App.windows.keys()]) App.close(id, { silent: true });
    window.App = undefined;
    window.__broStore = undefined;
    vi.resetModules();
    document.head.innerHTML = SHELL_HTML.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
    document.body.innerHTML = SHELL_HTML.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
    await import('../src/main.js');
    App = window.App;
    window.__broBootOverlay?.stop?.();
    expect(document.querySelector('[aria-label="Ryan\'s dream"]')).toBeNull();

    const { createStore } = await import('../src/state.js');
    const fresh = createStore({ storage: null });
    expect(fresh.importState(snapshot)).toBe(true);
    expect(fresh.state.dreams.entries).toHaveLength(1);
    expect(fresh.state.dreams.entries[0].readAt).not.toBeNull();

    problemReport('dream soak');
  });

  it('no dream without the absence; no sends while focused; re-arm releases stale cooldowns', { timeout: 60_000 }, async () => {
    await bootShell();
    window.__broBootOverlay?.stop?.();

    // NO dream on a fresh boot (no absence) — even with every window open.
    const windows = [...document.querySelectorAll('#dock .dock-btn')]
      .map((b) => b.getAttribute('onclick')?.match(/App\.open\('([a-z]+)'\)/)?.[1]).filter(Boolean);
    for (const id of windows) App.open(id);
    expect(document.querySelector('[aria-label="Ryan\'s dream"]')).toBeNull();
    expect(dreams()).toHaveLength(0);

    await enableNudges();
    window.__broNudges.pinHour(12);
    vi.setSystemTime(new Date('2026-09-26T12:00:00'));

    // Focused tabs never send — even deep in a crisis. Sampled across many
    // single-tick advances so a tick can't land between phases unnoticed.
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    state().stats.hunger = 10;
    for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(1000);
    expect(sent()).toHaveLength(0);

    // Unfocus: the FIRST qualifying tick sends; the rest are debounced.
    hasFocus.mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent().filter((n) => n.opts.tag === 'hunger')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3 * 1000);
    expect(sent().filter((n) => n.opts.tag === 'hunger')).toHaveLength(1); // debounce held

    // Re-arm: feed him (condition false → 'hunger' released), starve again
    // (a NEW episode gets its own nudge — no stale cooldown eats it).
    state().stats.hunger = 60;
    await vi.advanceTimersByTimeAsync(2 * 1000);
    state().stats.hunger = 10;
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent().filter((n) => n.opts.tag === 'hunger')).toHaveLength(2);
    hasFocus.mockRestore();

    // The energy lane mirrors the discipline — and sleeping is a re-arm:
    state().stats.energy = 10; // drained, awake
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent().filter((n) => n.opts.tag === 'energy')).toHaveLength(1);
    store().rest(); // he sleeps — rest is the fix in progress, so silence
    state().stats.energy = 10; // the regen fight — keep him drained regardless
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent().filter((n) => n.opts.tag === 'energy')).toHaveLength(1);
    // ...but sleeping RELEASES the energy key (the re-arm sweep clears it),
    // so waking still-drained rings a fresh episode:
    store().rest(); // wake
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent().filter((n) => n.opts.tag === 'energy')).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2 * 1000);
    expect(sent().filter((n) => n.opts.tag === 'energy')).toHaveLength(2); // debounce held

    problemReport('nudge discipline soak');
  });
});
