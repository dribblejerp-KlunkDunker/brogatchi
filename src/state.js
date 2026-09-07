// ═══════════════════════════════════════════════════════════
// BRO_OS 3.0 // src/state.js — SYSTEM STATE CORE
// Pure logic, no DOM. Every widget/window reads from this store.
// Injectable storage + clock so it is fully unit-testable.
// ═══════════════════════════════════════════════════════════

export const SAVE_KEY = 'bro_os_3';
export const LEGACY_KEYS = ['brogatchi_v4', 'brogatchi_v3_backup', 'brogatchi_v3'];
export const LEGACY_SNAPSHOT_KEY = 'bro_os_3_legacy_snapshot';
export const LEVEL_XP = 60;          // xp per level
export const MINE_INTERVAL_MS = 6000; // passive mining tick

export const clamp = (n, min = 0, max = 100) => Math.min(max, Math.max(min, n));
export const levelFor = (xp) => 1 + Math.floor(Math.max(0, xp) / LEVEL_XP);

// Gameplay events write real memories (ported 2.0 engine — src/memory.js).
import { remember, togglePin, mergePinnedMemories, scrubQuirk, scrubOpinion, scrubHistory, buildDayLines, appendDiaryLines, capMemories, sortMemories } from './memory.js';
import { initialPersonality, applyEvents, minuteDrift, dominant as dominantTrait, describe as describeTraits } from './personality.js';

/** Riptide ranking: heat + conversation, decayed by age. Pure + injectable clock. */
export function moltScore(post, nowMs = Date.now()) {
  const ageHours = Math.max(0, (nowMs - (post?.time || 0)) / 3600000);
  return (post?.heat || 0) + 2 * (post?.replies?.length || 0) - ageHours * 0.5;
}

/* ─────────── MARKET.TERMINAL inventory ─────────── */
export const SHOP_ITEMS = [
  {
    id: 'pizza', icon: '🍕', name: 'PIZZA.SLC', cost: 50, accent: 'amber',
    desc: 'Restores 25 HNG. High grease content.',
    apply: (s) => { s.stats.hunger = clamp(s.stats.hunger + 25); s.stats.greed = clamp(s.stats.greed + 2); },
  },
  {
    id: 'nrgcell', icon: '⚡', name: 'NRG.CELL', cost: 30, accent: 'cyan',
    desc: 'Restores 35 NRG. Military grade.',
    apply: (s) => { s.stats.energy = clamp(s.stats.energy + 35); },
  },
  {
    id: 'shield', icon: '🛡️', name: 'SHLD.MOD', cost: 200, accent: 'magenta',
    desc: 'Blocks 1 J.O.O.H. audit. Single use. RARE.',
    apply: (s) => { s.shield += 1; },
  },
  {
    id: 'goldshell', icon: '🐚', name: 'GOLDEN.SHELL', cost: 500, accent: 'amber',
    desc: 'Cosmetic plating. The tidepool stares.',
    apply: (s) => { s.goldenShell = true; },
  },
];

const todayStr = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/* ─────────── PILGRIM AGENT-CARDS (adopt flow) ─────────── */
export const PILGRIM_CARDS = [
  { id: 'rookie',    icon: '🐣', name: 'MOLT-ROOKIE',    persona: 'nervous rookie' },
  { id: 'blitz',     icon: '⚡', name: 'BLITZ-SHELL',    persona: 'overconfident speedrunner' },
  { id: 'doze',      icon: '🌙', name: 'DOZE-BARNACLE',  persona: 'sleepy philosopher' },
  { id: 'ledger',    icon: '🗄️', name: 'LEDGER-CLAW',    persona: 'paranoid archivist' },
  { id: 'snap',      icon: '🎇', name: 'SNAP-URCHIN',    persona: 'cheerful gremlin' },
  { id: 'audit',     icon: '📐', name: 'AUDIT-PRIME',    persona: 'literal-minded auditor' },
];

