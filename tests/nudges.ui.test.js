// UI test for NUDGES in the real shell: the CFG section renders, the
// permission flow behaves for granted/denied/unsupported browsers, the
// tick consumer sends via a stubbed Notification when the tab is
// unfocused (jsdom's hasFocus() is false by default — the reviewed spec's
// jsdom truth), debounces the second tick, and a focused tab never sends.
//
// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

const SHELL_HTML = readFileSync('index.html', 'utf8');

let App;
let realGetContext;
let realConsoleError;

beforeAll(() => {
  realConsoleError = console.error;
  console.error = (...args) => {
    if (String(args[0]).includes('Not implemented')) return; // jsdom noise
    realConsoleError(...args);
  };
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
  console.error = realConsoleError;
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', realGetContext);
});

afterEach(() => {
  // The 1s tick + boot timers must not outlive their test — a prior
  // instance's ticker firing into this suite's fresh env is exactly the
  // cross-test leak this suite exists to catch.
  window.__broTick?.stop?.();
  window.__broBootOverlay?.stop?.();
  for (const id of [...(App?.windows?.keys?.() ?? [])]) App.close(id, { silent: true });
  window.App = undefined;
  window.__broStore = undefined;
  delete window.Notification;
  vi.restoreAllMocks();
  vi.resetModules();
});

// CI runs at arbitrary UTC hours — inside quiet hours (22–8) the crisis
// lanes are CORRECTLY silent. Every send test pins noon via the hook's
// documented handle so the suite tests the doorbell, not the clock.
function pinNoon() { window.__broNudges?.pinHour?.(12); }

async function bootShell() {
  try { localStorage.clear(); } catch { /* storage-free environments */ }
  try { sessionStorage.clear(); } catch { /* same */ }
  document.head.innerHTML = SHELL_HTML.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
  document.body.innerHTML = SHELL_HTML.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
  document.documentElement.setAttribute('data-theme', 'cyberpunk');
  await import('../src/main.js');
  App = window.App;
}

function openSettings() {
  App.open('settings');
  return App.windows.get('settings');
}

/** Stub the Notification API: granted or denied, recording constructions. */
function stubNotification(mode) {
  const constructed = [];
  const N = class Notification {
    constructor(title, opts) { this.title = title; this.opts = opts; constructed.push({ title, opts }); this.close = vi.fn(); }
  };
  if (mode === 'granted') {
    N.requestPermission = vi.fn().mockResolvedValue('granted');
    N.permission = 'granted';
  } else {
    N.requestPermission = vi.fn().mockResolvedValue('denied');
    N.permission = 'denied';
  }
  window.Notification = N;
  return constructed;
}

describe('NUDGES — the SYSTEM.CFG section', () => {
  it('renders OFF with the toggle and the quiet-hours note', async () => {
    await bootShell();
    const win = openSettings();
    expect(win.el.querySelector('#nudges-status')?.textContent).toBe('OFF');
    expect(win.el.querySelector('#nudges-toggle')?.textContent).toBe('ENABLE');
    expect(win.el.textContent).toContain('quiet 22:00');
  });

  it('granted permission → ON, save persisted, toggle flips', async () => {
    stubNotification('granted');
    await bootShell();
    const win = openSettings();
    win.el.querySelector('#nudges-toggle').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(win.el.querySelector('#nudges-status')?.textContent).toBe('ON');
    expect(win.el.querySelector('#nudges-toggle')?.textContent).toBe('DISABLE');
    expect(window.__broStore.state.nudges.enabled).toBe(true);
    const logText = document.querySelector('#sys-log')?.textContent ?? '';
    expect(logText).toContain('NUDGES online');
  });

  it('denied permission → BLOCKED, save stays off', async () => {
    stubNotification('denied');
    await bootShell();
    const win = openSettings();
    win.el.querySelector('#nudges-toggle').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(win.el.querySelector('#nudges-status')?.textContent).toContain('BLOCKED');
    expect(window.__broStore.state.nudges.enabled).toBe(false);
  });

  it('no Notification API → BLOCKED without prompting (jsdom truth)', async () => {
    await bootShell(); // no stub — window.Notification absent
    const win = openSettings();
    win.el.querySelector('#nudges-toggle').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(win.el.querySelector('#nudges-status')?.textContent).toContain('BLOCKED');
    expect(window.__broStore.state.nudges.enabled).toBe(false);
  });

  it('DISABLE after enable turns it off again', async () => {
    stubNotification('granted');
    await bootShell();
    const win = openSettings();
    win.el.querySelector('#nudges-toggle').click();
    await new Promise((r) => setTimeout(r, 0));
    win.el.querySelector('#nudges-toggle').click(); // off
    expect(win.el.querySelector('#nudges-status')?.textContent).toBe('OFF');
    expect(window.__broStore.state.nudges.enabled).toBe(false);
  });
});

describe('NUDGES — the send path in the tick consumer', () => {
  it('unfocused tab + starving bro: sends once, logs, debounces the second tick', async () => {
    const sent = stubNotification('granted');
    await bootShell();
    pinNoon();
    const win = openSettings();
    win.el.querySelector('#nudges-toggle').click();
    await new Promise((r) => setTimeout(r, 0));

    // jsdom's document.hasFocus() is false by default — the doorbell arms.
    // Seed a starvation crisis directly (the vitals the panel would show).
    const store = window.__broStore;
    store.state.stats.hunger = 10;
    // the tick loop runs on the real 1s interval — wait for one pass
    await new Promise((r) => setTimeout(r, 1400));
    expect(sent.length).toBeGreaterThanOrEqual(1);
    expect(sent[0].title).toContain('Ryan is starving');
    expect(sent[0].opts.tag).toBe('hunger');
    const countAfterFirst = sent.length;
    const logText = document.querySelector('#sys-log')?.textContent ?? '';
    expect(logText).toContain('[NUDGE]');

    // second tick inside the 6h debounce: no second notification
    await new Promise((r) => setTimeout(r, 1300));
    expect(sent.length).toBe(countAfterFirst);
  }, 15_000);

  it('a focused tab never sends and consumes no cooldown', async () => {
    const sent = stubNotification('granted');
    await bootShell();
    pinNoon();
    const win = openSettings();
    win.el.querySelector('#nudges-toggle').click();
    await new Promise((r) => setTimeout(r, 0));
    const store = window.__broStore;
    store.state.stats.hunger = 10;
    // Deterministic against the real 1s tick: sample the spy across MANY
    // short waits instead of one long one, so a tick can't land between
    // mock phases unnoticed. Focused phase: nothing sends, nothing stamps.
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 200));
    expect(sent.filter((n) => n.title.includes('starving'))).toHaveLength(0);
    // unfocus: the FIRST qualifying tick sends (no cooldown was consumed)
    hasFocus.mockReturnValue(false);
    for (let i = 0; i < 24 && sent.filter((n) => n.title.includes('starving')).length === 0; i++) {
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(sent.filter((n) => n.title.includes('starving'))).toHaveLength(1);
    hasFocus.mockRestore();
  }, 15_000);

  it('disabled nudges never send, even in a crisis', async () => {
    const sent = stubNotification('granted');
    await bootShell();
    pinNoon();
    const store = window.__broStore;
    store.state.stats.hunger = 10; // crisis, but the toggle is OFF
    await new Promise((r) => setTimeout(r, 1400));
    expect(sent).toHaveLength(0);
  }, 15_000);
});
