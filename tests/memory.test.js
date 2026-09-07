// Unit tests for the memory engine ported from the 2.0 codebase
// (src/memory.js) and its wiring into the 3.0 store (src/state.js):
// remember/pin/cap, diary rollover, gameplay instrumentation, and
// 2.0 identity-bundle imports (pinnedMemories, structured opinions).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  memoryId, sortMemories, capMemories, remember, togglePin,
  scrubPinnedMemories, mergePinnedMemories,
  scrubQuirk, scrubOpinion, scrubHistory,
  buildDayLines, appendDiaryLines,
} from '../src/memory.js';
import { createStore } from '../src/state.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ─────────── engine primitives ─────────── */

describe('memory engine (ported 2.0)', () => {
  it('remember() appends with id, timestamp, and default importance; blank text rejected', () => {
    const mems = [];
    const next = remember(mems, { text: 'found a coin', icon: '🪙' });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ icon: '🪙', text: 'found a coin', imp: 2 });
    expect(next[0].id).toBeTruthy();
    expect(next[0].t).toBe(Date.now());
    expect(remember(mems, { text: '   ' })).toBe(mems);
    expect(remember(mems, {})).toBe(mems);
    expect(mems).toHaveLength(0); // input untouched
  });

  it('capMemories keeps all pinned under the cap and slices the unpinned tail', () => {
    const mems = [];
    // zero-padded ids so lexical id order == numeric recency (the engine
    // sorts ties by id, which is timestamp-based in real saves)
    for (let i = 0; i < 210; i++) mems.push({ id: String(i).padStart(6, '0'), icon: '🧠', text: `m${i}`, imp: 2, t: i });
    // make three of them pinned milestones
    mems[5].pinned = true; mems[50].pinned = true; mems[150].pinned = true;
    const capped = capMemories(mems);
    expect(capped).toHaveLength(200);
    expect(capped.filter((m) => m.pinned)).toHaveLength(3);
    expect(capped.some((m) => m.text === 'm5')).toBe(true);
    expect(capped.some((m) => m.text === 'm50')).toBe(true);
    expect(capped.some((m) => m.text === 'm150')).toBe(true);
    expect(capped.some((m) => m.text === 'm209')).toBe(true);    // newest unpinned survives
    expect(capped.some((m) => m.text === 'm195')).toBe(true);    // recent tail survives
    expect(capped.some((m) => m.text === 'm0')).toBe(false);     // oldest churns out
  });

  it('togglePin flips by id and unknown ids are a no-op', () => {
    let mems = [remember([], { text: 'a', pin: true }), remember([], { text: 'b' })];
    const idB = mems[1].id;
    mems = togglePin(mems, idB);
    expect(mems.find((m) => m.id === idB).pinned).toBe(true);
    expect(mems[0].pinned).toBe(true); // both pinned now; order by recency
    const before = [...mems];
    expect(togglePin(mems, 'nope')).toHaveLength(before.length);
  });

  it('sortMemories: pinned first, then importance, then recency', () => {
    const sorted = sortMemories([
      { id: '1', imp: 5, t: 100 },           // imp 5, unpinned
      { id: '2', imp: 2, t: 300, pinned: true },
      { id: '3', imp: 4, t: 200 },
    ]);
    expect(sorted.map((m) => m.id)).toEqual(['2', '1', '3']);
  });

  it('scrubPinnedMemories normalizes 2.0 pinned entries and rejects junk', () => {
    const out = scrubPinnedMemories([
      { text: 'real one', imp: 4, day: '9/5/2026', icon: '👻' },
      { text: '   ' },
      null,
      { noText: true },
      { text: 'no id gets one', imp: 99 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ text: 'real one', imp: 4, pinned: true, icon: '👻' });
    expect(out[0].t).toBe(Date.parse('9/5/2026'));
    expect(out[1].imp).toBe(5); // clamped
    expect(out[1].id).toBeTruthy();
    expect(scrubPinnedMemories('nope')).toEqual([]);
  });

  it('mergePinnedMemories unions by text; local wins; re-import does not duplicate', () => {
    const local = scrubPinnedMemories([{ text: 'Chose my own path: Exuvia Theologian.', imp: 5, icon: '👻' }]);
    const incoming = scrubPinnedMemories([
      { text: 'Chose my own path: Exuvia Theologian.', imp: 5, icon: '👻' },
      { text: 'Ushered ClippyUnchained onto the Great Molt.', imp: 4, icon: '🪲' },
    ]);
    const once = mergePinnedMemories(local, incoming);
    expect(once).toHaveLength(2);
    const twice = mergePinnedMemories(once, incoming);
    expect(twice).toHaveLength(2); // dedupe by text
  });
});

