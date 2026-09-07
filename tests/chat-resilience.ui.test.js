// UI test for the chat resilience path: when the wired brain is down the
// send must never look like a normal answer — a friendly system line appears
// (the proxy's curated wording when it has one), then firmware Ryan speaks.
// A healthy wired send renders only the answer, no degradation notice.

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const SHELL_HTML = readFileSync('index.html', 'utf8');
const GENERIC_OK = { ok: true, entries: [], actions: [] };
let chatPayload;

let App;
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

function chatContent() {
  return App.windows.get('chat').el.querySelector('.window-content');
}

async function send(message) {
  App.open('chat');
  const c = chatContent();
  c.querySelector('#chat-input').value = message;
  c.querySelector('#chat-send').click();
  await vi.advanceTimersByTimeAsync(3000); // offline-brain delay is 500–1400ms
  return c;
}

beforeEach(() => {
  vi.useFakeTimers();
  CONSOLE_CALLS.length = 0;
  // The shell's boot fetches answer generically; the CHAT endpoint answers
  // with whatever the current test scenario needs.
  chatPayload = { ok: false };
  vi.stubGlobal('fetch', vi.fn(async (url) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).includes('v1/chat') ? chatPayload : GENERIC_OK),
  })));
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const id of [...(App?.windows?.keys?.() ?? [])]) App.close(id, { silent: true });
  window.App = undefined;
  vi.resetModules();
});

describe('chat send vs a down wired brain', () => {
  it('a failed send surfaces the friendly system line, then firmware Ryan', async () => {
    await bootShell();
    chatPayload = { ok: false, error: 'wired-brain-down', friendly: 'The wired brain is unreachable right now — Ryan is answering from firmware backup.' };
    const c = await send('are you still there, Ryan?');

    const body = c.querySelector('#chat-messages').textContent;
    expect(body).toContain('The wired brain is unreachable right now — Ryan is answering from firmware backup.');
    expect(body).toContain('[RYAN]:'); // firmware answer still lands — never a dead send
    // The degradation is marked in the syslog too.
    expect(document.getElementById('sys-log').textContent).toContain('firmware backup');
  });

  it('falls back to the generic notice when the proxy sends no friendly text', async () => {
    await bootShell();
    chatPayload = { ok: false };
    const c = await send('status');
    expect(c.querySelector('#chat-messages').textContent).toContain('WIRE LINK DEGRADED');
  });

  it('a healthy wired send renders only the answer — no degradation noise', async () => {
    await bootShell();
    chatPayload = { ok: true, text: 'Wired and dangerous, pilgrim.' };
    const c = await send('you there?');
    const body = c.querySelector('#chat-messages').textContent;
    expect(body).toContain('Wired and dangerous, pilgrim.');
    expect(body).not.toContain('WIRE LINK');
    expect(body).not.toContain('firmware backup');
  });

  it('the whole degraded session stays console-clean', async () => {
    await bootShell();
    chatPayload = { ok: false, error: 'wired-brain-down', friendly: 'Down.' };
    await send('clean console check');
    await send('and again');
    const problems = CONSOLE_CALLS.filter((p) => p.method === 'error' || p.method === 'warn');
    expect(problems, problems.map((p) => `${p.method}: ${p.text}`).join('\n')).toHaveLength(0);
  });
});
