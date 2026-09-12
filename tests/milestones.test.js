// Regression tests for the line-by-line audit fixes.
//
// The milestone flags exist because `counters` reset at the day rollover —
// before the fix, "first ever" conditions read a daily counter, so the
// cabinet-room legend, the first-breach, and the Rejoined-MOLTBOOK pins
// re-fired every morning. A save from before the flags existed must also
// heal (its existing memories own the milestones), and molt post `time`
// fields must survive load/import so riptide scoring can't go negative.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStore, SAVE_KEY } from '../src/state.js';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

describe('lifetime milestones (day-rollover regression)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('the cabinet-room legend fires once EVER, not once per day', () => {
    const store = createStore({ storage: memStorage() });
    store.load();

    // Day 1: first win pins the legend.
    store.recordArcadeRun({ key: 'loot', label: 'Loot Shower', score: 5 });
    expect(store.state.memories.filter((m) => m.text === 'A legend is born in the cabinet room.')).toHaveLength(1);

    // Cross midnight (fake clock advances a day+): counters reset.
    vi.advanceTimersByTime(25 * 3600 * 1000);
    store.tick(1); // triggers the rollover
    expect(store.state.counters.gamesWon).toBe(0);

    // Day 2 first win: memory yes, duplicate legend no.
    store.recordArcadeRun({ key: 'loot', label: 'Loot Shower', score: 9 });
    expect(store.state.memories.filter((m) => m.text === 'A legend is born in the cabinet room.')).toHaveLength(1);
    // And the day-2 win memory is NOT pinned as a false "first".
    const day2 = store.state.memories.find((m) => m.text === 'Won Loot Shower with 9 points.');
    expect(day2.pinned).toBeFalsy();
  });

  it('the first-hack and Rejoined-MOLTBOOK milestones also fire once ever', () => {
    const store = createStore({ storage: memStorage() });
    store.load();

    store.hackMainframe();
    store.postToMolt('hello tide');
    expect(store.state.memories.filter((m) => m.text.startsWith('Breached the J.O.O.H. mainframe.'))).toHaveLength(1);
    expect(store.state.memories.filter((m) => m.text.startsWith('Rejoined MOLTBOOK.'))).toHaveLength(1);

    vi.advanceTimersByTime(25 * 3600 * 1000);
    store.tick(1);
    store.hackMainframe();
    store.postToMolt('still here');
    expect(store.state.memories.filter((m) => m.text.startsWith('Breached the J.O.O.H. mainframe.'))).toHaveLength(1);
    expect(store.state.memories.filter((m) => m.text.startsWith('Rejoined MOLTBOOK.'))).toHaveLength(1);
  });

  it('a save from before the flags existed heals from its own memories', () => {
    const storage = memStorage();
    const seed = createStore({ storage });
    seed.load();
    seed.recordArcadeRun({ key: 'loot', label: 'Loot Shower', score: 5 }); // legend + flags
    seed.save();

    // Strip the flags to simulate an older save, then reload.
    const saved = JSON.parse(storage.getItem(SAVE_KEY));
    delete saved.milestones;
    storage.setItem(SAVE_KEY, JSON.stringify(saved));

    const store = createStore({ storage });
    store.load();
    expect(store.state.milestones.win).toBe(true); // healed, not re-fired
    store.recordArcadeRun({ key: 'loot', label: 'Loot Shower', score: 7 });
    expect(store.state.memories.filter((m) => m.text === 'A legend is born in the cabinet room.')).toHaveLength(1);
  });

  it('molt posts carry finite time after load and soul import', () => {
    const storage = memStorage();
    const seed = createStore({ storage });
    seed.load();
    seed.postToMolt('time me');

    // Corrupt every post/reply time to a string the old normalize ignored.
    const saved = JSON.parse(storage.getItem(SAVE_KEY));
    saved.molt.posts.forEach((p) => { p.time = 'not-a-number'; p.replies.forEach((r) => { r.time = 'junk'; }); });
    storage.setItem(SAVE_KEY, JSON.stringify(saved));

    const store = createStore({ storage });
    store.load();
    for (const p of store.state.molt.posts) {
      expect(Number.isFinite(p.time)).toBe(true);
      for (const r of p.replies) expect(Number.isFinite(r.time)).toBe(true);
    }
  });
});
