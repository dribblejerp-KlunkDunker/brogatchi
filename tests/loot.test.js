// @vitest-environment jsdom
// Unit tests for Loot Shower mechanics: movement, coin catch, combo
// multiplier, bomb damage, missed coins, and difficulty ramp.

import { describe, it, expect } from 'vitest';
import { LootGame } from '../src/games/loot.js';
import { VIEW_W, VIEW_H } from '../src/games/GameBase.js';

// Player catch zone spans PLAYER_Y..PLAYER_Y+40 (538..578); items fall from
// above at ~300 u/s (5 u/frame), so a spawn at y=515 is caught within 1-2 frames.
const CATCH_READY_Y = 515;

function makeGame() {
  const ctx = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
        return typeof prop === 'string' && /^fill|stroke|begin|arc|rect|save|restore|clear|translate|scale|rotate|lineTo|moveTo|ellipse|textBaseline|textAlign$/.test(prop)
          ? () => {}
          : undefined;
      },
    }
  );
  const cvs = { getContext: () => ctx, width: VIEW_W, height: VIEW_H };
  const app = {
    audio: { playCoin() {}, playHit() {}, setVariant() {} },
    onGameOver() {},
  };
  const game = new LootGame(app, cvs);
  game.setup();
  return game;
}

describe('LootGame.setup', () => {
  it('starts centered with three lives and no items', () => {
    const g = makeGame();
    expect(g.lives).toBe(3);
    expect(g.items.length).toBe(0);
    expect(g.px).toBeCloseTo(VIEW_W / 2 - 16);
    expect(g.score).toBe(0);
  });
});

describe('LootGame movement', () => {
  it('moves right while the right key is held', () => {
    const g = makeGame();
    g.keys.right = true;
    g.update(1 / 60);
    const moved = g.px;
    g.update(1 / 60);
    expect(g.px).toBeGreaterThan(moved);
  });

  it('clamps to the play field', () => {
    const g = makeGame();
    g.px = -500;
    g.vx = -1000;
    g.update(1 / 60);
    expect(g.px).toBeGreaterThanOrEqual(0);
    g.px = 10000;
    g.update(1 / 60);
    expect(g.px).toBeLessThanOrEqual(VIEW_W - 32);
  });

  it('glides toward the pointer', () => {
    const g = makeGame();
    g.px = 30;
    g.onPointer(370);
    g.update(1 / 60);
    g.update(1 / 60);
    expect(g.px).toBeGreaterThan(30);
  });
});

describe('LootGame catching', () => {
  it('catches a coin and scores', () => {
    const g = makeGame();
    g.items.push({ x: g.px, y: CATCH_READY_Y, vy: 300, bomb: false, w: 24, h: 22 });
    g.update(1 / 60);
    g.update(1 / 60);
    expect(g.score).toBe(1);
    expect(g.items.length).toBe(0);
    expect(g.combo).toBe(1);
  });

  it('builds a combo multiplier on consecutive catches', () => {
    const g = makeGame();
    const coin = () => ({ x: g.px, y: CATCH_READY_Y, vy: 300, bomb: false, w: 24, h: 22 });
    for (let i = 0; i < 8; i++) {
      g.items.push(coin());
      g.update(1 / 60);
      g.update(1 / 60);
    }
    // Combo 1-3 -> x1, 4-7 -> x2, 8 -> x3: 1+1+1+2+2+2+2+3 = 14
    expect(g.score).toBe(14);
    expect(g.combo).toBe(8);
    expect(g.bestCombo).toBe(8);
  });

  it('a bomb costs a life and resets the combo', () => {
    const g = makeGame();
    g.combo = 6;
    g.items.push({ x: g.px, y: CATCH_READY_Y, vy: 300, bomb: true, w: 28, h: 28 });
    g.update(1 / 60);
    g.update(1 / 60);
    expect(g.lives).toBe(2);
    expect(g.combo).toBe(0);
  });

  it('a missed coin resets the combo', () => {
    const g = makeGame();
    g.combo = 5;
    g.items.push({ x: 40, y: VIEW_H, vy: 50, bomb: false, w: 24, h: 22 });
    g.update(1 / 60);
    expect(g.combo).toBe(0);
  });
});

describe('LootGame ramp', () => {
  it('spawns items on a fast interval at t=0 and ramps down over time', () => {
    const early = makeGame();
    early.spawnTimer = 0;
    early.update(1 / 60);
    expect(early.spawnTimer).toBeGreaterThan(0.7); // ~1.15s interval at t=0

    const late = makeGame();
    late.time = 75;
    late.spawnTimer = 0;
    late.update(1 / 60);
    expect(late.spawnTimer).toBeLessThan(0.6); // ramped to the 0.45s floor
  });
});