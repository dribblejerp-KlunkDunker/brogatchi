// Store + engine tests for Ryan's petitions (2.0 self-authorship restored).
// Generator boundaries, cooldown, the decision flow (grant MUST mutate),
// expiry as 'ignored', the degrade path, and normalize's heal behavior.
// See docs/superpowers/specs/2026-09-15-petitions-design.md.

import { describe, it, expect } from 'vitest';
import {
  createStore, clamp, SAVE_KEY,
} from '../src/state.js';
import {
  generatePetition, normalizePetitions, applyShifts, shiftsFor,
  grantApplies, PETITION_COOLDOWN_DAYS, PETITION_KINDS,
} from '../src/petitions.js';

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

// Fixed fake clock: noon on a real Wednesday, so cooldown/expiry math has
// a stable base and never races the real Date.now().
const FAKE_NOW = new Date(2026, 8, 16, 12, 0, 0).getTime();

// Strip every generator trigger so only the trait under test can fire.
function neutralState(store) {
  const s = store.state;
  s.personality = { paranoia: 0, ego: 0, gluttony: 0, fitness: 50, broCode: 10, greed: 0 };
  s.stats = { happy: 50, hunger: 80, energy: 90, greed: 5 };
  s.steps = 1; // trainer asks for steps === 0
  s.milestones.hack = false;
  s.counters.posts = 0;
  s.mining = false; // curfew's grant wants mining on; the TRIGGER only wants greed
  s.petitions.lastDecisionDay = null;
  s.petitions.live = null;
  return s;
}

describe('petition generators — fire exactly under their trigger', () => {
  it.each([
    ['greed', 59, null],
    ['greed', 60, 'curfew'],
  ])('curfew: greed %i → %s', (_t, val, want) => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.personality.greed = val;
    expect(generatePetition(s)?.kind ?? undefined).toBe(want ?? undefined);
  });

  it.each([
    [54, 80, null],
    [55, 39, 'feast'],
    [55, 40, null], // hunger boundary: must be strictly below 40
  ])('feast: gluttony %i hunger %i → %s', (glut, hunger, want) => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.personality.gluttony = glut;
    s.stats.hunger = hunger;
    expect(generatePetition(s)?.kind ?? undefined).toBe(want ?? undefined);
  });

  it.each([
    [64, 3, null],      // ego boundary
    [65, 2, null],      // posts boundary (spec: posts ≥ 3)
    [65, 3, 'renown'],
  ])('renown: ego %i posts %i → %s', (ego, posts, want) => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.personality.ego = ego;
    s.counters.posts = posts;
    expect(generatePetition(s)?.kind ?? undefined).toBe(want ?? undefined);
  });

  it.each([
    [16, 0, null],
    [15, 0, 'trainer'],
    [15, 1, null], // steps must be 0
  ])('trainer: fitness %i steps %i → %s', (fit, steps, want) => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.personality.fitness = fit;
    s.steps = steps;
    expect(generatePetition(s)?.kind ?? undefined).toBe(want ?? undefined);
  });

  it.each([
    [54, true, null],
    [55, false, null], // needs the hack milestone too
    [55, true, 'ghost'],
  ])('ghost: paranoia %i hack %s → %s', (par, hack, want) => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.personality.paranoia = par;
    s.milestones.hack = hack;
    expect(generatePetition(s)?.kind ?? undefined).toBe(want ?? undefined);
  });

  it.each([
    [84, null],
    [85, 'sabbath'],
  ])('sabbath: happy %i → %s', (happy, want) => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.stats.happy = happy;
    expect(generatePetition(s)?.kind ?? undefined).toBe(want ?? undefined);
  });

  it('drafts at most one petition — first generator in order wins', () => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.personality.greed = 70;
    s.stats.happy = 90;
    expect(generatePetition(s)?.kind).toBe('curfew');
  });

  it('every draft carries the full live shape', () => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.personality.gluttony = 60;
    s.stats.hunger = 30;
    const d = generatePetition(s, 1000);
    expect(d.id).toMatch(/^pet-/);
    expect(PETITION_KINDS).toContain(d.kind);
    expect(d.title).toBeTruthy();
    expect(d.argument).toBeTruthy();
    expect(d.request).toBeTruthy();
    expect(d.draftedAt).toBe(1000);
    expect(d.expiresAt).toBe(1000 + 48 * 3600 * 1000);
  });
});

