// Persistence: v4 save format with automatic v3 migration + rollover handling.

import { initialStats } from './stats.js';
import { initialPersonality } from './personality.js';
import { addDiaryEntry, buildDayLines, memoryId, capMemories } from './memory.js';

const KEY = 'brogatchi_v4';
const KEY_V3 = 'brogatchi_v3';
const KEY_V3_BACKUP = 'brogatchi_v3_backup';

// localStorage may be unavailable (private mode, some test envs, file://) —
// fall back to a process-local shim so the game never hard-crashes.
const memStore = new Map();
const storage = (() => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  } catch { /* noop */ }
  return {
    getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
    setItem: (k, v) => memStore.set(k, String(v)),
    removeItem: (k) => memStore.delete(k),
    clear: () => memStore.clear(),
  };
})();

export function todayKey() {
  return new Date().toLocaleDateString();
}

import { normalizeMoltbook, defaultMoltbook } from './moltbook.js';

export function defaultState() {
  return {
    version: 4,
    stats: initialStats(),
    coins: 50,
    poop: 0,
    clutter: [],
    irlTasks: [],
    inventory: {
      miner: false,
      theme: 'lounge',
      hat: 'none',
      shirts: ['classic'],
      shirt: 'classic',
      pants: 'jeans',
      shoes: 'sneakers',
      glasses: 'none',
      chains: 'none',
      wrist: 'none',
      backpacks: 'none',
    },
    personality: initialPersonality(),
    memories: [],
    diaries: [],
    journal: [],
    xp: 0,
    level: 1,
    title: null,
    forme: null,
    bestScores: { flappy: 0, breaker: 0, mario: 0, rpg: 0, loot: 0 },
    counters: { pizzas: 0, salads: 0, burgers: 0, fuels: 0, gamesWon: 0, hacks: 0, steps: 0, pet: 0 },
    claims: {},
    steps: 0,
    stepHistory: {},
    stepRecord: 0,
    currentDate: todayKey(),
    lastSave: Date.now(),
    sideBro: null,
    moltbook: defaultMoltbook(),
    // The Tide's Budget: persistent AI cache + soft daily self-rationing.
    // cap is duplicated from ai/gateway.js AI_BUDGET_CAP (schema default only;
    // the gateway treats any missing/odd cap as its own constant).
    aiCache: [],
    aiBudget: { day: todayKey(), used: 0, cap: 40, rateLimitedUntil: 0 },
    // Durable Ask-Ryan transcript: [{ q, a, at, offline }] — survives reloads
    // (unlike the in-memory chatHistory, which only feeds the AI context).
    askLog: [],
  };
}

export function saveState(state) {
  state.lastSave = Date.now();
  storage.setItem(KEY, JSON.stringify(state));
}

// Resets all brogatchi keys. Exposed for tests and as a "new game" escape hatch.
export function wipeSave() {
  storage.removeItem(KEY);
  storage.removeItem(KEY_V3);
  storage.removeItem(KEY_V3_BACKUP);
}

// Test/app hook: the same storage the module uses (localStorage or shim).
export function getTestStorage() {
  return storage;
}

export function loadState() {
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 4) return { state: normalize(s), migrated: false };
      if (s) return { state: normalize(fromLegacy(s)), migrated: true };
    }
  } catch {
    /* corrupted v4 — fall through to v3 */
  }
  try {
    const rawV3 = storage.getItem(KEY_V3);
    if (rawV3) {
      const s = JSON.parse(rawV3);
      if (!storage.getItem(KEY_V3_BACKUP)) storage.setItem(KEY_V3_BACKUP, rawV3);
      return { state: normalize(fromLegacy(s)), migrated: true };
    }
  } catch {
    /* no v3 either */
  }
  return { state: defaultState(), migrated: false };
}

