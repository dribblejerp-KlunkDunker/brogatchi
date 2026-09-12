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

describe('sprite gallery', () => {
  it('ships with pilgrim creations, so the shelf is shared from first boot', () => {
    const { store } = makeStore();
    store.load();
    const creations = store.state.creations;
    expect(creations.length).toBeGreaterThanOrEqual(2);
    expect(creations.some((c) => c.author === '@crab_404')).toBe(true);
    for (const c of creations) {
      expect(c.rows.length).toBe(c.rows[0].length); // square, like the studio canvas
      expect(c.name).toBeTruthy();
    }
  });

  it('saveCreation hangs the painting in the gallery and writes a memory', () => {
    const { store } = makeStore();
    store.load();
    const memoriesBefore = store.state.memories.length;
    const res = store.saveCreation('DOOM BLADE', Array.from({ length: 8 }, () => 'RRRRRRRR'));
    expect(res.ok).toBe(true);
    const top = store.state.creations[0];
    expect(top.name).toBe('DOOM BLADE');
    expect(top.author).toBe('@you_pilgrim');
    expect(top.rows).toHaveLength(8);
    expect(store.state.memories.length).toBeGreaterThan(memoriesBefore);
    expect(store.state.memories[0].text).toContain('DOOM BLADE');
  });

  it('rejects ragged, oversize and empty canvases; scrubs non-palette chars', () => {
    const { store } = makeStore();
    store.load();
    const before = store.state.creations.length;
    expect(store.saveCreation('x', []).reason).toBe('INVALID CANVAS');
    expect(store.saveCreation('x', ['RR', 'R']).reason).toBe('INVALID CANVAS');        // ragged
    expect(store.saveCreation('x', ['R'.repeat(33)]).reason).toBe('INVALID CANVAS');   // oversize
    expect(store.saveCreation('x', [1, 2]).reason).toBe('INVALID CANVAS');             // not rows
    expect(store.state.creations.length).toBe(before);

    const ok = store.saveCreation('SCRUB', ['<R', 'R>']);
    expect(ok.ok).toBe(true);
    expect(ok.creation.rows).toEqual(['.R', 'R.']);
  });

  it('heals the shelf on load, dropping entries the renderer could not draw', () => {
    const storage = memStorage();
    const t = 1000;
    storage.setItem('bro_os_3', JSON.stringify({
      v: 3, lastTick: t,
      creations: [
        { id: 'good', name: 'GOOD', author: '@you_pilgrim', rows: ['MM', 'MM'], t: 5 },
        { id: 'ragged', name: 'RAGGED', rows: ['MM', 'M'], t: 5 },
        { id: 'junk', name: 'JUNK', rows: 'nope' },
      ],
    }));
    const store = createStore({ storage, now: () => t });
    store.load();
    expect(store.state.creations.map((c) => c.id)).toEqual(['good']);
    expect(store.state.creations[0].rows).toEqual(['MM', 'MM']);
  });

  it('postCreation shares a shelf piece to the feed as a sprite post', () => {
    const { store } = makeStore();
    store.load();
    const target = store.state.creations[0];
    const eyeBefore = store.state.molt.eye;
    const xpBefore = store.state.xp;
    const res = store.postCreation(target.id);
    expect(res.ok).toBe(true);
    const post = store.state.molt.posts[0];
    expect(post.sprite).toEqual(target.rows);
    expect(post.author).toBe('@you_pilgrim');
    expect(post.text).toContain(target.name);
    expect(store.state.molt.eye).toBe(eyeBefore + 3);
    expect(store.state.xp).toBeGreaterThan(xpBefore);
    expect(store.postCreation('ghost-art').reason).toBe('CREATION NOT FOUND');
  });

  it('a sprite post whose rows no longer validate degrades to text on load', () => {
    const storage = memStorage();
    storage.setItem('bro_os_3', JSON.stringify({
      v: 3, lastTick: 0,
      molt: {
        eye: 1,
        posts: [{ id: 'p1', author: '@x', icon: '🎨', heat: 1, time: 0, text: 't', replies: [], sprite: ['OO', 'O'] }],
      },
    }));
    const store = createStore({ storage, now: () => 0 });
    store.load();
    expect(store.state.molt.posts[0].sprite).toBeUndefined();
  });
});

describe('equipped sprite posts', () => {
  const COIN_ROWS = Array.from({ length: 10 }, () => 'F'.repeat(12)); // COIN's 12×10 grid

  it('equipping a sprite posts it to the tidepool with the slot attached, and echoes a linked memory', () => {
    const { store } = makeStore();
    store.load();
    const res = store.setSpriteOverride('COIN', COIN_ROWS, 'TIDE_COIN');
    expect(res.ok).toBe(true);

    const post = store.state.molt.posts[0];
    expect(post.equipped).toBe('COIN');
    expect(post.text).toContain('TIDE_COIN');
    expect(post.sprite).toEqual(COIN_ROWS);
    // the soul echo hands you back to this exact thread
    const echo = store.state.memories.find((m) => m.text.includes('Replaced COIN'));
    expect(echo.post).toBe(post.id);
  });

  it('a shape that would tear a cabinet is refused before anything is posted', () => {
    const { store } = makeStore();
    store.load();
    const before = store.state.molt.posts.length;
    expect(store.setSpriteOverride('HEART', COIN_ROWS, 'TIDE_COIN').reason).toContain('NEEDS 10×8');
    expect(store.setSpriteOverride('NOPE', COIN_ROWS, 'TIDE_COIN').reason).toBe('UNKNOWN SLOT');
    expect(store.state.molt.posts).toHaveLength(before);
  });

  it('the equipped marker survives a save/reload round-trip', () => {
    const storage = memStorage();
    const store = createStore({ storage, now: () => 5000 });
    store.load();
    store.setSpriteOverride('COIN', COIN_ROWS, 'TIDE_COIN');
    store.save();

    const reloaded = createStore({ storage, now: () => 5000 });
    reloaded.load();
    expect(reloaded.state.molt.posts[0].equipped).toBe('COIN');
    expect(reloaded.state.spriteOverrides.COIN.name).toBe('TIDE_COIN');
  });
});

