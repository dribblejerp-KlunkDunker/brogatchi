// Regression test for GitHub issue #1 — renderAll() vs a COMPLETED quest.
//
// The bug: renderAll() dereferences #quest-mined / #quest-goal-2, but those
// spans live inside #quest-state, whose innerHTML is rewritten to "COMPLETE ✓"
// once quest.rewarded flips true. From that moment every 1-second
// renderAll() tick threw
//   TypeError: Cannot set properties of null (setting 'textContent')
// — and, worse, the same exception aborted any event handler that called
// renderAll() mid-handler (Moltbook's tide replies stopped scheduling).
//
// This test reproduces the *exact* console state through the real UI:
// boot the real index.html + main.js in jsdom, drive the real 1-second
// ticker until the quest completes, then keep ticking and assert the
// captured console holds ZERO errors. Nothing is stubbed to make the bug
// invisible — main.js still installs its own 1s setInterval, and the
// captured console output is the same one a human would watch in DevTools.
//
// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const SHELL_HTML = readFileSync('index.html', 'utf8');

let App;
let realCreateObjectURL;
let realRevokeObjectURL;

// Every console method records into CONSOLE_CALLS; nothing is filtered, so
// "zero errors" is a real assertion over the session's output, not an
// artifact of the harness silencing noise.
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
});

afterAll(() => {
  for (const method of Object.keys(realConsole)) console[method] = realConsole[method];
});

async function bootShell() {
  document.head.innerHTML = SHELL_HTML.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
  document.body.innerHTML = SHELL_HTML.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
  document.documentElement.setAttribute('data-theme', 'cyberpunk');
  await import('../src/main.js');
  App = window.App;
}

beforeEach(() => {
  vi.useFakeTimers();
  realCreateObjectURL = URL.createObjectURL;
  realRevokeObjectURL = URL.revokeObjectURL;
  // jsdom lacks revokeObjectURL (downloadJSON defers it); the capture test in
  // moltbook.ui.test.js covers downloads, so here only the missing static is stubbed.
  URL.revokeObjectURL = vi.fn();
  CONSOLE_CALLS.length = 0;
});

afterEach(() => {
  vi.runOnlyPendingTimers(); // flush deferred revokes — must not throw either
  URL.createObjectURL = realCreateObjectURL;
  URL.revokeObjectURL = realRevokeObjectURL;
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const id of [...(App?.windows?.keys?.() ?? [])]) App.close(id, { silent: true });
  window.App = undefined;
  vi.resetModules();
});

describe('completed-quest save → renderAll() console silence (issue #1)', () => {
  it('runs the real ticker through and past quest completion with zero console errors', async () => {
    await bootShell();

    // Drive the real 1-second tick loop (store.tick + renderAll) until the
    // daily quest completes: 20 CR at 1 CR / 6s → 21 mining intervals by 126s.
    vi.advanceTimersByTime(126 * 1000);

    // The completed-quest UI state is exactly the one that used to crash:
    expect(window.__broStore.state.quest.rewarded).toBe(true);
    const questState = document.getElementById('quest-state');
    expect(questState.textContent).toContain('COMPLETE ✓');
    // ...and the destroyed-subtree premise of the bug still holds:
    expect(document.getElementById('quest-mined')).toBeNull();
    expect(document.getElementById('quest-goal-2')).toBeNull();

    // Keep ticking well past completion — every renderAll() in the old build
    // threw here, once per second, for the rest of the session.
    vi.advanceTimersByTime(30 * 1000);

    // Interactions that call renderAll() mid-handler (the sneaky half of the
    // bug: handlers died after the quest completed, e.g. tide replies never
    // scheduled). Fire several, then advance through any deferred work.
    App.open('moltbook');
    const c = App.windows.get('moltbook').el.querySelector('.window-content');
    c.querySelector('#molt-new-btn').click();
    c.querySelector('#molt-input').value = 'console silence regression';
    c.querySelector('#molt-post').click();
    App.open('shop');
    App.windows.get('shop').el.querySelector('.window-content .buy-btn').click();
    App.close('shop', { silent: true });
    App.open('settings');
    App.windows.get('settings').el.querySelector('.window-content #scan-toggle').click();
    App.close('settings', { silent: true });

    vi.advanceTimersByTime(10 * 1000);
    vi.runOnlyPendingTimers();

    // The assertion: zero console errors (and no warnings) across the whole
    // completed-quest session — the exact signal the bug produced in DevTools.
    const problems = CONSOLE_CALLS.filter((c) => c.method === 'error' || c.method === 'warn');
    expect(problems, `expected a clean console, got:\n${problems.map((p) => `${p.method}: ${p.text}`).join('\n') || '(none)'}`)
      .toHaveLength(0);
  });
});
