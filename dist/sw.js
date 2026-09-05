/* ═══════════════════════════════════════════════════════════
   BRO_OS 3.0 // public/sw.js — OFFLINE SHELL SERVICE WORKER
   Network-first for navigations (fresh deploys win, hard refresh
   picks them up), stale-while-revalidate for same-origin statics.
   Registered only in production builds (see src/main.js).
   ═══════════════════════════════════════════════════════════ */

const CACHE = 'bro-os-3-shell-v1';
const CORE = ['./', './index.html', './manifest.json', './favicon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE).catch(() => null)) // partial is fine
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never intercept CDN fonts etc.

  // Navigations: network-first, fall back to cached shell offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => null);
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Statics (hashed assets, icons): stale-while-revalidate
  e.respondWith(
    caches.match(req).then((hit) => {
      const refresh = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
          }
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});