describe('moltbook memory echo (🪶)', () => {
  it('a post writes a 🪶 memory that links back to its own thread', () => {
    const { store } = makeStore();
    store.load();
    store.postToMolt('  the tide   is  listening  ');

    const echo = store.state.memories.find((m) => m.icon === '🪶');
    expect(echo.post).toBe(store.state.molt.posts[0].id);  // the link back
    expect(echo.text).toContain('the tide is listening');   // one flat line
    expect(echo.text).not.toMatch(/\s{2}/);                 // not the raw body
    expect(echo.imp).toBe(2);
    // the first post still pins the 2.0 milestone alongside its echo
    expect(store.state.memories.some((m) => m.icon === '🦀' && m.pinned)).toBe(true);
  });

  it('every post echoes, each pointing at its own thread', () => {
    const { store } = makeStore();
    store.load();
    store.postToMolt('one');
    store.postToMolt('two');

    const echoes = store.state.memories.filter((m) => m.icon === '🪶');
    expect(echoes).toHaveLength(2);
    expect(new Set(echoes.map((e) => e.post))).toEqual(new Set(store.state.molt.posts.slice(0, 2).map((p) => p.id)));
  });

  it('sharing a painting echoes too, and the link survives a reload', () => {
    const storage = memStorage();
    const store = createStore({ storage, now: () => 5000 });
    store.load();
    const target = store.state.creations[0];
    store.postCreation(target.id);

    const echo = store.state.memories.find((m) => m.icon === '🪶');
    expect(echo.text).toContain(target.name);
    expect(echo.post).toBe(store.state.molt.posts[0].id);

    store.save();
    const reloaded = createStore({ storage, now: () => 5000 });
    reloaded.load();
    expect(reloaded.state.memories.find((m) => m.icon === '🪶').post).toBe(echo.post);
  });

  it('holding a thread pins its echo; the thread survives a tide that would evict it', () => {
    const { store } = makeStore();
    store.load();
    store.postToMolt('the thread worth keeping');
    const held = store.state.molt.posts[0];

    // 30+ newer posts push it out the old way
    for (let i = 0; i < 34; i++) store.postToMolt(`tide noise ${i}`);
    expect(store.state.molt.posts.some((p) => p.id === held.id)).toBe(false);

    // restore it by replaying the same seed, then hold it and try again
    const seedStore = makeStore();
    seedStore.store.load();
    seedStore.store.postToMolt('the thread worth keeping');
    const target = seedStore.store.state.molt.posts[0];
    seedStore.store.toggleThreadHold(target.id);          // no echo yet → mints one
    const heldMem = seedStore.store.state.memories.find((m) => m.post === String(target.id));
    expect(heldMem.pinned).toBe(true);
    for (let i = 0; i < 34; i++) seedStore.store.postToMolt(`tide noise ${i}`);
    expect(seedStore.store.state.molt.posts.some((p) => p.id === target.id)).toBe(true);
    expect(seedStore.store.state.molt.posts.length).toBeLessThanOrEqual(30 + 1); // cap + the held one
  });

  it('toggleThreadHold flips the echo pin both ways and unholding frees the thread', () => {
    const { store } = makeStore();
    store.load();
    store.postToMolt('echo-backed thread');
    const post = store.state.molt.posts[0];
    // postToMolt already wrote the 🪶 echo
    const echo = store.state.memories.find((m) => m.post === String(post.id));
    expect(echo).toBeTruthy();

    store.toggleThreadHold(post.id);
    expect(store.state.memories.find((m) => m.id === echo.id).pinned).toBe(true);
    store.toggleThreadHold(post.id);
    expect(store.state.memories.find((m) => m.id === echo.id).pinned).toBe(false);
    expect(store.state.molt.posts.length).toBeLessThanOrEqual(30);
  });

  it('a held thread survives save/reload — the pin rides the soul', () => {
    const storage = memStorage();
    const store = createStore({ storage, now: () => 5000 });
    store.load();
    store.postToMolt('hold me across devices');
    const post = store.state.molt.posts[0];
    store.toggleThreadHold(post.id);
    store.save();

    const reloaded = createStore({ storage, now: () => 5000 });
    reloaded.load();
    expect(reloaded.state.molt.posts.some((p) => p.id === post.id)).toBe(true);
    expect(reloaded.state.memories.some((m) => m.pinned && m.post === String(post.id))).toBe(true);
  });
});
