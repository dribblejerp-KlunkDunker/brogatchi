// TWO-DAY MILESTONE SOAK — the milestone fixes proven under the real loop.
//
// The audit found that "first-ever" milestones read DAILY counters, so the
// cabinet-room legend, the first-breach pin and the Rejoined-MOLTBOOK pin
// re-fired every midnight. The unit tests pin the store logic; this suite
// drives the REAL shell (index.html + main.js in jsdom) across two simulated
// days with the genuine 1-second tick loop running, every window open, and
// the clean-console bar held the whole way.
//
// Tractability with honesty: the fake clock starts at 23:58 so each midnight
// is minutes away (the real loop crosses it at full rate — the exact moment
// the old bug fired). Quiet hours are jumped by PAUSING timers, moving the
// clock, and resuming for real ticks: every milestone-relevant code path
// still executes under the actual store.tick()/renderAll() loop rather than
// 170k simulated one-second iterations.
//
// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const SHELL_HTML = readFileSync('index.html', 'utf8');

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
  // jsdom canvas stub — same absorbing proxy as soak.test.js, so the arcade
  // payout during the soak is a real hosted run.
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

async function bootShell() {
  document.head.innerHTML = SHELL_HTML.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
  document.body.innerHTML = SHELL_HTML.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
  document.documentElement.setAttribute('data-theme', 'cyberpunk');
  await import('../src/main.js');
  App = window.App;
}

const content = (id) => App.windows.get(id)?.el.querySelector('.window-content');
const store = () => window.__broStore;
const countMem = (pred) => store().state.memories.filter(pred).length;

// Jump the wall clock to h:minute (tomorrow if that time already passed).
// The quiet hours vanish in one move; the shell's REAL 1s tick loop then runs
// across the boundary — decay catch-up, quest reset, diary rollover, trait
// drift, memory fade all engage under genuine ticks instead of ~80k
// simulated one-second iterations.
function jumpTo(h, minute) {
  const now = new Date(Date.now()); // Date.now() follows the mocked clock
  const target = new Date(now);
  target.setHours(h, minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  vi.setSystemTime(target);
}

// Drive one arcade run through the REAL hosted cabinet, like a player would.
function playArcade(score) {
  const c = content('arcade');
  c.querySelector('button[data-game="loot"]')?.click();
  const cvs = c.querySelector('#game-canvas');
  expect(cvs?.__game).toBeTruthy();
  cvs.__game.score = score;
  cvs.__game.gameOver(score);
  c.querySelector('#game-exit')?.click();
}

const legend = (m) => m.text === 'A legend is born in the cabinet room.';
const firstHack = (m) => m.text.startsWith('Breached the J.O.O.H. mainframe.');
const rejoined = (m) => m.text.startsWith('Rejoined MOLTBOOK.');
// The J.O.O.H. terminal staggers its 5 breach lines at 260ms and writes the
// memory when the last lands — wait just past that tail.
const HACK_TAIL_MS = 5 * 260 + 500;

// Cross midnight(s) deterministically: advance the mocked clock in 5-minute
// steps, running the shell's REAL 1s interval once per step, until the
// store's rollover day is observed. A blind multi-hour clock jump plus a
// long advance relies on fake-timer catch-up semantics (fired intervals can
// read their stale schedule, zone-dependently — CI failed exactly there); a
// stepped sweep keeps every tick's now() unambiguous.
async function sweepToDay(day) {
  for (let i = 0; i < 800; i++) {
    vi.setSystemTime(new Date(Date.now() + 5 * 60 * 1000));
    await vi.advanceTimersByTimeAsync(1000);
    if (store().state.dailyDiaryDone === day) return;
  }
  // falling through is fine — the caller's expectDay names the failure
}
function expectDay(needDay) {
  expect(store().state.dailyDiaryDone).toBe(needDay);
}

beforeEach(() => {
  vi.useFakeTimers();
  realCreateObjectURL = URL.createObjectURL;
  realRevokeObjectURL = URL.revokeObjectURL;
  URL.revokeObjectURL = vi.fn();
  // No dev server in jsdom: the shell's boot/bridge/soul fetches all answer
  // with clean empty-state JSON so the soak exercises live-render paths.
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, handle: 'KlunkDunker', autonomy: true, registered: false, agentId: null, day: '2026-09-07', lastTickAt: null, lastPostAt: null, lastCommentAt: null, caps: { posts: 2, comments: 6, dms: 2 }, today: { posts: 0, comments: 0, dms: 0 }, actions: [], entries: [] }),
  })));
  // 23:58 — the first midnight rollover is two real minutes away.
  vi.setSystemTime(new Date('2026-09-07T23:58:00'));
  CONSOLE_CALLS.length = 0;
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  URL.createObjectURL = realCreateObjectURL;
  URL.revokeObjectURL = realRevokeObjectURL;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const id of [...(App?.windows?.keys?.() ?? [])]) App.close(id, { silent: true });
  window.App = undefined;
  vi.resetModules();
});

