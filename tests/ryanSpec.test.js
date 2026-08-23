import { describe, it, expect } from 'vitest';
import { buildSpec, computeMood, outfitOf, PHYSIQUE } from '../src/core/ryanSpec.js';
import { defaultState } from '../src/core/save.js';

describe('ryanSpec.buildSpec', () => {
  it('maps weight to physique tier', () => {
    const s = defaultState();
    s.stats.weight = 2.4;
    expect(buildSpec(s).tier).toBe(5);
    s.stats.weight = 1.0;
    expect(buildSpec(s).tier).toBe(1);
  });

  it('chonky tiers have belly and cheeks', () => {
    const s = defaultState();
    s.stats.weight = 3.0;
    const spec = buildSpec(s);
    expect(spec.physique.belly).toBeGreaterThan(0);
    expect(spec.physique.cheeks).toBe(true);
  });

  it('resolves the outfit from inventory', () => {
    const s = defaultState();
    s.inventory.shirt = 'crimson';
    const spec = buildSpec(s);
    expect(spec.outfit.shirt.id).toBe('crimson');
    expect(spec.outfit.shirt.color).toBe('#dc2626');
  });
});

describe('ryanSpec.computeMood', () => {
  it('sleeping wins over everything', () => {
    const s = defaultState();
    s.stats.hunger = 5;
    expect(computeMood(s, { sleeping: true })).toBe('sleepy');
  });
  it('hunger and energy thresholds', () => {
    const s = defaultState();
    s.stats.hunger = 10;
    expect(computeMood(s)).toBe('hungry');
    s.stats.hunger = 80;
    s.stats.energy = 5;
    expect(computeMood(s)).toBe('dizzy');
    s.stats.energy = 50;
    s.stats.happy = 15;
    expect(computeMood(s)).toBe('tilt');
    s.stats.happy = 95;
    expect(computeMood(s)).toBe('giddy');
  });
});

describe('ryanSpec.PHYSIQUE', () => {
  it('has five tiers in ascending bulk', () => {
    expect(PHYSIQUE[1].scale).toBeLessThan(PHYSIQUE[3].scale);
    expect(PHYSIQUE[5].scale).toBeGreaterThan(PHYSIQUE[3].scale);
    expect(PHYSIQUE[5].name).toContain('CHONK');
  });
});

describe('ryanSpec.outfitOf', () => {
  it('defaults gracefully', () => {
    const s = defaultState();
    const o = outfitOf(s);
    expect(o.hat.id).toBe('none');
    expect(o.shirt.id).toBe('classic');
  });
});