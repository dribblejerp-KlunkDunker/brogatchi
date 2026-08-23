import { describe, it, expect } from 'vitest';
import { entryFromState, addEntry, describeChange, MAX_ENTRIES, JOURNAL_TYPES } from '../src/core/journal.js';
import { defaultState } from '../src/core/save.js';
import { weightTier, TIER_NAMES } from '../src/core/stats.js';

function makeState(overrides = {}) {
  const s = defaultState();
  return { ...s, ...overrides, stats: { ...s.stats, ...(overrides.stats || {}) }, personality: { ...s.personality, ...(overrides.personality || {}) } };
}

describe('journal.entryFromState', () => {
  it('snapshots the full state', () => {
    const s = makeState({ coins: 120, level: 3, title: 'Grindlord', forme: null });
    s.stats.weight = 1.6;
    const e = entryFromState(s, { type: 'level', label: 'Level 3', svg: '<rect/>' });
    expect(e.type).toBe('level');
    expect(e.label).toBe('Level 3');
    expect(e.svg).toBe('<rect/>');
    expect(e.coins).toBe(120);
    expect(e.level).toBe(3);
    expect(e.title).toBe('Grindlord');
    expect(e.tier).toBe(weightTier(1.6));
    expect(e.tierName).toBe(TIER_NAMES[weightTier(1.6)]);
    expect(e.stats.happy).toBe(80);
    expect(e.personality.paranoia).toBe(20);
    expect(e.at).toContain(':');
  });

  it('copies personality (no mutation aliasing)', () => {
    const s = makeState();
    const e = entryFromState(s, { type: 'spawn' });
    e.personality.ego = 99;
    expect(s.personality.ego).toBe(22);
  });
});

describe('journal.addEntry', () => {
  it('appends in order', () => {
    let j = [];
    j = addEntry(j, entryFromState(makeState({ coins: 1 }), { type: 'spawn' }));
    j = addEntry(j, entryFromState(makeState({ coins: 2 }), { type: 'level', label: 'L2' }));
    expect(j.length).toBe(2);
    expect(j[0].coins).toBe(1);
    expect(j[1].coins).toBe(2);
  });

  it('caps at MAX_ENTRIES dropping the oldest', () => {
    let j = [];
    for (let i = 0; i < MAX_ENTRIES + 5; i++) {
      j = addEntry(j, entryFromState(makeState({ coins: i }), { type: 'level', label: `L${i}` }));
    }
    expect(j.length).toBe(MAX_ENTRIES);
    expect(j[0].coins).toBe(5); // oldest dropped
    expect(j[j.length - 1].coins).toBe(MAX_ENTRIES + 4);
  });
});

describe('journal.describeChange', () => {
  it('describes the origin', () => {
    expect(describeChange(null, {})).toContain('Spawn');
  });

  it('reports level, tier, coins, weight, happiness deltas', () => {
    const prev = entryFromState(makeState({ coins: 50, level: 1, stats: { happy: 80, hunger: 75, energy: 100, weight: 1.0 } }), { type: 'spawn' });
    const next = entryFromState(makeState({ coins: 200, level: 4, stats: { happy: 95, hunger: 40, energy: 60, weight: 1.9 } }), { type: 'level' });
    const text = describeChange(prev, next);
    expect(text).toContain('LV 1 → 4');
    expect(text).toContain('+150c');
    expect(text).toContain('weight +0.9');
    expect(text).toContain('happiness +15');
  });

  it('returns a filler line when nothing notable changed', () => {
    const prev = entryState(makeState({ coins: 50 }), { type: 'spawn' });
    const next = entryState(makeState({ coins: 51 }), { type: 'level' });
    expect(describeChange(prev, next)).toBe('Quiet stretch in the sim.');
  });
});

describe('journal.JOURNAL_TYPES', () => {
  it('has an entry for every milestone kind', () => {
    for (const k of ['spawn', 'level', 'title', 'forme', 'rig', 'tier', 'win', 'steps']) {
      expect(JOURNAL_TYPES[k]).toBeTruthy();
      expect(JOURNAL_TYPES[k].icon).toBeTruthy();
    }
  });
});

function entryState(s) {
  return entryFromState(s, { type: 'x' });
}