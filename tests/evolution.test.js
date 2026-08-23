import { describe, it, expect } from 'vitest';
import { addXp, xpToNext, MAX_LEVEL, formeFor, titleFor } from '../src/core/evolution.js';
import { defaultState } from '../src/core/save.js';

describe('evolution.xpToNext', () => {
  it('scales per level', () => {
    expect(xpToNext(1)).toBe(50);
    expect(xpToNext(2)).toBe(90);
    expect(xpToNext(3)).toBe(130);
  });
});

describe('evolution.addXp', () => {
  it('levels up and reports events', () => {
    const s = defaultState();
    const events = addXp(s, 60);
    expect(s.level).toBe(2);
    expect(events.some((e) => e.type === 'levelup')).toBe(true);
    expect(s.title).toBeTruthy();
  });

  it('evolves into a forme when leveling into max', () => {
    const s = defaultState();
    s.level = MAX_LEVEL - 1; // 9
    s.xp = xpToNext(9) - 1;  // one XP shy of 10
    const events = addXp(s, 10);
    expect(s.level).toBe(MAX_LEVEL);
    expect(s.xp).toBe(0);
    expect(events.some((e) => e.type === 'forme')).toBe(true);
    expect(s.forme).toBeTruthy();
    expect(s.forme).toBe('GLITCH'); // starting personality: paranoia is 20, broCode 15 -> paranoia dominates
  });
});

describe('evolution.formeFor', () => {
  it('maps dominant traits to formes', () => {
    expect(formeFor('fitness')).toBe('SHRED');
    expect(formeFor('gluttony')).toBe('CHONK');
    expect(formeFor('paranoia')).toBe('GLITCH');
    expect(formeFor('ego')).toBe('GLITCH');
  });
});

describe('evolution.titleFor', () => {
  it('picks trait-flavored titles', () => {
    const t = titleFor('paranoia', 6);
    expect(typeof t).toBe('string');
    expect(t.length).toBeGreaterThan(3);
  });
});