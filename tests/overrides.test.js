// Sprite overrides — a PIXEL.STUDIO painting replaces a named bank sprite.
// Covers the resolver's shape contract and fallback, the store's
// validation/heal contract, conformance against the bank and the game
// sources, and the store ↔ resolver handoff that makes art appear in play.

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as BANK from '../src/games/sprites.js';
import {
  OVERRIDABLE, getSprite, initSpriteOverrides, slotSize, overrideProblem, bankRows,
} from '../src/games/overrides.js';
import { createStore } from '../src/state.js';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function makeStore(now = 1000) {
  const store = createStore({ storage: memStorage(), now: () => now });
  store.load();
  return store;
}

/** A blank painting that fills `slot`'s grid exactly. */
function paint(slot, ch = 'O') {
  return bankRows(slot).map((r) => ch.repeat(r.length));
}

afterEach(() => { initSpriteOverrides(null); });

describe('sprite override resolver', () => {
  it('conformance: OVERRIDABLE is exactly the bank sprite set', () => {
    const bankSprites = Object.keys(BANK).filter((k) => k !== 'spr' && k !== 'X');
    expect(Object.keys(OVERRIDABLE).sort()).toEqual(bankSprites.sort());
    expect(bankSprites).toHaveLength(15);
  });

  it('conformance: every getSprite(slot) a cabinet asks for is overridable', () => {
    const root = resolve(import.meta.dirname, '..');
    let seen = 0;
    for (const game of ['flappy', 'loot', 'mario', 'rpg']) {
      const file = resolve(root, 'src', 'games', `${game}.js`);
      const text = readFileSync(file, 'utf8');
      for (const call of text.matchAll(/getSprite\(([^)]*)\)/g)) {
        for (const lit of call[1].matchAll(/'([A-Z0-9_]+)'/g)) {
          expect(OVERRIDABLE[lit[1]], `${game}.js asks for unknown slot ${lit[1]}`).toBeTruthy();
          seen++;
        }
      }
    }
    expect(seen).toBeGreaterThanOrEqual(8);
  });

  it('returns the bank art unchanged while nothing is overridden', () => {
    expect(getSprite('COIN')).toBe(BANK.COIN);
    expect(getSprite('RYAN_RUN1')).toBe(BANK.RYAN_RUN1);
    expect(getSprite('NOT_A_SLOT')).toBeUndefined();
  });

  it('serves an override in the bank sprite\'s own shape', () => {
    const single = paint('RYAN_RUN1', 'R');
    const frames = paint('COIN', 'G');
    initSpriteOverrides({ state: { spriteOverrides: { RYAN_RUN1: { rows: single }, COIN: { rows: frames } } } });

    const art = getSprite('RYAN_RUN1');
    expect(art.r).toEqual(single);
    expect(art.p).toBe(BANK.X);

    // a 2-frame sprite keeps its frame count — the replacement animates static
    const coin = getSprite('COIN');
    expect(Array.isArray(coin)).toBe(true);
    expect(coin).toHaveLength(BANK.COIN.length);
    expect(coin.every((f) => f.r === frames)).toBe(true);
  });

  it('falls back to the bank art when the override is malformed or the wrong size', () => {
    const short = ['OO', 'OO'];
    initSpriteOverrides({ state: { spriteOverrides: {
      COIN: { rows: short },                                    // wrong dimensions
      PIPE: { rows: paint('PIPE') },                            // fine
      BRICK: { rows: null },
      NOPE: { rows: ['OO'] },
    } } });
    expect(getSprite('COIN')).toBe(BANK.COIN);
    expect(getSprite('BRICK')).toBe(BANK.BRICK);
    expect(getSprite('PIPE').r[0]).toHaveLength(slotSize('PIPE').w);
  });

  it('reports the exact grid a slot needs', () => {
    const { w, h } = slotSize('RYAN_RUN1');
    expect(overrideProblem('RYAN_RUN1', paint('RYAN_RUN1'))).toBeNull();
    expect(overrideProblem('RYAN_RUN1', ['OO'])).toBe(`NEEDS ${w}×${h}`);
    expect(overrideProblem('RYAN_RUN1', [])).toBe('EMPTY CANVAS');
    expect(overrideProblem('GHOST', paint('RYAN_RUN1'))).toBe('UNKNOWN SLOT');
  });
});

