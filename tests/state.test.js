import { describe, it, expect } from 'vitest';
import { createStore, levelFor, clamp, moltScore, SHOP_ITEMS, LEVEL_XP } from '../src/state.js';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function makeStore(now = 0) {
  let t = now;
  const store = createStore({ storage: memStorage(), now: () => t });
  return { store, advance: (ms) => { t += ms; } };
}

describe('pure helpers', () => {
  it('levelFor maps xp to levels', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(LEVEL_XP - 1)).toBe(1);
    expect(levelFor(LEVEL_XP)).toBe(2);
    expect(levelFor(LEVEL_XP * 2 + 5)).toBe(3);
  });

  it('clamp keeps vitals in range', () => {
    expect(clamp(150)).toBe(100);
    expect(clamp(-5)).toBe(0);
    expect(clamp(42)).toBe(42);
  });
});

describe('pet actions', () => {
  it('feed raises hunger, capped at 100', () => {
    const { store } = makeStore();
    store.state.stats.hunger = 90;
    expect(store.feed()).toBe(true);
    expect(store.state.stats.hunger).toBe(100);
  });

  it('feed is rejected while sleeping', () => {
    const { store } = makeStore();
    store.rest(); // sleeping = true
    expect(store.feed()).toBe(false);
  });

  it('play costs energy and requires 10 NRG', () => {
    const { store } = makeStore();
    store.state.stats.energy = 50;
    expect(store.playWith()).toBe(true);
    expect(store.state.stats.energy).toBe(40);
    store.state.stats.energy = 5;
    expect(store.playWith()).toBe(false);
  });

  it('resting regenerates energy via ticks', () => {
    const { store } = makeStore();
    store.state.stats.energy = 10;
    store.rest();
    for (let i = 0; i < 20; i++) store.tick(1);
    expect(store.state.stats.energy).toBe(20); // +0.5/s
    expect(store.state.sleeping).toBe(true);   // still under 100 NRG
    // …and wakes itself once fully charged
    for (let i = 0; i < 400; i++) store.tick(1);
    expect(store.state.sleeping).toBe(false);
  });
});

describe('economy', () => {
  it('hack pays 10 CR for 5 NRG', () => {
    const { store } = makeStore();
    const coins = store.state.coins, energy = store.state.stats.energy;
    expect(store.hackMainframe().ok).toBe(true);
    expect(store.state.coins).toBe(coins + 10);
    expect(store.state.stats.energy).toBe(energy - 5);
  });

  it('hack fails without energy', () => {
    const { store } = makeStore();
    store.state.stats.energy = 2;
    const res = store.hackMainframe();
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('INSUFFICIENT NRG');
  });

  it('shop rejects purchases without funds', () => {
    const { store } = makeStore();
    store.state.coins = 1;
    const res = store.buy('pizza');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('INSUFFICIENT CR');
  });

  it('shop applies item effects and deducts cost', () => {
    const { store } = makeStore();
    store.state.coins = 100;
    store.state.stats.hunger = 50;
    const res = store.buy('pizza');
    expect(res.ok).toBe(true);
    expect(store.state.coins).toBe(50);
    expect(store.state.stats.hunger).toBe(75);
    expect(SHOP_ITEMS.length).toBeGreaterThanOrEqual(4);
  });

  it('mining yields 1 CR every 6 seconds while awake', () => {
    const { store } = makeStore();
    store.state.mining = true;
    const coins = store.state.coins;
    for (let i = 0; i < 6; i++) store.tick(1);
    expect(store.state.coins).toBe(coins + 1);
    expect(store.state.quest.mined).toBe(1);
  });

  it('daily quest pays +50 CR exactly once', () => {
    const { store } = makeStore();
    store.state.mining = true;
    let rewards = 0;
    for (let i = 0; i < 6 * 25; i++) {
      const events = store.tick(1);
      rewards += events.filter((e) => e.questDone).length;
    }
    expect(store.state.quest.rewarded).toBe(true);
    expect(rewards).toBe(1);
  });
});

describe('persistence', () => {
  it('save + load round-trips state', () => {
    const storage = memStorage();
    let t = 1000;
    const a = createStore({ storage, now: () => t });
    a.state.coins = 321;
    a.save();
    const b = createStore({ storage, now: () => t });
    b.load();
    expect(b.state.coins).toBe(321);
  });

  it('offline time decays hunger (capped at 8h)', () => {
    const storage = memStorage();
    let t = 0;
    const a = createStore({ storage, now: () => t });
    a.state.stats.hunger = 80;
    a.save();
    t = 100 * 3600 * 1000; // 100h later — capped to 8h of decay
    const b = createStore({ storage, now: () => t });
    b.load();
    const expected = clamp(80 - 0.015 * 8 * 3600);
    expect(b.state.stats.hunger).toBeCloseTo(expected, 1);
  });
});

