// Thin browser client for the local proxy (/api/v1/chat).
// The gemini key never leaves the server.

let healthCache = null;
let healthAt = 0;

export async function apiHealth(force = false) {
  if (!force && healthCache && Date.now() - healthAt < 60_000) return healthCache;
  try {
    const res = await fetch('/api/health');
    healthCache = await res.json();
  } catch {
    healthCache = { ok: false, hasKey: false, error: 'unreachable' };
  }
  healthAt = Date.now();
  return healthCache;
}

// Returns { ok: true, text } or { ok: false, code, message }.
export async function chat({ systemInstruction, userText, history = [] }) {
  const contents = [
    ...(history || []),
    ...(userText ? [{ role: 'user', parts: [{ text: userText }] }] : []),
  ];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);

  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-3-flash-preview',
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          contents,
        }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) return { ok: false, code: 'NO_KEY', message: data.error || 'No API key' };
      if (res.status === 429) return { ok: false, code: 'RATE', message: data.error || 'Rate limited' };
      if (!res.ok) return { ok: false, code: 'ERROR', message: data.error || `HTTP ${res.status}` };
      if (data.text) return { ok: true, text: data.text, grounded: data.grounded !== false };
      return { ok: false, code: 'EMPTY', message: 'Empty reply' };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  return { ok: false, code: 'NETWORK', message: lastErr?.message || 'Network failed' };
}

// Fetch the current weather mood from the proxy (which calls Open-Meteo).
// Returns { mood, condition, temp } or null on failure (app falls back to
// its clock-based ambient). Pass lat/lon if the browser has geolocation;
// otherwise the proxy falls back to IP-based geolocation.
const WEATHER_CITY_KEY = 'brogatchi_weather_city';

function readWeatherCity() {
  try {
    const v = window.localStorage.getItem(WEATHER_CITY_KEY);
    return v ? v.trim() : '';
  } catch {
    return '';
  }
}

export { readWeatherCity };

export async function fetchWeather() {
  let lat, lon;
  try {
    if (navigator.geolocation) {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 5000, maximumAge: 30 * 60_000,
        });
      });
      lat = pos.coords.latitude;
      lon = pos.coords.longitude;
    }
  } catch { /* no permission / no GPS — proxy will try IP geo */ }

  const city = readWeatherCity();
  const params = new URLSearchParams();
  if (lat != null && lon != null) { params.set('lat', lat); params.set('lon', lon); }
  if (city) params.set('city', city);
  const qs = params.toString();
  const url = '/api/v1/weather' + (qs ? '?' + qs : '');

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.mood) return null; // proxy fell back — stick with clock
    return data;
  } catch {
    return null;
  }
}