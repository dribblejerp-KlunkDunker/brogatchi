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
import { remember, togglePin, mergePinnedMemories, scrubQuirk, scrubOpinion, scrubHistory, buildDayLines, appendDiaryLines, capMemories, sortMemories, fadeMemories } from './memory.js';
import { initialPersonality, applyEvents, minuteDrift, dominant as dominantTrait, describe as describeTraits } from './personality.js';
// Slot names + the native grid of each, so an override that would tear a
// game's layout is rejected here rather than drawn badly later.
import { OVERRIDABLE, overrideProblem } from './games/overrides.js';

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

/* ─────────── SPRITE GALLERY (painted creations) ───────────
   PIXEL.STUDIO paints in the games' native format: uniform char rows
   keyed to the master palette. A creation is one such painting — saved
   into the soul, hung in the gallery, shareable to the tidepool — and
   an override is a creation bound to a bank sprite's own grid. Rows are
   stripped to palette-safe chars, so a hand-edited save can never feed
   the renderer anything but pixels. */

const CREATION_SIDE_MAX = 32;
const CREATION_CAP = 24;

const CRAB_ART = [
  '.O....O.',
  '.OO..OO.',
  '.ORRRRO.',
  'ORWWRRWO',
  'ORRRRRRO',
  '.ORRRRO.',
  '.O....O.',
  '..O..O..',
];

const SHELL_ART = [
  '..OOOO..',
  '.OMMMMO.',
  'OMEEMMMO',
  'OMEMMEMO',
  'OMMEEMMO',
  '.OMMMMO.',
  '..OMMO..',
  '...OO...',
];

/** Uniform, ≤32 a side, palette-safe (letters + '.'). Anything else is rejected. */
function sanitizeRows(raw) {
  if (!Array.isArray(raw)) return null;
  const h = raw.length;
  if (!h || h > CREATION_SIDE_MAX) return null;
  const w = typeof raw[0] === 'string' ? raw[0].length : 0;
  if (!w || w > CREATION_SIDE_MAX) return null;
  const rows = [];
  for (const r of raw) {
    if (typeof r !== 'string' || r.length !== w) return null;
    rows.push(r.replace(/[^A-Za-z.]/g, '.'));
  }
  return rows;
}

/** One flat line of a post, for the 🪶 soul memory that echoes it. */
function echoLine(text, max = 64) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** A stored override, or null when the slot or the grid is not paintable. */
function sanitizeOverride(slot, raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rows = sanitizeRows(raw.rows);
  if (!rows || overrideProblem(slot, rows)) return null;
  return { rows, name: String(raw.name ?? 'UNTITLED').slice(0, 24), t: Number(raw.t) || null };
}

function sanitizeCreation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rows = sanitizeRows(raw.rows);
  if (!rows) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : null,
    author: typeof raw.author === 'string' && raw.author ? raw.author.slice(0, 24) : '@you_pilgrim',
    name: String(raw.name ?? 'UNTITLED').slice(0, 24),
    rows,
    t: Number(raw.t) || null,
  };
}

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
    bgmMuted: false,
    remixes: {},       // CHIPTUNE.SYNTH: `${game}:${tier}` -> remixed 16-step track
    spriteOverrides: {}, // PIXEL.STUDIO: bank sprite name -> { rows, name, t }
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
    // Lifetime "first-ever" milestone flags. counters reset at the day
    // rollover, so pin conditions must never read them as "first ever" —
    // otherwise the legend re-fires every morning after the first win.
    milestones: { win: false, hack: false, post: false },
    dailyDiaryDone: todayStr(now),   // last date the rollover diary was written
    roster: [],        // adopted pilgrim agent-cards
    // Painted creations. Two pilgrims' pieces ship with the tide so the
    // gallery is a shared shelf from the first boot.
    creations: [
      { id: 'seed-art-crab', author: '@crab_404', name: 'BRASS CRAB', rows: CRAB_ART, t: now - 5400000 },
      { id: 'seed-art-zeke', author: '@zeke_shell', name: 'NEW SHELL', rows: SHELL_ART, t: now - 9000000 },
    ],
    legacy: null,      // { source, importedAt, counts } after a 2.0 migration
    personality: initialPersonality(), // 2.0 trait core — nudged by arcade/meal/quest events
    lastTick: now,
  };
}

