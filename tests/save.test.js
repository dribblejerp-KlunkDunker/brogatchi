// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { defaultState, normalize, rolloverIfNeeded, saveState, loadState, todayKey, wipeSave, getTestStorage } from '../src/core/save.js';

beforeEach(() => {
  wipeSave();
});

function seedV3(obj) {
  getTestStorage().setItem('brogatchi_v3', JSON.stringify(obj));
}

describe('save.v4 roundtrip', () => {
  it('saves and loads', () => {
    const s = defaultState();
    s.coins = 123;
    saveState(s);
    const { state, migrated } = loadState();
    expect(state.coins).toBe(123);
    expect(migrated).toBe(false);
  });
});

describe('save.v3 migration', () => {
  it('preserves v3 fields and adds v4 defaults', () => {
    const v3 = {
      stats: { happy: 10, hunger: 20, energy: 30, weight: 1.7 },
      coins: 77,
      poop: 1,
      clutter: [{ x: 50, type: '🥤' }],
      irlTasks: ['Do the thing'],
      inventory: { miner: true, theme: 'gamer', hat: '👑' },
      steps: 40,
      stepHistory: { '8/1/2026': 500 },
      stepRecord: 500,
      lastSave: Date.now(),
    };
    seedV3(v3);
    const { state, migrated } = loadState();
    expect(migrated).toBe(true);
    expect(state.coins).toBe(77);
    expect(state.inventory.miner).toBe(true);
    expect(state.inventory.theme).toBe('gamer');
    expect(state.steps).toBe(40);
    expect(state.stepRecord).toBe(500);
    expect(state.personality.gluttony).toBe(20);
    expect(state.bestScores.mario).toBe(0);
    expect(state.version).toBe(4);
  });

  it('backs up the v3 blob once', () => {
    const v3 = { coins: 7 };
    seedV3(v3);
    loadState();
    expect(getTestStorage().getItem('brogatchi_v3_backup')).toBeTruthy();
  });
});

describe('save.normalize', () => {
  it('fills every missing field', () => {
    const s = normalize({ coins: 5 });
    expect(s.stats.hunger).toBe(75);
    expect(s.inventory.shirt).toBe('classic');
    expect(Array.isArray(s.memories)).toBe(true);
    expect(s.counters.pizzas).toBe(0);
  });
});

describe('save.ai gateway state', () => {
  it('normalize initializes aiCache/aiBudget and repairs malformed values', () => {
    const s = normalize({ aiCache: 'junk', aiBudget: { used: -5, cap: 2, rateLimitedUntil: 'x' } });
    expect(Array.isArray(s.aiCache)).toBe(true);
    expect(s.aiBudget).toMatchObject({ used: 0, cap: 2, rateLimitedUntil: 0 });
    expect(typeof s.aiBudget.day).toBe('string');
  });

  it('drops malformed cache entries but keeps valid ones', () => {
    const s = normalize({
      aiCache: [
        { k: 'good', text: 'kept', at: Date.now() },
        { k: 'bad' },
        null,
      ],
    });
    expect(s.aiCache.length).toBe(1);
    expect(s.aiCache[0].k).toBe('good');
  });

  it('normalizes askLog: repairs shape, sorts newest-first, caps at 30', () => {
    const t = Date.now();
    const s = normalize({
      askLog: [
        { q: 'old', a: 'b', at: t - 1000 },
        { q: 'new', a: 'a', at: t },
        { q: 'bad' }, // missing answer
        { q: 42, a: 'x', at: t }, // junk question
        null,
      ],
    });
    expect(s.askLog).toHaveLength(2);
    expect(s.askLog[0].q).toBe('new'); // newest first
    const filled = normalize({ coins: 5 });
    expect(Array.isArray(filled.askLog)).toBe(true); // legacy saves get []
    const cap = normalize({ askLog: Array.from({ length: 40 }, (_, i) => ({ q: `q${i}`, a: 'a', at: t - i })) });
    expect(cap.askLog).toHaveLength(30);
    expect(cap.askLog[0].q).toBe('q0');
  });

  it('rollover resets the budget day/used but keeps the rate-limit cooldown', () => {
    const s = defaultState();
    s.currentDate = '1/1/1970';
    s.aiBudget = { day: '1/1/1970', used: 12, cap: 40, rateLimitedUntil: 123456 };
    rolloverIfNeeded(s);
    expect(s.aiBudget).toMatchObject({ day: todayKey(), used: 0, cap: 40, rateLimitedUntil: 123456 });
  });
});

describe('rollover', () => {
  it('archives steps and writes a diary entry on a new day', () => {
    const s = defaultState();
    s.currentDate = '1/1/1970';
    s.steps = 300;
    s.counters.pizzas = 2;
    const events = rolloverIfNeeded(s);
    expect(events.length).toBe(1);
    expect(s.stepHistory['1/1/1970']).toBe(300);
    expect(s.steps).toBe(0);
    expect(s.counters.pizzas).toBe(0);
    expect(s.diaries.length).toBe(1);
    expect(s.currentDate).toBe(todayKey());
  });

  it('is a no-op on the same day', () => {
    const s = defaultState();
    expect(rolloverIfNeeded(s)).toEqual([]);
  });
});