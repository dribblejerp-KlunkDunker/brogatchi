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

  it('STEP.SYNC: an enabled walk lane with steps reaches the prompt; a disabled one never does', () => {
    // enabled + walked: the harness knows the real number
    const walked = identityFromEnvelope(v3(null, { pedometer: { enabled: true, goal: 2000, today: { date: '2026-09-26', steps: 1240, rewarded: false } } }));
    expect(walked.steps).toBe(1240);
    const walkedPrompt = buildSystemPrompt(walked);
    expect(walkedPrompt).toMatch(/pedometer counts the user's real steps: 1240 so far today/);
    expect(walkedPrompt).toContain('Never claim a body');

    // disabled or zero-step lanes stay out of the prompt entirely
    const off = identityFromEnvelope(v3(null, { pedometer: { enabled: false, goal: 2000, today: { date: '2026-09-26', steps: 900, rewarded: false } } }));
    expect(off.steps).toBeUndefined();
    expect(buildSystemPrompt(off)).not.toMatch(/pedometer/);

    const fresh = identityFromEnvelope(v3(null, { pedometer: { enabled: true, goal: 2000, today: { date: '2026-09-26', steps: 0, rewarded: false } } }));
    expect(fresh.steps).toBeUndefined();

    // a lane over the goal clips to the goal — he doesn't brag past the cap
    const capped = identityFromEnvelope(v3(null, { pedometer: { enabled: true, goal: 2000, today: { date: '2026-09-26', steps: 3120, rewarded: true } } }));
    expect(capped.steps).toBe(2000);
  });

  it('DREAM.CYCLE: an unread dream reaches the prompt verbatim; a stale read one never does', () => {
    const dream = { id: 'd1', t: 1789574400000, awayMs: 3 * 86400000, awayDays: 3, mood: 'grand', text: 'I dreamed for 3 days straight — it kept coming back to Won LOOT SHOWER with 5 points. The record is still 5. I checked.', strands: ['a1'], readAt: null };

    // unread: carried
    const unread = identityFromEnvelope(v3(null, { dreams: { lastDreamedAt: dream.t, entries: [dream] } }));
    expect(unread.dream.awayDays).toBe(3);
    expect(unread.dream.text).toContain('I dreamed for 3 days straight');
    const unreadPrompt = buildSystemPrompt(unread);
    expect(unreadPrompt).toMatch(/While they were away, you dreamed/);
    expect(unreadPrompt).toContain('do not invent a different one');

    // read but < 24h: still fresh enough to mention
    const fresh = identityFromEnvelope(v3(null, { dreams: { lastDreamedAt: dream.t, entries: [{ ...dream, readAt: Date.now() - 3600e3 }] } }));
    expect(fresh.dream).toBeTruthy();

    // read > 24h ago: gone from the prompt
    const stale = identityFromEnvelope(v3(null, { dreams: { lastDreamedAt: dream.t, entries: [{ ...dream, readAt: Date.now() - 25 * 3600e3 }] } }));
    expect(stale.dream).toBeUndefined();
    expect(buildSystemPrompt(stale)).not.toMatch(/you dreamed/);

    // no dreams field at all: nothing
    expect(identityFromEnvelope(v3(null)).dream).toBeUndefined();
  });
});
