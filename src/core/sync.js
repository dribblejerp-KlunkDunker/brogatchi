// Cloud sync client: push/pull saves via the LAN proxy using a short account code.
// No passwords — the 6-char code is a shared secret you type on both devices.
// Merge strategy: latest-write-wins for full state, field-level Max for coins/steps/records.

const SYNC_CODE_KEY = 'brogatchi_sync_code';
const SYNC_VERSION_KEY = 'brogatchi_sync_version';

export function readSyncCode() {
  try {
    return (window.localStorage.getItem(SYNC_CODE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function writeSyncCode(code) {
  try {
    window.localStorage.setItem(SYNC_CODE_KEY, code.trim());
    return true;
  } catch {
    return false;
  }
}

let lastSyncedVersion = 0;

export function getSyncVersion() {
  try {
    return Number(window.localStorage.getItem(SYNC_VERSION_KEY)) || 0;
  } catch {
    return 0;
  }
}

function setSyncVersion(v) {
  try {
    window.localStorage.setItem(SYNC_VERSION_KEY, String(v));
  } catch {}
  lastSyncedVersion = v;
}

// Push the current state to the server.
// Returns { ok, version } or { ok: false } on failure.
export async function pushSync(state) {
  const code = readSyncCode();
  if (!code) return { ok: false, reason: 'no-code' };
  try {
    const res = await fetch(`/api/v1/sync/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, reason: 'server-error' };
    const data = await res.json();
    if (data.ok) {
      setSyncVersion(data.version);
      return { ok: true, version: data.version };
    }
    return { ok: false, reason: 'server-refused' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// Pull the latest state from the server. Returns { ok, state, syncedAt } or { ok: false }.
export async function pullSync() {
  const code = readSyncCode();
  if (!code) return { ok: false, reason: 'no-code' };
  try {
    const res = await fetch(`/api/v1/sync/${code}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, reason: 'server-error' };
    const data = await res.json();
    if (!data.ok || !data.state) return { ok: false, reason: 'no-state' };
    setSyncVersion(data.version || 0);
    return { ok: true, state: data.state, syncedAt: data.syncedAt };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// Merge a pulled remote state into the local state.
// Strategy: the remote state replaces local UNLESS the local state has
// higher-value fields (coins, steps, stepRecord, bestScores, level).
// This prevents sync from downgrading progress made offline.
export function mergeRemote(local, remote) {
  if (!remote || !local) return local;
  const merged = { ...remote };
  // Preserve locally-higher numeric counters
  merged.coins = Math.max(local.coins, remote.coins || 0);
  merged.steps = Math.max(local.steps, remote.steps || 0);
  merged.stepRecord = Math.max(local.stepRecord, remote.stepRecord || 0);
  merged.level = Math.max(local.level, remote.level || 1);
  merged.xp = Math.max(local.xp, remote.xp || 0);
  // Merge best scores: keep highest per game
  if (local.bestScores && remote.bestScores) {
    merged.bestScores = { ...remote.bestScores };
    for (const k of Object.keys(local.bestScores)) {
      merged.bestScores[k] = Math.max(local.bestScores[k] || 0, remote.bestScores[k] || 0);
    }
  }
  // Merge inventory: OR on miner, keep owned shirts
  if (local.inventory && remote.inventory) {
    merged.inventory = { ...remote.inventory };
    merged.inventory.miner = local.inventory.miner || remote.inventory.miner;
    if (local.inventory.shirts && remote.inventory.shirts) {
      merged.inventory.shirts = [...new Set([...local.inventory.shirts, ...remote.inventory.shirts])];
    }
  }
  // Merge journal: deduplicate by id, keep newest 24
  if (local.journal && remote.journal) {
    const seen = new Set();
    merged.journal = [...local.journal, ...remote.journal]
      .filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      })
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 24);
  }
  // Merge personalities: take higher values
  if (local.personality && remote.personality) {
    merged.personality = { ...remote.personality };
    for (const k of Object.keys(local.personality)) {
      merged.personality[k] = Math.max(local.personality[k], remote.personality[k] || 0);
    }
  }
  return merged;
}