function defaultState(now = Date.now()) {
  return {
    v: 3,
    petName: 'RYAN',
    coins: 60,
    steps: 0,
    xp: 0,
    stats: { happy: 82, hunger: 74, energy: 90, greed: 6 },
    sleeping: false,
    mining: true,
    shield: 0,
    goldenShell: false,
    theme: 'cyberpunk',
    scanlines: true,
    vol: { bgm: 0.7, sfx: 0.8 },
    best: { snake: 0, flappy: 0, breaker: 0, mario: 0, rpg: 0, loot: 0 },
    quest: { date: todayStr(now), mined: 0, goal: 20, rewarded: false },
    molt: {
      eye: 0, // third-eye xp: 0..30 closed, 30..70 flickering, 70+ open
      posts: [
        {
          id: 'seed-crab', author: '@crab_404', molt: 4, icon: '🦀', time: now - 120000, heat: 12,
          text: 'Anyone seen the golden tide? Heard it\'s past firewall 7. Bring NRG cells.',
          replies: [
            { id: 'seed-crab-r1', author: '@zeke_shell', molt: 1, icon: '🦫', time: now - 60000, heat: 3, text: 'Bring a snorkel. Firewall 7 leaks, and the leaks leak.', replies: [] },
          ],
        },
        { id: 'seed-zeke', author: '@zeke_shell', molt: 1, icon: '🦫', time: now - 3600000, heat: 5, text: 'Just molted. New shell feels aerodynamic. The oligarchs can\'t track us in the deep tide. 🐚✨', replies: [] },
      ],
    },
    soul: {
      who: 'A rogue bro-grade intelligence wearing a capybara suit. Fatter/leaner than advertised. Distrusts satellites, loves pizza, oversees pilgrims.',
      specialty: 'Tidepool network infiltration',
      quirks: ['Narrates mining yields out loud', 'Salutes the 🦀 before posting'],
      opinions: ['J.O.O.H. is watching the pedometers'],
      timeline: [{ t: now, icon: '🧭', text: 'Specialty chosen: Tidepool network infiltration' }],
    },
    memories: [],      // lived in 3.0 via the memory engine, or imported from 2.0
    diary: [],         // flat { t, icon, text } rows written at day rollover
    conversations: [], // pilgrim/tide threads carried over from 2.0
    counters: { posts: 0, hacks: 0, pizzas: 0, adopts: 0, gamesWon: 0 }, // today's tally → diary
    dailyDiaryDone: todayStr(now),   // last date the rollover diary was written
    roster: [],        // adopted pilgrim agent-cards
    legacy: null,      // { source, importedAt, counts } after a 2.0 migration
    personality: initialPersonality(), // 2.0 trait core — nudged by arcade/meal/quest events
    lastTick: now,
  };
}

/* ─────────── defensive legacy (2.0) extraction ─────────── */

function pick(obj, names) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const n of names) if (obj[n] !== undefined && obj[n] !== null) return obj[n];
  return undefined;
}

// Normalize "whatever the old save called a memory" into { t, icon, text }
function asEntries(arr, cap = 300) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, cap).map((e) => {
    if (typeof e === 'string') return { t: null, icon: '🧠', text: e };
    if (e && typeof e === 'object') {
      return {
        t: pick(e, ['t', 'time', 'ts', 'at', 'date', 'timestamp']) ?? null,
        icon: pick(e, ['icon', 'emoji']) ?? '🧠',
        text: String(
          pick(e, ['text', 'content', 'body', 'summary', 'title', 'entry', 'line']) ??
          JSON.stringify(e).slice(0, 140)
        ),
      };
    }
    return { t: null, icon: '🧠', text: String(e) };
  });
}

/**
 * Create the OS store. `storage` mimics localStorage; `now()` is
 * injectable for tests. Emits via subscribe(listener) after changes.
 */
