// @vitest-environment node
// Sprite bank validity: uniform grids, known palette tokens, no trailing hacks.
import { describe, it, expect } from 'vitest';
import * as S from '../src/games/sprites.js';

const NAMED = [
  'RYAN_RUN1', 'RYAN_RUN2', 'BRICK', 'QBLOCK', 'QBLOCK_EMPTY',
  'PIPE', 'RYAN_RPG', 'ZEKE_RPG', 'CHAD_RPG', 'DRONE_RPG', 'AGENT_RPG', 'HEART',
];

describe('sprite bank', () => {
  for (const name of NAMED) {
    it(`${name} has uniform rows and defined tokens`, () => {
      const spr = S[name];
      expect(spr).toBeTruthy();
      const w = spr.r[0].length;
      for (const row of spr.r) {
        expect(row.length, `${name} row width`).toBe(w);
        for (const ch of row) {
          if (ch === '.') continue;
          expect(spr.p[ch], `${name} unknown token ${JSON.stringify(ch)}`).toBeTruthy();
        }
      }
    });
  }

  for (const name of ['FLAPPY', 'REPTOID', 'COIN']) {
    it(`${name} frames are uniform`, () => {
      expect(Array.isArray(S[name])).toBe(true);
      for (const frame of S[name]) {
        expect(frame).toBeTruthy();
        const w = frame.r[0].length;
        for (const row of frame.r) {
          expect(row.length).toBe(w);
          for (const ch of row) {
            if (ch === '.') continue;
            expect(frame.p[ch]).toBeTruthy();
          }
        }
      }
    });
  }

  it('exported palettes do not collide with outline orange', () => {
    // Regression: a duplicate `O` key used to make every outline render orange.
    expect(S.X.O).not.toBe('#f97316');
    expect(S.X.o).toBe('#c2410c');
  });
});