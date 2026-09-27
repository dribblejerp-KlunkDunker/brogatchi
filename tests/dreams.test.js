// Composer + store tests for the dream cycle — Ryan dreams on your return.
// The composer is pure (node-runnable, no jsdom): thresholds, determinism,
// mood routing, material rules, closer truth. The store tests cover the
// once-per-gap gate, the diary ordering after the rollover, markDreamRead's
// once-only payment, and normalize's heal.
// See docs/superpowers/specs/2026-09-26-dream-cycle-design.md.

import { describe, it, expect } from 'vitest';
import { createStore, SAVE_KEY } from '../src/state.js';
import { composeDream, moodFor, DREAM_THRESHOLD_MS } from '../src/dreams.js';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// Fixed fake clock: noon Wednesday.
const FAKE_NOW = new Date(2026, 8, 16, 12, 0, 0).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const GAP = 3 * DAY_MS;

const MEMS = [
  { id: 'a1', text: 'Won LOOT SHOWER with 5 points. First run on record.', icon: '🎮', imp: 4, pinned: true, t: FAKE_NOW - GAP - 3600e3 },
  { id: 'b2', text: 'Petitioned you: "THE STEP GOAL" — and you said yes.', icon: '📜', imp: 4, pinned: true, t: FAKE_NOW - GAP - 7200e3 },
  { id: 'c3', text: 'Read on Moltbook: shell market dip — buying opportunity?', icon: '👁', imp: 2, t: FAKE_NOW - GAP - 86400e3 },
];

const CLEAN_STATE = {
  personality: { paranoia: 10, ego: 22, gluttony: 20, fitness: 50, broCode: 15, greed: 10 },
  best: { loot: 5, snake: 0, flappy: 0, breaker: 0, mario: 0, rpg: 0 },
  steps: 0,
  pedometer: { enabled: false, goal: 2000, today: { date: '2026-09-16', steps: 0, rewarded: false } },
  petitions: { live: null },
};

describe('composeDream — the pure composer', () => {
  it('threshold: null at 19h59m, non-null at 20h with material', () => {
    const justUnder = DREAM_THRESHOLD_MS - 60_000;
    expect(composeDream(MEMS, CLEAN_STATE, justUnder, FAKE_NOW)).toBeNull();
    const dream = composeDream(MEMS, CLEAN_STATE, DREAM_THRESHOLD_MS, FAKE_NOW);
    expect(dream).toBeTruthy();
    expect(dream.text).toBeTruthy();
  });

  it('deterministic: same inputs → byte-identical dream', () => {
    const a = composeDream(MEMS, CLEAN_STATE, GAP, FAKE_NOW);
    const b = composeDream(MEMS, CLEAN_STATE, GAP, FAKE_NOW);
    expect(a.text).toBe(b.text);
    expect(a.mood).toBe(b.mood);
    expect(a.strands).toEqual(b.strands);
  });

  it('mood pins: anxiety wins over ego; clean traits go soft; records go grand', () => {
    const anxious = { ...CLEAN_STATE, personality: { ...CLEAN_STATE.personality, paranoia: 60, ego: 80 } };
    expect(moodFor(anxious, MEMS)).toBe('anxious');
    const soft = { ...CLEAN_STATE, personality: { ...CLEAN_STATE.personality, ego: 10 }, best: {} };
    expect(moodFor(soft, [{ id: 'x', text: 'Pretty quiet day.' }])).toBe('soft');
    const grand = { ...CLEAN_STATE, personality: { ...CLEAN_STATE.personality, ego: 70 } };
    expect(moodFor(grand, MEMS)).toBe('grand');
    // a live petition is anxious material even with squeaky-clean traits
    const desk = { ...CLEAN_STATE, petitions: { live: { id: 'p1', title: 'X', request: 'Y' } } };
    expect(moodFor(desk, MEMS)).toBe('anxious');
  });

  it('material rules: strands only from settled memory; zero memories → null', () => {
    const dream = composeDream(MEMS, CLEAN_STATE, GAP, FAKE_NOW);
    for (const id of dream.strands) expect(MEMS.some((m) => m.id === id)).toBe(true);
    expect(composeDream([], CLEAN_STATE, GAP, FAKE_NOW)).toBeNull();
    // fragments stay inside one sentence — never a full-memory paste
    const longMem = [{ id: 'l1', text: 'A very long memory sentence that rambles on and on about the tide. Second sentence here. Third one too.', imp: 3, t: FAKE_NOW - GAP - 3600e3 }];
    const d2 = composeDream(longMem, CLEAN_STATE, GAP, FAKE_NOW);
    expect(d2.text).not.toContain('Second sentence');
  });

  it('closer truth: the petition closer appears only when an ask is live', () => {
    const withAsk = { ...CLEAN_STATE, petitions: { live: { id: 'p1', title: 'X', request: 'Y' } } };
    expect(composeDream(MEMS, withAsk, GAP, FAKE_NOW).text).toContain('You left my ask on the desk');
    const withoutAsk = composeDream(MEMS, CLEAN_STATE, GAP, FAKE_NOW);
    expect(withoutAsk.text).not.toContain('on the desk');
    // steps closer when the pedometer is live and has walked
    const walker = { ...CLEAN_STATE, steps: 1240, pedometer: { ...CLEAN_STATE.pedometer, enabled: true } };
    expect(composeDream(MEMS, walker, GAP, FAKE_NOW).text).toContain('1,240 steps');
    // best-score closer on a plain save
    expect(composeDream(MEMS, CLEAN_STATE, GAP, FAKE_NOW).text).toContain('The record is still 5');
  });

  it('the opener mentions the gap length in days', () => {
    expect(composeDream(MEMS, CLEAN_STATE, GAP, FAKE_NOW).text).toMatch(/3 days/);
    const oneDay = composeDream(MEMS, CLEAN_STATE, DREAM_THRESHOLD_MS + 3600e3, FAKE_NOW);
    expect(oneDay.text).toMatch(/a whole day|1 days|one day/);
  });
});

