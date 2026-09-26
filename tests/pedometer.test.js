// Store tests for STEP.SYNC — the pedometer's IRL quest lane.
// addSteps is the only mutation surface: lifetime counter, the daily lane,
// the once-per-day reward, rollover re-stamp, normalize's heal, and the
// trainer petition retiring while hardware answers the ask.
// See docs/superpowers/specs/2026-09-26-pedometer-design.md.

import { describe, it, expect } from 'vitest';
import { createStore, SAVE_KEY } from '../src/state.js';
import { generatePetition } from '../src/petitions.js';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function makeStore(now = FAKE_NOW) {
  let t = now;
  const store = createStore({ storage: memStorage(), now: () => t });
  return { store, advance: (ms) => { t += ms; }, setNow: (v) => { t = v; } };
}

// Fixed fake clock: noon Wednesday, so day math is stable.
const FAKE_NOW = new Date(2026, 8, 16, 12, 0, 0).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

describe('addSteps — the one mutation surface', () => {
  it('grows the lifetime counter and today’s lane together', () => {
    const { store } = makeStore();
    store.addSteps(400);
    store.addSteps(250);
    expect(store.state.steps).toBe(650);
    expect(store.state.pedometer.today.steps).toBe(650);
  });

  it('ignores junk input (NaN, negative, zero)', () => {
    const { store } = makeStore();
    store.addSteps(NaN);
    store.addSteps(-100);
    store.addSteps(0);
    expect(store.state.steps).toBe(0);
    expect(store.state.pedometer.today.steps).toBe(0);
  });

  it('keeps 2.0’s fitness wiring: +0.8 per 100-step crossing, capped per call', () => {
    const { store } = makeStore();
    const f0 = store.state.personality.fitness;
    store.addSteps(500); // five crossings → +4
    expect(store.state.personality.fitness).toBeCloseTo(f0 + 4, 5);
    const f1 = store.state.personality.fitness;
    store.addSteps(1200); // 12 crossings → capped at 10 → +8 (lane 1700 < goal — no reward)
    expect(store.state.personality.fitness).toBeCloseTo(f1 + 8, 5);
  });
});

describe('the IRL quest — reward fires exactly once', () => {
  it('goal−1 pays nothing; the crossing pays; goal+1 after pays nothing more', () => {
    const { store } = makeStore();
    const coins0 = store.state.coins;

    store.addSteps(1999);
    expect(store.state.pedometer.today.rewarded).toBe(false);
    expect(store.state.coins).toBe(coins0);
    expect(store.state.memories.filter((m) => m.icon === '👟')).toHaveLength(0);

    store.addSteps(1);
    expect(store.state.pedometer.today.steps).toBe(2000);
    expect(store.state.pedometer.today.rewarded).toBe(true);
    expect(store.state.coins).toBe(coins0 + 40);
    const mem = store.state.memories.filter((m) => m.icon === '👟');
    expect(mem).toHaveLength(1);
    expect(mem[0].text).toContain('Walked 2,000 real steps today');
    expect(mem[0].pinned).toBe(true);

    store.addSteps(500); // the walk continues; the reward does not
    expect(store.state.pedometer.today.steps).toBe(2000); // lane capped
    expect(store.state.pedometer.today.rewarded).toBe(true);
    expect(store.state.coins).toBe(coins0 + 40);
    expect(store.state.memories.filter((m) => m.icon === '👟')).toHaveLength(1);
    expect(store.state.steps).toBe(2500); // lifetime keeps counting
  });

  it('the reward feeds traits once: fitness +2, broCode +1', () => {
    const { store } = makeStore();
    const f0 = store.state.personality.fitness;
    const b0 = store.state.personality.broCode;
    store.addSteps(2000);
    // reward shifts (+2, +1) land on top of the crossing shifts (20 crossings,
    // but the per-call cap is 10 → +8)
    expect(store.state.personality.fitness).toBeCloseTo(f0 + 8 + 2, 5);
    expect(store.state.personality.broCode).toBeCloseTo(b0 + 1, 5);
  });

  it('overshooting in one call still pays once and caps the lane', () => {
    const { store } = makeStore();
    store.addSteps(9000);
    expect(store.state.pedometer.today.steps).toBe(2000);
    expect(store.state.pedometer.today.rewarded).toBe(true);
    expect(store.state.memories.filter((m) => m.icon === '👟')).toHaveLength(1);
  });
});

