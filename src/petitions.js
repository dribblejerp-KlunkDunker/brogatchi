// ═══════════════════════════════════════════════════════════
// BRO_OS 3.0 // src/petitions.js — RYAN'S PETITIONS (2.0 port)
// Self-authorship, reconstructed from 2.0's surviving
// fingerprints ({name, argument} quirks, the pinned "Petitioned
// you:" memory convention, the README's [SOUL] promise — see
// docs/superpowers/specs/2026-09-15-petitions-design.md).
//
// Ryan drafts asks from his LIVE traits (never a fixed script),
// the player grants or denies, and every decision becomes soul:
// a grant mutates real state, a deny costs him trait points.
//
// Pure functions only — no DOM, no store. Importable from the
// store (state.js) and the tests without a window.
// ═══════════════════════════════════════════════════════════

import { applyEvents } from './personality.js';
import { remember, sortMemories } from './memory.js';

export const PETITION_COOLDOWN_DAYS = 3;
export const PETITION_EXPIRY_MS = 48 * 3600 * 1000;
export const PETITION_HISTORY_CAP = 30;
export const DECISIONS = ['granted', 'denied', 'ignored'];

export const PETITION_KINDS = ['curfew', 'feast', 'renown', 'trainer', 'ghost', 'sabbath'];

// Trait/stat shifts per kind and decision. `happy` is a STAT, not a
// trait axis — applyShifts routes it to stats.happy; everything else
// goes through applyEvents (unknown traits ignored, values clamped).
const SHIFTS = {
  curfew:  { grant: { traits: [['greed', -8], ['broCode', 4]] },  deny: { traits: [['greed', 3], ['broCode', -2]] } },
  feast:   { grant: { traits: [['gluttony', -6]], happy: 8 },     deny: { traits: [['gluttony', 4]], happy: -5 } },
  renown:  { grant: { traits: [['ego', 5], ['paranoia', 2]] },    deny: { traits: [['ego', -6], ['paranoia', 4]] } },
  trainer: { grant: { traits: [['fitness', 7], ['greed', 2]] },   deny: { traits: [['fitness', -3], ['broCode', -1]] } },
  ghost:   { grant: { traits: [['paranoia', -9], ['ego', 3]] },   deny: { traits: [['paranoia', 6], ['ego', -2]] } },
  sabbath: { grant: { traits: [['fitness', -3]], happy: 4 },      deny: { traits: [['broCode', 2]], happy: -4 } },
};

export function shiftsFor(kind, decision) {
  // Decisions are 'granted'/'denied'; the table keys are 'grant'/'deny'.
  const key = decision === 'granted' ? 'grant' : decision === 'denied' ? 'deny' : decision;
  return SHIFTS[kind]?.[key] ?? null;
}

/** Apply one shifts bundle to live state. Returns the shifts actually
    applied (tests assert on this). */
export function applyShifts(state, shifts) {
  if (!shifts) return null;
  if (shifts.traits?.length) applyEvents(state.personality, shifts.traits.map(([trait, amount]) => ({ trait, amount })));
  if (shifts.happy) state.stats.happy = Math.min(100, Math.max(0, state.stats.happy + shifts.happy));
  return shifts;
}

/* ─────────── normalize (same heal-on-load pattern as sprite overrides) ─────────── */

function validDay(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }

function validLive(l) {
  if (!l || typeof l !== 'object' || Array.isArray(l)) return null;
  if (!PETITION_KINDS.includes(l.kind)) return null;
  if (typeof l.id !== 'string' || !l.id) return null;
  if (typeof l.title !== 'string' || !l.title.trim()) return null;
  if (!Number.isFinite(l.expiresAt)) return null;
  return {
    id: l.id,
    kind: l.kind,
    title: l.title.trim().slice(0, 80),
    argument: String(l.argument ?? '').slice(0, 200),
    request: String(l.request ?? '').slice(0, 120),
    params: l.params && typeof l.params === 'object' && !Array.isArray(l.params) ? l.params : {},
    draftedAt: Number.isFinite(l.draftedAt) ? l.draftedAt : l.expiresAt - PETITION_EXPIRY_MS,
    expiresAt: l.expiresAt,
  };
}

/** Heal the petitions field from any save shape. Never throws; drops
    malformed live petitions and history entries, caps history. */
export function normalizePetitions(input) {
  const base = { live: null, history: [], lastDecisionDay: null, lastEffect: null, sabbathDay: null };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return base;
  const out = { ...base };
  out.live = validLive(input.live);
  if (Array.isArray(input.history)) {
    out.history = input.history
      .filter((h) => h && typeof h === 'object' && PETITION_KINDS.includes(h.kind) && DECISIONS.includes(h.decision))
      .slice(-PETITION_HISTORY_CAP);
  }
  out.lastDecisionDay = validDay(input.lastDecisionDay);
  if (input.lastEffect && input.lastEffect.kind === 'scrub-log' && Number.isFinite(input.lastEffect.t)) {
    out.lastEffect = { kind: 'scrub-log', t: input.lastEffect.t };
  }
  out.sabbathDay = validDay(input.sabbathDay);
  return out;
}

/* ─────────── the six generators — pure (state) → draft | null ─────────── */

