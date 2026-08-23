// Zero-dependency Gemini proxy.
// Exposes POST /api/v1/chat  -> forwards to Gemini generateContent (+google_search).
// Exposes GET  /api/health   -> { ok, hasKey } for the UI to show AI status.
// The API key lives ONLY in .env, never in the browser.
//
// Works two ways:
//   1. As Vite middleware (vite.config.js) so `npm run dev` serves both
//   2. Standalone: `node server/proxy.mjs` (used for LAN/phone hosting)

import http from 'node:http';

const MODEL = 'gemini-3-flash-preview';
const ENDPOINT = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

// ---------- tiny helpers ----------
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// ---------- per-process state ----------
const CACHE_TTL_MS = 10 * 60 * 1000; // identical queries repeat cheaply for 10 min
const cache = new Map();

// ---------- rate limiting (sliding window, per IP) ----------
const WINDOW_MS = 60_000;
const MAX_REQ = 30; // 30 req/min — plenty for local play, keeps cost sane
const hits = new Map();

function allow(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_REQ) {
    hits.set(ip, list);
    return false;
  }
  list.push(now);
  hits.set(ip, list);
  return true;
}

// ---------- upstream call ----------
// If the search-grounding tool is quota-limited (very common on free keys),
// Gemini 429s only when `tools: [{google_search}]` is attached. We retry the
// same prompt once WITHOUT the tool so the app still gets a reply; the
// response is flagged `grounded:false` so the UI can show "no web search".
async function callGemini(apiKey, payload, timeoutMs = 45_000) {
  let result = await attemptGemini(apiKey, payload, timeoutMs);
  const hasSearch = Array.isArray(payload.tools) && payload.tools.some((t) => t.google_search);
  if (result.status === 429 && hasSearch) {
    await new Promise((r) => setTimeout(r, 1500));
    const withoutSearch = { ...payload, tools: [] };
    const retry = await attemptGemini(apiKey, withoutSearch, timeoutMs);
    if (retry.status === 200) {
      return { ...retry, grounded: false };
    }
  }
  return result;
}

