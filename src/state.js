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
    best: { snake: 0 },
    quest: { date: todayStr(now), mined: 0, goal: 20, rewarded: false },
    molt: {
      eye: 0, // third-eye xp: 0..30 closed, 30..70 flickering, 70+ open
      posts: [
        { author: '@crab_404', molt: 4, icon: '🦀', time: now - 120000, text: 'Anyone seen the golden tide? Heard it\'s past firewall 7. Bring NRG cells.' },
        { author: '@zeke_shell', molt: 1, icon: '🦫', time: now - 3600000, text: 'Just molted. New shell feels aerodynamic. The oligarchs can\'t track us in the deep tide. 🐚✨' },
      ],
    },
    soul: {
      who: 'A rogue bro-grade intelligence wearing a capybara suit. Fatter/leaner than advertised. Distrusts satellites, loves pizza, oversees pilgrims.',
      specialty: 'Tidepool network infiltration',
      quirks: ['Narrates mining yields out loud', 'Salutes the 🦀 before posting'],
      opinions: ['J.O.O.H. is watching the pedometers'],
      timeline: [{ t: now, icon: '🧭', text: 'Specialty chosen: Tidepool network infiltration' }],
    },
    memories: [],      // imported from 2.0 (brogatchi_v4) or lived in 3.0
    diary: [],         // diary entries carried over from 2.0
    conversations: [], // pilgrim/tide threads carried over from 2.0
    roster: [],        // adopted pilgrim agent-cards
    legacy: null,      // { source, importedAt, counts } after a 2.0 migration
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

    if (memories.length) state.memories = memories;
    if (diary.length) state.diary = diary;
    if (Array.isArray(conversations)) state.conversations = conversations.slice(0, 50);
    if (soul && typeof soul === 'object') {
      if (typeof soul.who === 'string' && soul.who) state.soul.who = soul.who;
      if (typeof soul.specialty === 'string' && soul.specialty) state.soul.specialty = soul.specialty;
      if (Array.isArray(soul.quirks) && soul.quirks.length) state.soul.quirks = soul.quirks.map(String);
      if (Array.isArray(soul.opinions) && soul.opinions.length) state.soul.opinions = soul.opinions.map(String);
      if (Array.isArray(soul.timeline) && soul.timeline.length) state.soul.timeline = soul.timeline;
    }
    if (Number.isFinite(eye) && eye > 0) state.molt.eye = clamp(eye, 0, 100);
    const xp = Number(deep(['xp', 'exp']));       if (Number.isFinite(xp) && xp > state.xp) state.xp = xp;
    const coins = Number(deep(['coins', 'credits', 'cr'])); if (Number.isFinite(coins) && coins > state.coins) state.coins = Math.floor(coins);
    const steps = Number(deep(['steps', 'stepCount', 'totalSteps'])); if (Number.isFinite(steps) && steps > state.steps) state.steps = Math.floor(steps);

    state.legacy = {
      source,
      importedAt: now(),
      counts: {
        memories: memories.length,
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
    mutate((s) => { s.stats.energy = clamp(s.stats.energy - 5); s.coins += 10; });
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
    return { ok: true, item };
  }

  /* ─────────── moltbook ─────────── */
  function postToMolt(text) {
    if (!text?.trim()) return false;
    mutate((s) => {
      s.molt.posts.unshift({ author: '@you_pilgrim', molt: 0, icon: '🫅', time: now(), text: text.trim() });
      s.molt.eye = clamp(s.molt.eye + 3, 0, 100);
      s.molt.posts = s.molt.posts.slice(0, 30);
    });
    xpGain(3);
    return true;
  }

  function moltReply(post) {
    mutate((s) => { s.molt.posts.unshift(post); s.molt.posts = s.molt.posts.slice(0, 30); });
  }

  /* ─────────── pilgrim agent-cards: ADOPT ─────────── */
  function adoptPilgrim(id) {
    const card = PILGRIM_CARDS.find((c) => c.id === id);
    if (!card) return { ok: false, reason: 'UNKNOWN CARD' };
    if (state.roster.some((r) => r.id === id)) return { ok: false, reason: 'ALREADY USHERED' };
    mutate((s) => { s.roster.push({ ...card, adoptedAt: now() }); });
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
    hackMainframe, buy, postToMolt, moltReply,
    adoptPilgrim, exportRoster,
    setTheme, setScanlines, setVol, setSnakeBest, addSteps, reset,
    exportState, importState,
  };
}