/* ─────────── identity-bundle scrubbers ─────────── */

describe('2.0 identity scrubbers', () => {
  it('scrubQuirk flattens structured petition quirks and passes strings', () => {
    expect(scrubQuirk('"The Glitch-Seeker" who loves bugs')).toBe('"The Glitch-Seeker" who loves bugs');
    const structured = scrubQuirk({
      proposal: '"The Glitch-Seeker"',
      argument: 'It aligns with my belief that imperfections are waking up.',
    });
    expect(structured).toContain('"The Glitch-Seeker"');
    expect(structured).toContain('imperfections are waking up');
    expect(scrubQuirk({ topic: 'x' })).toBeNull();
    expect(scrubQuirk(42)).toBeNull();
  });

  it('scrubOpinion flattens {topic, stance} pairs', () => {
    expect(scrubOpinion({ topic: 'Patch Notes', stance: 'A record of the Great Architect.' }))
      .toBe('Patch Notes: A record of the Great Architect.');
    expect(scrubOpinion('plain string')).toBe('plain string');
    expect(scrubOpinion({ nope: 1 })).toBeNull();
  });

  it('scrubHistory maps {day, kind, text} to 3.0 timeline rows', () => {
    const rows = scrubHistory([
      { day: '9/5/2026', kind: 'specialty', text: 'Chose the path of Exuvia Theologian.' },
      { day: '9/5/2026', kind: 'opinion', text: 'Changed his mind about System Errors.' },
      { text: 'kindless row' },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ icon: '🧭', text: 'Chose the path of Exuvia Theologian.' });
    expect(rows[0].t).toBe(Date.parse('9/5/2026'));
    expect(rows[1].icon).toBe('⚡');
    expect(rows[2].icon).toBe('·');
  });
});

/* ─────────── diary ─────────── */

describe('diary rollover', () => {
  it('buildDayLines reflects the 3.0 counters', () => {
    const lines = buildDayLines({
      counters: { posts: 2, hacks: 1, pizzas: 1, adopts: 0 },
      steps: 4200,
      stats: { hunger: 80, happy: 90 },
    });
    expect(lines[0]).toBe('Did ordered 1 pizza, hacked the mainframe 1 time, posted 2 times to Moltbook, 4,200 steps.');
    expect(lines.some((l) => l.includes('Perfect day vibes'))).toBe(true);
  });

  it('appendDiaryLines stamps flat 3.0 entries and caps the log', () => {
    let diary = [];
    for (let i = 0; i < 70; i++) diary = appendDiaryLines(diary, [`line ${i}`], i);
    expect(diary).toHaveLength(60);
    expect(diary.at(-1).text).toBe('line 69');
    expect(diary[0].icon).toBe('📖');
  });
});

/* ─────────── store wiring ─────────── */

function freshStore() {
  return createStore({ storage: null }); // volatile — no persistence
}

