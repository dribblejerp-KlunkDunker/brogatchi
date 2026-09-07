// Permanent regression version of the manual "click every button in every
// window while watching the console" sweep.
//
// Bar: after clicking EVERY button in EVERY dock window, the captured console
// holds ZERO errors and warnings. Buttons are re-queried after every click —
// renderers rewrite subtrees (the innerHTML pattern), so a pre-collected list
// would click ghosts and miss buttons that only appear mid-sweep.
//
// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const SHELL_HTML = readFileSync('index.html', 'utf8');

let App;
let realGetContext;
let realConfirm;
let realAlert;
let realPrompt;
let realRevokeObjectURL;

const CONSOLE_CALLS = [];
let realConsole;

beforeAll(() => {
  realConsole = {};
  for (const method of ['error', 'warn', 'log', 'info', 'debug']) {
    realConsole[method] = console[method];
    console[method] = (...args) => {
      const text = args.map((a) => String(a)).join(' ');
      // jsdom's own "Not implemented: window.alert"-style noise is harness
      // chatter, not an app error — everything else counts.
      if (text.includes('Not implemented')) return;
      CONSOLE_CALLS.push({ method, text });
      realConsole[method](...args);
    };
  }
  // jsdom has no canvas 2D context — same absorbing stub as the arcade tests,
  // so launching cabinets through real card clicks is a real hosted run.
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

function dockWindows() {
  return [...document.querySelectorAll('#dock .dock-btn')]
    .map((b) => b.getAttribute('onclick')?.match(/App\.open\('([a-z]+)'\)/)?.[1])
    .filter(Boolean);
}

beforeEach(() => {
  vi.useFakeTimers();
  realConfirm = window.confirm;
  realAlert = window.alert;
  realPrompt = window.prompt;
  realRevokeObjectURL = URL.revokeObjectURL;
  // The sweep clicks everything — destructive confirmations are DECLINED so
  // factory-reset flows run their guard path without wiping the sweep state.
  window.confirm = vi.fn(() => false);
  window.alert = vi.fn(() => {});
  window.prompt = vi.fn(() => null);
  URL.revokeObjectURL = vi.fn();
  // Stub is contract-faithful: /api/bridge-status ok:true ALWAYS carries the
  // full status shape (the endpoint is its only producer) — a lazy {ok:true}
  // here would false-positive the BRIDGE render.
  vi.stubGlobal('fetch', vi.fn(async (url) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).includes('bridge-status') ? {
      ok: true,
      handle: 'KlunkDunker', autonomy: true, registered: false, agentId: null,
      day: '2026-09-07', lastTickAt: null, lastPostAt: null, lastCommentAt: null,
      caps: { posts: 2, comments: 6, dms: 2 }, today: { posts: 0, comments: 0, dms: 0 },
      actions: [],
    } : { ok: true, entries: [] }),
  })));
  CONSOLE_CALLS.length = 0;
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  window.confirm = realConfirm;
  window.alert = realAlert;
  window.prompt = realPrompt;
  URL.revokeObjectURL = realRevokeObjectURL;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const id of [...(App?.windows?.keys?.() ?? [])]) App.close(id, { silent: true });
  window.App = undefined;
  vi.resetModules();
});

describe('button sweep: every button in every window, zero console errors', () => {
  it('clicks the whole dock and every button it can find, console-silent throughout', async () => {
    await bootShell();
    const windows = dockWindows();
    expect(windows.length).toBeGreaterThanOrEqual(9);

    let clicked = 0;
    const problems = () => CONSOLE_CALLS.filter((c) => c.method === 'error' || c.method === 'warn');

    for (const id of windows) {
      App.open(id);
      expect(App.windows.has(id), `${id} did not open`).toBe(true);

      // Sweep until no unclicked button remains in the CURRENT subtree.
      // (A window may close itself mid-sweep — e.g. arcade's BACK TO ARCADE
      // closes + reopens — in which case the sweep for that window is done.)
      for (let guard = 0; guard < 250; guard++) {
        const w = App.windows.get(id);
        if (!w) break;
        const btn = w.el.querySelector('button:not([data-swept]), [role="button"]:not([data-swept])');
        if (!btn) break;
        btn.dataset.swept = '1';
        const label = btn.textContent.trim().slice(0, 40) || btn.id || btn.className;
        btn.click();
        clicked += 1;
        await vi.advanceTimersByTimeAsync(1000);
        const p = problems();
        if (p.length) {
          throw new Error(`console problem after clicking "${label}" in ${id}:\n${p.map((x) => `${x.method}: ${x.text}`).join('\n')}`);
        }
      }

      // Let the window's own deferred work finish before moving on.
      await vi.advanceTimersByTimeAsync(2000);
      if (App.windows.has(id)) App.close(id, { silent: true });
    }

    // The dock itself. Its buttons carry inline onclick="App.open('x')"
    // handlers, and jsdom cannot bind module-set globals into inline handler
    // scope (verified: a dock click right after boot ReferenceErrors while
    // window.App is set and window === globalThis — a harness realm quirk,
    // not an app bug; real browsers resolve it). So exercise the exact
    // behavior the handler performs: parse the id, open through App.
    for (const btn of document.querySelectorAll('#dock .dock-btn')) {
      const id = btn.getAttribute('onclick')?.match(/App\.open\('([a-z]+)'\)/)?.[1];
      expect(id, `dock button "${btn.textContent.trim()}" has no parseable App.open handler`).toBeTruthy();
      App.open(id);
      expect(App.windows.has(id), `dock button for ${id} did not open its window`).toBe(true);
      await vi.advanceTimersByTimeAsync(500);
      const p = problems();
      if (p.length) {
        throw new Error(`console problem opening ${id} from its dock button:\n${p.map((x) => `${x.method}: ${x.text}`).join('\n')}`);
      }
      App.close(id, { silent: true });
    }

    await vi.advanceTimersByTimeAsync(5000);
    vi.runOnlyPendingTimers();

    const final = problems();
    expect(final, `sweep console problems:\n${final.map((x) => `${x.method}: ${x.text}`).join('\n') || '(none)'}`)
      .toHaveLength(0);
    // The sweep must not be vacuous. The shell's initial button population
    // across the 9 dock windows is ~27 (games add more only mid-run, which
    // the arcade's own UI tests cover) — a big drop means windows stopped
    // rendering their controls and this sweep silently stopped covering them.
    expect(clicked).toBeGreaterThan(20);
  });
});
