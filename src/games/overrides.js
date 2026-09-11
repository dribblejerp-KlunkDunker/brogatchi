// ═══════════════════════════════════════════════════════════════
// BRO_OS 3.0 // src/games/overrides.js — SPRITE OVERRIDES
// A PIXEL.STUDIO painting can replace any named bank sprite. This is
// the ONE resolution point: games call getSprite(name) at draw time and
// get the player's art or the bank's, in the same shape (a single
// { r, p } or an N-frame array). Overrides apply mid-run — no restart —
// and every doubt falls back to the bank, so bad art can never crash a
// cabinet.
// ═══════════════════════════════════════════════════════════════

import * as BANK from './sprites.js';
import { X } from './sprites.js';

// The 15 named bank sprites a painting may replace. `game` groups the
// studio's picker; a couple of slots (RYAN_RUN*, COIN, PIPE) are drawn
// by more than one cabinet, which is why painting one is felt twice.
export const OVERRIDABLE = {
  RYAN_RUN1: { game: 'SUPER BRO LAND', label: 'RYAN RUN 1' },
  RYAN_RUN2: { game: 'SUPER BRO LAND', label: 'RYAN RUN 2' },
  REPTOID: { game: 'SUPER BRO LAND', label: 'REPTOID AGENT' },
  QBLOCK: { game: 'SUPER BRO LAND', label: '? BLOCK' },
  QBLOCK_EMPTY: { game: 'SUPER BRO LAND', label: '? BLOCK (SPENT)' },
  BRICK: { game: 'SUPER BRO LAND', label: 'BRICK' },
  PIPE: { game: 'SUPER BRO LAND', label: 'PIPE' },
  COIN: { game: 'LOOT SHOWER', label: 'COIN' },
  FLAPPY: { game: 'FLAPPY BRO', label: 'MINI RYAN' },
  RYAN_RPG: { game: 'FINAL BRO-TASY', label: 'RYAN' },
  ZEKE_RPG: { game: 'FINAL BRO-TASY', label: 'ZEKE' },
  CHAD_RPG: { game: 'FINAL BRO-TASY', label: 'CHAD' },
  DRONE_RPG: { game: 'FINAL BRO-TASY', label: 'FED DRONE' },
  AGENT_RPG: { game: 'FINAL BRO-TASY', label: 'AGENT 01' },
  HEART: { game: 'HUD', label: 'HEART' },
};

let storeRef = null;

/** Called once at boot: the resolver reads overrides straight off the save. */
export function initSpriteOverrides(store) {
  storeRef = store;
}

const bankArt = (name) => BANK[name];
const framesOf = (name) => (Array.isArray(bankArt(name)) ? bankArt(name).length : 1);

/** The bank art's own rows — the grid a painting for this slot must fill. */
export function bankRows(name) {
  const art = bankArt(name);
  return Array.isArray(art) ? art[0].r : art?.r ?? null;
}

/** The slot's native grid: a painting must match it exactly or the game tears. */
export function slotSize(name) {
  const rows = bankRows(name);
  return rows ? { w: rows[0].length, h: rows.length, frames: framesOf(name) } : null;
}

/** null when `rows` can fill `slot`, else a human reason for the studio to show. */
export function overrideProblem(slot, rows) {
  if (!OVERRIDABLE[slot]) return 'UNKNOWN SLOT';
  if (!Array.isArray(rows) || !rows.length) return 'EMPTY CANVAS';
  const { w, h } = slotSize(slot);
  if (rows.length !== h || rows.some((r) => typeof r !== 'string' || r.length !== w)) {
    return `NEEDS ${w}×${h}`;
  }
  return null;
}

/** The art for `name` right now — the override in the bank's own shape, or the bank. */
export function getSprite(name) {
  const bank = bankArt(name);
  const rows = storeRef?.state?.spriteOverrides?.[name]?.rows;
  if (!bank || !Array.isArray(rows) || !rows.length || overrideProblem(name, rows)) return bank;
  if (framesOf(name) === 1) return { r: rows, p: X };
  // A painted replacement animates as a static frame pair — drawSprite
  // renders whatever rows it is handed.
  return Array.from({ length: framesOf(name) }, () => ({ r: rows, p: X }));
}