describe('two-day soak: milestones hold under the real tick loop', () => {
  it('earns all three milestones on day 1 and never repeats them through day 3', { timeout: 60000 }, async () => {
    await bootShell();

    // Open the whole dock so every interval/render path is live all week.
    const windows = [...document.querySelectorAll('#dock .dock-btn')]
      .map((b) => b.getAttribute('onclick')?.match(/App\.open\('([a-z]+)'\)/)?.[1]).filter(Boolean);
    for (const id of windows) App.open(id);
    expect(App.windows.size).toBe(windows.length);

    // ── DAY 1 (23:58 → midnight → morning): earn every milestone ──
    // 2 real minutes across midnight — the rollover fires inside the loop.
    await vi.advanceTimersByTimeAsync(120 * 1000);
    expect(store().state.dailyDiaryDone).toBe('2026-09-08'); // rollover really happened

    // First post of the day → the Rejoined-MOLTBOOK pin (exactly the moment
    // the old bug would mint a second copy).
    const molt = content('moltbook');
    molt.querySelector('#molt-new-btn')?.click();
    const input = molt.querySelector('#molt-input');
    input.value = 'day one transmission across the tide';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    molt.querySelector('#molt-post')?.click();
    await vi.advanceTimersByTimeAsync(2 * 1000);
    expect(countMem(rejoined)).toBe(1);

    // First hack of the day → the J.O.O.H. breach pin.
    content('jooh').querySelector('#jooh-hack')?.click();
    await vi.advanceTimersByTimeAsync(HACK_TAIL_MS);
    expect(countMem(firstHack)).toBe(1);

    // First arcade run ever → the win pin + the cabinet-room legend.
    playArcade(12);
    await vi.advanceTimersByTimeAsync(2 * 1000);
    expect(countMem(legend)).toBe(1);
    // The first-ever run's memory is the one pinned win (hosted label is the
    // cabinet's registry name, so match on the 'Won ' prefix).
    const wonPinsDay1 = store().state.memories.filter((m) => m.pinned && m.text.startsWith('Won '));
    expect(wonPinsDay1).toHaveLength(1);
    const firstWinId = wonPinsDay1[0].id;

    // Second arcade run the SAME day: no new legend (it never keyed on the
    // daily counter within a day either).
    playArcade(15);
    await vi.advanceTimersByTimeAsync(2 * 1000);
    expect(countMem(legend)).toBe(1);

    // Idle afternoon under every window's tickers.
    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);

    // ── MIDNIGHT #2 → DAY 2: the regression moment ──
    // Sweep the quiet hours (real ticks every 5 simulated minutes) straight
    // through midnight #2.
    await sweepToDay('2026-09-09');
    expectDay('2026-09-09');
    expect(store().state.counters.gamesWon).toBe(0); // daily counter reset...

    // ...but the milestones must NOT re-fire on day 2's firsts.
    const m2 = content('moltbook');
    const input2 = m2.querySelector('#molt-input');
    m2.querySelector('#molt-new-btn')?.click();
    input2.value = 'day two, older and saltier';
    input2.dispatchEvent(new window.Event('input', { bubbles: true }));
    m2.querySelector('#molt-post')?.click();
    content('jooh').querySelector('#jooh-hack')?.click();
    await vi.advanceTimersByTimeAsync(HACK_TAIL_MS);
    playArcade(20);
    await vi.advanceTimersByTimeAsync(2 * 1000);

    expect(countMem(rejoined)).toBe(1);
    expect(countMem(firstHack)).toBe(1);
    expect(countMem(legend)).toBe(1);
    // Day 2's first win writes a memory but never a NEW pinned win.
    const wonPinsDay2 = store().state.memories.filter((m) => m.pinned && m.text.startsWith('Won '));
    expect(wonPinsDay2).toHaveLength(1);
    expect(wonPinsDay2[0].id).toBe(firstWinId);

    // ── DAY 3: one more midnight, one more set of firsts ──
    await sweepToDay('2026-09-10');
    expectDay('2026-09-10');

    const input3 = m2.querySelector('#molt-input');
    input3.value = 'day three transmission';
    input3.dispatchEvent(new window.Event('input', { bubbles: true }));
    m2.querySelector('#molt-post')?.click();
    content('jooh').querySelector('#jooh-hack')?.click();
    await vi.advanceTimersByTimeAsync(HACK_TAIL_MS);
    playArcade(25);
    await vi.advanceTimersByTimeAsync(2 * 1000);
    vi.runOnlyPendingTimers();

    expect(countMem(rejoined)).toBe(1);
    expect(countMem(firstHack)).toBe(1);
    expect(countMem(legend)).toBe(1);
    expect(store().state.memories.filter((m) => m.text.startsWith('Won '))).toHaveLength(4); // four runs, one pinned

    // THE BAR: zero console errors/warnings across the whole two days.
    const problems = CONSOLE_CALLS.filter((c) => c.method === 'error' || c.method === 'warn');
    expect(problems, `two-day soak failed:\n${problems.map((p) => `${p.method}: ${p.text}`).join('\n') || '(none)'}`)
      .toHaveLength(0);
  });

  it('keeps the pins stable across a simulated save/load week', { timeout: 30000 }, async () => {
    await bootShell();

    // Earn the milestones on "day 1" through the real UI.
    for (const id of ['moltbook', 'jooh', 'arcade']) App.open(id);
    const molt = content('moltbook');
    molt.querySelector('#molt-new-btn')?.click();
    const input = molt.querySelector('#molt-input');
    input.value = 'week-start transmission';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    molt.querySelector('#molt-post')?.click();
    content('jooh').querySelector('#jooh-hack')?.click();
    await vi.advanceTimersByTimeAsync(HACK_TAIL_MS);
    playArcade(9);
    await vi.advanceTimersByTimeAsync(2 * 1000);

    // Take the shell's windows down before re-pointing window.__broStore:
    // fresh stores each day, and the shell's 1s intervals must not keep
    // ticking the retired one — noise this store-level week doesn't need.
    for (const id of [...App.windows.keys()]) App.close(id, { silent: true });

    // Simulate a week of days by carrying the soul to a fresh store each
    // midnight — the real exportState() → importState() path. Every import
    // re-heals the milestone flags from the memories themselves, so a pinned
    // legend can never be re-minted, and the fade pass runs on each boot.
    // (jsdom localStorage is unusable here, so the raw save key is not an
    // option — the export path is the honest cross-device carrier anyway.)
    const { createStore } = await import('../src/state.js');
    let live = store();
    for (let day = 0; day < 7; day++) {
      jumpTo(23, 58); // next midnight, wherever the last iteration left us
      const snapshot = live.exportState();
      live = createStore({ storage: null }); // a fresh device, no mirrors
      expect(live.importState(snapshot)).toBe(true);
      window.__broStore = live;
      vi.advanceTimersByTime(1100);
      await vi.advanceTimersByTimeAsync(1 * 1000);
      expect(countMem(legend)).toBe(1);
      expect(countMem(firstHack)).toBe(1);
      expect(countMem(rejoined)).toBe(1);
    }
    vi.runOnlyPendingTimers();
    const problems = CONSOLE_CALLS.filter((c) => c.method === 'error' || c.method === 'warn');
    expect(problems, `save/load week failed:\n${problems.map((p) => `${p.method}: ${p.text}`).join('\n') || '(none)'}`)
      .toHaveLength(0);
  });
});