// Shapes a legacy save (or any generic object) into the v4 schema.
export function fromLegacy(s) {
  const d = defaultState();
  const inv = s.inventory || {};
  return {
    ...d,
    stats: { ...d.stats, ...(s.stats || {}) },
    coins: s.coins ?? d.coins,
    poop: s.poop ?? 0,
    clutter: Array.isArray(s.clutter) ? s.clutter : [],
    irlTasks: Array.isArray(s.irlTasks) ? s.irlTasks : [],
    inventory: {
      ...d.inventory,
      miner: !!inv.miner,
      theme: inv.theme || 'lounge',
      hat: inv.hat || 'none',
      shirts: Array.isArray(inv.shirts) && inv.shirts.length ? inv.shirts : d.inventory.shirts,
      shirt: inv.shirt || (Array.isArray(inv.shirts) && inv.shirts[0]) || 'classic',
      glasses: inv.glasses || 'none',
      chains: inv.chains || 'none',
      backpacks: inv.backpacks || 'none',
    },
    steps: s.steps ?? 0,
    stepHistory: s.stepHistory || {},
    stepRecord: s.stepRecord || 0,
    currentDate: s.currentDate || todayKey(),
    lastSave: s.lastSave || Date.now(),
  };
}

// Fills missing/nested fields from a v4-shaped object (forward-compat).
export function normalize(s) {
  const d = defaultState();
  const out = { ...d, ...s };
  out.stats = { ...d.stats, ...(s.stats || {}) };
  out.inventory = { ...d.inventory, ...(s.inventory || {}) };
  out.personality = { ...d.personality, ...(s.personality || {}) };
  out.bestScores = { ...d.bestScores, ...(s.bestScores || {}) };
  out.counters = { ...d.counters, ...(s.counters || {}) };
  out.claims = s.claims || {};
  // Memories: backfill ids for pre-pinning saves, drop malformed entries,
  // enforce the pin-aware cap (pinned milestones survive; legacy saves can't
  // have pins, so this equals the old 14-cap for them).
  if (!Array.isArray(out.memories)) out.memories = [];
  out.memories = capMemories(
    out.memories
      .filter((m) => m && typeof m === 'object' && typeof m.text === 'string')
      .map((m) => (m.id ? m : { ...m, id: memoryId() })),
  );
  if (!Array.isArray(out.diaries)) out.diaries = [];
  if (!Array.isArray(out.journal)) out.journal = [];
  if (!Array.isArray(out.clutter)) out.clutter = [];
  if (!Array.isArray(out.irlTasks)) out.irlTasks = [];
  // AI gateway state: repair malformed cache/budget, keep valid entries.
  if (!Array.isArray(out.aiCache)) out.aiCache = [];
  out.aiCache = out.aiCache
    .filter((e) => e && typeof e === 'object' && typeof e.k === 'string' && typeof e.text === 'string' && Number.isFinite(e.at))
    .slice(0, 40);
  // Ask-Ryan transcript: repair shape, keep newest 30 exchanges.
  if (!Array.isArray(out.askLog)) out.askLog = [];
  out.askLog = out.askLog
    .filter((e) => e && typeof e === 'object' && typeof e.q === 'string' && typeof e.a === 'string' && Number.isFinite(e.at))
    .sort((x, y) => y.at - x.at)
    .slice(0, 30);
  const b = out.aiBudget || {};
  out.aiBudget = {
    day: typeof b.day === 'string' && b.day ? b.day : todayKey(),
    used: Number.isFinite(b.used) ? Math.max(0, Math.floor(b.used)) : 0,
    cap: Number.isFinite(b.cap) && b.cap > 0 ? Math.floor(b.cap) : 40,
    rateLimitedUntil: Number.isFinite(b.rateLimitedUntil) ? b.rateLimitedUntil : 0,
  };
  out.moltbook = normalizeMoltbook(out.moltbook);
  return out;
}

// Day rollover: archives steps, resets counters, writes yesterday's diary entry.
// Returns a list of human-readable events for the UI.
export function rolloverIfNeeded(state) {
  const today = todayKey();
  if (state.currentDate === today) return [];
  const events = [];
  if (state.steps > 0) state.stepHistory[state.currentDate] = state.steps;
  state.steps = 0;
  const lines = buildDayLines(state);
  state.diaries = addDiaryEntry(state.diaries, state.currentDate, lines);
  state.counters = defaultState().counters;
  state.claims = {};
  // The Tide's budget resets each new day; the 45-min rate-limit cooldown is
  // a timestamp and survives the rollover untouched.
  state.aiBudget = {
    day: today,
    used: 0,
    cap: state.aiBudget?.cap || 40,
    rateLimitedUntil: state.aiBudget?.rateLimitedUntil || 0,
  };
  state.currentDate = today;
  events.push({ type: 'newday', lines });
  return events;
}