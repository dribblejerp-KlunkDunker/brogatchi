import { describe, it, expect } from 'vitest';
import { createRedundancy, RKEYS } from '../src/persist.js';

function mem() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
const save = (obj) => JSON.stringify({ v: 3, lastTick: 0, ...obj });

describe('tiered memory redundancy', () => {
  it('restorePrimary recovers from the freshest mirror when primary is corrupt', () => {
    const local = mem(), session = mem();
    local.setItem(RKEYS.primary, '{corrupt');
    local.setItem(RKEYS.backup, save({ lastTick: 100, coins: 111 }));
    session.setItem(RKEYS.session, save({ lastTick: 200, coins: 222 }));
    const red = createRedundancy({ local, session, now: () => 0 });
    expect(red.restorePrimary()).toBe('session'); // freshest lastTick wins
    expect(JSON.parse(local.getItem(RKEYS.primary)).coins).toBe(222);
  });

  it('restorePrimary prefers backup when it is fresher than session', () => {
    const local = mem(), session = mem();
    local.setItem(RKEYS.backup, save({ lastTick: 900, coins: 9 }));
    session.setItem(RKEYS.session, save({ lastTick: 200, coins: 2 }));
    const red = createRedundancy({ local, session, now: () => 0 });
    expect(red.restorePrimary()).toBe('backup');
    expect(JSON.parse(local.getItem(RKEYS.primary)).coins).toBe(9);
  });

  it('restorePrimary does nothing when primary is healthy', () => {
    const local = mem();
    local.setItem(RKEYS.primary, save({ coins: 1 }));
    const red = createRedundancy({ local, session: mem(), now: () => 0 });
    expect(red.restorePrimary()).toBeNull();
  });

  it('sync mirrors to session instantly and writes backup on first sync', () => {
    const local = mem(), session = mem();
    local.setItem(RKEYS.primary, save({ lastTick: 5, coins: 7 }));
    const red = createRedundancy({ local, session, now: () => 0 });
    red.sync();
    expect(JSON.parse(session.getItem(RKEYS.session)).coins).toBe(7);
    expect(JSON.parse(local.getItem(RKEYS.backup)).coins).toBe(7);
    expect(red.status.session).toBe(true);
    expect(red.status.idb).toBe(false); // no indexedDB in jsdom → tier off, no crash
  });

  it('backup tier is throttled (≥10 s) unless forced', () => {
    const local = mem();
    local.setItem(RKEYS.primary, save({ lastTick: 1, coins: 1 }));
    let t = 0;
    const red = createRedundancy({ local, session: null, now: () => t });
    red.sync();
    local.setItem(RKEYS.primary, save({ lastTick: 2, coins: 2 }));
    t = 3000;
    red.sync();
    expect(JSON.parse(local.getItem(RKEYS.backup)).coins).toBe(1); // throttled
    t = 11000;
    red.sync();
    expect(JSON.parse(local.getItem(RKEYS.backup)).coins).toBe(2); // window passed
    local.setItem(RKEYS.primary, save({ lastTick: 3, coins: 3 }));
    red.sync(true);
    expect(JSON.parse(local.getItem(RKEYS.backup)).coins).toBe(3); // force bypasses
  });

  it('sync is a no-op without a primary (nothing to mirror)', () => {
    const local = mem(), session = mem();
    const red = createRedundancy({ local, session, now: () => 0 });
    red.sync();
    expect(session.getItem(RKEYS.session)).toBeNull();
  });
});
