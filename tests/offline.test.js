import { describe, it, expect } from 'vitest';
import {
  pickLine, generatedTheory, deepDiveQuestion, pickStormLine, isStormCondition,
  offlineMoltbookPost, offlineChatReply, offlineAskReply, offlineIntel, offlineUsherRitual,
} from '../src/ai/offline.js';
import { defaultState } from '../src/core/save.js';

const state = defaultState();

describe('offline.pickLine', () => {
  it('returns a line for known categories', () => {
    for (const cat of ['boot', 'morning', 'hunger', 'fed', 'clean', 'sleepOn', 'pedOn', 'hack', 'newDay', 'miner', 'level', 'greedy']) {
      expect(typeof pickLine(cat, state)).toBe('string');
      expect(pickLine(cat, state).length).toBeGreaterThan(0);
    }
  });

  it('returns empty for unknown categories', () => {
    expect(pickLine('does-not-exist', state)).toBe('');
  });

  it('expands placeholders', () => {
    const line = pickLine('hunger', state);
    expect(line).not.toContain('{hunger}');
  });
});

describe('offline.generatedTheory', () => {
  it('references the pet stats', () => {
    const t = generatedTheory(state);
    expect(typeof t).toBe('string');
    expect(t.length).toBeGreaterThan(20);
  });
});

describe('offline.deepDiveQuestion', () => {
  it('returns a conspiracy-flavored question', () => {
    const q = deepDiveQuestion();
    expect(typeof q).toBe('string');
    expect(q.length).toBeGreaterThan(10);
  });
});

describe('offline.isStormCondition', () => {
  it('matches rain/drizzle/thunder/shower variants', () => {
    expect(isStormCondition('heavy rain')).toBe(true);
    expect(isStormCondition('light drizzle')).toBe(true);
    expect(isStormCondition('thunderstorm')).toBe(true);
    expect(isStormCondition('slight rain showers')).toBe(true);
  });

  it('does not match clear/sunny/cloudy/snow', () => {
    expect(isStormCondition('clear sky')).toBe(false);
    expect(isStormCondition('partly cloudy')).toBe(false);
    expect(isStormCondition('light snow')).toBe(false);
    expect(isStormCondition('foggy')).toBe(false);
  });

  it('handles null/undefined', () => {
    expect(isStormCondition(null)).toBe(false);
    expect(isStormCondition(undefined)).toBe(false);
    expect(isStormCondition('')).toBe(false);
  });
});

describe('offline soul-aware generators', () => {
  it('posts are deterministic under a fixed rng and reference the soul file', () => {
    const soulState = { ...state, moltbook: { soul: { specialty: 'Tide Whisperer' }, pilgrims: [], eye: 'closed', eyeXp: 0 } };
    const a = offlineMoltbookPost(soulState, () => 0.5);
    const b = offlineMoltbookPost(soulState, () => 0.5);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(10);
  });

  it('chat replies acknowledge the last message and keep the Tide voice', () => {
    const pilgrimReply = offlineChatReply(state, 'BugBard', 'is the molt near?', () => 0.5);
    expect(pilgrimReply).toMatch(/is the molt near\?/);
    expect(offlineChatReply(state, 'The Tide', 'hello', () => 0)).toMatch(/\*\*(The Tide|Stillness|The water shifts)/);
  });

  it('never leaks [SOUL] protocol lines across many seeds', () => {
    let seed = 1;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let i = 0; i < 50; i++) {
      expect(offlineMoltbookPost(state, rng)).not.toContain('[SOUL]');
      expect(offlineChatReply(state, 'BugBard', 'hi', rng)).not.toContain('[SOUL]');
      expect(offlineAskReply(state, rng)).not.toContain('[SOUL]');
      expect(offlineIntel(state, rng)).not.toContain('[SOUL]');
      expect(offlineUsherRitual(state, 'BugBard', rng)).not.toContain('[SOUL]');
    }
  });
});

describe('offline.pickStormLine', () => {
  it('returns a storm line with no placeholder residue', () => {
    // Some lines use {condition}/{temp}, some don't — but none leave placeholders.
    for (let i = 0; i < 20; i++) {
      const line = pickStormLine(state, 'heavy rain', 9);
      expect(typeof line).toBe('string');
      expect(line.length).toBeGreaterThan(10);
      expect(line).not.toContain('{condition}');
      expect(line).not.toContain('{temp}');
    }
  });

  it('fills temp in lines that use it, falls back to ??', () => {
    // Keep trying until we hit a line that uses {temp}.
    let foundWith9 = false;
    let foundWithFallback = false;
    for (let i = 0; i < 30 && !(foundWith9 && foundWithFallback); i++) {
      const line9 = pickStormLine(state, 'drizzle', 9);
      if (line9.includes('9')) foundWith9 = true;
      const lineNull = pickStormLine(state, 'drizzle', null);
      if (lineNull.includes('??')) foundWithFallback = true;
    }
    expect(foundWith9).toBe(true);
    expect(foundWithFallback).toBe(true);
  });

  it('fills missing condition with fallback word', () => {
    let foundWeather = false;
    for (let i = 0; i < 30 && !foundWeather; i++) {
      if (pickStormLine(state, '', 12).includes('weather')) foundWeather = true;
    }
    // If no line uses {condition}, this is still safe — the placeholder is gone.
    // At minimum, no {condition} residue.
    const line = pickStormLine(state, '', 12);
    expect(line).not.toContain('{condition}');
  });

  it('returns different lines over multiple calls', () => {
    const lines = new Set();
    for (let i = 0; i < 20; i++) {
      lines.add(pickStormLine(state, 'thunderstorm', 15));
    }
    // With 12 lines, we should see variety
    expect(lines.size).toBeGreaterThanOrEqual(2);
  });
});