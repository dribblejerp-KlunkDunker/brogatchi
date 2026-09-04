import { describe, it, expect } from 'vitest';
import { tick, applyOffline, FOODS, weightTier, clamp, initialStats } from '../src/core/stats.js';

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