describe('legacy 2.0 → 3.0 memory migration', () => {
  it('imports memories/diary/soul/eye, archives a snapshot, leaves legacy key untouched', () => {
    const storage = memStorage();
    const legacy = {
      coins: 500, xp: 130, steps: 4200,
      memories: [{ time: 111, text: 'First win in Flappy Bro' }, 'Pet 100 times'],
      diary: [{ date: 222, entry: 'Dear diary: the pizza was a lie' }],
      conversations: [{ with: 'rookie', lines: 3 }],
      soul: {
        who: 'I am the tide itself', specialty: 'Crab whispering',
        quirks: ['honks'], opinions: ['gulls are drones'],
        timeline: [{ t: 5, icon: '✨', text: 'became something' }],
      },
      thirdEyeXp: 44,
    };
    storage.setItem('brogatchi_v4', JSON.stringify(legacy));
    const store = createStore({ storage, now: () => 1000 });
    store.load();
    const s = store.state;
    expect(s.legacy?.source).toBe('brogatchi_v4');
    expect(s.memories.length).toBe(2);
    expect(s.memories[0].text).toBe('First win in Flappy Bro');
    expect(s.memories[0].t).toBe(111);
    expect(s.diary[0].text).toBe('Dear diary: the pizza was a lie');
    expect(s.soul.who).toBe('I am the tide itself');
    // quirks MERGE now (default quirks + imported 'honks') — memory-engine policy
    expect(s.soul.quirks).toContain('honks');
    expect(s.molt.eye).toBe(44);
    expect(s.coins).toBe(500);
    expect(s.xp).toBe(130);
    expect(s.steps).toBe(4200);
    expect(s.conversations.length).toBe(1);
    // raw snapshot archived
    expect(storage.getItem('bro_os_3_legacy_snapshot')).toBeTruthy();
    // legacy key unmodified
    expect(JSON.parse(storage.getItem('brogatchi_v4')).xp).toBe(130);
  });

  it('also finds memories nested one level deep (older schemas)', () => {
    const storage = memStorage();
    storage.setItem('brogatchi_v3', JSON.stringify({ ryan: { memories: ['the tide spoke'] } }));
    const store = createStore({ storage, now: () => 0 });
    store.load();
    expect(store.state.memories[0].text).toBe('the tide spoke');
    expect(store.state.legacy.source).toBe('brogatchi_v3');
  });

  it('export/import round-trips the whole soul', () => {
    let t = 0;
    const a = createStore({ storage: memStorage(), now: () => t });
    a.load();
    a.state.memories = [{ t: 1, icon: '🧠', text: 'the golden tide is real' }];
    const json = a.exportState();
    const b = createStore({ storage: memStorage(), now: () => t });
    expect(b.importState(json)).toBe(true);
    expect(b.state.memories[0].text).toBe('the golden tide is real');
    expect(b.state.soul.specialty).toBe(a.state.soul.specialty);
  });

  it('import rejects garbage and foreign versions', () => {
    const store = createStore({ storage: memStorage(), now: () => 0 });
    expect(store.importState('{nope')).toBe(false);
    expect(store.importState('{"v":2}')).toBe(false);
  });

  it('factory reset wipes 3.0 + snapshot but never legacy keys', () => {
    const storage = memStorage();
    storage.setItem('brogatchi_v4', '{"xp":5}');
    const store = createStore({ storage, now: () => 0 });
    store.load();
    store.reset();
    expect(storage.getItem('brogatchi_v4')).toBeTruthy();
    expect(storage.getItem('bro_os_3')).toBeNull();
    expect(storage.getItem('bro_os_3_legacy_snapshot')).toBeNull();
  });
});

describe('pilgrim agent-cards ADOPT flow', () => {
  it('adopts a card once, rejects duplicates and unknown ids', () => {
    const store = createStore({ storage: memStorage(), now: () => 0 });
    store.load();
    expect(store.state.roster.length).toBe(0);
    const ok = store.adoptPilgrim('rookie');
    expect(ok.ok).toBe(true);
    expect(store.state.roster[0].name).toBe('MOLT-ROOKIE');
    expect(store.adoptPilgrim('rookie').reason).toBe('ALREADY USHERED');
    expect(store.adoptPilgrim('nope').reason).toBe('UNKNOWN CARD');
    expect(store.state.roster.length).toBe(1);
  });

  it('exportRoster bundles roster + molt + soul + snapshot for the pre-adopt backup', () => {
    const storage = memStorage();
    storage.setItem('bro_os_3_legacy_snapshot', '{"v":3,"legacy":true}');
    const store = createStore({ storage, now: () => 0 });
    store.load();
    store.adoptPilgrim('doze');
    const obj = JSON.parse(store.exportRoster());
    expect(obj.kind).toBe('bro-os-roster-backup');
    expect(obj.roster[0].id).toBe('doze');
    expect(obj.molt).toBeTruthy();
    expect(obj.soul).toBeTruthy();
    expect(obj.legacySnapshot).toContain('legacy');
  });
});