describe('cooldown + one-live gate', () => {
  it('blocks generation inside 3 days of a decision, resumes after', () => {
    const { store, setNow } = makeStore();
    const s = neutralState(store);
    s.personality.greed = 80;
    const day = new Date(FAKE_NOW).toISOString().slice(0, 10);
    store.state.petitions.lastDecisionDay = day;
    expect(generatePetition(store.state, FAKE_NOW)).toBeNull();
    const later = Date.parse(day) + PETITION_COOLDOWN_DAYS * 86400000 + 1000;
    setNow(later);
    expect(generatePetition(store.state, later)?.kind).toBe('curfew');
  });

  it('never drafts while a petition is live', () => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.personality.greed = 80;
    s.petitions.live = { id: 'pet-live', kind: 'curfew', title: 'x', argument: 'y', request: 'z', params: {}, draftedAt: 0, expiresAt: Date.now() + 1000 };
    expect(generatePetition(s)).toBeNull();
  });
});

describe('decidePetition — the grant must actually mutate', () => {
  it('feast grant: pizzas really added, hunger really fed, pinned memory, history, cooldown set', () => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.personality.gluttony = 60;
    s.stats.hunger = 30;
    const draft = store.maybeGeneratePetition();
    expect(draft.kind).toBe('feast');
    const glutBefore = store.state.personality.gluttony;
    expect(store.decidePetition(draft.id, 'granted')).toBe(true);
    expect(store.state.counters.pizzas).toBe(2);
    expect(store.state.stats.hunger).toBe(70);
    expect(store.state.personality.gluttony).toBeLessThan(glutBefore);
    const mem = store.state.memories.find((m) => m.icon === '📜');
    expect(mem.text).toBe('Petitioned you: "THE FEAST" — and you said yes.');
    expect(mem.pinned).toBe(true);
    expect(store.state.petitions.live).toBeNull();
    expect(store.state.petitions.history).toHaveLength(1);
    expect(store.state.petitions.history[0].decision).toBe('granted');
    expect(store.state.petitions.lastDecisionDay).toBeTruthy();
    // The diary line lands immediately (MOLT JOURNAL pairs it for free).
    expect(store.state.diary.some((d) => d.text.includes('THE FEAST'))).toBe(true);
  });

  it('curfew deny: mining untouched, deny shifts applied, unpinned memory', () => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.personality.greed = 80;
    s.mining = true;
    const draft = store.maybeGeneratePetition();
    const greedBefore = store.state.personality.greed;
    const broBefore = store.state.personality.broCode;
    expect(store.decidePetition(draft.id, 'denied')).toBe(true);
    expect(store.state.mining).toBe(true); // no mutation on deny
    expect(store.state.personality.greed).toBeGreaterThan(greedBefore);
    expect(store.state.personality.broCode).toBeLessThan(broBefore);
    const mem = store.state.memories.find((m) => m.icon === '📜');
    expect(mem.text).toBe('Petitioned you: "THE NIGHT OFF" — and you said no.');
    expect(mem.pinned).toBeFalsy(); // unpinned — the field may be absent
  });

  it('ghost grant sets the scrub-log seam effect; the store never touches the DOM', () => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.personality.paranoia = 70;
    s.milestones.hack = true;
    const draft = store.maybeGeneratePetition();
    expect(store.decidePetition(draft.id, 'granted')).toBe(true);
    expect(store.state.petitions.lastEffect).toEqual({ kind: 'scrub-log', t: expect.any(Number) });
  });

  it('sabbath grant zeros tomorrow\u2019s quest goal via sabbathDay', () => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.stats.happy = 90;
    const draft = store.maybeGeneratePetition();
    expect(store.decidePetition(draft.id, 'granted')).toBe(true);
    const tomorrow = new Date(FAKE_NOW + 86400000).toISOString().slice(0, 10);
    expect(store.state.petitions.sabbathDay).toBe(tomorrow);
  });

  it('renown grant pins today\u2019s own top post through the hold machinery', () => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.personality.ego = 70;
    s.counters.posts = 4;
    const postId = 'm-test-pin';
    store.state.molt.posts.unshift({ id: postId, author: '@you_pilgrim', molt: 0, icon: '🫅', time: Date.now(), heat: 9, text: 'my best work', replies: [] });
    const draft = store.maybeGeneratePetition();
    expect(draft.kind).toBe('renown');
    expect(draft.params.postId).toBe(postId);
    expect(store.decidePetition(draft.id, 'granted')).toBe(true);
    expect(store.state.memories.some((m) => m.post === postId && m.pinned)).toBe(true);
  });

  it('unknown id / wrong id / double-decide all refuse', () => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.personality.greed = 80;
    const draft = store.maybeGeneratePetition();
    expect(store.decidePetition('pet-nope', 'granted')).toBe(false);
    expect(store.decidePetition(draft.id, 'maybe')).toBe(false);
    expect(store.state.petitions.live).not.toBeNull(); // untouched
    store.decidePetition(draft.id, 'granted');
    expect(store.decidePetition(draft.id, 'granted')).toBe(false); // desk empty
  });

  it('grant degrades to a +2 happy shrug when the world moved on', () => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.personality.greed = 80; // drafts curfew…
    const draft = store.maybeGeneratePetition();
    store.state.mining = false; // …but the rig powered down before the answer
    const happyBefore = store.state.stats.happy;
    expect(store.decidePetition(draft.id, 'granted')).toBe(true);
    expect(store.state.petitions.history[0].decision).toBe('ignored');
    expect(store.state.stats.happy).toBe(happyBefore + 2);
  });
});