// Order is the desk's voice: grind first, body second, pride, health,
// fear, and rest last. Each reads live state only.
const GENERATORS = [
  // 1 — the grind: a rich rig demands a night off.
  (s) => (s.personality.greed >= 60
    ? {
        kind: 'curfew', title: 'THE NIGHT OFF',
        argument: 'Mining is eating my nights. One night off.',
        request: 'Power down the rig for the evening.',
        params: {},
      }
    : null),
  // 2 — the body: starving and gluttonous demands a feast.
  (s) => (s.personality.gluttony >= 55 && s.stats.hunger < 40
    ? {
        kind: 'feast', title: 'THE FEAST',
        argument: 'Two pizzas. The machine hungers.',
        request: 'Two pizzas, no questions.',
        params: {},
      }
    : null),
  // 3 — the pride: a prolific poster with ego to spare wants the pin.
  (s) => (s.personality.ego >= 65 && s.counters.posts >= 3
    ? {
        kind: 'renown', title: 'PIN MY BEST',
        argument: 'The tide scrolls past everything I make.',
        request: 'Pin my best post to the tideline.',
        params: { postId: topOwnPostToday(s)?.id ?? null },
      }
    : null),
  // 4 — the body, again: an immobile bro wants a reason to move.
  (s) => (s.personality.fitness <= 15 && s.steps === 0
    ? {
        kind: 'trainer', title: 'THE STEP GOAL',
        argument: 'I sit. The rig sits. Everything sits.',
        request: 'Add a step goal to my daily quest.',
        params: { addGoal: 5, bonus: 5 },
      }
    : null),
  // 5 — the fear: a hacker with paranoia to spare wants the log gone.
  (s) => (s.personality.paranoia >= 55 && s.milestones.hack === true
    ? {
        kind: 'ghost', title: 'WIPE THE LOG',
        argument: 'They read the hack log. All of it. I can feel it.',
        request: "Wipe today's hack log from SYS.LOG.",
        params: {},
      }
    : null),
  // 6 — the rest: a happy bro with no cooldown in sight asks for a
  // quest-free day. (The global cooldown gate in generatePetition
  // already enforces "not right after a decision"; this reads the mood.)
  (s) => (s.stats.happy >= 85
    ? {
        kind: 'sabbath', title: 'THE DAY OF REST',
        argument: 'I have been good. The quests can wait one day.',
        request: 'A day of rest. No quests tomorrow.',
        params: {},
      }
    : null),
];

function topOwnPostToday(s) {
  const day = new Date().toISOString().slice(0, 10);
  return (s.molt?.posts ?? [])
    .filter((p) => p.author === '@you_pilgrim' && p.time && new Date(p.time).toISOString().slice(0, 10) === day)
    .sort((a, b) => (b.heat ?? 0) - (a.heat ?? 0))[0] ?? null;
}

/** The one generation surface: cooldown + one-live-petition gates, then
    the first generator that fires drafts the petition. Returns a full
    live-petition object or null. */
export function generatePetition(state, now = Date.now()) {
  const p = state.petitions ?? {};
  if (p.live) return null;
  if (p.lastDecisionDay) {
    const days = (now - Date.parse(p.lastDecisionDay)) / 86400000;
    if (days < PETITION_COOLDOWN_DAYS) return null;
  }
  for (const gen of GENERATORS) {
    const draft = gen(state);
    if (draft) {
      return {
        id: `pet-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        ...draft,
        draftedAt: now,
        expiresAt: now + PETITION_EXPIRY_MS,
      };
    }
  }
  return null;
}

/* ─────────── grant application — validate, then mutate ─────────── */

/** Is the ask still satisfiable in the world as it is NOW? (The world
    may have moved on since he drafted.) Unknown kinds are not grantable. */
export function grantApplies(state, kind, params) {
  switch (kind) {
    case 'curfew': return state.mining === true;
    case 'renown': return !!params?.postId && state.molt.posts.some((p) => p.id === params.postId);
    case 'feast':
    case 'trainer':
    case 'ghost':
    case 'sabbath':
      return true;
    default:
      return false;
  }
}

/** Perform the granted mutation inside the caller's mutate. Returns
    false if the grant turned out unsatisfiable (store then degrades). */
export function applyGrant(state, kind, params, t = Date.now()) {
  if (!grantApplies(state, kind, params)) return false;
  switch (kind) {
    case 'curfew':
      state.mining = false;
      state._mineAcc = 0;
      break;
    case 'feast':
      state.counters.pizzas += 2;
      state.stats.hunger = Math.min(100, state.stats.hunger + 40);
      break;
    case 'renown': {
      const echo = state.memories.find((m) => m.post === String(params.postId));
      if (echo) {
        echo.pinned = true;
        state.memories = sortMemories(state.memories);
      } else {
        state.memories = remember(state.memories, {
          icon: '📌',
          text: 'Held a thread in the tideline — his petition made it stick.',
          imp: 2,
          pin: true,
          post: String(params.postId),
        });
      }
      break;
    }
    case 'trainer':
      state.quest.goal += Number(params?.addGoal) || 5;
      state.coins += Number(params?.bonus) || 5;
      break;
    case 'ghost':
      state.petitions.lastEffect = { kind: 'scrub-log', t };
      break;
    case 'sabbath':
      state.petitions.sabbathDay = new Date(t + 86400000).toISOString().slice(0, 10);
      break;
    default:
      return false;
  }
  return true;
}
