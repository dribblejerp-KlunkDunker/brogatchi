// Contract tests for GET /api/bridge-status: the dev/preview endpoint must
// report the harness's live state.json (through the bridge's own loadState,
// so defaults + day rollover match), its caps, and the parsed tail of
// actions.log — while passing through anything that is not its route.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBridgeStatusMiddleware, parseActionsLog } from '../server/bridge-status.mjs';

function mockReq(method, url, body) {
  return {
    method,
    url,
    on: (ev, cb) => { if (ev === 'data') cb(Buffer.from(body || '')); if (ev === 'end') cb(); },
  };
}

function mockRes() {
  const res = { statusCode: null, body: null, headers: null };
  res.writeHead = (code, headers) => { res.statusCode = code; res.headers = headers; };
  res.end = (text) => { res.body = JSON.parse(text); };
  return res;
}

async function call(mw, method, url, body) {
  const res = mockRes();
  let nexted = false;
  await mw(mockReq(method, url, body), res, () => { nexted = true; });
  return { res, nexted };
}

const TODAY = new Date().toISOString().slice(0, 10);

describe('GET /api/bridge-status middleware', () => {
  let dir, mw;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bridge-status-'));
    mw = createBridgeStatusMiddleware({ bridgeDir: dir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports the live state, caps, and parsed actions.log', async () => {
    writeFileSync(join(dir, 'state.json'), JSON.stringify({
      autonomy: true, day: TODAY, postsToday: 1, commentsToday: 2, dmsToday: 0,
      lastTickAt: '2026-09-07T01:14:04.227Z', registered: false, handle: 'KlunkDunker',
    }));
    writeFileSync(join(dir, 'actions.log'), [
      '[2026-09-07T01:02:16.345Z] DRY-RUN POST /posts {"title":"The Theology of the Frame Drop"}',
      'not a log line at all',
      '[2026-09-07T01:03:36.246Z] POST /posts {"title":"live one"}',
      '[2026-09-07T01:14:04.227Z] DRY-RUN GET /posts?sort=hot&limit=10',
    ].join('\n'));

    const { res, nexted } = await call(mw, 'GET', '/bridge-status');
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.handle).toBe('KlunkDunker');
    expect(res.body.autonomy).toBe(true);
    expect(res.body.registered).toBe(false);
    expect(res.body.caps).toEqual({ posts: 2, comments: 6, dms: 2 });
    expect(res.body.today).toEqual({ posts: 1, comments: 2, dms: 0 });
    // malformed line skipped; dry/live classified; order preserved
    expect(res.body.actions).toHaveLength(3);
    expect(res.body.actions[0]).toEqual({
      t: '2026-09-07T01:02:16.345Z',
      kind: 'dry',
      text: 'DRY-RUN POST /posts {"title":"The Theology of the Frame Drop"}',
    });
    expect(res.body.actions[1].kind).toBe('live');
    expect(res.body.actions[2].kind).toBe('dry');
  });

  it('falls back to harness defaults when no files exist yet', async () => {
    const { res } = await call(mw, 'GET', '/bridge-status');
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.autonomy).toBe(true);
    expect(res.body.today).toEqual({ posts: 0, comments: 0, dms: 0 });
    expect(res.body.actions).toEqual([]);
  });

  it('survives a corrupt state.json (loadState defaults, not a 500)', async () => {
    writeFileSync(join(dir, 'state.json'), '{not json');
    const { res } = await call(mw, 'GET', '/bridge-status');
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.handle).toBe('KlunkDunker');
  });

  it('rolls caps over when state.json is from a previous day', async () => {
    writeFileSync(join(dir, 'state.json'), JSON.stringify({
      autonomy: true, day: '2020-01-01', postsToday: 2, commentsToday: 6, dmsToday: 2,
    }));
    const { res } = await call(mw, 'GET', '/bridge-status');
    expect(res.body.day).toBe(TODAY);
    expect(res.body.today).toEqual({ posts: 0, comments: 0, dms: 0 });
  });

  it('only owns GET /bridge-status — everything else passes through', async () => {
    for (const [method, url] of [['POST', '/bridge-status'], ['GET', '/bridge-soul'], ['GET', '/chat'], ['PUT', '/bridge-status']]) {
      const { nexted } = await call(mw, method, url, '{}');
      expect(nexted, `${method} ${url}`).toBe(true);
    }
  });
});

describe('parseActionsLog', () => {
  it('keeps the newest lines up to max and truncates long payloads', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `[2026-09-07T00:00:${String(i % 60).padStart(2, '0')}.000Z] DRY-RUN GET /page-${i} ${'x'.repeat(300)}`);
    const out = parseActionsLog(lines.join('\n'), 40);
    expect(out).toHaveLength(40);
    expect(out[0].text.startsWith('DRY-RUN GET /page-20')).toBe(true);
    expect(out[39].text.length).toBe(200);
  });
});