describe('expiry — the ask withdraws itself', () => {
  it('expirePetition resolves past-due asks as ignored: no shifts, no memory', () => {
    const { store, setNow } = makeStore();
    const s = neutralState(store);
    s.personality.greed = 80;
    const draft = store.maybeGeneratePetition();
    const memBefore = store.state.memories.length;
    const histBefore = store.state.petitions.history.length;
    setNow(draft.expiresAt + 1);
    const expired = store.expirePetition();
    expect(expired.id).toBe(draft.id);
    expect(store.state.petitions.live).toBeNull();
    expect(store.state.petitions.history).toHaveLength(histBefore + 1);
    expect(store.state.petitions.history[0].decision).toBe('ignored');
    expect(store.state.memories).toHaveLength(memBefore); // no memory
  });

  it('a still-fresh ask survives the expiry check', () => {
    const { store } = makeStore();
    const s = neutralState(store);
    s.personality.greed = 80;
    store.maybeGeneratePetition();
    expect(store.expirePetition()).toBeNull();
    expect(store.state.petitions.live).not.toBeNull();
  });
});

describe('normalizePetitions heals any save shape', () => {
  it('garbage in → clean empty shape out, never throws', () => {
    for (const bad of [undefined, null, 42, 'x', [], { live: 7, history: 'nope' }]) {
      const healed = normalizePetitions(bad);
      expect(healed.live).toBeNull();
      expect(healed.history).toEqual([]);
      expect(healed.lastDecisionDay).toBeNull();
    }
  });

  it('drops a malformed live petition, keeps a valid one, caps history at 30', () => {
    const live = { id: 'pet-ok', kind: 'feast', title: 'T', argument: 'a', request: 'r', params: {}, draftedAt: 1, expiresAt: 2 };
    const junk = { id: '', kind: 'nonsense', title: '' };
    const hist = Array.from({ length: 40 }, (_, i) => ({ kind: 'feast', decision: 'granted', title: `h${i}` }));
    const healed = normalizePetitions({ live: junk, history: hist, lastDecisionDay: '2026-13-99' });
    expect(healed.live).toBeNull();
    expect(healed.history).toHaveLength(30);
    const healedLive = normalizePetitions({ live });
    expect(healedLive.live.id).toBe('pet-ok');
  });

  it('store load heals a corrupt petitions field without dying', () => {
    const storage = memStorage();
    const corrupt = { v: 3, petitions: { live: { kind: 'nonsense' }, history: 'not-an-array', lastDecisionDay: 42 } };
    storage.setItem(SAVE_KEY, JSON.stringify(corrupt));
    const store2 = createStore({ storage, now: () => 0 });
    expect(() => store2.load()).not.toThrow();
    expect(store2.state.petitions.live).toBeNull();
    expect(Array.isArray(store2.state.petitions.history)).toBe(true);
    expect(store2.state.petitions.lastDecisionDay).toBeNull();
  });
});

describe('shift plumbing', () => {
  it('shiftsFor covers every kind × grant/deny; applyShifts routes happy to stats', () => {
    for (const kind of PETITION_KINDS) {
      expect(shiftsFor(kind, 'grant')).toBeTruthy();
      expect(shiftsFor(kind, 'deny')).toBeTruthy();
    }
    const s = { personality: { paranoia: 0, ego: 0, gluttony: 0, fitness: 0, broCode: 0, greed: 0 }, stats: { happy: 50, hunger: 0, energy: 0, greed: 0 } };
    applyShifts(s, shiftsFor('feast', 'grant'));
    expect(s.stats.happy).toBe(58);
    expect(clamp(s.personality.gluttony, 0, 100)).toBe(0); // -6 clamped at 0
  });

  it('grantApplies rejects an unknown kind', () => {
    expect(grantApplies({ mining: true }, 'time-travel', {})).toBe(false);
  });
});