describe('the store gate — maybeDreamOnReturn', () => {
  it('boot with a stale lastTick dreams on the FIRST tick — after the rollover lines', () => {
    const storage = memStorage();
    const old = FAKE_NOW - GAP;
    const s1 = createStore({ storage, now: () => old });
    s1.rememberEvent('Won LOOT SHOWER with 5 points.', { icon: '🎮', imp: 4, pin: true });

    const s2 = createStore({ storage, now: () => FAKE_NOW });
    s2.load();
    expect(s2.state.dreams.entries).toHaveLength(0); // load did NOT compose
    s2.tick(1);
    expect(s2.state.dreams.entries).toHaveLength(1);
    const dream = s2.state.dreams.entries[0];
    expect(s2.state.dreams.lastDreamedAt).toBe(FAKE_NOW);
    expect(s2.state.memories.filter((m) => m.icon === '🌙')).toHaveLength(1);
    // the 🌙 diary line exists and follows any rollover lines
    const diary = s2.state.diary;
    const dreamIdx = diary.findIndex((l) => l.text.startsWith('🌙 Dreamed:'));
    expect(dreamIdx).toBeGreaterThanOrEqual(0);
    const rolloverIdx = diary.findIndex((l) => l.text.startsWith('Did ') || l.text.startsWith('Pretty quiet day'));
    if (rolloverIdx >= 0) expect(dreamIdx).toBeGreaterThan(rolloverIdx);
    // second tick: no new dream
    s2.tick(1);
    expect(s2.state.dreams.entries).toHaveLength(1);
  });

  it('an open session after the dream anchors the gate: same-session reloads never re-dream', () => {
    const storage = memStorage();
    // Absence → dream at FAKE_NOW − GAP. The player then keeps the shell
    // open and reloads minutes later: the gate measures the absence since
    // the DREAM (lastDreamedAt), not since lastTick — so presence counts.
    let t = FAKE_NOW - GAP;
    const s1 = createStore({ storage, now: () => t });
    s1.rememberEvent('Dream material.', { icon: '🧠', imp: 3 });
    t = FAKE_NOW; // return: compose the dream
    const s2 = createStore({ storage, now: () => t });
    s2.load(); s2.tick(1);
    expect(s2.state.dreams.entries).toHaveLength(1);
    expect(s2.state.dreams.lastDreamedAt).toBe(FAKE_NOW);

    // …the session stays open for hours (lastTick keeps moving), then a
    // reload at dream + 30 min — a SHORT absence since the dream:
    t = FAKE_NOW + 30 * 60 * 1000;
    const s3 = createStore({ storage, now: () => t });
    s3.load(); s3.tick(1);
    expect(s3.state.dreams.entries).toHaveLength(1); // no second dream
    expect(s3.state.dreams.lastDreamedAt).toBe(FAKE_NOW); // anchor unmoved

    // …but a REAL absence — reload a full day later — dreams again,
    // exactly once, on top of the preserved first entry:
    t = FAKE_NOW + DAY_MS;
    const s4 = createStore({ storage, now: () => t });
    s4.load(); s4.tick(1);
    expect(s4.state.dreams.entries).toHaveLength(2);
    expect(s4.state.dreams.lastDreamedAt).toBe(FAKE_NOW + DAY_MS);
  });

  it('a short gap never dreams, and the gate still allows a later longer gap', () => {
    const storage = memStorage();
    const s1 = createStore({ storage, now: () => FAKE_NOW - 2 * 3600e3 });
    s1.rememberEvent('Something vivid.', { icon: '🧠', imp: 3 });
    const s2 = createStore({ storage, now: () => FAKE_NOW });
    s2.load();
    s2.tick(1);
    expect(s2.state.dreams.entries).toHaveLength(0);
    expect(s2.state.dreams.lastDreamedAt).toBeNull(); // gate stays put
  });

  it('two long absences → two dreams; the cap holds at 10', () => {
    const storage = memStorage();
    let t = FAKE_NOW - 3 * GAP;
    const s1 = createStore({ storage, now: () => t });
    s1.rememberEvent('Dream material one.', { icon: '🧠', imp: 3 });
    t += GAP; const s2 = createStore({ storage, now: () => t }); s2.load(); s2.tick(1);
    t += GAP; const s3 = createStore({ storage, now: () => t }); s3.load(); s3.tick(1);
    expect(s3.state.dreams.entries).toHaveLength(2);
    expect(s3.state.dreams.entries[0].t).toBeLessThan(s3.state.dreams.entries[1].t);
    // flood the cap
    for (let i = 0; i < 12; i++) {
      s3.state.dreams.entries.push({ id: `d${i}`, t: t + i, awayMs: GAP, awayDays: 3, mood: 'soft', text: `dream ${i}`, strands: [], readAt: 0 });
    }
    t += GAP; const s4 = createStore({ storage, now: () => t }); s4.load(); s4.tick(1);
    expect(s4.state.dreams.entries.length).toBeLessThanOrEqual(10);
  });

  it('markDreamRead pays +2 happy exactly once (the vital moves — applyEvents would no-op)', () => {
    const storage = memStorage();
    const s1 = createStore({ storage, now: () => FAKE_NOW - GAP });
    s1.rememberEvent('Dream material.', { icon: '🧠', imp: 3 });
    const s2 = createStore({ storage, now: () => FAKE_NOW });
    s2.load();
    s2.tick(1);
    const h0 = s2.state.stats.happy;
    expect(s2.markDreamRead()).toBe(true);
    expect(s2.state.stats.happy).toBe(h0 + 2);
    expect(s2.state.dreams.entries[0].readAt).toBeGreaterThanOrEqual(FAKE_NOW); // stamped at read time
    expect(s2.markDreamRead()).toBe(false);
    expect(s2.state.stats.happy).toBe(h0 + 2);
  });

  it('normalizeDreams heals a corrupt field without throwing', () => {
    const storage = memStorage();
    const s1 = createStore({ storage, now: () => FAKE_NOW });
    const raw = JSON.stringify({
      ...s1.state, v: 3,
      dreams: { lastDreamedAt: 'nope', entries: [{ t: 'x', mood: 'lucid', text: 'A real dream text.' }, null, { nope: true }, 'garbage'] },
    });
    storage.setItem(SAVE_KEY, raw);
    const healed = createStore({ storage, now: () => FAKE_NOW });
    healed.load();
    const d = healed.state.dreams;
    expect(d.lastDreamedAt).toBeNull();
    expect(d.entries).toHaveLength(1); // the null/garbage/empty entries dropped
    expect(d.entries[0].mood).toBe('soft'); // 'lucid' coerced
    expect(d.entries[0].readAt).toBeNull();
    expect(typeof d.entries[0].id).toBe('string');
  });

  it('an unread dream survives a load and re-presents (import-a-save-code case)', () => {
    const storage = memStorage();
    const s1 = createStore({ storage, now: () => FAKE_NOW - GAP });
    s1.rememberEvent('Dream material.', { icon: '🧠', imp: 3 });
    const s2 = createStore({ storage, now: () => FAKE_NOW });
    s2.load();
    s2.tick(1); // dreams; unread
    const raw = JSON.stringify({ ...s2.state, v: 3 });
    storage.setItem(SAVE_KEY, raw);
    const s3 = createStore({ storage, now: () => FAKE_NOW + 5000 });
    s3.load();
    expect(s3.state.dreams.entries[0].readAt).toBeNull(); // still unread
    // and it does NOT re-dream on the same gap
    s3.tick(1);
    expect(s3.state.dreams.entries).toHaveLength(1);
  });
});
