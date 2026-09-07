// server/bridge-soul.mjs — dev/preview endpoint that lets the SOUL window
// write Ryan's live v3 soul export straight into the autonomy harness:
//
//   POST /api/bridge-soul   body: { v:3, kind:'bro-os-soul-export', state:{...} }
//   → writes bridge/identity/klunkdunker-soul.json, which the bridge's
//     loadIdentity() reads — so KlunkDunker on the real network always
//     speaks with the current soul, not a stale snapshot.
//
// Static hosting has no endpoint; the SOUL window falls back to a download
// there. The path is fixed server-side and the body must be a v3 envelope —
// the endpoint cannot be coaxed into writing anywhere else.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_IDENTITY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../bridge/identity/klunkdunker-soul.json',
);
const MAX_BYTES = 4 * 1024 * 1024;

function send(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        rejectBody(new Error('soul export exceeds 4MB'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rejectBody);
  });
}

export function createBridgeSoulMiddleware({ identityPath = DEFAULT_IDENTITY } = {}) {
  return async function bridgeSoulMiddleware(req, res, next) {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.method !== 'POST' || !req.url?.startsWith('/bridge-soul')) return next();

    let envelope;
    try {
      envelope = JSON.parse(await readBody(req));
    } catch (err) {
      return send(res, 400, { ok: false, error: `Unreadable soul export: ${err.message}` });
    }
    if (
      envelope?.v !== 3 ||
      envelope?.kind !== 'bro-os-soul-export' ||
      !envelope.state ||
      typeof envelope.state !== 'object'
    ) {
      return send(res, 400, { ok: false, error: 'Expected a v3 bro-os-soul-export envelope.' });
    }

    try {
      mkdirSync(dirname(identityPath), { recursive: true });
      const body = JSON.stringify(envelope, null, 2);
      writeFileSync(identityPath, body);
      return send(res, 200, { ok: true, written: identityPath, bytes: Buffer.byteLength(body) });
    } catch (err) {
      return send(res, 500, { ok: false, error: `Could not write soul file: ${err.message}` });
    }
  };
}
