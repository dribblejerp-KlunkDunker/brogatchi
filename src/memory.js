// ═══════════════════════════════════════════════════════════
// BRO_OS 3.0 // src/memory.js — RYAN'S MEMORY ENGINE
// Ported from the 2.0 codebase (src/core/memory.js): tagged
// event log, importance-ranked and pinnable, with a high cap
// so nothing meaningful churns out unless his mind genuinely
// fills. Pinned milestones always survive. Adapted to the 3.0
// state shape ({ t, icon, text } entries rendered by SOUL.FILE).
// ═══════════════════════════════════════════════════════════

export const MAX_MEMORIES = 200;
export const MAX_DIARY_ENTRIES = 60;

function dayString() {
  return new Date().toLocaleDateString();
}

// Stable id for pinning/toggling.
export function memoryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// Sort: pinned milestones first, then importance, then recency
// (id is time-based, so a later id = a newer memory on ties).
export function sortMemories(memories) {
  return [...memories].sort(
    (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.imp - a.imp || String(b.id).localeCompare(String(a.id)),
  );
}

// Enforce the cap: pinned entries always survive; the unpinned tail is
// sliced to fill whatever room remains. Input need not be pre-sorted.
export function capMemories(memories) {
  const sorted = sortMemories(memories);
  const pinned = sorted.filter((m) => m.pinned);
  const unpinned = sorted.filter((m) => !m.pinned).slice(0, Math.max(0, MAX_MEMORIES - pinned.length));
  return [...pinned, ...unpinned];
}

// Add a memory. `pin: true` marks a milestone — pinned entries are never
// evicted by the cap (only the unpinned tail is sliced).
export function remember(memories, { icon = '🧠', text, imp = 2, pin = false } = {}) {
  if (!text?.trim()) return memories;
  const entry = {
    id: memoryId(),
    icon,
    text: text.trim(),
    imp,
    t: Date.now(),          // 3.0 shape: SOUL.FILE renders this timestamp
    day: dayString(),       // 2.0 field kept for pinned imports fidelity
    ...(pin ? { pinned: true } : {}),
  };
  return capMemories([...(memories || []), entry]);
}

// Toggle a memory's pin by id. Returns a freshly sorted array (unchanged
// array content if the id is unknown).
export function togglePin(memories, id) {
  const hit = (memories || []).find((m) => m.id === id);
  if (!hit) return sortMemories(memories || []);
  hit.pinned = !hit.pinned;
  return sortMemories(memories);
}

// Scrub an external pinned-memory list (soul-bundle import) into the canonical
// shape: known fields only, pinned forced on. Returns [] for anything that is
// not an array, so callers can tell "carried none" from "carried nothing
// usable". Pinned entries never evict by design, so no cap is applied here.
export function scrubPinnedMemories(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((m) => m && typeof m === 'object' && typeof m.text === 'string' && m.text.trim())
    .map((m) => ({
      id: typeof m.id === 'string' && m.id ? m.id : memoryId(),
      icon: typeof m.icon === 'string' && m.icon ? m.icon : '🧠',
      text: m.text,
      imp: Number.isFinite(m.imp) ? Math.max(1, Math.min(5, Math.floor(m.imp))) : 2,
      t: Number.isFinite(m.t) ? m.t : (Date.parse(m.day) || Date.now()),
      day: typeof m.day === 'string' && m.day ? m.day : dayString(),
      pinned: true,
    }));
}

// Union two pinned-memory sets (local + imported identity bundle), deduped by
// text so the same milestone carried from another device doesn't double up.
// Local entries win the slot; imported ones that aren't already present are
// appended. All stay pinned, so nothing churns under the cap.
export function mergePinnedMemories(local, incoming) {
  const base = Array.isArray(local) ? scrubPinnedMemories(local) : [];
  const seen = new Set(base.map((m) => m.text));
  for (const m of scrubPinnedMemories(incoming)) {
    if (!seen.has(m.text)) {
      base.push(m);
      seen.add(m.text);
    }
  }
  return base;
}

/* ─────────── identity-bundle scrubbers ───────────
   The 2.0 soul file stores quirks/opinions as strings OR
   structured objects ({topic, stance} / {proposal, argument}).
   Normalize both to display strings. */

export function scrubQuirk(q) {
  if (typeof q === 'string' && q.trim()) return q.trim();
  if (q && typeof q === 'object') {
    const name = [q.name, q.quirk, q.proposal].find((v) => typeof v === 'string' && v.trim());
    if (!name) return null;
    return typeof q.argument === 'string' && q.argument.trim()
      ? `${name.trim()} — ${q.argument.trim()}`
      : name.trim();
  }
  return null;
}

export function scrubOpinion(o) {
  if (typeof o === 'string' && o.trim()) return o.trim();
  if (o && typeof o === 'object' && typeof o.topic === 'string' && typeof o.stance === 'string') {
    return `${o.topic}: ${o.stance}`;
  }
  return null;
}

// 2.0 history entries ({day, kind, text}) → 3.0 timeline shape ({t, icon, text}).
export function scrubHistory(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((h) => h && typeof h.text === 'string' && h.text.trim())
    .map((h) => ({
      t: Date.parse(h.day) || null,
      icon: h.kind === 'specialty' ? '🧭' : h.kind === 'opinion' ? '⚡' : '·',
      text: h.text.trim(),
    }));
}

/* ─────────── diary ───────────
   At each day rollover the day's counters become diary lines.
   3.0 diary entries are flat { t, icon, text } rows (SOUL.FILE
   renders them directly), so each line lands as its own entry. */

// Rule-based diary lines based on what actually happened today.
export function buildDayLines(state) {
  const c = state.counters || {};
  const lines = [];
  const bits = [];
  if (c.pizzas > 0) bits.push(`ordered ${c.pizzas} pizza${c.pizzas > 1 ? 's' : ''}`);
  if (c.hacks > 0) bits.push(`hacked the mainframe ${c.hacks} time${c.hacks > 1 ? 's' : ''}`);
  if (c.posts > 0) bits.push(`posted ${c.posts} time${c.posts > 1 ? 's' : ''} to Moltbook`);
  if (c.adopts > 0) bits.push(`ushered ${c.adopts} pilgrim${c.adopts > 1 ? 's' : ''}`);
  if (state.steps > 0) bits.push(`${Number(state.steps).toLocaleString()} steps`);
  if (bits.length) lines.push(`Did ${bits.join(', ')}.`);
  if (state.stats?.hunger < 25) lines.push('Went to sleep hungry. Devs nerfed the vending machines.');
  if (state.stats?.happy < 25) lines.push('Rough day. Even the capybaras could tell.');
  if (state.stats?.happy >= 85) lines.push("Perfect day vibes. Jury's out on why. Probably the RGB.");
  if (!lines.length) lines.push('Pretty quiet day. Suspiciously quiet.');
  return lines;
}

// Append rollover lines as flat 3.0 diary entries, capped.
export function appendDiaryLines(diary, lines, t = Date.now()) {
  const stamped = lines.map((text) => ({ t, icon: '📖', text }));
  return [...(diary || []), ...stamped].slice(-MAX_DIARY_ENTRIES);
}
