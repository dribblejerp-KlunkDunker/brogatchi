// server/proxy.mjs — zero-dependency Gemini proxy for Bro OS 3.0
// Keeps the API key on the machine that runs the dev server; the browser
// only ever talks to /api/v1/chat. If no key is configured the middleware
// answers 503 and the app's offline brain takes over (same personality).

const MODEL = 'gemini-2.0-flash';
const ENDPOINT = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

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
      return send(res, 503, { ok: false, error: 'no-key', detail: 'Set GEMINI_API_KEY in .env to wake the wired brain. Ryan is answering from firmware.' });
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

        const upstream = await fetch(ENDPOINT(apiKey), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction: system ? { parts: [{ text: system }] } : undefined,
            generationConfig: { temperature: 0.9, maxOutputTokens: 512 },
          }),
        });

        if (!upstream.ok) {
          const detail = await upstream.text().catch(() => '');
          return send(res, 502, { ok: false, error: `upstream-${upstream.status}`, detail: detail.slice(0, 300) });
        }

        const data = await upstream.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        return send(res, 200, { ok: true, text });
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
