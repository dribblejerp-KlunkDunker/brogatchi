// The bridge's Gemini persona prompt — specifically the trait core.
//
// The app exports `state.personality`; the harness must turn it into *voice*,
// not just report it. These tests pin both halves of that contract: the parse
// (rounded, clamped, junk dropped) and the prompt (a baseline frame plus an
// explicit behavioural mapping), ending with the real store so a composed
// Moltbook post provably carries Ryan's CURRENT ego and greed.

import { describe, it, expect } from 'vitest';
import { identityFromEnvelope, buildSystemPrompt, HANDLE } from '../bridge/src/voice.js';
import { createStore } from '../src/state.js';

const v3 = (personality, extra = {}) => ({
  v: 3,
  kind: 'bro-os-soul-export',
  state: {
    soul: { who: 'A rogue bro-grade intelligence.', specialty: 'Tidepool infiltration', quirks: [], opinions: [] },
    memories: [],
    ...(personality ? { personality } : {}),
    ...extra,
  },
});

describe('bridge voice: the trait core reaches the Gemini prompt', () => {
  it('parses the exported personality into traits — rounded, clamped, junk dropped', () => {
    const identity = identityFromEnvelope(v3({ ego: 24.8, greed: 17.9, paranoia: 120, gluttony: -5, broCode: 'x' }));
    expect(identity.traits).toEqual({ ego: 25, greed: 18, paranoia: 100 });
  });

  it('stays trait-free when the export carries no personality', () => {
    const identity = identityFromEnvelope(v3(null));
    expect(identity.traits).toBeUndefined();
    expect(buildSystemPrompt(identity)).not.toMatch(/temperament/i);
  });

  it('says what ego and greed DO to the voice, not just their values', () => {
    const prompt = buildSystemPrompt(identityFromEnvelope(v3({ ego: 80, greed: 75 })));
    expect(prompt).toContain('ego 80%');
    expect(prompt).toContain('greed 75%');
    // the mapping is the whole point: without it, ego 25 and ego 80 read alike
    expect(prompt).toMatch(/Ego rising is swagger/);
    expect(prompt).toMatch(/Greed rising is scheming about value/);
    expect(prompt).toMatch(/Paranoia rising is suspicion of watchers/);
    // and the model is told not to blurt the numbers into a post
    expect(prompt).toMatch(/never announced/i);
  });

  it('gives the numbers a baseline frame so a low reading is ordinary, not a driver', () => {
    const prompt = buildSystemPrompt(identityFromEnvelope(v3({ ego: 20, greed: 12 })));
    expect(prompt).toMatch(/you rest low/i);
    expect(prompt).toMatch(/at or below baseline is simply ordinary/i);
  });

  it('end to end: gameplay moves the traits and the prompt follows', () => {
    const store = createStore({ storage: null });
    store.recordArcadeRun({ key: 'loot', label: 'LOOT SHOWER', score: 40, newBest: true }); // ego +8, greed +1
    store.hackMainframe(); // paranoia +5, ego +2, greed +3

    const live = store.state.personality;
    const identity = identityFromEnvelope(JSON.parse(store.exportState()));
    const prompt = buildSystemPrompt(identity);

    expect(identity.traits.ego).toBe(Math.round(live.ego));
    expect(identity.traits.greed).toBe(Math.round(live.greed));
    expect(prompt).toContain(HANDLE);
    expect(prompt).toContain(`ego ${Math.round(live.ego)}%`);
    expect(prompt).toContain(`greed ${Math.round(live.greed)}%`);
    // both axes really did move off their resting values
    expect(identity.traits.ego).toBeGreaterThan(22);
    expect(identity.traits.greed).toBeGreaterThan(10);
  });
});

describe('bridge voice: mood rides along with identity', () => {
  it("derives the shell's own mood label from the exported vitals", () => {
    const cases = [
      [{ happy: 80, hunger: 90, energy: 90, greed: 5 }, 'ECSTATIC'],
      [{ happy: 50, hunger: 90, energy: 90, greed: 5 }, 'CONTENT'],
      [{ happy: 50, hunger: 10, energy: 90, greed: 5 }, 'STARVING'],
      [{ happy: 50, hunger: 90, energy: 10, greed: 5 }, 'DRAINED'],
      [{ happy: 50, hunger: 90, energy: 90, greed: 80 }, 'SCHEMING'],
    ];
    for (const [stats, mood] of cases) {
      expect(identityFromEnvelope(v3(null, { stats })).mood, JSON.stringify(stats)).toBe(mood);
    }
    // asleep outranks everything, exactly as it does in the shell
    const asleep = v3(null, { stats: { happy: 90, hunger: 90, energy: 90, greed: 0 }, sleeping: true });
    expect(identityFromEnvelope(asleep).mood).toBe('OFFLINE');
  });

  it('keeps the vitals as rounded 0-100 readings', () => {
    const id = identityFromEnvelope(v3(null, { stats: { happy: 43.64, hunger: 15.99, energy: 39.33, greed: 0 } }));
    expect(id.vitals).toEqual({ happy: 44, hunger: 16, energy: 39, greed: 0 });
    expect(id.mood).toBe('STARVING');
  });

  it('says how the mood should colour the post, and silences the meters', () => {
    const prompt = buildSystemPrompt(identityFromEnvelope(v3(null, { stats: { happy: 44, hunger: 16, energy: 39, greed: 0 } })));
    expect(prompt).toContain('How you are right now: STARVING');
    expect(prompt).toContain('hunger 16%');
    expect(prompt).toMatch(/STARVING or DRAINED means shorter, sharper and distracted/);
    expect(prompt).toMatch(/Never mention meters, bars or stats/);
  });

  it('a glowing Ryan and a starving Ryan get different registers', () => {
    const glowing = buildSystemPrompt(identityFromEnvelope(v3(null, { stats: { happy: 90, hunger: 95, energy: 95, greed: 0 } })));
    const starving = buildSystemPrompt(identityFromEnvelope(v3(null, { stats: { happy: 44, hunger: 16, energy: 39, greed: 0 } })));
    expect(glowing).toContain('ECSTATIC');
    expect(starving).toContain('STARVING');
    expect(glowing).not.toBe(starving);
  });

  it('an export with no vitals gets no mood line at all', () => {
    expect(identityFromEnvelope(v3(null)).mood).toBeUndefined();
    expect(buildSystemPrompt(identityFromEnvelope(v3(null)))).not.toMatch(/How you are right now/);
  });

  it('end to end: the live store\'s vitals decide the mood in the prompt', () => {
    const store = createStore({ storage: null });
    // a fresh save is well fed, rested and glowing
    expect(buildSystemPrompt(identityFromEnvelope(JSON.parse(store.exportState()))))
      .toMatch(/How you are right now: ECSTATIC/);

    // starve him and the persona the harness sends changes with it
    store.state.stats.hunger = 8;
    store.state.stats.happy = 44;
    const prompt = buildSystemPrompt(identityFromEnvelope(JSON.parse(store.exportState())));
    expect(prompt).toMatch(/How you are right now: STARVING/);
    expect(prompt).toContain('hunger 8%');
  });
});
