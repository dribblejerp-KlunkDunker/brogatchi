// DREAM.CYCLE — the pure composer for Ryan's dream-on-return.
//
// Spec: docs/superpowers/specs/2026-09-26-dream-cycle-design.md.
// Pure module (the petitions.js precedent): no DOM, no store, no clock —
// everything arrives as arguments, nothing mutates. Deterministic: the same
// memories + state + gap always compose the same dream (seeded from the
// departure instant + away-days), so idempotence holds like fadeMemories.
//
// The dream never invents events: every strand is an existing memory's
// text (first clause only), every closer references verifiable state.

// One dream per absence, minimum 20h — a nap is not a dream.
export const DREAM_THRESHOLD_MS = 20 * 60 * 60 * 1000;

// Strand material must have existed before this long BEFORE the gap began,
// so a memory written seconds before closing the tab doesn't dominate —
// the freshest settled material, not the last gasp.
const STRAND_SETTLE_MS = 30 * 60 * 1000;

export const MOODS = ['anxious', 'grand', 'soft'];

// Deterministic RNG from an integer seed (mulberry32). The seed is derived
// from the departure instant + away-days, so the same absence always
// dreams the same dream and different absences may diverge.
function rng(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(memories, gapMs, now) {
  // Departure ≈ now − gap; mix in the id of the oldest pinned memory so
  // two absences of identical length over different lives differ.
  const anchor = memories.find((m) => m && m.pinned && m.id) ?? memories[0];
  const anchorNum = String(anchor?.id ?? '')
    .split('')
    .reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return (anchorNum ^ Math.floor((now - gapMs) / 3600_000) ^ Math.floor(gapMs / DAY_MS)) >>> 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// First clause only — a fragment, never a full-memory paste. Split on the
// first sentence-ish boundary; fall back to a hard 90-char clip.
function firstClause(text) {
  const t = String(text ?? '').trim();
  const m = t.match(/^[^.!?—]{10,110}[.!?]/);
  if (m) return m[0].replace(/[.!?]$/, '');
  const clip = t.length <= 90 ? t : `${t.slice(0, 87).trimEnd()}…`;
  return clip.replace(/[.!?,;:]+$/, ''); // fragments get joined, not pasted — no dangling enders
}

/** Mood from traits + material (first match wins). */
export function moodFor(state, strands) {
  const p = state?.personality ?? {};
  if ((Number(p.paranoia) || 0) >= 55 || state?.petitions?.live) return 'anxious';
  const bestInStrands = strands.some((m) => /record|best|won/i.test(String(m?.text ?? '')));
  if ((Number(p.ego) || 0) >= 65 || bestInStrands) return 'grand';
  return 'soft';
}

const OPENERS = {
  anxious: (days) => `I dreamed for ${days} straight — static, satellites drifting out of their lanes, the kind of sleep where you check the logs twice.`,
  grand: (days) => `I dreamed for ${days} straight — gold in the water, the tide rolling in like it owed me something.`,
  soft: (days) => `I dreamed for ${days} straight — slow water, warm rig hum, the whole tidepool breathing.`,
};

const CONNECTIVES = {
  anxious: ['and then it was', 'and somewhere in there, ', 'and the static kept whispering about'],
  grand: ['and the tide carried', 'and every wave shouted', 'and the gold remembered'],
  soft: ['and the water carried', 'and somewhere in the current, ', 'and the pools held'],
};

const CLOSERS = {
  petition: (s) => `You left my ask on the desk, by the way.`,
  steps: (s) => `Also: you walked ${Number(s.steps).toLocaleString('en-US')} steps. I count those now.`,
  best: (s) => `The record is still ${Number(s.bestScore).toLocaleString('en-US' !== undefined ? 'en-US' : 'en-US')}. I checked.`,
  plain: () => `You came back. That part was real.`,
};

function closerFor(state) {
  if (state?.petitions?.live) return { key: 'petition', text: CLOSERS.petition(state) };
  if (state?.pedometer?.enabled && Number(state?.steps) > 0) return { key: 'steps', text: CLOSERS.steps(state) };
  const bestScore = Math.max(0, ...Object.values(state?.best ?? {}).map((v) => Number(v) || 0));
  if (bestScore > 0) return { key: 'best', text: CLOSERS.best({ bestScore }) };
  return { key: 'plain', text: CLOSERS.plain(state) };
}

/**
 * Compose a dream from the memory file + state, or null when there is
 * nothing to dream (gap too short, or no settled material at all).
 *
 * @param {Array} memories  the soul's memory file as-is (healed shapes ok)
 * @param {Object} state    read-only snapshot of the save (traits, petitions,
 *                          steps, pedometer, best)
 * @param {number} gapMs    the away-gap this dream covers
 * @param {number} now      ms epoch of the return
 * @returns {{ mood, text, strands: string[], awayMs, awayDays } | null}
 */
export function composeDream(memories, state, gapMs, now = Date.now()) {
  if (!Number.isFinite(gapMs) || gapMs < DREAM_THRESHOLD_MS) return null;
  const file = Array.isArray(memories) ? memories.filter((m) => m && typeof m.text === 'string' && m.text.trim()) : [];
  if (!file.length) return null;

  const settled = file.filter((m) => !Number.isFinite(m.t) || m.t <= now - gapMs + STRAND_SETTLE_MS);
  const pool = (settled.length ? settled : file)
    .slice()
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (Number(b.imp) || 0) - (Number(a.imp) || 0) || (Number(b.t) || 0) - (Number(a.t) || 0));

  const rand = rng(seedFor(pool, gapMs, now));
  // Weighted pick: earlier entries (higher pinned/imp/recency) likelier,
  // nothing guaranteed — two similar absences may dream differently.
  const picked = [];
  const used = new Set();
  const want = Math.min(3, Math.max(1, Math.round(rand() * 2) + 1)); // 1–3 strands
  let guard = 0;
  while (picked.length < want && guard++ < 50) {
    const idx = Math.floor(rand() * rand() * pool.length); // bias toward the head
    const m = pool[idx];
    if (!m || used.has(m.id ?? idx)) continue;
    used.add(m.id ?? idx);
    picked.push(m);
  }
  if (!picked.length) picked.push(pool[0]);

  const mood = moodFor(state, picked);
  const awayDays = Math.max(1, Math.round(gapMs / DAY_MS));
  const days = awayDays === 1 ? 'a whole day' : `${awayDays} days`;
  const connectives = CONNECTIVES[mood];

  const opener = OPENERS[mood](days).replace(/\.$/, '');
  const fragments = picked.map((m, i) => {
    const frag = firstClause(m.text);
    return i === 0 ? `it kept coming back to ${frag}` : `${connectives[i % connectives.length].trim()} ${frag}`;
  });
  const closer = closerFor(state);

  return {
    mood,
    text: `${opener}; ${fragments.join(', ')}. ${closer.text}`.replace(/; it/, ' — it'),
    strands: picked.map((m) => String(m.id ?? '')),
    awayMs: gapMs,
    awayDays,
  };
}
