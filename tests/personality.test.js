import { describe, it, expect } from 'vitest';
import { initialPersonality, adjust, applyEvents, dominant, minuteDrift } from '../src/core/personality.js';
import { defaultState } from '../src/core/save.js';

describe('personality.adjust', () => {
  it('clamps to 0..100', () => {
    const p = initialPersonality();
    adjust(p, 'paranoia', 500);
    expect(p.paranoia).toBe(100);
    adjust(p, 'ego', -900);
    expect(p.ego).toBe(0);
  });
});

describe('personality.initialPersonality', () => {
  it('includes all six traits including greed', () => {
    const p = initialPersonality();
    expect(p.greed).toBe(10);
  });
});

describe('personality.applyEvents', () => {
  it('applies trait nudges', () => {
    const p = initialPersonality();
    applyEvents(p, [
      { trait: 'gluttony', amount: 4 },
      { trait: 'fitness', amount: -2 },
    ]);
    expect(p.gluttony).toBe(24);
    expect(p.fitness).toBe(10);
  });

  it('ignores unknown traits', () => {
    const p = initialPersonality();
    applyEvents(p, [{ trait: 'nope', amount: 100 }]);
    expect(p.paranoia).toBe(20);
  });
});

describe('personality.dominant', () => {
  it('returns the highest trait', () => {
    const state = defaultState();
    state.personality.gluttony = 90;
    expect(dominant(state)).toBe('gluttony');
  });
});

describe('personality.minuteDrift', () => {
  it('hungry pets get more paranoid', () => {
    const state = defaultState();
    state.stats.hunger = 10;
    const before = state.personality.paranoia;
    minuteDrift(state.personality, state);
    expect(state.personality.paranoia).toBeGreaterThan(before);
  });

  it('rich pets get greedier', () => {
    const state = defaultState();
    state.coins = 250;
    const before = state.personality.greed;
    minuteDrift(state.personality, state);
    expect(state.personality.greed).toBeGreaterThan(before);
  });

  it('broke pets lose greed', () => {
    const state = defaultState();
    state.coins = 5;
    const before = state.personality.greed;
    minuteDrift(state.personality, state);
    expect(state.personality.greed).toBeLessThan(before);
  });
});

describe('personality.dominant', () => {
  it('returns greed when it is the highest trait', () => {
    const state = defaultState();
    state.personality.greed = 95;
    expect(dominant(state)).toBe('greed');
  });
});