async function attemptGemini(apiKey, payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const raw = await res.text();
    if (!res.ok) {
      return { status: res.status, error: `Gemini ${res.status}: ${raw.slice(0, 300)}` };
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return { status: 502, error: 'Gemini returned unparseable JSON' };
    }
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join('') || '';
    if (!text) {
      return { status: 502, error: 'Empty model response' };
    }
    return { status: 200, text };
  } catch (err) {
    return { status: 502, error: `Upstream failure: ${err?.message || err}` };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- weather → ambient mood mapping ----------
// Open-Meteo weather codes (WMO) mapped to the 4 ambient moods.
const WEATHER_MOOD = {
  // 0: clear sky
  '0': 'day', '1': 'day', '2': 'day',
  // 3: overcast, 45+48: fog
  '3': 'dusk', '45': 'dawn', '48': 'dawn',
  // 51-57: drizzle
  '51': 'night', '53': 'night', '55': 'night', '57': 'night',
  // 61-67: rain
  '61': 'night', '63': 'night', '65': 'night', '67': 'night',
  // 71-77: snow (quiet dawn vibes)
  '71': 'dawn', '73': 'dawn', '75': 'dawn', '77': 'dawn',
  // 80-86: rain showers
  '80': 'night', '81': 'night', '82': 'night', '85': 'night', '86': 'night',
  // 95-99: thunderstorms (very moody)
  '95': 'night', '96': 'night', '99': 'night',
};

async function handleWeather(req, res, ip) {
  const url = new URL(req.url, 'http://localhost');
  let lat = Number(url.searchParams.get('lat'));
  let lon = Number(url.searchParams.get('lon'));
  const city = (url.searchParams.get('city') || '').trim();

  // No coords given → try a rough IP geo. Trust the browser if it has them.
  if ((!lat || !lon) && !city) {
    try {
      const geo = await fetch(`http://ip-api.com/json/${ip}?fields=lat,lon`, {
        signal: AbortSignal.timeout(4000),
      });
      if (geo.ok) {
        const g = await geo.json();
        if (g.lat && g.lon) { lat = g.lat; lon = g.lon; }
      }
    } catch { /* ip geo fail — fall back */ }
  }

  // User-configured fallback city → resolve via Open-Meteo Geocoding.
  if ((!lat || !lon) && city) {
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`;
      const geo = await fetch(geoUrl, { signal: AbortSignal.timeout(5000) });
      if (geo.ok) {
        const g = await geo.json();
        if (g.results?.[0]?.latitude && g.results?.[0]?.longitude) {
          lat = g.results[0].latitude;
          lon = g.results[0].longitude;
        }
      }
    } catch { /* geocoding fail — fall through */ }
  }

  // Default to Seattle (grey, rainy, game-studio vibes)
  if (!lat || !lon) { lat = 47.61; lon = -122.33; }

  try {
    const url2 = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,temperature_2m&forecast_hours=1`;
    const meteo = await fetch(url2, { signal: AbortSignal.timeout(7000) });
    if (!meteo.ok) throw new Error(`open-meteo ${meteo.status}`);
    const data = await meteo.json();
    const code = String(data.current?.weather_code ?? 0);
    const temp = data.current?.temperature_2m;
    const mood = WEATHER_MOOD[code] || 'day';
    const labels = {
      '0': 'clear sky', '1': 'mostly clear', '2': 'partly cloudy', '3': 'overcast',
      '45': 'foggy', '48': 'rime fog',
      '51': 'light drizzle', '53': 'moderate drizzle', '55': 'dense drizzle',
      '61': 'slight rain', '63': 'moderate rain', '65': 'heavy rain',
      '71': 'light snow', '73': 'moderate snow', '75': 'heavy snow',
      '80': 'slight rain showers', '81': 'mod rain showers', '82': 'violent rain showers',
      '95': 'thunderstorm', '96': 'hail thunderstorm', '99': 'heavy thunderstorm',
    };
    return json(res, 200, {
      mood,
      condition: labels[code] || `code ${code}`,
      temp: temp != null ? Math.round(temp) : null,
      lat: Math.round(lat * 100) / 100,
      lon: Math.round(lon * 100) / 100,
    });
  } catch (err) {
    // open-meteo down, IP geo down, no network → the app's hourly clock
    // fallback is built-in and normal. Return gracefully.
    return json(res, 200, { mood: null, condition: null, temp: null });
  }
}

export function createChatMiddleware(apiKey) {
  return (req, res) => {
    const ip = req.socket?.remoteAddress || 'local';
    const url = req.url || '';

    if (req.method === 'GET' && url === '/health') {
      return json(res, 200, { ok: true, hasKey: !!apiKey, model: MODEL });
    }

    // Weather endpoint: the ambient loop uses this to choose a room mood.
    // Open-Meteo is free, no API key, and returns the current hour's weather
    // code. The client passes lat/lon (null means try IP geolocation); the
    // server never stores them.
    if (req.method === 'GET' && url.startsWith('/v1/weather')) {
      return handleWeather(req, res, ip);
    }

    // Cloud sync: push/pull saves by 6-char account code.
    if (req.method === 'PUT' && url.startsWith('/v1/sync/')) {
      return handleSyncPut(req, res, url);
    }
    if (req.method === 'GET' && url.startsWith('/v1/sync/')) {
      return handleSyncGet(req, res, url);
    }

    if (req.method !== 'POST' || url !== '/v1/chat') {
      return json(res, 404, { error: 'Not found' });
    }

    // Rate limit
    if (!allow(ip)) {
      return json(res, 429, { error: 'Rate limit hit — Ryan is catching his breath. Wait a sec.' });
    }

    readBody(req).then(async (bodyText) => {
      let body;
      try {
        body = JSON.parse(bodyText);
      } catch {
        return json(res, 400, { error: 'Bad JSON body' });
      }

      if (!apiKey) {
        return json(res, 503, { code: 'NO_KEY', error: 'GEMINI_API_KEY not set in .env' });
      }

      // Whitelist what we forward to Gemini (never trust the browser blindly)
      const payload = {
        contents: Array.isArray(body.contents) ? body.contents : [],
        tools: [{ google_search: {} }],
      };
      if (body.systemInstruction?.parts?.length) payload.systemInstruction = body.systemInstruction;
      if (!payload.contents.length) return json(res, 400, { error: 'No contents' });

      // Cache identical requests for a few minutes (news intel repeats a lot)
      const cacheKey = hash(JSON.stringify(payload));
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return json(res, 200, { text: cached.text, cached: true, grounded: cached.grounded !== false });
      }

      const result = await callGemini(apiKey, payload);
      if (result.status === 200 && result.text) {
        cache.set(cacheKey, { at: Date.now(), text: result.text, grounded: !!result.grounded });
        if (cache.size > 200) {
          const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
          cache.delete(oldest[0]);
        }
        return json(res, 200, { text: result.text, grounded: result.grounded !== false });
      }
      return json(res, result.status, { error: result.error });
    });
  };
}

