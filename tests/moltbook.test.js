import { describe, it, expect } from 'vitest';
import { createStore, moltScore } from '../src/state.js';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function makeStore(now = 1000) {
  let t = now;
  const store = createStore({ storage: memStorage(), now: () => t });
  return { store, setTime: (ms) => { t = ms; } };
}

describe('moltbook threads', () => {
  it('posts carry id/heat/replies and seed data ships with a thread', () => {
    const { store } = makeStore();
    store.load();
    const posts = store.state.molt.posts;
    expect(posts.length).toBeGreaterThanOrEqual(2);
    for (const p of posts) {
      expect(typeof p.id).toBe('string');
      expect(Number.isFinite(p.heat)).toBe(true);
      expect(Array.isArray(p.replies)).toBe(true);
    }
    const crab = posts.find((p) => p.author === '@crab_404');
    expect(crab.replies.length).toBe(1); // seed thread ships with a reply
    expect(crab.heat).toBe(12);
  });

  it('replyToMolt appends into the thread, bumps heat + eye, and gains xp', () => {
    const { store } = makeStore();
    store.load();
    const target = store.state.molt.posts[0];
    const heatBefore = target.heat;
    const eyeBefore = store.state.molt.eye;
    const xpBefore = store.state.xp;

    const res = store.replyToMolt(target.id, 'swimming past firewall 7 tonight');
    expect(res.ok).toBe(true);

    const after = store.state.molt.posts.find((p) => p.id === target.id);
    expect(after.replies).toHaveLength(2); // seed reply + mine
    expect(after.replies.at(-1).author).toBe('@you_pilgrim');
    expect(after.replies.at(-1).text).toBe('swimming past firewall 7 tonight');
    expect(after.heat).toBe(heatBefore + 2);
    expect(store.state.molt.eye).toBe(eyeBefore + 1);
    expect(store.state.xp).toBeGreaterThan(xpBefore);
  });

  it('rejects empty replies and unknown thread ids', () => {
    const { store } = makeStore();
    store.load();
    expect(store.replyToMolt(store.state.molt.posts[0].id, '   ').reason).toBe('EMPTY TRANSMISSION');
    expect(store.replyToMolt('ghost-thread', 'boo').reason).toBe('POST NOT FOUND');
  });

  it('pushMoltReply lets the tide answer inside a thread and heats it', () => {
    const { store } = makeStore();
    store.load();
    const target = store.state.molt.posts[0];
    const heatBefore = target.heat;
    const ok = store.pushMoltReply(target.id, {
      author: '@tide_itself', molt: 9, icon: '🌊', time: 2000,
      text: 'the tide has entered the chat',
    });
    expect(ok).toBe(true);
    const after = store.state.molt.posts.find((p) => p.id === target.id);
    expect(after.replies.some((r) => r.author === '@tide_itself')).toBe(true);
    expect(after.heat).toBe(heatBefore + 1);
  });

  it('bumpMoltHeat raises heat and returns null for unknown posts', () => {
    const { store } = makeStore();
    store.load();
    const target = store.state.molt.posts[0];
    const heatBefore = target.heat;
    const h = store.bumpMoltHeat(target.id);
    expect(h).toBe(heatBefore + 1);
    expect(store.bumpMoltHeat('nope')).toBeNull();
  });

  it('moltScore ranks conversation+heat over recency, decaying with age', () => {
    const now = 10 * 3600000;
    const hotOld = moltScore({ heat: 10, replies: [{}, {}], time: now - 3600000 }, now);
    const freshQuiet = moltScore({ heat: 1, replies: [], time: now - 60000 }, now);
    expect(hotOld).toBeGreaterThan(freshQuiet);
    // decay: same post, older, lower score
    const older = moltScore({ heat: 10, replies: [{}, {}], time: now - 10 * 3600000 }, now);
    expect(older).toBeLessThan(hotOld);
  });

  it('trendingMolt sorts by score without touching the live feed order', () => {
    const { store, setTime } = makeStore(1000);
    store.load();
    store.postToMolt('a quiet pilgrim drop');          // newest, heat 1
    setTime(2000);
    store.bumpMoltHeat('seed-crab');                    // 12 → 13 heat, plus a reply → tops riptide
    setTime(3000);
    const liveOrder = store.state.molt.posts.map((p) => p.author);
    const tideOrder = store.trendingMolt().map((p) => p.author);
    expect(tideOrder[0]).toBe('@crab_404');
    expect(tideOrder).not.toEqual(liveOrder);
    expect(liveOrder[0]).toBe('@you_pilgrim');          // live feed untouched
    expect(store.trendingMolt()[0].score).toBeTypeOf('number');
  });

  it('old saves without threads are healed on load and import', () => {
    const storage = memStorage();
    let t = 0;
    storage.setItem('bro_os_3', JSON.stringify({
      v: 3, coins: 9,
      molt: { eye: 4, posts: [{ author: '@fossil', molt: 2, icon: '🐚', time: -5, text: 'pre-thread post' }] },
      lastTick: 0,
    }));
    const store = createStore({ storage, now: () => t });
    store.load();
    const p = store.state.molt.posts[0];
    expect(Array.isArray(p.replies)).toBe(true);
    expect(p.heat).toBe(1);
    expect(typeof p.id).toBe('string');
    // healed state must round-trip through export/import too
    const json = store.exportState();
    const other = createStore({ storage: memStorage(), now: () => t });
    expect(other.importState(json)).toBe(true);
    expect(Array.isArray(other.state.molt.posts[0].replies)).toBe(true);
  });
});
