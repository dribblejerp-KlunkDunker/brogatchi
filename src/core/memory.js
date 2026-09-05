// Ryan's memory: tagged event log (importance-ranked, pinnable) + end-of-day
// diary. The cap is set high enough to be effectively unlimited in practice —
// nothing meaningful churns out unless his mind genuinely fills (or the user
// pins more than the cap; pinned entries always survive regardless).

export const MAX_MEMORIES = 200;
const MAX_DIARIES = 7;

function dayString() {
  return new Date().toLocaleDateString();
}

// Stable id for pinning/toggling (also backfilled by save normalization).
export function memoryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// Sort: pinned milestones first, then importance, then recency (id is
// time-based, so a later id = a newer memory on ties).
export function sortMemories(memories) {
  return [...memories].sort(
    (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.imp - a.imp || b.id.localeCompare(a.id),
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
export function remember(memories, { icon = '🪙', text, imp = 2, pin = false }) {
  if (!text) return memories;
  const entry = { id: memoryId(), icon, text, imp, day: dayString(), ...(pin ? { pinned: true } : {}) };
  return capMemories([...memories, entry]);
}

// Toggle a memory's pin by id. Returns a freshly sorted array (unchanged
// array content if the id is unknown).
export function togglePin(memories, id) {
  const hit = memories.find((m) => m.id === id);
  if (!hit) return sortMemories(memories);
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
      icon: typeof m.icon === 'string' && m.icon ? m.icon : '🪙',
      text: m.text,
      imp: Number.isFinite(m.imp) ? Math.max(1, Math.min(5, Math.floor(m.imp))) : 2,
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

// Rule-based diary lines based on what actually happened today.
export function buildDayLines(state) {
  const c = state.counters;
  const lines = [];
  const bits = [];
  if (c.pizzas > 0) bits.push(`${c.pizzas} pizza${c.pizzas > 1 ? 's' : ''}`);
  if (c.burgers > 0) bits.push(`${c.burgers} burger${c.burgers > 1 ? 's' : ''}`);
  if (c.gamesWon > 0) bits.push(`won ${c.gamesWon} game${c.gamesWon > 1 ? 's' : ''}`);
  if (c.hacks > 0) bits.push(`hacked ${c.hacks} mainframe${c.hacks > 1 ? 's' : ''}`);
  if (c.salads > 0) bits.push(`ate ${c.salads} salad${c.salads > 1 ? 's' : ''}`);
  if (state.steps > 0) bits.push(`${state.steps.toLocaleString()} steps`);
  if (bits.length) lines.push(`Did ${bits.join(', ')}.`);
  if (state.stats.weight >= 2.0) lines.push(`The midnight snacks are catching up. Ping went UP.`);
  else if (state.stats.weight < 1.3 && state.steps > 2000) lines.push(`Feelin' light. Might actually outrun a fed today.`);
  if (state.stats.hunger < 25) lines.push(`Went to sleep hungry. Devs nerfed the vending machines.`);
  if (state.stats.happy < 25) lines.push(`Rough day. Even the capybaras could tell.`);
  if (state.stats.happy >= 85) lines.push(`Perfect day vibes. Jury's out on why. Probably the RGB.`);
  if (!lines.length) lines.push('Pretty quiet day. Suspiciously quiet.');
  return lines;
}

export function addDiaryEntry(diaries, date, lines) {
  const next = diaries.filter((d) => d.date !== date);
  next.unshift({ date, lines });
  return next.slice(0, MAX_DIARIES);
}