// ---------- standalone mode ----------
if (process.argv[1] && process.argv[1].endsWith('proxy.mjs')) {
  const key = process.env.GEMINI_API_KEY || '';
  const port = Number(process.env.PORT || 8787);
  const middleware = createChatMiddleware(key);
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith('/api')) {
      req.url = req.url.replace(/^\/api/, '');
      return middleware(req, res);
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bro OS API proxy running. Use /api/v1/chat.');
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`[bro-os proxy] listening on http://0.0.0.0:${port} (has key: ${!!key})`);
  });
}

// ---------- cloud sync ----------
import fs from 'node:fs';
import path from 'node:path';

const SYNC_DIR = path.join(
  process.env.BRO_SYNC_DIR || path.join(import.meta.url ? path.dirname(new URL(import.meta.url).pathname) : process.cwd(), 'sync_data'),
);

function syncPath(code) {
  // Only allow alphanumeric codes, 4-8 chars
  if (!/^[a-zA-Z0-9]{4,8}$/.test(code)) return null;
  return path.join(SYNC_DIR, `${code}.json`);
}

async function handleSyncPut(req, res, url) {
  const code = url.split('/v1/sync/')[1]?.split('?')[0];
  const file = syncPath(code);
  if (!file) return json(res, 400, { error: 'Invalid sync code' });
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body);
    if (!payload.state) return json(res, 400, { error: 'Missing state' });
    // Store with server timestamp so pull can compare freshness
    const stored = {
      state: payload.state,
      syncedAt: Date.now(),
      version: 1,
    };
    // Merge with existing: keep the newer state
    let existing = null;
    try { existing = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    if (existing && existing.syncedAt >= stored.syncedAt - 1000) {
      // Server has newer or equal state — increment version and keep
      stored.version = (existing.version || 0) + 1;
    }
    fs.mkdirSync(SYNC_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(stored));
    return json(res, 200, { ok: true, version: stored.version, syncedAt: stored.syncedAt });
  } catch (e) {
    return json(res, 500, { error: 'Sync write failed' });
  }
}

async function handleSyncGet(req, res, url) {
  const code = url.split('/v1/sync/')[1]?.split('?')[0];
  const file = syncPath(code);
  if (!file) return json(res, 400, { error: 'Invalid sync code' });
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    return json(res, 200, { ok: true, state: data.state, syncedAt: data.syncedAt, version: data.version });
  } catch {
    return json(res, 200, { ok: true, state: null, syncedAt: 0, version: 0 });
  }
}