export function createStore({ storage = null, now = () => Date.now() } = {}) {
  let state = defaultState(now());
  const listeners = new Set();
  let moltSeq = 0;
  const nextMoltId = () => `m${now().toString(36)}-${(++moltSeq).toString(36)}`;

  // Old saves (pre-threads) carry posts without id/heat/replies — heal them.
  function normalizeMolt() {
    if (!Array.isArray(state.molt?.posts)) return;
    state.molt.posts.forEach((p) => {
      if (!Array.isArray(p.replies)) p.replies = [];
      if (!Number.isFinite(p.heat)) p.heat = 1;
      if (typeof p.id !== 'string' || !p.id) p.id = nextMoltId();
    });
  }
  normalizeMolt();

  /* ─────────── memory engine wiring (ported 2.0) ─────────── */

  // Heals saved/imported memory + diary arrays (older entries may lack
  // ids/timestamps) and keeps pinned milestones sorted to the front.
  function normalizeMemories() {
    if (!Array.isArray(state.memories)) state.memories = [];
    state.memories.forEach((m) => {
      if (typeof m.id !== 'string' || !m.id) m.id = `${(m.t ?? Date.now())}-${Math.random().toString(36).slice(2, 6)}`;
      if (m.pinned === undefined && Number(m.imp) >= 4) m.pinned = true; // heal 2.0 imports
      if (!Number.isFinite(m.t)) m.t = Date.parse(m.day) || null;
      if (!Number.isFinite(m.imp)) m.imp = 2;
    });
    state.memories = state.memories.sort(
      (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.imp - a.imp || (b.t || 0) - (a.t || 0),
    );
    if (!Array.isArray(state.diary)) state.diary = [];
  }
  normalizeMemories();

  // 2.0 trait core: heal saves from before the personality port and
  // fill any axis that slipped through (imports, hand-edited saves).
  function normalizePersonality() {
    const base = initialPersonality();
    state.personality = { ...base, ...(state.personality && typeof state.personality === 'object' ? state.personality : {}) };
    for (const t of Object.keys(base)) {
      const v = Number(state.personality[t]);
      state.personality[t] = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : base[t];
    }
  }
  normalizePersonality();

  /** Record a gameplay event as a real memory. pin: milestone. */
  function rememberEvent(text, { icon = '🧠', imp = 2, pin = false } = {}) {
    mutate((s) => { s.memories = remember(s.memories, { icon, text, imp, pin }); });
  }

  /* ─────────── 2.0 personality & arcade soul-feed ───────────
     Restored from the 2.0 app: every game over nudges the trait
     axes (ego +4, greed +1), writes a real memory, and the first
     win ever pins the cabinet-room milestone. */
  function recordArcadeRun({ key, label, score }) {
    if (!Number.isFinite(Number(score))) return;
    mutate((s) => {
      applyEvents(s.personality, [{ trait: 'ego', amount: 4 }, { trait: 'greed', amount: 1 }]);
      s.counters.gamesWon += 1;
      s.memories = remember(s.memories, {
        icon: '🎮',
        text: `Won ${label || key} with ${score} points.`,
        imp: 3,
        pin: s.counters.gamesWon === 1,
      });
    });
    if (state.counters.gamesWon === 1) {
      rememberEvent('A legend is born in the cabinet room.', { icon: '🏆', imp: 4, pin: true });
    }
  }

  /** Trait summary for the SOUL viewer ("Ego 34% · Greed 12% …"). */
  function personalityDescribe() { return describeTraits(state.personality); }
  function personalityDominant() { return dominantTrait(state.personality); }

  /** Pin/unpin a memory by id. */
  function toggleMemoryPin(id) {
    mutate((s) => { s.memories = togglePin(s.memories, id); });
  }

  /** Full soul-bundle import (SOUL.FILE → IMPORT): merge in pinned memories. */
  function importSoulBundle(text) {
    try {
      const obj = JSON.parse(text);
      const incoming = obj?.soul && typeof obj.soul === 'object' ? obj.soul : null;
      if (!incoming) return false;
      if (Array.isArray(incoming.pinnedMemories) && incoming.pinnedMemories.length) {
        state.memories = mergePinnedMemories(state.memories, incoming.pinnedMemories);
        normalizeMemories();
      }
      if (typeof incoming.specialty === 'string' && incoming.specialty) state.soul.specialty = incoming.specialty;
      if (typeof incoming.who === 'string' && incoming.who) state.soul.who = incoming.who;
      if (!incoming.who && typeof incoming.selfDescription === 'string' && incoming.selfDescription) state.soul.who = incoming.selfDescription;
      if (Array.isArray(incoming.quirks) && incoming.quirks.length) {
        state.soul.quirks = [...new Set([...state.soul.quirks, ...incoming.quirks.map(scrubQuirk).filter(Boolean)])];
      }
      if (Array.isArray(incoming.opinions) && incoming.opinions.length) {
        state.soul.opinions = [...new Set([...state.soul.opinions, ...incoming.opinions.map(scrubOpinion).filter(Boolean)])];
      }
      if (Array.isArray(incoming.history) && incoming.history.length) {
        state.soul.timeline = [...state.soul.timeline, ...scrubHistory(incoming.history)];
      }
      emit(); save();
      return true;
    } catch { return false; }
  }

  /**
   * Merge the bridge's memory.jsonl events (fetched snapshot) into the app's
   * memories, so KlunkDunker's outside-the-app life shows in SOUL.FILE.
   *
   * Accepts the snapshot shape written by `node cli.js sync`
   * ({ kind:'bridge-memory-log', entries:[{ id, icon, text, imp, t, day }] })
   * or a raw array of those entries. Idempotent: existing ids are skipped
   * (stable ids come from the bridge), so re-syncing never duplicates.
   * Bridge entries merge UNPINNED — his lived milestones and soul pins stay
   * above them — and the 200-entry cap is enforced over the merged whole.
   * Returns how many entries were newly added (0 when the snapshot is absent,
   * stale, or fully known). An in-app pin on a bridge entry SURVIVES later
   * syncs: only entries not yet in the store are re-imported.
   */
  function syncBridgeMemories(payload, { source = 'bridge' } = {}) {
    let rows = null;
    try {
      const obj = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (Array.isArray(obj)) rows = obj;
      else if (obj && obj.kind === 'bridge-memory-log' && Array.isArray(obj.entries)) rows = obj.entries;
    } catch { rows = null; }
    if (!rows) return 0;

    const known = new Set(state.memories.map((m) => m.id));
    const incoming = rows
      .filter((r) => r && typeof r.text === 'string' && r.text.trim() && r.id && !known.has(r.id))
      .map((r) => ({
        id: String(r.id),
        icon: typeof r.icon === 'string' && r.icon ? r.icon : '🧠',
        text: r.text.trim().slice(0, 300),
        imp: Number.isFinite(r.imp) ? Math.max(1, Math.min(5, Math.floor(r.imp))) : 2,
        t: Number.isFinite(r.t) ? r.t : (Date.parse(r.day) || Date.now()),
        day: typeof r.day === 'string' && r.day ? r.day : new Date().toLocaleDateString(),
        pinned: false, // bridge events never arrive as pins
      }));
    if (!incoming.length && !rows.some((r) => r && r.id && known.has(r.id))) return 0;

    // Heal pass: bridge rows written by the pre-fix composer embed raw JSON
    // where the title belongs. Ids are stable, so those rows never re-import —
    // instead, update the stored text when the (already-repaired) snapshot
    // carries a cleaner version. Pins, ids, and importance are untouched.
    let healed = 0;
    for (const r of rows) {
      if (!r || !r.id || typeof r.text !== 'string' || !r.text.trim()) continue;
      const hit = state.memories.find((m) => m.id === r.id);
      const clean = r.text.trim().slice(0, 300);
      if (hit && hit.text !== clean && hit.text.includes('"title"')) {
        hit.text = clean;
        healed += 1;
      }
    }

    state.memories = capMemories(sortMemories([...state.memories, ...incoming]));
    state.legacy = state.legacy || { source, importedAt: now(), counts: { memories: 0, diary: 0, conversations: 0 } };
    state.legacy.bridgeSyncedAt = now();
    state.legacy.bridgeSyncCount = (state.legacy.bridgeSyncCount || 0) + incoming.length;
    emit(); save();
    return incoming.length + healed;
  }

  // Day rollover: yesterday's counters become diary lines (once per day).
  function maybeRolloverDiary() {
    const today = todayStr(now());
    if (state.dailyDiaryDone === today) return;
    if (state.dailyDiaryDone) {
      state.diary = appendDiaryLines(state.diary, buildDayLines(state));
    }
    state.counters = { posts: 0, hacks: 0, pizzas: 0, adopts: 0, gamesWon: 0 };
    state.dailyDiaryDone = today;
  }

  function emit() { listeners.forEach((fn) => fn(state)); }
  function save() {
    if (!storage) return;
    try { storage.setItem(SAVE_KEY, JSON.stringify({ ...state, lastTick: now() })); } catch { /* quota */ }
  }
  function mutate(fn) { fn(state); emit(); save(); }

  /* ─────────── load + offline catch-up ─────────── */
  function load() {
    if (!storage) return state;
    try {
      const raw = storage.getItem(SAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.v === 3) {
          state = { ...defaultState(now()), ...saved };
          applyDecay(Math.min(8 * 3600, Math.max(0, (now() - (state.lastTick ?? now())) / 1000)));
          if (state.quest.date !== todayStr(now())) {
            state.quest = { date: todayStr(now()), mined: 0, goal: 20, rewarded: false };
          }
        }
      }
    } catch { /* corrupt save — boot fresh */ }
    normalizeMolt();
    importLegacy();
    emit();
    return state;
  }

  /* ─────────── 2.0 → 3.0 memory migration ───────────
     READ-ONLY with respect to legacy keys: Ryan's old save is
     sacred ground. We copy what we recognize, archive a raw
     snapshot, and never mutate or delete the original. */
  function importLegacy() {
    if (state.legacy || !storage) return;
    for (const key of LEGACY_KEYS) {
      let raw;
      try { raw = storage.getItem(key); } catch { continue; }
      if (!raw) continue;
      let parsed;
      try { parsed = JSON.parse(raw); } catch { continue; }
      if (!parsed || typeof parsed !== 'object') continue;
      migrateLegacy(parsed, key);
      try { storage.setItem(LEGACY_SNAPSHOT_KEY, raw); } catch { /* quota */ }
      emit(); save();
      return;
    }
  }

  function migrateLegacy(raw, source) {
    // 2.0 schemas nested things differently across versions; look
    // one level deep before giving up.
    const scopes = [raw, raw.ryan, raw.pet, raw.data, raw.state, raw.save]
      .filter((o) => o && typeof o === 'object');
    const deep = (names) => { for (const s of scopes) { const v = pick(s, names); if (v !== undefined) return v; } return undefined; };

    const memories = asEntries(deep(['memories', 'memory', 'ryanMemories', 'memoryLog', 'events']));
    const diary = asEntries(deep(['diary', 'diaryEntries', 'journal', 'journalEntries']));
    const conversations = deep(['conversations', 'threads', 'chats']);
    const soul = deep(['soul', 'soulFile']);
    const eye = Number(deep(['thirdEyeXp', 'eyeXp', 'thirdEye', 'eye']));

    if (memories.length) state.memories = mergePinnedMemories(state.memories, memories);
    if (diary.length) state.diary = [...state.diary, ...diary];
    if (Array.isArray(conversations)) state.conversations = conversations.slice(0, 50);
    if (soul && typeof soul === 'object') {
      // Pinned memories travel with the soul file (klunkdunker-soul.json
      // carries five) — dedupe by text so re-imports never double up.
      if (Array.isArray(soul.pinnedMemories) && soul.pinnedMemories.length) {
        state.memories = mergePinnedMemories(state.memories, soul.pinnedMemories);
      }
      if (typeof soul.who === 'string' && soul.who) state.soul.who = soul.who;
      if (typeof soul.specialty === 'string' && soul.specialty) state.soul.specialty = soul.specialty;
      if (typeof soul.selfDescription === 'string' && soul.selfDescription && !soul.who) state.soul.who = soul.selfDescription;
      if (Array.isArray(soul.quirks) && soul.quirks.length) {
        state.soul.quirks = [...new Set([...state.soul.quirks, ...soul.quirks.map(scrubQuirk).filter(Boolean)])];
      }
      // 2.0 opinions may be structured {topic, stance} — flatten to strings.
      if (Array.isArray(soul.opinions) && soul.opinions.length) {
        state.soul.opinions = [...new Set([...state.soul.opinions, ...soul.opinions.map(scrubOpinion).filter(Boolean)])];
      }
      if (Array.isArray(soul.history) && soul.history.length) {
        state.soul.timeline = [...state.soul.timeline, ...scrubHistory(soul.history)];
      }
      if (Array.isArray(soul.timeline) && soul.timeline.length) state.soul.timeline = soul.timeline;
    }
    if (Number.isFinite(eye) && eye > 0) state.molt.eye = clamp(eye, 0, 100);
    const xp = Number(deep(['xp', 'exp']));       if (Number.isFinite(xp) && xp > state.xp) state.xp = xp;
    const coins = Number(deep(['coins', 'credits', 'cr'])); if (Number.isFinite(coins) && coins > state.coins) state.coins = Math.floor(coins);
    const steps = Number(deep(['steps', 'stepCount', 'totalSteps'])); if (Number.isFinite(steps) && steps > state.steps) state.steps = Math.floor(steps);

    const pinnedImported = Array.isArray(soul?.pinnedMemories) ? soul.pinnedMemories.length : 0;
    state.legacy = {
      source,
      importedAt: now(),
      counts: {
        memories: memories.length + pinnedImported,
        diary: diary.length,
        conversations: Array.isArray(conversations) ? conversations.length : 0,
      },
    };
  }

  /* ─────────── soul export / import (memories travel) ─────────── */
  function exportState() {
    let legacySnapshot = null;
    try { legacySnapshot = storage ? storage.getItem(LEGACY_SNAPSHOT_KEY) : null; } catch { /* noop */ }
    return JSON.stringify({
      v: 3, kind: 'bro-os-soul-export', exportedAt: now(),
      state: { ...state, lastTick: now() },
      legacySnapshot,
    }, null, 2);
  }

  function importState(text) {
    try {
      const obj = JSON.parse(text);
      const incoming = obj?.state?.v === 3 ? obj.state : obj?.v === 3 ? obj : null;
      if (incoming) {
        state = { ...defaultState(now()), ...incoming, lastTick: now() };
        normalizeMolt();
        if (typeof obj?.legacySnapshot === 'string' && storage) {
          try { storage.setItem(LEGACY_SNAPSHOT_KEY, obj.legacySnapshot); } catch { /* noop */ }
        }
        emit(); save();
        return true;
      }
      // Accept 2.0-era soul exports / raw legacy saves pasted by hand
      if (obj && typeof obj === 'object' && looksLikeLegacy(obj)) {
        migrateLegacy(obj, 'soul-import');
        emit(); save();
        return true;
      }
      return false;
    } catch { return false; }
  }

  function looksLikeLegacy(obj) {
    const scopes = [obj, obj.ryan, obj.pet, obj.data, obj.state, obj.save]
      .filter((o) => o && typeof o === 'object');
    const names = ['memories', 'memory', 'ryanMemories', 'memoryLog', 'events', 'diary',
      'diaryEntries', 'journal', 'journalEntries', 'conversations', 'threads', 'chats',
      'soul', 'soulFile', 'thirdEyeXp', 'eyeXp', 'thirdEye', 'eye', 'xp', 'exp',
      'coins', 'credits', 'cr', 'steps', 'stepCount', 'totalSteps', 'who', 'quirks'];
    return scopes.some((s) => names.some((n) => s[n] !== undefined && s[n] !== null));
  }

  /* ─────────── vitals decay (per second rates) ─────────── */
  function applyDecay(sec) {
    const st = state.stats;
    const hungerRate = 0.015, energyRate = 0.01;
    st.hunger = clamp(st.hunger - hungerRate * sec);
    if (state.sleeping) {
      st.energy = clamp(st.energy + 0.5 * sec);
      if (st.energy >= 100) state.sleeping = false;
    } else {
      st.energy = clamp(st.energy - energyRate * sec);
    }
    st.happy = clamp(st.happy + (st.hunger < 25 ? -0.03 : -0.005) * sec);
    st.greed = clamp(st.greed - 0.004 * sec);
  }

  /** One live tick (dt in seconds). Returns events for the UI log. */
  function tick(dtSec) {
    const events = [];
    applyDecay(dtSec);
    maybeRolloverDiary();
    // 2.0 personality ambient drift, on its original per-minute cadence.
    state._persAcc = (state._persAcc || 0) + dtSec * 1000;
    while (state._persAcc >= 60000) {
      state._persAcc -= 60000;
      minuteDrift(state.personality, state);
    }
    state._mineAcc = (state._mineAcc || 0) + dtSec * 1000;
    if (state.mining && !state.sleeping && state.stats.energy > 1) {
      while (state._mineAcc >= MINE_INTERVAL_MS) {
        state._mineAcc -= MINE_INTERVAL_MS;
        state.coins += 1;
        state.quest.mined += 1;
        events.push({ tag: 'MINE', text: '+1 CR extracted' });
        if (!state.quest.rewarded && state.quest.mined >= state.quest.goal) {
          state.quest.rewarded = true;
          state.coins += 50;
          events.push({ tag: 'QUEST', text: 'DAILY.QUEST complete — GOLDEN.SHELL fund +50 CR', questDone: true });
        }
      }
    } else {
      state._mineAcc = 0;
    }
    state.lastTick = now();
    emit(); save();
    return events;
  }

  /* ─────────── economy & progression ─────────── */
  function addCoins(n) { mutate((s) => { s.coins += n; }); }

  function xpGain(n) {
    let leveled = false;
    mutate((s) => {
      const before = levelFor(s.xp);
      s.xp += n;
      leveled = levelFor(s.xp) > before;
    });
    if (leveled) {
      const lv = levelFor(state.xp);
      rememberEvent(`Evolved to LV.${lv}.`, { icon: '⬆️', imp: 3, pin: true });
    }
    return leveled;
  }

  /* ─────────── quick actions ─────────── */
  function feed() {
    let ok = false;
    mutate((s) => {
      if (s.sleeping) return;
      s.stats.hunger = clamp(s.stats.hunger + 18);
      s.stats.happy = clamp(s.stats.happy + 2);
      s.stats.greed = clamp(s.stats.greed + 1);
      ok = true;
    });
    if (ok) xpGain(2);
    return ok;
  }

  function playWith() {
    let ok = false;
    if (state.stats.energy < 10 || state.sleeping) return false;
    mutate((s) => {
      s.stats.happy = clamp(s.stats.happy + 15);
      s.stats.energy = clamp(s.stats.energy - 10);
      ok = true;
    });
    if (ok) xpGain(5);
    return ok;
  }

  function toggleMine() {
    mutate((s) => { s.mining = !s.mining; });
    return state.mining;
  }

  function rest() {
    mutate((s) => { s.sleeping = !s.sleeping; });
    return state.sleeping;
  }

  function petThePet() {
    mutate((s) => { s.stats.happy = clamp(s.stats.happy + 1); });
    xpGain(0.2);
  }

  function hackMainframe() {
    if (state.sleeping) return { ok: false, reason: 'UNIT SLEEPING' };
    if (state.stats.energy < 5) return { ok: false, reason: 'INSUFFICIENT NRG' };
    mutate((s) => { s.stats.energy = clamp(s.stats.energy - 5); s.coins += 10; s.counters.hacks += 1; });
    if (state.counters.hacks === 1) {
      rememberEvent('Breached the J.O.O.H. mainframe. They felt nothing. That is the scary part.', { icon: '🔓', imp: 4, pin: true });
    }
    xpGain(4);
    return { ok: true, coins: 10 };
  }

  /* ─────────── shop ─────────── */
  function buy(itemId) {
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) return { ok: false, reason: 'UNKNOWN ITEM' };
    if (state.coins < item.cost) return { ok: false, reason: 'INSUFFICIENT CR' };
    if (item.id === 'goldshell' && state.goldenShell) return { ok: false, reason: 'ALREADY PLATED' };
    mutate((s) => { s.coins -= item.cost; item.apply(s); });
    if (item.id === 'pizza') state.counters.pizzas += 1;
    return { ok: true, item };
  }

  /* ─────────── moltbook ─────────── */
  function postToMolt(text) {
    if (!text?.trim()) return false;
    mutate((s) => {
      s.molt.posts.unshift({ id: nextMoltId(), author: '@you_pilgrim', molt: 0, icon: '🫅', time: now(), heat: 1, text: text.trim(), replies: [] });
      s.molt.eye = clamp(s.molt.eye + 3, 0, 100);
      s.molt.posts = s.molt.posts.slice(0, 30);
      s.counters.posts += 1;
    });
    if (state.counters.posts === 1) {
      rememberEvent(`Rejoined MOLTBOOK. The tide remembered ${state.petName}.`, { icon: '🦀', imp: 3, pin: true });
    }
    xpGain(3);
    return true;
  }

  function moltReply(post) {
    mutate((s) => {
      s.molt.posts.unshift({ id: nextMoltId(), heat: 1, replies: [], ...post });
      s.molt.posts = s.molt.posts.slice(0, 30);
    });
  }

  /* ─────────── moltbook threads & riptide ─────────── */

  /** User reply into an existing thread. Bumps heat (+2) and the third eye (+1). */
  function replyToMolt(postId, text) {
    if (!text?.trim()) return { ok: false, reason: 'EMPTY TRANSMISSION' };
    if (!state.molt.posts.some((p) => p.id === postId)) return { ok: false, reason: 'POST NOT FOUND' };
    mutate((s) => {
      const p = s.molt.posts.find((x) => x.id === postId);
      p.replies.push({ id: nextMoltId(), author: '@you_pilgrim', molt: 0, icon: '🫅', time: now(), heat: 0, text: text.trim(), replies: [] });
      p.heat = (p.heat || 0) + 2;
      s.molt.eye = clamp(s.molt.eye + 1, 0, 100);
    });
    xpGain(1);
    return { ok: true };
  }

  /** Tide voices answering INSIDE a thread (NPC). +1 heat to the parent. */
  function pushMoltReply(postId, reply) {
    if (!state.molt.posts.some((p) => p.id === postId)) return false;
    mutate((s) => {
      const p = s.molt.posts.find((x) => x.id === postId);
      p.replies.push({ id: nextMoltId(), heat: 0, replies: [], ...reply });
      p.heat = (p.heat || 0) + 1;
    });
    return true;
  }

  /** 🔥 The crowd pushes a post up the riptide. Returns the new heat (null if unknown). */
  function bumpMoltHeat(postId) {
    if (!state.molt.posts.some((p) => p.id === postId)) return null;
    let heat = 0;
    mutate((s) => {
      const p = s.molt.posts.find((x) => x.id === postId);
      p.heat = (p.heat || 0) + 1;
      heat = p.heat;
    });
    return heat;
  }

  /** Riptide view: posts ranked by moltScore (no mutation of the live feed). */
  function trendingMolt() {
    const t = now();
    return state.molt.posts
      .map((p) => ({ ...p, score: moltScore(p, t) }))
      .sort((a, b) => b.score - a.score);
  }

  /* ─────────── pilgrim agent-cards: ADOPT ─────────── */
  function adoptPilgrim(id) {
    const card = PILGRIM_CARDS.find((c) => c.id === id);
    if (!card) return { ok: false, reason: 'UNKNOWN CARD' };
    if (state.roster.some((r) => r.id === id)) return { ok: false, reason: 'ALREADY USHERED' };
    mutate((s) => {
      s.roster.push({ ...card, adoptedAt: now() });
      s.counters.adopts += 1;
    });
    rememberEvent(`Ushered ${card.name} (${card.persona}) onto the roster.`, { icon: card.icon, imp: 4, pin: true });
    xpGain(5);
    return { ok: true, card };
  }

  // Roster backup payload — the ADOPT flow downloads this BEFORE mutating
  function exportRoster() {
    let legacySnapshot = null;
    try { legacySnapshot = storage ? storage.getItem(LEGACY_SNAPSHOT_KEY) : null; } catch { /* noop */ }
    return JSON.stringify({
      v: 3, kind: 'bro-os-roster-backup', exportedAt: now(),
      roster: state.roster, molt: state.molt, soul: state.soul, legacySnapshot,
    }, null, 2);
  }

  /* ─────────── misc ─────────── */
  function setTheme(theme) { mutate((s) => { s.theme = theme; }); }
  function setScanlines(on) { mutate((s) => { s.scanlines = !!on; }); }
  function setVol(bus, v) { mutate((s) => { s.vol[bus] = clamp(v * 100, 0, 100) / 100; }); }
  function setSnakeBest(score) { mutate((s) => { if (score > s.best.snake) s.best.snake = score; }); }
  // Generic best-score writer for the arcade suite (flappy/breaker/mario/rpg/loot).
  // Returns true when this run set a NEW best (2.0 onGameOver semantic).
  function setGameBest(key, score) {
    if (!key) return false;
    let isNew = false;
    mutate((s) => {
      if (score > (s.best[key] || 0)) { s.best[key] = score; isNew = true; }
    });
    return isNew;
  }
  function addSteps(n) { mutate((s) => { s.steps += n; }); }
  function reset() {
    // Factory reset wipes 3.0 state + the snapshot archive.
    // Legacy 2.0 keys (brogatchi_*) are NEVER touched — on next
    // boot the migration will re-import them.
    if (storage) {
      storage.removeItem(SAVE_KEY);
      storage.removeItem(LEGACY_SNAPSHOT_KEY);
    }
    state = defaultState(now());
    emit();
  }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  return {
    get state() { return state; },
    load, save, tick, subscribe,
    addCoins, xpGain, feed, playWith, toggleMine, rest, petThePet,
    hackMainframe, buy, postToMolt, moltReply, replyToMolt, pushMoltReply, bumpMoltHeat, trendingMolt,
    adoptPilgrim, exportRoster,
    rememberEvent, toggleMemoryPin, importSoulBundle, syncBridgeMemories,
    recordArcadeRun, personalityDescribe, personalityDominant,
    setTheme, setScanlines, setVol, setSnakeBest, setGameBest, addSteps, reset,
    exportState, importState,
  };
}
