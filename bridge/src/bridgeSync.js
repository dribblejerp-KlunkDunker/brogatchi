// Sync — KlunkDunker's outside-the-app life, delivered to his memory panel.
//
// The bridge logs everything he does (reads, posts, comments, DMs, owner
// injections) to bridge/memory.jsonl, but the browser app cannot read that
// file. So `node cli.js sync` converts the log into a single JSON snapshot
// written next to the app's index.html, and the app fetches it on boot and
// merges the rows into state.memories (state.js → syncBridgeMemories).
//
// Idempotent by construction: every entry carries a stable id derived from
// the row's timestamp + text, and the app skips ids it already has — so
// re-running sync, or re-syncing the same snapshot on every boot, never
// duplicates a memory. Bridge entries always merge as UNPINNED (importance
// ≤ 4): his lived 3.0 milestones and imported soul pins stay above them.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BRIDGE_DIR, REPO_DIR } from './env.js';
import { readLocalMemory } from './memory.js';

// Bridge event kind → the app memory panel's icon / importance (1-5).
export const KIND_ICONS = { read: '👁', posted: '🪶', commented: '💬', dm: '✉️', owner: '📌' };
export const KIND_IMP = { read: 1, commented: 2, dm: 3, posted: 3, owner: 4 };

// Stable id: timestamp + text hash, so the same log row always produces the
// same id (the app dedupes on it) and different rows never collide.
export function rowId(row) {
  const base = `${row?.at || ''}|${String(row?.text || '').slice(0, 80)}`;
  let h = 5381;
  for (let i = 0; i < base.length; i++) h = ((h * 33) ^ base.charCodeAt(i)) >>> 0;
  return `bridge-${row?.at || '0'}-${h.toString(36)}`;
}

// Legacy repair: rows written by the pre-fix composer embed the model's raw
// JSON (often truncated) where the title belongs — e.g. `Posted to m/x: "{"...`.
// Recover the real title where the embedded JSON still carries it; otherwise
// show the row as-is (honest history beats invented text).
export function repairPostText(text) {
  const m = String(text || '').match(/^(Posted to \S+: )([\s\S]+)$/);
  if (!m) return text;
  const rest = m[2].trim();
  if (!/^[`"']?\{/.test(rest)) return text; // a normal title, not JSON
  const title = (() => {
    try {
      const j = JSON.parse(rest);
      if (j && typeof j.title === 'string') return j.title;
    } catch { /* truncated or unescaped — fall through */ }
    const t = rest.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    return t ? t[1].replace(/\\"/g, '"') : null;
  })();
  return title ? `${m[1]}"${title}"` : text;
}

// One memory.jsonl row → one app memory entry ({ id, icon, text, imp, t, day }),
// the shape src/memory.js renders. Returns null for unusable rows.
export function toMemoryEntry(row) {
  if (!row || typeof row.text !== 'string' || !row.text.trim()) return null;
  const kind = typeof row.kind === 'string' && KIND_ICONS[row.kind] ? row.kind : 'read';
  const ts = Date.parse(row.at);
  return {
    id: rowId(row),
    icon: KIND_ICONS[kind],
    text: repairPostText(row.text.trim()).slice(0, 300),
    imp: KIND_IMP[kind] || 2,
    t: Number.isFinite(ts) ? ts : Date.now(),
    day: Number.isFinite(ts) ? new Date(ts).toLocaleDateString() : new Date().toLocaleDateString(),
  };
}

// Where the app fetches the snapshot from (repo root = the app shell root,
// so the browser path is just 'bridge-memory-log.json').
export function snapshotPath() {
  return resolve(REPO_DIR, 'bridge-memory-log.json');
}

// Convert the bridge memory log into the app snapshot. Options are for tests;
// production callers just run writeBridgeSnapshot().
export function writeBridgeSnapshot({ rowsPath, outPath } = {}) {
  const rows = readLocalMemory(rowsPath ? resolve(rowsPath) : resolve(BRIDGE_DIR, 'memory.jsonl'));
  const entries = rows.map(toMemoryEntry).filter(Boolean);
  const snapshot = {
    kind: 'bridge-memory-log',
    generatedAt: new Date().toISOString(),
    count: entries.length,
    entries,
  };
  const out = outPath ? resolve(outPath) : snapshotPath();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(snapshot, null, 2), 'utf8');
  return { out, count: entries.length };
}

// Existence helper for the CLI status panel.
export function snapshotExists() {
  return existsSync(snapshotPath());
}