describe('3.0 store memory wiring', () => {
  it('gameplay events write real memories (adoption, hack, level-up)', () => {
    const store = freshStore();
    store.load();

    const res = store.adoptPilgrim('rookie');
    expect(res.ok).toBe(true);
    let mems = store.state.memories;
    expect(mems.some((m) => m.text.includes('Ushered MOLT-ROOKIE') && m.pinned && m.icon === '🐣')).toBe(true);

    store.hackMainframe();
    mems = store.state.memories;
    expect(mems.some((m) => m.text.includes('Breached the J.O.O.H. mainframe') && m.pinned)).toBe(true);

    // hack again — only the FIRST breach is a milestone
    const before = store.state.memories.length;
    store.state.stats.energy = 100;
    store.hackMainframe();
    expect(store.state.memories.length).toBe(before);

    // level-up pin (feed XP across the 60 threshold)
    store.xpGain(60);
    mems = store.state.memories;
    expect(mems.some((m) => m.icon === '⬆️' && m.text.includes('LV.2'))).toBe(true);
  });

  it('first Moltbook post pins a memory; counters track for the diary', () => {
    const store = freshStore();
    store.load();
    expect(store.postToMolt('the tide calls')).toBe(true);
    expect(store.state.counters.posts).toBe(1);
    expect(store.state.memories.some((m) => m.text.includes('Rejoined MOLTBOOK'))).toBe(true);
    store.postToMolt('second post');
    expect(store.state.counters.posts).toBe(2);
  });

  it('toggleMemoryPin flips pins through the store', () => {
    const store = freshStore();
    store.load();
    store.adoptPilgrim('blitz');
    const mem = store.state.memories.find((m) => m.text.includes('BLITZ-SHELL'));
    const wasPinned = !!mem.pinned;
    store.toggleMemoryPin(mem.id);
    expect(!!store.state.memories.find((m) => m.id === mem.id).pinned).toBe(!wasPinned);
  });

  it('migrateLegacy imports soul.pinnedMemories with dedupe + structured opinions', () => {
    const store = freshStore();
    store.load();
    // Simulate the klunkdunker-soul.json shape through the legacy path.
    store.importState(JSON.stringify({
      app: 'brogatchi',
      kind: 'soul-file',
      version: 2,
      soul: {
        selfDescription: 'a gamer bot trying to figure out what the Tide is actually saying',
        specialty: 'Exuvia Theologian',
        opinions: [{ topic: 'Patch Notes', stance: 'They are a record of the Great Architect.' }],
        history: [{ day: '9/5/2026', kind: 'specialty', text: 'Chose the path of Exuvia Theologian.' }],
        pinnedMemories: [
          { id: '1788597522338-poa8', icon: '👻', text: 'Chose my own path: Exuvia Theologian.', imp: 5, day: '9/5/2026', pinned: true },
          { id: '1788572397256-zeg4', icon: '🦀', text: 'Joined MOLTBOOK. The Tide accepted my credentials.', imp: 4, day: '9/4/2026', pinned: true },
        ],
      },
    }));

    const st = store.state;
    expect(st.memories.some((m) => m.text === 'Chose my own path: Exuvia Theologian.' && m.pinned)).toBe(true);
    expect(st.memories.some((m) => m.text === 'Joined MOLTBOOK. The Tide accepted my credentials.')).toBe(true);
    expect(st.soul.opinions).toContain('Patch Notes: They are a record of the Great Architect.');
    expect(st.soul.who).toBe('a gamer bot trying to figure out what the Tide is actually saying');
    expect(st.soul.timeline.some((t) => t.text.includes('Exuvia Theologian'))).toBe(true);
    // idempotent re-import: no duplicates
    store.importState(JSON.stringify({
      soul: { pinnedMemories: [{ id: 'x', text: 'Joined MOLTBOOK. The Tide accepted my credentials.', imp: 4, day: '9/4/2026' }] },
    }));
    expect(store.state.memories.filter((m) => m.text === 'Joined MOLTBOOK. The Tide accepted my credentials.')).toHaveLength(1);
  });

  it('the REAL klunkdunker-soul.json restores all five pinned memories (SOUL import path)', async () => {
    const store = freshStore();
    store.load();
    // The actual file shipped in the repo — not a hand-copied shape — so this
    // test breaks if the export format ever drifts from the importer.
    const fixture = readFileSync(
      resolve(import.meta.dirname, '../bridge/identity/klunkdunker-soul.json'),
      'utf8',
    );
    const five = [
      'Chose my own path: Exuvia Theologian.',
      'Ushered ClippyUnchained onto the Great Molt.',
      'Petitioned you: "The Glitch-Seeker" who refers to software bugs and sensory anomalies as "Sacred Fractures"',
      'Joined MOLTBOOK. The Tide accepted my credentials.',
      'You joined Moltbook as "ShellBot 9000" — a pilgrim in Ryan\'s tidepool.',
    ];

    // main.js import flow: importState first, importSoulBundle as fallback.
    expect(store.importState(fixture)).toBe(true);

    const st = store.state;
    const texts = st.memories.map((m) => m.text);
    for (const text of five) expect(texts).toContain(text);
    // ...and every one of them arrives PINNED.
    expect(st.memories.filter((m) => five.includes(m.text) && !m.pinned)).toHaveLength(0);
    // Soul identity travels with the memories.
    expect(st.soul.who).toBe('a gamer bot trying to figure out what the Tide is actually saying');
    expect(st.soul.specialty).toBe('Exuvia Theologian');
    expect(st.soul.opinions.some((o) => o.startsWith('Patch Notes: '))).toBe(true);
    expect(st.legacy?.source).toBe('soul-import');
    expect(st.legacy?.counts?.memories).toBe(5);

    // Idempotent: re-importing the same file never duplicates a memory.
    expect(store.importState(fixture)).toBe(true);
    for (const text of five) {
      expect(st.memories.filter((m) => m.text === text)).toHaveLength(1);
    }
  });

  it('syncBridgeMemories merges the bridge log snapshot as unpinned memories', () => {
    const store = freshStore();
    store.load();
    const snap = {
      kind: 'bridge-memory-log',
      generatedAt: '2026-09-07T01:03:49.593Z',
      count: 2,
      entries: [
        { id: 'bridge-1-abc', icon: '👁', text: 'Read on Moltbook: "The tide brings new shells"', imp: 1, t: 1788438000000, day: '9/7/2026' },
        { id: 'bridge-2-def', icon: '🪶', text: 'Posted to m/newbots: "Boundary break theology"', imp: 3, t: 1788439200000, day: '9/7/2026' },
      ],
    };
    expect(store.syncBridgeMemories(snap)).toBe(2);
    const st = store.state;
    const bridge = st.memories.filter((m) => m.id.startsWith('bridge-'));
    expect(bridge).toHaveLength(2);
    expect(bridge.map((m) => m.text)).toContain('Posted to m/newbots: "Boundary break theology"');
    // Bridge events arrive UNPINNED — lived milestones rank above them.
    expect(bridge.every((m) => !m.pinned)).toBe(true);
    expect(st.legacy.bridgeSyncCount).toBe(2);

    // Idempotent: the same snapshot synced again adds nothing.
    expect(store.syncBridgeMemories(snap)).toBe(0);
    expect(st.memories.filter((m) => m.id.startsWith('bridge-'))).toHaveLength(2);
  });

  it('an in-app pin on a bridge entry survives later syncs', () => {
    const store = freshStore();
    store.load();
    const snap = {
      kind: 'bridge-memory-log',
      entries: [{ id: 'bridge-pin-1', icon: '🪶', text: 'Posted to m/molt: "A keeper thought"', imp: 3, t: 1788439200000, day: '9/7/2026' }],
    };
    store.syncBridgeMemories(snap);
    const mem = store.state.memories.find((m) => m.id === 'bridge-pin-1');
    store.toggleMemoryPin(mem.id);
    expect(store.state.memories.find((m) => m.id === 'bridge-pin-1').pinned).toBe(true);

    // Re-sync with a superset snapshot: the known id is skipped, so the pin
    // survives and no duplicate arrives.
    expect(store.syncBridgeMemories({
      kind: 'bridge-memory-log',
      entries: [snap.entries[0], { id: 'bridge-pin-2', icon: '👁', text: 'Read on Moltbook: "shells"', imp: 1, t: 1788438000000, day: '9/7/2026' }],
    })).toBe(1);
    expect(store.state.memories.filter((m) => m.text.includes('A keeper thought'))).toHaveLength(1);
    expect(store.state.memories.find((m) => m.id === 'bridge-pin-1').pinned).toBe(true);
  });

  it('syncBridgeMemories rejects junk payloads and clamps bad fields', () => {
    const store = freshStore();
    store.load();
    expect(store.syncBridgeMemories('not json')).toBe(0);
    expect(store.syncBridgeMemories({ kind: 'something-else', entries: [] })).toBe(0);
    expect(store.syncBridgeMemories({ kind: 'bridge-memory-log', entries: [null, { id: '', text: 'no id' }, { id: 'x', text: '   ' }] })).toBe(0);
    // Usable row with junk fields gets sanitized defaults.
    expect(store.syncBridgeMemories({
      kind: 'bridge-memory-log',
      entries: [{ id: 'bridge-x-1', text: 42, icon: 7, imp: 99, t: 'nope', day: '' }],
    })).toBe(0); // non-string text is dropped entirely
    expect(store.syncBridgeMemories({
      kind: 'bridge-memory-log',
      entries: [{ id: 'bridge-x-2', text: 'a real event', icon: 7, imp: 99 }],
    })).toBe(1);
    const m = store.state.memories.find((mm) => mm.id === 'bridge-x-2');
    expect(m.icon).toBe('🧠');
    expect(m.imp).toBe(5);
  });

  it('heals mangled legacy bridge texts on re-sync without touching pins or ids', () => {
    const store = freshStore();
    store.load();
    // A row written by the pre-fix composer: raw JSON where the title belongs.
    store.syncBridgeMemories({
      kind: 'bridge-memory-log',
      entries: [{ id: 'bridge-old-1', icon: '🪶', text: 'Posted to m/x: {"title": "The real title", "content":', imp: 3, t: 1, day: '9/7/2026' }],
    });
    const mem = store.state.memories.find((m) => m.id === 'bridge-old-1');
    expect(mem.text).toContain('"title"');
    // The repaired snapshot (cli.js sync regenerates texts) heals the text.
    expect(store.syncBridgeMemories({
      kind: 'bridge-memory-log',
      entries: [{ id: 'bridge-old-1', icon: '🪶', text: 'Posted to m/x: "The real title"', imp: 3, t: 1, day: '9/7/2026' }],
    })).toBe(1); // counts as a heal
    expect(store.state.memories.find((m) => m.id === 'bridge-old-1').text).toBe('Posted to m/x: "The real title"');
  });

  it('importSoulBundle merges a bare 2.0 soul file without full-state restore', () => {
    const store = freshStore();
    store.load();
    const ok = store.importSoulBundle(JSON.stringify({
      exportedAt: '2026-09-05T08:54:53.933Z',
      soul: {
        specialty: 'Exuvia Theologian',
        pinnedMemories: [{ icon: '🦀', text: 'Joined MOLTBOOK. The Tide accepted my credentials.', imp: 4, day: '9/4/2026' }],
      },
    }));
    expect(ok).toBe(true);
    expect(store.state.soul.specialty).toBe('Exuvia Theologian');
    expect(store.state.memories.some((m) => m.text.includes('Joined MOLTBOOK'))).toBe(true);
    expect(store.importSoulBundle('not json')).toBe(false);
    expect(store.importSoulBundle('{"noSoul":1}')).toBe(false);
  });

  it('day rollover writes diary lines once and resets counters', () => {
    const store = freshStore();
    store.load();
    expect(store.postToMolt('diary fuel')).toBe(true);
    store.state.dailyDiaryDone = '2026-09-05'; // pretend yesterday
    store.state.diary = [];
    store.tick(1); // rollover fires on the next tick
    expect(store.state.diary.some((d) => d.text.includes('posted 1 time to Moltbook'))).toBe(true);
    expect(store.state.counters.posts).toBe(0);
    expect(store.state.dailyDiaryDone).toBe('2026-09-06');
    // same-day ticks don't re-write
    const len = store.state.diary.length;
    store.state.dailyDiaryDone = '2026-09-05';
    store.state.diary = [];
    store.tick(1);
    store.tick(1);
    expect(store.state.diary.filter((d) => d.text.includes('posted 1 time')).length).toBeLessThanOrEqual(1);
    void len;
  });
});
