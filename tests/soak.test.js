// Console-silence SOAK test — the issue #1 approach generalized.
//
// The bar: boot the REAL index.html + main.js in jsdom, visit EVERY window on
// the dock, exercise each one, and keep the app's real tickers running across
// several fake minutes — with ZERO console errors (and warnings) the whole
// time. Where tests/renderall.console.test.js pins one crash, this pins the
// property: nothing, anywhere in the shell, logs.
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
  // jsdom's canvas has no 2D context — same self-recording stub as the arcade
  // UI tests, so launching a cabinet in the soak is a real hosted run.
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
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => ctxStub,
    configurable: true,
  });
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

// Every window the dock offers — parsed from the dock's own App.open()
// handlers, so a new app is soaked automatically.
function dockWindows() {
  return [...document.querySelectorAll('#dock .dock-btn')]
    .map((b) => b.getAttribute('onclick')?.match(/App\.open\('([a-z]+)'\)/)?.[1])
    .filter(Boolean);
}

const content = (id) => App.windows.get(id)?.el.querySelector('.window-content');

// Per-window safe exercises: real UI actions with deterministic outcomes —
// no factory resets, no exports, no destructive buttons.
const EXERCISE = {
  moltbook: () => {
    const c = content('moltbook');
    c.querySelector('#molt-new-btn')?.click();
    const input = c.querySelector('#molt-input');
    if (input) { input.value = 'soak test transmission from the deep tide'; input.dispatchEvent(new window.Event('input', { bubbles: true })); }
    c.querySelector('#molt-post')?.click();
  },
  shop: () => content('shop').querySelector('.buy-btn')?.click(), // pizza at 50 CR on the fresh slate
  settings: () => content('settings').querySelector('#scan-toggle')?.click(),
  arcade: () => {
    content('arcade').querySelector('button[data-game="loot"]')?.click();
    const cvs = content('arcade')?.querySelector('#game-canvas');
    expect(cvs?.__game).toBeTruthy(); // a real hosted run during the soak
    cvs.__game.score = 7;
    cvs.__game.gameOver(20);          // pays out through the real HUD path
    content('arcade').querySelector('#game-exit')?.click();
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  realCreateObjectURL = URL.createObjectURL;
  realRevokeObjectURL = URL.revokeObjectURL;
  URL.revokeObjectURL = vi.fn();
  // The bridge window polls /api/bridge-status and the shell boots with fetches;
  // a dev server does not exist in jsdom — answer everything with clean JSON so
  // the soak exercises live-render paths deterministically.
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, handle: 'KlunkDunker', autonomy: true, registered: false, agentId: null, day: '2026-09-07', lastTickAt: null, lastPostAt: null, lastCommentAt: null, caps: { posts: 2, comments: 6, dms: 2 }, today: { posts: 0, comments: 0, dms: 0 }, actions: [], entries: [] }),
  })));
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

describe('console-silence soak: every window, several fake minutes, zero errors', () => {
  it('survives 5 fake minutes across the whole dock with a clean console', { timeout: 30000 }, async () => {
    await bootShell();
    const windows = dockWindows();
    // the dock must be fully wired — the core windows all reachable from it
    expect(windows).toEqual(expect.arrayContaining(['chat', 'arcade', 'shop', 'moltbook', 'journal', 'bridge', 'settings']));

    // PHASE 1 — visit every window: open, 15s of real ticking inside it,
    // exercise it, leave it open (windows stack — the shell must cope).
    for (const id of windows) {
      App.open(id);
      expect(App.windows.has(id), `${id} did not open`).toBe(true);
      await vi.advanceTimersByTimeAsync(15 * 1000);
      try {
        EXERCISE[id]?.();
        await vi.advanceTimersByTimeAsync(5 * 1000);
      } catch (err) {
        throw new Error(`exercise('${id}') threw: ${err.message}`);
      }
    }

    // PHASE 2 — 3 more fake minutes with EVERYTHING open at once: every
    // window's interval fires every second, all sharing one shell.
    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);

    // PHASE 3 — tear down in reverse and keep the shell alive 30s: teardown
    // paths (game loops, bridge poll, synth) must stop cleanly, not log.
    for (const id of [...windows].reverse()) App.close(id, { silent: true });
    await vi.advanceTimersByTimeAsync(30 * 1000);
    vi.runOnlyPendingTimers();

    // THE BAR: zero console errors and warnings across the entire session —
    // boot, every window, every ticker, every teardown.
    const problems = CONSOLE_CALLS.filter((c) => c.method === 'error' || c.method === 'warn');
    expect(problems, `clean-console soak failed:\n${problems.map((p) => `${p.method}: ${p.text}`).join('\n') || '(none)'}`)
      .toHaveLength(0);

    // And the session really did soak: mining pays CR on the 1s loop, so the
    // balance after ~5 minutes must exceed the starting 60.
    expect(window.__broStore.state.coins).toBeGreaterThan(60);
  });

  it('reopens the heaviest windows repeatedly with no residue', async () => {
    await bootShell();
    const heavy = ['arcade', 'moltbook', 'bridge', 'journal', 'chat'];
    for (let round = 0; round < 3; round++) {
      for (const id of heavy) {
        App.open(id);
        await vi.advanceTimersByTimeAsync(10 * 1000);
        App.close(id, { silent: true });
        await vi.advanceTimersByTimeAsync(2 * 1000);
      }
    }
    vi.runOnlyPendingTimers();
    const problems = CONSOLE_CALLS.filter((c) => c.method === 'error' || c.method === 'warn');
    expect(problems, `open/close soak failed:\n${problems.map((p) => `${p.method}: ${p.text}`).join('\n') || '(none)'}`)
      .toHaveLength(0);
  });
});
