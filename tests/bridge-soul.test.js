// Contract tests for EXPORT FOR BRIDGE: the store's live v3 export must
// survive the dev-server endpoint, land in bridge/identity/klunkdunker-soul.json,
// and be consumable by the autonomy harness's identityFromEnvelope() —
// that chain is what makes the bridge speak with Ryan's current soul.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBridgeSoulMiddleware } from '../server/bridge-soul.mjs';
import { identityFromEnvelope } from '../bridge/src/voice.js';
import { createStore } from '../src/state.js';

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
  await mw(mockReq(method, url, body), res, () => { nexted = true; });
  return { res, nexted };
}

describe('POST /api/bridge-soul middleware', () => {
  let dir, identityPath, mw, store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bridge-soul-'));
    identityPath = join(dir, 'identity', 'klunkdunker-soul.json');
    mw = createBridgeSoulMiddleware({ identityPath });
    store = createStore({ storage: null });
    store.rememberEvent('Recovered the tide codes from a dead relay.', { icon: '📡', imp: 3, pin: true });
    store.rememberEvent('Lost a run to a rogue drone. It laughed.', { icon: '🎮', imp: 2 });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes the store\'s live v3 export to the identity file', async () => {
    const envelope = JSON.parse(store.exportState());
    const { res } = await run(mw, 'POST', '/bridge-soul', JSON.stringify(envelope));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);

    expect(existsSync(identityPath)).toBe(true);
    const written = JSON.parse(readFileSync(identityPath, 'utf8'));
    expect(written.v).toBe(3);
    expect(written.kind).toBe('bro-os-soul-export');
  });

  it('produces a file the autonomy harness consumes as Ryan\'s current identity', async () => {
    await run(mw, 'POST', '/bridge-soul', store.exportState());
    const written = JSON.parse(readFileSync(identityPath, 'utf8'));
    const identity = identityFromEnvelope(written);

    const st = JSON.parse(store.exportState()).state;
    expect(identity.selfDescription).toBe(st.soul.who);
    expect(identity.specialty).toBe(st.soul.specialty);
    expect(identity.quirks).toEqual(st.soul.quirks);
    expect(identity.pinnedMemories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ icon: '📡', text: 'Recovered the tide codes from a dead relay.' }),
      ]),
    );
    expect(identity.pinnedMemories.some((m) => m.text.includes('rogue drone'))).toBe(false); // unpinned rides along, pinned lead
  });

  it('rejects non-v3 payloads without touching the identity file', async () => {
    await run(mw, 'POST', '/bridge-soul', JSON.stringify({ app: 'brogatchi', kind: 'soul-file', version: 2 }));
    expect(existsSync(identityPath)).toBe(false);
    const bad = await run(mw, 'POST', '/bridge-soul', 'not json at all');
    expect(bad.res.statusCode).toBe(400);
  });

  it('passes through non-POST requests to the next middleware', async () => {
    const get = await run(mw, 'GET', '/bridge-soul', undefined);
    expect(get.nexted).toBe(true);
    const post = await run(mw, 'POST', '/v1/chat', '{}');
    expect(post.nexted).toBe(true);
  });
});
