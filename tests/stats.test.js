import { describe, it, expect } from 'vitest';
import { tick, applyOffline, FOODS, weightTier, clamp, initialStats, emptyEtas, TICK_SECONDS } from '../src/core/stats.js';

describe('stats.tick', () => {
  it('decays hunger and happy, drains energy (gently)', () => {
    const s = tick(initialStats(), {});
    expect(s.hunger).toBe(74);
    expect(s.happy).toBe(79.5);
    expect(s.energy).toBe(99.5);
  });

  it('decays slower while sleeping and restores energy', () => {
    const s = tick(initialStats(), { sleeping: true });
    expect(s.hunger).toBe(75 - 1 * 0.2);
    expect(s.energy).toBe(100 - 5 + 5);
    expect(s.energy).toBeLessThanOrEqual(100);
  });

  it('dirty room hurts happiness (halved penalty)', () => {
    const s = tick(initialStats(), { poop: 2, clutterCount: 2 });
    // dirtyPen = 2*0.5 + 2*1 = 3; penalty halved to 0.5 + 3*0.5 = 2
    expect(s.happy).toBe(80 - 2);
  });

  it('loses weight when starving', () => {
    const s = tick({ happy: 50, hunger: 15, energy: 50, weight: 1.3 }, {});
    expect(s.weight).toBeCloseTo(1.25, 5);
  });
});

describe('stats.applyOffline', () => {
  it('decays for elapsed minutes (gently)', () => {
    const r = applyOffline(initialStats(), 60, { hasMiner: false });
    expect(r.stats.hunger).toBe(60); // 75 - 60*0.25
    expect(r.stats.happy).toBe(68);  // 80 - 60*0.2
    expect(r.coins).toBe(0);
  });
  it('passive miner pays out', () => {
    const r = applyOffline(initialStats(), 60, { hasMiner: true });
    expect(r.coins).toBe(300);
  });
  it('zero minutes is a no-op', () => {
    const r = applyOffline(initialStats(), 0, { hasMiner: true });
    expect(r.coins).toBe(0);
    expect(r.stats.hunger).toBe(75);
  });
});

describe('stats.weightTier', () => {
  it('maps weight to the five physique tiers', () => {
    expect(weightTier(1.0)).toBe(1);
    expect(weightTier(1.2)).toBe(2);
    expect(weightTier(1.5)).toBe(3);
    expect(weightTier(2.0)).toBe(4);
    expect(weightTier(2.6)).toBe(5);
    expect(weightTier(3.5)).toBe(5);
  });
});

describe('stats.FOODS', () => {
  it('pizza is a cheap weight-gainer', () => {
    expect(FOODS.pizza.cost).toBe(5);
    expect(FOODS.pizza.weight).toBeGreaterThan(FOODS.salad.weight);
  });
  it('energy drink restores energy', () => {
    expect(FOODS.energy.energy).toBe(true);
    expect(FOODS.salad.energy).toBe(false);
  });
});

describe('clamp', () => {
  it('bounds values', () => {
    expect(clamp(150)).toBe(100);
    expect(clamp(-5)).toBe(0);
    expect(clamp(42)).toBe(42);
  });
});

describe('stats.emptyEtas', () => {
  it('mirrors tick() math: a full battery drains in ticks × 15s, honest minutes', () => {
    const etas = emptyEtas(initialStats(), {});
    // hunger 75 at 1/tick = 75 ticks = 1125s = 18.75 → ceil 19 min
    expect(etas.hunger).toBe(Math.ceil((75 / 1) * TICK_SECONDS / 60));
    // happy 80 at 0.5/tick = 160 ticks = 40 min
    expect(etas.happy).toBe(40);
    // energy 100 at 0.5/tick = 200 ticks = 50 min
    expect(etas.energy).toBe(50);
  });

  it('mess (poop + clutter) speeds up the happy drain', () => {
    const clean = emptyEtas({ happy: 80, hunger: 75, energy: 100 }, {});
    const dirty = emptyEtas({ happy: 80, hunger: 75, energy: 100 }, { poop: 2, clutterCount: 4 });
    expect(dirty.happy).toBeLessThan(clean.happy);
    expect(dirty.hunger).toBe(clean.hunger); // mess only touches happy
  });

  it('sleeping slows decay 5× and energy regenerates (never empties)', () => {
    const asleep = emptyEtas(initialStats(), { sleeping: true });
    // 75 hunger at 0.2/tick = 375 ticks × 15s = 93.75 min → 94
    expect(asleep.hunger).toBe(94);
    expect(asleep.energy).toBe(Infinity); // charging, not draining
  });

  it('empty stats report 0 minutes, not Infinity', () => {
    const etas = emptyEtas({ happy: 0, hunger: 0, energy: 0 }, {});
    expect(etas.hunger).toBe(0);
    expect(etas.happy).toBe(0);
  });
});