/* ─────────── CHIPTUNE.SYNTH remixes (arcade BGM overrides) ───────────
   A remix is a whole 16-step track for one game+tier, keyed
   `${game}:${tier}`. Saves can arrive from anywhere (a pasted soul
   file), so every lane is coerced to 16 in-range steps and a missing
   or broken bpm rejects the remix outright. */

const LOOP_STEPS = 16;

function lane16(raw, max) {
  const out = new Array(LOOP_STEPS).fill(0);
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < LOOP_STEPS; i++) {
    const v = Math.round(Number(raw[i]));
    out[i] = Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0;
  }
  return out;
}

function sanitizeRemix(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const bpm = Math.round(Number(raw.bpm));
  if (!Number.isFinite(bpm)) return null;
  return {
    name: String(raw.name ?? 'REMIX').slice(0, 32),
    bpm: Math.max(40, Math.min(240, bpm)),
    lead: lane16(raw.lead, 127),
    bass: lane16(raw.bass, 127),
    hat: lane16(raw.hat, 1),
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
      if (!Number.isFinite(p.time)) p.time = now(); // riptide age + "time ago" need a real clock
      p.replies.forEach((r) => { if (!Number.isFinite(r.time)) r.time = now(); });
      // A sprite post whose rows no longer validate degrades to text only.
      if (p.sprite !== undefined && !sanitizeRows(p.sprite)) delete p.sprite;
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

  // heal saves from before the mute toggle existed
  if (typeof state.bgmMuted !== 'boolean') state.bgmMuted = false;

  // heal saves from before the lifetime milestone flags existed: a save
  // that already carries these memories owns them — never re-fire. Runs on
  // init, load, and import (whichever swap memories in underneath us).
  function normalizeMilestones() {
    if (!state.milestones || typeof state.milestones !== 'object') state.milestones = { win: false, hack: false, post: false };
    for (const m of state.memories) {
      if (m.text === 'A legend is born in the cabinet room.') state.milestones.win = true;
      else if (m.text.startsWith('Breached the J.O.O.H. mainframe.')) state.milestones.hack = true;
      else if (m.text.startsWith('Rejoined MOLTBOOK.')) state.milestones.post = true;
    }
  }
  normalizeMilestones();

  // An unreadable remix entry degrades to the stock loop instead of breaking
  // the arcade — drop rather than trust. Re-run on load/import, which swap the
  // whole state object in underneath this heal.
  function normalizeRemixes() {
    if (!state.remixes || typeof state.remixes !== 'object' || Array.isArray(state.remixes)) state.remixes = {};
    for (const [key, val] of Object.entries(state.remixes)) {
      const clean = sanitizeRemix(val);
      if (clean) state.remixes[key] = clean; else delete state.remixes[key];
    }
  }
  normalizeRemixes();

  // Re-run on load/import, which swap the whole state object in underneath.
  // An override that no longer matches its slot's grid is dropped rather
  // than trusted — the game then simply draws the bank art.
  function normalizeSpriteOverrides() {
    if (!state.spriteOverrides || typeof state.spriteOverrides !== 'object' || Array.isArray(state.spriteOverrides)) {
      state.spriteOverrides = {};
    }
    for (const [slot, val] of Object.entries(state.spriteOverrides)) {
      const clean = sanitizeOverride(slot, val);
      if (clean) state.spriteOverrides[slot] = clean; else delete state.spriteOverrides[slot];
    }
  }
  normalizeSpriteOverrides();

  function normalizeCreations() {
    if (!Array.isArray(state.creations)) state.creations = [];
    state.creations = state.creations.map(sanitizeCreation).filter(Boolean).slice(0, CREATION_CAP);
    state.creations.forEach((c) => { if (!c.id) c.id = nextMoltId(); });
  }
  normalizeCreations();

  /** Record a gameplay event as a real memory. pin: milestone; post: the
      Moltbook thread this memory echoes (SOUL.FILE links back through it). */
  function rememberEvent(text, { icon = '🧠', imp = 2, pin = false, post = null } = {}) {
    mutate((s) => { s.memories = remember(s.memories, { icon, text, imp, pin, post }); });
  }

  /* ─────────── 2.0 personality & arcade soul-feed ───────────
     Restored from the 2.0 app: every game over nudges the trait
     axes (ego +4, greed +1), writes a real memory, and the first
     win ever pins the cabinet-room milestone. */
  function recordArcadeRun({ key, label, score, newBest = false }) {
    if (!Number.isFinite(Number(score))) return;
    // Captured BEFORE the mutate: the "first-ever" signal for both the win
    // pin and the cabinet-room legend, so a daily counter reset can never
    // re-fire either one on later days.
    const firstWinEver = !state.milestones.win;
    mutate((s) => {
      applyEvents(s.personality, [{ trait: 'ego', amount: 4 }, { trait: 'greed', amount: 1 }]);
      // A personal record doubles the ego feed — the bro remembers being great.
      if (newBest) applyEvents(s.personality, [{ trait: 'ego', amount: 4 }]);
      // 2.0 game-over flow: a run at the cabinets is a good time.
      if (s.stats) s.stats.happy = clamp(s.stats.happy + 20);
      s.counters.gamesWon += 1;
      s.milestones.win = true;
      // A score memory fades with age (see fadeMemories): vivid today,
      // ordinary later. The first win is pinned, and pinning arrests it.
      s.memories = remember(s.memories, {
        icon: '🎮',
        text: `Won ${label || key} with ${score} points.`,
        imp: 3,
        pin: firstWinEver,
        fade: true,
      });
      // High scores write their own memory — the soul keeps the leaderboard.
      if (newBest) {
        s.memories = remember(s.memories, {
          icon: '🌟',
          text: `New ${label || key} record: ${score} points.`,
          imp: 4,
          fade: true,
        });
      }
    });
    if (firstWinEver) {
      rememberEvent('A legend is born in the cabinet room.', { icon: '🏆', imp: 4, pin: true });
    }
  }

  /** Trait summary for the SOUL viewer ("Ego 34% · Greed 12% …"). */
  function personalityDescribe() { return describeTraits(state.personality); }
  function personalityDominant() { return dominantTrait(state.personality); }

  /** Current trait core as a persona-prompt line (chat brain, bridge voice). */
  function personalityPromptLine() { return `Your trait core right now: ${describeTraits(state.personality)}. Dominant drive: ${dominantTrait(state.personality)} — let it color the tone, never announce it.`; }

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
          normalizeMolt(); // heal before decay math reads post times
          applyDecay(Math.min(8 * 3600, Math.max(0, (now() - (state.lastTick ?? now())) / 1000)));
          if (state.quest.date !== todayStr(now())) {
            state.quest = { date: todayStr(now()), mined: 0, goal: 20, rewarded: false };
          }
        }
      }
    } catch { /* corrupt save — boot fresh */ }
    normalizeMolt();
    normalizeRemixes();
    normalizeSpriteOverrides();
    normalizeCreations();
    normalizeMilestones();
    importLegacy();
    // Age is the whole input, so a save that sat closed for a month comes
    // back with its records already settled.
    state.memories = fadeMemories(state.memories, now());
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
        normalizeRemixes();
        normalizeSpriteOverrides();
        normalizeCreations();
        normalizeMilestones();
        state.memories = fadeMemories(state.memories, now());
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
      // The same clock erodes old records' grip on the top of the file.
      state.memories = fadeMemories(state.memories, now());
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
          // 2.0 quest wiring: completion feeds broCode and fitness.
          applyEvents(state.personality, [{ trait: 'broCode', amount: 2 }, { trait: 'fitness', amount: 1 }]);
          // 2.0 quest milestone — pinned.
          rememberEvent('Finished a real-life quest. The sim shakes.', { icon: '✅', imp: 4, pin: true });
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
      // 2.0 meal wiring: a meal feeds gluttony (pizza-tier).
      applyEvents(s.personality, [{ trait: 'gluttony', amount: 3 }]);
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
    mutate((s) => {
      s.mining = !s.mining;
      // 2.0 rig wiring: deploying the miner feeds greed.
      if (s.mining) applyEvents(s.personality, [{ trait: 'greed', amount: 3 }]);
    });
    if (state.mining) {
      rememberEvent('Deployed the mining rig. Passive income go brrr.', { icon: '⛏️', imp: 3 });
    }
    return state.mining;
  }

  function rest() {
    mutate((s) => { s.sleeping = !s.sleeping; });
    return state.sleeping;
  }

  function petThePet() {
    mutate((s) => {
      s.stats.happy = clamp(s.stats.happy + 1);
      // 2.0 pet wiring: pet10 quest paid broCode +2 — same rate per pet.
      applyEvents(s.personality, [{ trait: 'broCode', amount: 0.2 }]);
    });
    xpGain(0.2);
  }

  function hackMainframe() {
    if (state.sleeping) return { ok: false, reason: 'UNIT SLEEPING' };
    if (state.stats.energy < 5) return { ok: false, reason: 'INSUFFICIENT NRG' };
    mutate((s) => {
      s.stats.energy = clamp(s.stats.energy - 5);
      s.coins += 10;
      s.counters.hacks += 1;
      // 2.0 hack wiring: paranoia up hard, ego and greed ride the payout.
      applyEvents(s.personality, [{ trait: 'paranoia', amount: 5 }, { trait: 'ego', amount: 2 }, { trait: 'greed', amount: 3 }]);
    });
    if (state.counters.hacks === 1 && !state.milestones.hack) {
      state.milestones.hack = true;
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
    mutate((s) => {
      s.coins -= item.cost;
      item.apply(s);
      // 2.0 shop wiring: pizza feeds gluttony, NRG cells feed ego.
      if (item.id === 'pizza') applyEvents(s.personality, [{ trait: 'gluttony', amount: 3 }]);
      if (item.id === 'nrgcell') applyEvents(s.personality, [{ trait: 'ego', amount: 1.5 }]);
    });
    if (item.id === 'pizza') state.counters.pizzas += 1;
    rememberEvent(`Bought the ${item.name}. Worth it.`, { icon: '🛍️', imp: 2 });
    return { ok: true, item };
  }

  /* ─────────── moltbook ─────────── */
  function postToMolt(text) {
    if (!text?.trim()) return false;
    const body = text.trim();
    let postId = null;
    mutate((s) => {
      postId = nextMoltId();
      s.molt.posts.unshift({ id: postId, author: '@you_pilgrim', molt: 0, icon: '🫅', time: now(), heat: 1, text: body, replies: [] });
      s.molt.eye = clamp(s.molt.eye + 3, 0, 100);
      s.molt.posts = s.molt.posts.slice(0, 30);
      s.counters.posts += 1;
    });
    // 🪶 Every post leaves an echo in the soul that links back to its thread.
    rememberEvent(`Posted to the tidepool: "${echoLine(body)}"`, { icon: '🪶', imp: 2, post: postId });
    if (state.counters.posts === 1 && !state.milestones.post) {
      state.milestones.post = true;
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

  /* ─────────── sprite gallery: save + share a painting ─────────── */

  /** Hang a painting in the gallery. Returns { ok, creation } or { ok, reason }. */
  function saveCreation(name, rows) {
    const clean = sanitizeRows(rows);
    if (!clean) return { ok: false, reason: 'INVALID CANVAS' };
    const creation = {
      id: nextMoltId(),
      author: '@you_pilgrim',
      name: String(name ?? '').trim().slice(0, 24) || 'UNTITLED',
      rows: clean,
      t: now(),
    };
    mutate((s) => { s.creations = [creation, ...s.creations].slice(0, CREATION_CAP); });
    rememberEvent(`Painted "${creation.name}" (${clean[0].length}×${clean.length}). The tidepool curates.`, { icon: '🎨', imp: 2 });
    return { ok: true, creation };
  }

  /* ─────────── sprite overrides: a painting becomes game art ─────────── */

  /** Bind a painting to a bank sprite. Returns { ok, slot } or { ok, reason }. */
  function setSpriteOverride(slot, rows, name = 'UNTITLED') {
    if (!OVERRIDABLE[slot]) return { ok: false, reason: 'UNKNOWN SLOT' };
    const clean = sanitizeRows(rows);
    const problem = clean ? overrideProblem(slot, clean) : 'EMPTY CANVAS';
    if (problem) return { ok: false, reason: problem };
    const label = String(name ?? '').trim().slice(0, 24) || 'UNTITLED';
    const meta = OVERRIDABLE[slot];
    mutate((s) => { s.spriteOverrides[slot] = { rows: clean, name: label, t: now() }; });
    // Write a Moltbook post so the equipped state is visible on the tidepool.
    let postId = null;
    mutate((s) => {
      postId = nextMoltId();
      s.molt.posts.unshift({
        id: postId, author: '@you_pilgrim', molt: 0, icon: '🎮', time: now(), heat: 1,
        text: `Equipped "${label}" into ${meta.label} (${meta.game}). The cabinets draw your art now.`,
        replies: [],
        sprite: [...clean],
        equipped: slot,
      });
      s.molt.eye = clamp(s.molt.eye + 3, 0, 100);
      s.molt.posts = s.molt.posts.slice(0, 30);
      s.counters.posts += 1;
    });
    rememberEvent(`Replaced ${slot} with "${label}".`, { icon: '🎨', imp: 3, post: postId });
    return { ok: true, slot };
  }

  /** Hand the slot back to the bank art. */
  function resetSpriteOverride(slot) {
    if (!state.spriteOverrides[slot]) return { ok: false, reason: 'NO OVERRIDE' };
    mutate((s) => { delete s.spriteOverrides[slot]; });
    return { ok: true, slot };
  }

  /** Share a gallery creation to the feed, where pilgrims answer it. */
  function postCreation(id, text) {
    const creation = state.creations.find((c) => c.id === id);
    if (!creation) return { ok: false, reason: 'CREATION NOT FOUND' };
    let postId = null;
    mutate((s) => {
      postId = nextMoltId();
      s.molt.posts.unshift({
        id: postId, author: '@you_pilgrim', molt: 0, icon: '🎨', time: now(), heat: 1,
        text: String(text ?? '').trim().slice(0, 240) || `Painted "${creation.name}" in PIXEL.STUDIO. Judge it, tide.`,
        replies: [],
        sprite: [...creation.rows],
      });
      s.molt.eye = clamp(s.molt.eye + 3, 0, 100);
      s.molt.posts = s.molt.posts.slice(0, 30);
      s.counters.posts += 1;
    });
    rememberEvent(`Shared "${creation.name}" with the tidepool.`, { icon: '🪶', imp: 2, post: postId });
    xpGain(3);
    return { ok: true, creation };
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
  function setBgmMuted(on) { mutate((s) => { s.bgmMuted = !!on; }); }

  /* ─────────── CHIPTUNE.SYNTH remixes ─────────── */
  function setRemix(id, tier, track) {
    const clean = sanitizeRemix(track);
    if (!clean) return false;
    mutate((s) => { s.remixes[`${id}:${tier}`] = clean; });
    return true;
  }
  function clearRemix(id, tier) {
    mutate((s) => { delete s.remixes[`${id}:${tier}`]; });
  }
  function remixFor(id, tier) {
    return state.remixes[`${id}:${tier}`] || null;
  }
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
  function addSteps(n) {
    if (!Number.isFinite(Number(n)) || n <= 0) return;
    mutate((s) => {
      const before = s.steps;
      s.steps += Math.floor(Number(n));
      // 2.0 pedometer wiring: fitness +0.8 per 100 steps crossed.
      const gained = Math.floor(s.steps / 100) - Math.floor(before / 100);
      if (gained > 0) applyEvents(s.personality, [{ trait: 'fitness', amount: 0.8 * Math.min(gained, 10) }]);
    });
  }
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
    saveCreation, postCreation, setSpriteOverride, resetSpriteOverride,
    adoptPilgrim, exportRoster,
    rememberEvent, toggleMemoryPin, importSoulBundle, syncBridgeMemories,
    recordArcadeRun, personalityDescribe, personalityDominant, personalityPromptLine,
    setBgmMuted, setRemix, clearRemix, remixFor,
    setTheme, setScanlines, setVol, setSnakeBest, setGameBest, addSteps, reset,
    exportState, importState,
  };
}