describe('sprite override store', () => {
  it('binds a painting to its slot, remembers it, and feeds the resolver', () => {
    const store = makeStore();
    const rows = paint('RYAN_RUN1', 'R');
    const res = store.setSpriteOverride('RYAN_RUN1', rows, 'DOOM RUNNER');
    expect(res.ok).toBe(true);
    expect(store.state.spriteOverrides.RYAN_RUN1.rows).toEqual(rows);
    expect(store.state.spriteOverrides.RYAN_RUN1.name).toBe('DOOM RUNNER');
    expect(store.state.memories[0].text).toContain('Replaced RYAN_RUN1 with "DOOM RUNNER".');

    initSpriteOverrides(store);
    expect(getSprite('RYAN_RUN1').r).toEqual(rows);   // what the cabinets now draw
    expect(getSprite('RYAN_RUN2')).toBe(BANK.RYAN_RUN2); // other slots untouched
  });

  it('rejects unknown slots, wrong-sized canvases and empty input', () => {
    const store = makeStore();
    expect(store.setSpriteOverride('GHOST', paint('RYAN_RUN1')).reason).toBe('UNKNOWN SLOT');
    expect(store.setSpriteOverride('COIN', ['OO', 'OO']).reason).toBe(`NEEDS ${slotSize('COIN').w}×${slotSize('COIN').h}`);
    expect(store.setSpriteOverride('COIN', ['G'.repeat(slotSize('COIN').w)]).reason).toBe(`NEEDS ${slotSize('COIN').w}×${slotSize('COIN').h}`);
    expect(store.setSpriteOverride('COIN', []).reason).toBe('EMPTY CANVAS');
    expect(store.state.spriteOverrides).toEqual({});
  });

  it('scrubs characters the palette cannot draw instead of storing them', () => {
    const store = makeStore();
    const rows = paint('COIN', '<');
    expect(store.setSpriteOverride('COIN', rows).ok).toBe(true);
    expect(store.state.spriteOverrides.COIN.rows[0]).toBe('.'.repeat(slotSize('COIN').w));
  });

  it('persists across a reload and hands the slot back on reset', () => {
    const storage = memStorage();
    const store = createStore({ storage, now: () => 1000 });
    store.load();
    const rows = paint('HEART', 'R');
    store.setSpriteOverride('HEART', rows, 'BRO HEART');

    const reloaded = createStore({ storage, now: () => 1000 });
    reloaded.load();
    expect(reloaded.state.spriteOverrides.HEART.rows).toEqual(rows);

    expect(reloaded.resetSpriteOverride('HEART').ok).toBe(true);
    expect(reloaded.state.spriteOverrides.HEART).toBeUndefined();
    expect(reloaded.resetSpriteOverride('HEART').reason).toBe('NO OVERRIDE');
    initSpriteOverrides(reloaded);
    expect(getSprite('HEART')).toBe(BANK.HEART);
  });

  it('drops overrides a hand-edited save got wrong, keeping the good ones', () => {
    const storage = memStorage();
    storage.setItem('bro_os_3', JSON.stringify({
      v: 3, lastTick: 0,
      spriteOverrides: {
        HEART: { rows: paint('HEART') },
        COIN: { rows: ['OO', 'OO'] },       // wrong dimensions for the slot
        GHOST: { rows: ['OO'] },            // not a slot at all
        BRICK: null,
      },
    }));
    const store = createStore({ storage, now: () => 0 });
    store.load();
    expect(Object.keys(store.state.spriteOverrides)).toEqual(['HEART']);
  });
});
