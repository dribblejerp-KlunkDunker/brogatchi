// Contract tests for the chat proxy's resilience: the primary model 404ing
// (decommissioned — 'gemini-2.0-flash' died exactly this way) or 502ing must
// fall through to the next model in the chain, and total failure must answer
// with a curated friendly message — never a dead send.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createChatMiddleware } from '../server/proxy.mjs';

function mockReq(method, url, body) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  if (body !== undefined) {
    process.nextTick(() => {
      req.emit('data', Buffer.from(body));
      req.emit('end');
    });
  }
  return req;
}

function mockRes() {
  return {
    statusCode: null,
    body: null,
    writeHead(code) { this.statusCode = code; },
    end(b) { this.body = b ?? ''; },
  };
}

async function run(mw, method, url, body) {
  const res = mockRes();
  let nexted = false;
  mw(mockReq(method, url, body), res, () => { nexted = true; });
  // The middleware answers from inside the async 'end' handler — poll until
  // the response lands (or it passed through synchronously).
  for (let i = 0; i < 200 && res.body === null && !nexted; i++) {
    await new Promise((r) => setTimeout(r, 1));
  }
  return { res, nexted, json: () => JSON.parse(res.body) };
}

const CHAT_BODY = JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] });
const upstream = (status, body = '{}') => new Response(body, { status });

describe('POST /v1/chat middleware — model fallback', () => {
  let calls;

  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      calls.push({ url: _url, body: JSON.parse(init.body) });
      return calls.queue.shift()();
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('primary 404 (decommissioned) → next model serves the answer', async () => {
    calls.queue = [
      () => upstream(404, 'not found'),
      () => upstream(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: 'wired reply' }] } }] })),
    ];
    const { res, json } = await run(createChatMiddleware('key'), 'POST', '/v1/chat', CHAT_BODY);
    expect(res.statusCode).toBe(200);
    expect(json()).toMatchObject({ ok: true, text: 'wired reply', model: 'gemini-2.5-flash' });
    expect(calls.length).toBe(2);
    expect(calls[0].url).toContain('gemini-flash-latest');
    expect(calls[1].url).toContain('gemini-2.5-flash');
  });

  it('404 + 404 → third model serves the answer', async () => {
    calls.queue = [
      () => upstream(404),
      () => upstream(502, 'bad gateway'),
      () => upstream(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: 'lite reply' }] } }] })),
    ];
    const { json } = await run(createChatMiddleware('key'), 'POST', '/v1/chat', CHAT_BODY);
    expect(json()).toMatchObject({ ok: true, text: 'lite reply', model: 'gemini-flash-lite-latest' });
    expect(calls.length).toBe(3);
  });

  it('200 with empty candidates is treated as a failure and falls through', async () => {
    calls.queue = [
      () => upstream(200, JSON.stringify({ candidates: [] })),
      () => upstream(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: 'real text' }] } }] })),
    ];
    const { json } = await run(createChatMiddleware('key'), 'POST', '/v1/chat', CHAT_BODY);
    expect(json()).toMatchObject({ ok: true, text: 'real text', model: 'gemini-2.5-flash' });
  });

  it('every model down → 502 with the curated friendly message', async () => {
    calls.queue = [() => upstream(404), () => upstream(404), () => upstream(404)];
    const { res, json } = await run(createChatMiddleware('key'), 'POST', '/v1/chat', CHAT_BODY);
    expect(res.statusCode).toBe(502);
    const out = json();
    expect(out.ok).toBe(false);
    expect(out.error).toBe('wired-brain-down');
    expect(out.friendly).toContain('firmware backup');
    expect(out.detail).toContain('all 3 models failed');
    expect(calls.length).toBe(3);
  });

  it('a 200 with malformed JSON falls through to the next model, not a 500', async () => {
    calls.queue = [
      () => upstream(200, '<html>gateway garbage</html>'),
      () => upstream(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: 'recovered reply' }] } }] })),
    ];
    const { res, json } = await run(createChatMiddleware('key'), 'POST', '/v1/chat', CHAT_BODY);
    expect(res.statusCode).toBe(200);
    expect(json()).toMatchObject({ ok: true, text: 'recovered reply', model: 'gemini-2.5-flash' });
    expect(calls.length).toBe(2);
  });

  it('quota (429) fails fast — no pounding of the remaining models', async () => {
    calls.queue = [() => upstream(429, 'quota exceeded')];
    const { res, json } = await run(createChatMiddleware('key'), 'POST', '/v1/chat', CHAT_BODY);
    expect(res.statusCode).toBe(502);
    expect(json().friendly).toContain('firmware backup');
    expect(calls.length).toBe(1);
  });

  it('no key → 503 with the friendly firmware note (unchanged contract)', async () => {
    const { res, json } = await run(createChatMiddleware(''), 'POST', '/v1/chat', CHAT_BODY);
    expect(res.statusCode).toBe(503);
    expect(json().friendly).toContain('answering from firmware');
    expect(calls.length).toBe(0);
  });

  it('non-chat traffic still passes through', async () => {
    const { nexted } = await run(createChatMiddleware('key'), 'POST', '/v1/other', CHAT_BODY);
    expect(nexted).toBe(true);
  });
});
