// ═══════════════════════════════════════════════════════════════
// BRO_OS 3.0 // src/persist.js — TIERED MEMORY REDUNDANCY
// "Whatever happens, the memories must never be lost."
//
// Tiers (independent failure domains):
//   1. PRIMARY   localStorage[bro_os_3]          — written on every mutation
//   2. BACKUP    localStorage[bro_os_3_backup]   — throttled (≥10 s) mirror
//   3. SESSION   sessionStorage[bro_os_3_session]— mirrored on every sync
//   4. IDB       IndexedDB[bro-os-soul/mirrors]  — debounced async mirror
//
// Auto-export: main.js subscribes to every state mutation and calls
// sync(), so each interaction re-mirrors the soul (session instantly,
// backup throttled, IDB debounced) — cheap JSON setItem calls, no
// serialization work beyond what the store already did.
//
// Recovery cascade on boot: primary → backup → session → IDB,
// freshest lastTick wins. All tiers are optional; a missing API
// (sandboxed iframe, private mode) just switches that tier off.
// ═══════════════════════════════════════════════════════════════

export const RKEYS = {
  primary: 'bro_os_3',
  backup: 'bro_os_3_backup',
  session: 'bro_os_3_session',
};

export function createRedundancy({ local = null, session = null, now = () => Date.now() } = {}) {
  let dbPromise = null;
  let lastBackup = 0;

  const status = { primary: false, backup: null, session: false, idb: false, lastSync: null };

  // IDB writer: interval-based (a debounce never settles while the
  // 1 s tick keeps emitting). Writes at most every 5 s, only on change.
  let latestRaw = null;
  let lastIdbRaw = null;
  setInterval(() => {
    if (latestRaw && latestRaw !== lastIdbRaw) {
      lastIdbRaw = latestRaw;
      idbPut(latestRaw);
    }
  }, 5000);

  /* ── IndexedDB tier (async, large quota, separate API path) ── */
  function openIdb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open('bro-os-soul', 1);
        req.onupgradeneeded = () => { try { req.result.createObjectStore('mirrors'); } catch { resolve(null); } };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
    return dbPromise;
  }

  function idbPut(raw) {
    openIdb().then((db) => {
      if (!db) { status.idb = false; return; }
      try {
        db.transaction('mirrors', 'readwrite').objectStore('mirrors').put(raw, 'latest');
        status.idb = true;
      } catch { status.idb = false; }
    });
  }

  function idbGet() {
    return openIdb().then((db) => new Promise((resolve) => {
      if (!db) return resolve(null);
      try {
        const rq = db.transaction('mirrors').objectStore('mirrors').get('latest');
        rq.onsuccess = () => resolve(typeof rq.result === 'string' ? rq.result : null);
        rq.onerror = () => resolve(null);
      } catch { resolve(null); }
    }));
  }

  /* ── helpers ── */
  function readValid(storeLike, key) {
    try {
      const raw = storeLike?.getItem(key);
      if (!raw) return null;
      const o = JSON.parse(raw);
      return o?.v === 3 ? { raw, at: Number(o.lastTick ?? 0) } : null;
    } catch { return null; }
  }

  /* ── recovery cascade ── */
  function restorePrimary() {
    if (readValid(local, RKEYS.primary)) return null; // healthy
    const cand = [
      { hit: readValid(local, RKEYS.backup), src: 'backup' },
      { hit: readValid(session, RKEYS.session), src: 'session' },
    ]
      .filter((c) => c.hit)
      .sort((a, b) => b.hit.at - a.hit.at)[0];
    if (cand && local) {
      try { local.setItem(RKEYS.primary, cand.hit.raw); return cand.src; } catch { /* full */ }
    }
    return null;
  }

  async function restoreFromIdbIfPrimaryStillMissing() {
    if (readValid(local, RKEYS.primary) || readValid(local, RKEYS.backup) || readValid(session, RKEYS.session)) return null;
    const raw = await idbGet();
    if (!raw) return null;
    try { if (JSON.parse(raw)?.v !== 3) return null; } catch { return null; }
    if (local) { try { local.setItem(RKEYS.primary, raw); return 'indexeddb'; } catch { /* full */ } }
    return null;
  }

  /* ── auto-export / mirroring ── */
  function sync(force = false) {
    let raw = null;
    try { raw = local?.getItem(RKEYS.primary); } catch { /* noop */ }
    if (!raw) return;
    status.lastSync = now();
    status.primary = true;

    try {
      if (session) { session.setItem(RKEYS.session, raw); status.session = true; }
    } catch { status.session = false; }

    const b = readValid(local, RKEYS.backup);
    status.backup = b ? b.at : status.backup;
    if (force || !b || now() - lastBackup > 10000) {
      lastBackup = now();
      try { local.setItem(RKEYS.backup, raw); status.backup = now(); } catch { /* quota */ }
    }

    latestRaw = raw; // picked up by the IDB interval writer
  }

  return { sync, restorePrimary, restoreFromIdbIfPrimaryStillMissing, status };
}
