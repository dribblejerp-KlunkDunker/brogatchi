// Pure unit tests for the nudge evaluator — node-runnable by construction
// (no jsdom environment declared, no window in scope): the evaluator's
// DOM-independence is proven by the file's own environment.
// See docs/superpowers/specs/2026-09-26-nudges-design.md (as reviewed).

import { describe, it, expect } from 'vitest';
import { evaluateNudges, QUIET_START, QUIET_END } from '../src/nudges.js';

const NOW = new Date(2026, 8, 16, 12, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

// A content bro on a plain Wednesday noon.
function baseState(over = {}) {
  return {
    stats: { happy: 82, hunger: 74, energy: 90, greed: 6 },
    sleeping: false,
    petitions: {},
    pedometer: { enabled: false, goal: 2000, today: { date: '2026-09-16', steps: 0, rewarded: false } },
    ...over,
  };
}

describe('evaluateNudges — conditions fire exactly under their trigger', () => {
  it.each([
    ['hunger', { stats: { happy: 82, hunger: 24, energy: 90, greed: 6 } }, 12],
    ['energy', { stats: { happy: 82, hunger: 74, energy: 19, greed: 6 } }, 12],
    ['happy', { stats: { happy: 24, hunger: 74, energy: 90, greed: 6 } }, 12],
  ])('%s fires one point inside the boundary', (key, state, hour) => {
    expect(evaluateNudges(baseState(state), {}, hour, NOW).event.key).toBe(key);
  });

  it.each([
    ['hunger', { stats: { happy: 82, hunger: 25, energy: 90, greed: 6 } }, 12],
    ['energy', { stats: { happy: 82, hunger: 74, energy: 20, greed: 6 } }, 12],
    ['happy', { stats: { happy: 25, hunger: 74, energy: 90, greed: 6 } }, 12],
  ])('%s is silent one point outside the boundary', (key, state, hour) => {
    const r = evaluateNudges(baseState(state), {}, hour, NOW);
    expect(r?.event?.key ?? null).not.toBe(key);
  });

  it('priority: two crises at once → the first row wins, never a volley', () => {
    const both = baseState({ stats: { happy: 10, hunger: 10, energy: 5, greed: 6 } });
    const r = evaluateNudges(both, {}, 12, NOW);
    expect(r.event.key).toBe('hunger'); // row 2 beats rows 3 and 4
  });

  it('the petition deadline outranks the crisis lanes', () => {
    const s = baseState({
      stats: { happy: 10, hunger: 10, energy: 5, greed: 6 },
      petitions: { live: { id: 'p1', title: 'T', request: 'Two pizzas', expiresAt: NOW + 5 * HOUR } },
    });
    expect(evaluateNudges(s, {}, 12, NOW).event.key).toBe('petition:p1');
  });

  it('the petition fires inside 12h and not before; expired asks stay silent', () => {
    const far = baseState({ petitions: { live: { id: 'p1', title: 'T', request: 'R', expiresAt: NOW + 13 * HOUR } } });
    expect(evaluateNudges(far, {}, 12, NOW).event).toBeNull();
    const near = baseState({ petitions: { live: { id: 'p1', title: 'T', request: 'R', expiresAt: NOW + 11 * HOUR } } });
    expect(evaluateNudges(near, {}, 12, NOW).event.key).toBe('petition:p1');
    const expired = baseState({ petitions: { live: { id: 'p1', title: 'T', request: 'R', expiresAt: NOW - 1000 } } });
    expect(evaluateNudges(expired, {}, 12, NOW).event).toBeNull();
  });

  it('the walk fires in the evening when ≥200 short; never before 18:00; never when done', () => {
    const walker = baseState({ pedometer: { enabled: true, goal: 2000, today: { date: 'd', steps: 1800, rewarded: false } } });
    expect(evaluateNudges(walker, {}, 19, NOW).event.key).toBe('walk:d'); // 200 short, keyed to the lane's day
    expect(evaluateNudges(walker, {}, 14, NOW).event).toBeNull(); // daytime
    const tooClose = baseState({ pedometer: { enabled: true, goal: 2000, today: { date: 'd', steps: 1801, rewarded: false } } });
    expect(evaluateNudges(tooClose, {}, 19, NOW).event).toBeNull(); // 199 short
    const done = baseState({ pedometer: { enabled: true, goal: 2000, today: { date: 'd', steps: 2000, rewarded: true } } });
    expect(evaluateNudges(done, {}, 19, NOW).event).toBeNull();
    const off = baseState({ pedometer: { enabled: false, goal: 2000, today: { date: 'd', steps: 0, rewarded: false } } });
    expect(evaluateNudges(off, {}, 19, NOW).event).toBeNull();
  });
});

describe('quiet hours', () => {
  it('crisis lanes are silent at 23:00 and 03:00, live at 12:00', () => {
    const starving = baseState({ stats: { happy: 82, hunger: 10, energy: 90, greed: 6 } });
    expect(evaluateNudges(starving, {}, 23, NOW).event).toBeNull();
    expect(evaluateNudges(starving, {}, 3, NOW).event).toBeNull();
    expect(evaluateNudges(starving, {}, 12, NOW).event.key).toBe('hunger');
    expect(QUIET_START).toBe(22);
    expect(QUIET_END).toBe(8);
  });

  it('the petition deadline is exempt — 23:00 still rings for the closing desk', () => {
    const s = baseState({ petitions: { live: { id: 'p1', title: 'T', request: 'R', expiresAt: NOW + 5 * HOUR } } });
    expect(evaluateNudges(s, {}, 23, NOW).event.key).toBe('petition:p1');
  });

  it('the walk’s evening window ends at quiet hours (18:00–22:00 in practice)', () => {
    const walker = baseState({ pedometer: { enabled: true, goal: 2000, today: { date: 'd', steps: 0, rewarded: false } } });
    expect(evaluateNudges(walker, {}, 21, NOW).event?.key).toBe('walk:d');
    expect(evaluateNudges(walker, {}, 22, NOW).event).toBeNull();
  });
});

describe('debounce and re-arm', () => {
  const starving = baseState({ stats: { happy: 82, hunger: 10, energy: 90, greed: 6 } });

  it('second call inside the debounce window returns no event', () => {
    const sent = { hunger: NOW - 1 * HOUR };
    expect(evaluateNudges(starving, sent, 12, NOW).event).toBeNull();
  });

  it('after the 6h window the same episode can nudge again', () => {
    const sent = { hunger: NOW - 7 * HOUR };
    expect(evaluateNudges(starving, sent, 12, NOW).event.key).toBe('hunger');
  });

  it('the walk re-arms on the lane’s rollover: a new day is a new key (v3.4.1)', () => {
    // Day 1's send must not eat day 2's evening — the soak caught the
    // bare 'walk' key living for a whole session (never cleared on
    // rollover), so the key is scoped to the lane's date and the shell
    // is handed the stale keys via `clear`.
    const day1 = baseState({ pedometer: { enabled: true, goal: 2000, today: { date: '2026-09-26', steps: 1000, rewarded: false } } });
    expect(evaluateNudges(day1, {}, 19, NOW).event.key).toBe('walk:2026-09-26');
    // Same session, day 2's lane re-stamped: day 1's key (and the legacy
    // bare key) are stale — they arrive in `clear`, and day 2 rings again.
    const day2 = baseState({ pedometer: { enabled: true, goal: 2000, today: { date: '2026-09-27', steps: 1000, rewarded: false } } });
    const r = evaluateNudges(day2, { 'walk:2026-09-26': NOW - HOUR, walk: NOW - 25 * HOUR }, 19, NOW);
    expect(r.event.key).toBe('walk:2026-09-27');
    expect(r.clear).toContain('walk:2026-09-26');
    expect(r.clear).toContain('walk');
    // Same day again → still debounced (once per day, per lane date).
    expect(evaluateNudges(day2, { 'walk:2026-09-27': NOW - HOUR }, 19, NOW).event).toBeNull();
  });

  it('re-arm: the evaluator returns `clear` when the condition goes false', () => {
    const fed = baseState(); // hunger back to 74
    const r = evaluateNudges(fed, { hunger: NOW - HOUR }, 12, NOW);
    expect(r.event).toBeNull();
    expect(r.clear).toContain('hunger');
    // caller applies the clear → the next episode fires again
    const lastSent = { hunger: NOW - HOUR };
    for (const k of r.clear) delete lastSent[k];
    expect(evaluateNudges(starving, lastSent, 12, NOW).event.key).toBe('hunger');
  });

  it('a visible petition nudge does not repeat (keyed by id)', () => {
    const s = baseState({ petitions: { live: { id: 'p1', title: 'T', request: 'R', expiresAt: NOW + 5 * HOUR } } });
    const sent = { 'petition:p1': NOW - HOUR };
    expect(evaluateNudges(s, sent, 12, NOW).event).toBeNull();
    const newAsk = baseState({ petitions: { live: { id: 'p2', title: 'T2', request: 'R2', expiresAt: NOW + 5 * HOUR } } });
    expect(evaluateNudges(newAsk, sent, 12, NOW).event.key).toBe('petition:p2'); // a new ask is a new nudge
  });
});

describe('purity by construction', () => {
  it('mutates neither state nor lastSent; junk state returns null', () => {
    const state = starvingState();
    const lastSent = { hunger: NOW - 7 * HOUR };
    const snapshot = JSON.stringify(state);
    evaluateNudges(state, lastSent, 12, NOW);
    expect(JSON.stringify(state)).toBe(snapshot); // state untouched
    expect(lastSent.hunger).toBe(NOW - 7 * HOUR); // lastSent untouched
    expect(evaluateNudges(null, {}, 12, NOW)).toBeNull();
    expect(evaluateNudges({}, {}, 12, NOW)).toBeNull();
  });

  function starvingState() {
    return baseState({ stats: { happy: 82, hunger: 10, energy: 90, greed: 6 } });
  }
});