describe('rollover — a new day is a new walk', () => {
  it('re-stamps the lane; yesterday’s reward does not suppress today’s quest', () => {
    const { store, advance } = makeStore();
    store.addSteps(2000);
    expect(store.state.pedometer.today.rewarded).toBe(true);

    advance(DAY_MS + 60_000);
    store.tick(1); // rollover path runs inside the tick

    expect(store.state.pedometer.today.steps).toBe(0);
    expect(store.state.pedometer.today.rewarded).toBe(false);
    expect(store.state.quest.mined).toBe(0); // the mining quest rolled with it
    // and the lane is live again
    const coins0 = store.state.coins;
    store.addSteps(2000);
    expect(store.state.pedometer.today.rewarded).toBe(true);
    expect(store.state.coins).toBe(coins0 + 40);
  });

  it('the lane re-stamps itself lazily if addSteps is the first thing after midnight', () => {
    const { store, advance } = makeStore();
    store.addSteps(500);
    advance(DAY_MS + 60_000);
    // no tick — addSteps itself must notice the stale date
    store.addSteps(100);
    expect(store.state.pedometer.today.steps).toBe(100);
    expect(store.state.pedometer.today.rewarded).toBe(false);
  });
});

describe('the toggle and the heal', () => {
  it('setPedometerEnabled persists the opt-in', () => {
    const { store } = makeStore();
    expect(store.state.pedometer.enabled).toBe(false);
    store.setPedometerEnabled(true);
    expect(store.state.pedometer.enabled).toBe(true);
  });

  it('normalizePedometer heals a corrupt field without throwing', () => {
    const { store } = makeStore();
    const raw = JSON.stringify({ ...store.state, v: 3, pedometer: { enabled: 'yes', goal: -5, today: { date: 'garbage', steps: 'many', rewarded: 7 } } });
    const storage = memStorage();
    storage.setItem(SAVE_KEY, raw);
    const healed = createStore({ storage, now: () => FAKE_NOW });
    healed.load(); // the shell loads explicitly after construction
    const p = healed.state.pedometer;
    expect(p.enabled).toBe(false); // 'yes' is not === true
    expect(p.goal).toBe(2000); // -5 is not finite-positive
    expect(p.today.steps).toBe(0); // 'many' coerced out, stale date dropped
    expect(p.today.rewarded).toBe(false);
    expect(p.today.date).toBe(new Date(FAKE_NOW).toISOString().slice(0, 10));
  });

  it('today’s steps survive a load on the same day', () => {
    const { store } = makeStore();
    store.addSteps(700);
    const raw = JSON.stringify({ ...store.state, v: 3 });
    const storage = memStorage();
    storage.setItem(SAVE_KEY, raw);
    const reloaded = createStore({ storage, now: () => FAKE_NOW });
    reloaded.load();
    expect(reloaded.state.pedometer.today.steps).toBe(700);
    expect(reloaded.state.steps).toBe(700);
  });
});

describe('the trainer petition retires', () => {
  it('fires when the pedometer is off; stays silent once hardware answers the ask', () => {
    const { store } = makeStore();
    const s = store.state;
    s.personality = { paranoia: 0, ego: 0, gluttony: 0, fitness: 5, broCode: 10, greed: 0 };
    s.steps = 0;
    s.milestones.hack = false;
    s.counters.posts = 0;
    s.mining = false;
    s.petitions.lastDecisionDay = null;
    s.petitions.live = null;

    // off → the sit-around bro asks for a step goal
    expect(generatePetition(s)?.kind).toBe('trainer');

    // enabled → already answered by hardware; no petition
    s.pedometer.enabled = true;
    expect(generatePetition(s)).toBeNull();

    // enabled but zeroed lane is still "answered" — the toggle is the ask
    s.pedometer.enabled = true;
    s.pedometer.today.steps = 0;
    expect(generatePetition(s)).toBeNull();
  });
});
