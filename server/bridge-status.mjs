// server/bridge-status.mjs — dev/preview endpoint that puts the autonomy
// harness on the app's desktop:
//
//   GET /api/bridge-status
//   → { ok, handle, autonomy, registered, day, lastTickAt/PostAt/CommentAt,
//       caps, today:{posts,comments,dms}, actions:[{t, kind, text}] }
//
// Reads bridge/state.json (through the bridge's own loadState, so day
// rollover and defaults match the harness exactly) and tails actions.log —
// the same audit trail `node bridge/cli.js` writes. Read-only: the endpoint
// cannot modify the harness. Static hosting has no endpoint; the BRIDGE
// window renders an offline note there.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPS, loadState } from '../bridge/src/agent.js';

const DEFAULT_BRIDGE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../bridge',
);
const MAX_ACTION_CHARS = 200;

function send(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  });
  res.end(JSON.stringify(obj));
}

// actions.log lines look like "[2026-09-07T01:14:04.227Z] DRY-RUN GET /posts…"
// (moltbook client requests) or raw tick-event JSON (agent notes). Malformed
// lines are skipped, not fatal.
export function parseActionsLog(text, max = 40) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^\[([^\]]+)\]\s?(.+)$/.exec(line.trim());
    if (!m) continue;
    out.push({
      t: m[1],
      kind: m[2].startsWith('DRY-RUN') ? 'dry' : 'live',
      text: m[2].slice(0, MAX_ACTION_CHARS),
    });
  }
  return out.slice(-max);
}

export function createBridgeStatusMiddleware({ bridgeDir = DEFAULT_BRIDGE_DIR, maxActions = 40 } = {}) {
  return async function bridgeStatusMiddleware(req, res, next) {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.method !== 'GET' || !req.url?.startsWith('/bridge-status')) return next();

    try {
      const state = loadState(resolve(bridgeDir, 'state.json'));
      let actions = [];
      try {
        actions = parseActionsLog(readFileSync(resolve(bridgeDir, 'actions.log'), 'utf8'), maxActions);
      } catch { /* no actions.log yet — the harness has not stirred */ }
      return send(res, 200, {
        ok: true,
        handle: state.handle,
        autonomy: state.autonomy !== false,
        registered: !!state.registered,
        agentId: state.agentId,
        day: state.day,
        lastTickAt: state.lastTickAt,
        lastPostAt: state.lastPostAt,
        lastCommentAt: state.lastCommentAt,
        caps: CAPS,
        today: { posts: state.postsToday, comments: state.commentsToday, dms: state.dmsToday },
        actions,
      });
    } catch (err) {
      return send(res, 500, { ok: false, error: `bridge status unavailable: ${err.message}` });
    }
  };
}
