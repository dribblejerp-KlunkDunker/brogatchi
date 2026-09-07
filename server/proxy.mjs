// server/proxy.mjs — zero-dependency Gemini proxy for Bro OS 3.0
// Keeps the API key on the machine that runs the dev server; the browser
// only ever talks to /api/v1/chat. If no key is configured the middleware
// answers 503 and the app's offline brain takes over (same personality).

// Model fallback chain — tried in order. The evergreen alias tracks
// Google's current flash model, but models still get decommissioned (404)
// or gateways hiccup (502): 'gemini-2.0-flash' died exactly that way in
// Sep 2026 and the proxy answered dead sends until a human noticed.
const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest'];
const ENDPOINT = (key, model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

function send(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  res.end(JSON.stringify(obj));
}

/**
 * Vite middleware factory. Handles POST /v1/chat with
 * { messages: [{ role: 'user'|'assistant', content }], system?: string }
 * and answers { ok: true, text } — or { ok: false, error }.
 */
export function createChatMiddleware(apiKey) {
  return async function chatMiddleware(req, res, next) {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.method !== 'POST' || !req.url?.startsWith('/v1/chat')) return next();

    if (!apiKey) {
      const detail = 'Set GEMINI_API_KEY in .env to wake the wired brain. Ryan is answering from firmware.';
      return send(res, 503, { ok: false, error: 'no-key', detail, friendly: detail });
    }

    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      try {
        const { messages = [], system = '' } = JSON.parse(body || '{}');
        const contents = messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(m.content || '') }],
        }));

        // Walk the fallback chain: 404 (decommissioned) and 502 (bad
        // gateway / truncated response) are worth another model; quota (429)
        // and saturation (503) would hit every model equally — fail fast.
        let lastStatus = null;
        let lastDetail = '';
        for (const model of MODELS) {
          let upstream;
          try {
            upstream = await fetch(ENDPOINT(apiKey, model), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents,
                systemInstruction: system ? { parts: [{ text: system }] } : undefined,
                generationConfig: { temperature: 0.9, maxOutputTokens: 512 },
              }),
            });
          } catch (err) {
            lastStatus = 0;
            lastDetail = String(err?.message || err);
            console.warn(`[proxy] ${model} unreachable (${lastDetail}) — trying next model`);
            continue;
          }

          if (!upstream.ok) {
            lastStatus = upstream.status;
            lastDetail = (await upstream.text().catch(() => '')).slice(0, 300);
            if (upstream.status === 404 || upstream.status === 502) {
              console.warn(`[proxy] ${model} failed (${upstream.status}) — falling back`);
              continue;
            }
            break;
          }

          const data = await upstream.json();
          const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
          if (text) return send(res, 200, { ok: true, text, model });
          // 200 with empty candidates (safety block / truncation) — same
          // user experience as a gateway failure: try the next model.
          lastStatus = 502;
          lastDetail = 'empty model response';
          console.warn(`[proxy] ${model} returned no candidates — falling back`);
        }

        return send(res, 502, {
          ok: false,
          error: 'wired-brain-down',
          detail: `all ${MODELS.length} models failed (last: ${lastStatus}) ${lastDetail}`.trim(),
          friendly: 'The wired brain is unreachable right now — Ryan is answering from firmware backup.',
        });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'proxy-error', detail: String(err?.message || err) });
      }
    });
  };
}

// Standalone mode: `node server/proxy.mjs` → http://127.0.0.1:8787/api
import { createServer } from 'node:http';
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const key = process.env.GEMINI_API_KEY || '';
  const mw = createChatMiddleware(key);
  createServer((req, res) => mw(req, res, () => {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not-found' }));
  })).listen(8787, () => {
    console.log(key ? '[proxy] wired — Gemini key detected on :8787' : '[proxy] offline-brain mode — no GEMINI_API_KEY set');
  });
}
