// Bro OS service worker.
// Strategy: network-first for navigations (so dev/HMR and fast-refreshed
// index.html always win), stale-while-revalidate for other same-origin GETs,
// and NEVER cache /api/* (Ryan's brain must never serve stale answers).

const CACHE = 'bro-os-v1';

// Scope-relative paths ('./x') so the worker also works from a subpath
// deploy like GitHub Pages project sites (/<repo>/).
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['./', './manifest.webmanifest']))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // never cache API

  if (req.mode === 'navigate') {
    // Always try the network (fresh app + HMR in dev); fall back to shell offline.
    e.respondWith(fetch(req).catch(() => caches.match('./')));
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});

// Local notification scheduling: the app posts a message with { type, title, body, delay }.
// The SW sets a timeout and fires a notification even if the tab is in the background.
const pendingTimers = new Map();
self.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || d.type !== 'schedule-notification') return;
  const key = d.tag || 'bro-nudge';
  if (pendingTimers.has(key)) clearTimeout(pendingTimers.get(key));
  const timer = setTimeout(() => {
    pendingTimers.delete(key);
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: key,
      requireInteraction: false,
      vibrate: [200, 100, 200],
    });
  }, (d.delay || 0) * 1000);
  pendingTimers.set(key, timer);
});