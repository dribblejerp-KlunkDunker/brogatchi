# Sprite Overrides — Design Spec

**Date:** 2026-09-07
**Status:** Approved (brainstorming complete; pending implementation plan)
**Sub-project 1 of 4** in the creations program (1: sprite overrides → 2: Moltbook sprite gallery → 3: records panel → 4: diary tab).

## Motivation

PIXEL.STUDIO paints sprites in the games' native format (`spr(rows, X)` — uniform char rows keyed to the shared master palette `src/games/sprites.js`), but the creations are inert: they live in a localStorage draft and export files. Games still draw the bank art because they import named sprites (`RYAN_RUN1`, `COIN`, …) directly. This spec makes a saved creation *replace* any named bank sprite at runtime, so the player's art becomes the game's art.

## Goals

- Any of the 15 named bank sprites can be replaced by a painted creation.
- Overrides persist in the main save (survive reload; wiped by factory reset like the rest of the soul).
- Overrides apply at draw time — no game restart, no per-game plumbing.
- PIXEL.STUDIO is the single management surface (apply, reset).

## Non-Goals (YAGNI)

- Share/gallery format, author metadata, sprite ids (gallery is sub-project 2 and will design its own format; no migration is needed because overrides are keyed by bank name).
- Thumbnails or previews in the picker (the studio canvas already shows the art).
- Animation-frame pairing logic — `RYAN_RUN1`/`RYAN_RUN2` are independent slots.
- Mid-run override management UI (overrides *apply* mid-run; managing them is a studio activity).

## Architecture

### New module: `src/games/overrides.js`

The single resolution point for "which art is this sprite right now":

- `OVERRIDABLE` — map of the 15 overridable bank sprite names to `{ label, frames }`. `frames` is the bank sprite's shape kind: `1` for single `spr()` shapes, `2` for two-frame animation arrays (`COIN`, `FLAPPY`, `REPTOID`). Original dimensions vary per slot (8×10 … 20×16) and are read from the bank at runtime, not stored in the map.
- `getSprite(name)` — returns art in the bank sprite's own shape: a single `{ r, p }` for shape-1 sprites, or an array of `frames` copies of `{ r: rows, p: X }` for shape-2 sprites (a painted replacement animates as a static frame pair — visually valid, since `drawSprite` draws whatever rows it is handed). Returns the bank sprite unchanged when no valid override exists. A cheap object lookup; safe to call every frame.
- `initSpriteOverrides(store)` — called once from `main.js` at boot; the module holds the store reference so games never import the store directly. No import cycles: nothing in `state.js` imports from `games/`.

### Store: one new save field

`spriteOverrides: { COIN: { rows, name, t } }`

- Keyed by bank sprite name; value is `{ rows: string[], name, t }` — rows are `'.'`-transparent strings using master-palette chars (no palette needs storing), `name` is the creation's studio name (referenced by the apply memory; useful to the future gallery), `t` is an `apply` timestamp. Shape knowledge (frames) lives in `overrides.js`, not in the save.
- `setSpriteOverride(name, rows)` — validates the slot name against `OVERRIDABLE`, validates rows (uniform length, matching the original sprite's dimensions, chars ⊆ master palette ∪ `.`), writes via `mutate`.
- `resetSpriteOverride(name)` — deletes the entry.
- `normalizeSpriteOverrides()` — heals the save on load by silently dropping entries that fail validation, so a hand-edited save can never crash a game.

### Dimension rule

An override must match the original sprite's grid dimensions (`COIN` paints on 10×12, `RYAN_RUN1` on 20×16 — every slot has its own canvas). Games position sprites using their known sizes (e.g. `PLAYER_SIZE`, coin scale), so mismatched dimensions would tear layouts. The studio enforces this at the source (picking a slot resizes the canvas to that sprite's grid) and the store re-validates on apply. Games get no defensive code.

### Game wiring

Each game replaces direct bank-sprite references with `getSprite('<NAME>')` calls — one mechanical change per reference across `loot.js`, `flappy.js`, `mario.js`, `rpg.js` (`breaker.js` uses no sprites; `pixel.js` is the renderer and is untouched). Static `sprites.js` imports in games shrink to whatever remains unused (e.g. none or `X` only).

## UI: PIXEL.STUDIO target bar

A new row in the studio:

- **Slot dropdown** listing the 15 `OVERRIDABLE` names with display labels, grouped by game.
- Picking a slot **resizes the canvas** to that sprite's grid dimensions (the current in-progress painting is snapshotted into the draft as usual; switching slots loads that slot's current art — override if present, else the bank sprite's own rows — so you are always editing what the slot shows).
- **APPLY TO GAME** — writes the override through the store and records a 🎨 memory: `Replaced <slot> with "<name>".` (imp 3).
- **RESET SLOT** — restores bank art (log line only, no memory).

The existing draft autosave, JSON/PNG/source exports, and SAVE TO SOUL remain unchanged. This is an additive row, not a rework.

## Error handling

Concentrated in exactly two places:

1. **Store level** — `setSpriteOverride` rejects unknown slot names and invalid rows (as above). `normalizeSpriteOverrides` drops corrupt entries on every load.
2. **Resolver level** — `getSprite` falls back to the bank sprite on any doubt (missing entry, malformed shape). A game can never crash because of bad art.

The studio surfaces validation failures as inline status text (existing pattern); the store API returns `{ ok: false, reason }` like its siblings.

## Testing

- **Headless (resolver):** fallback when no override; override when set; bank fallback for malformed entries; `OVERRIDABLE` keys exactly match the bank exports (conformance via source read, mirroring the existing BGM conformance-test pattern).
- **Headless (store):** set/reset/normalize validation, dimension-rule rejection, memory written on apply, heal-on-load of corrupt saves.
- **UI (real shell, jsdom):** open ARCADE → studio → pick COIN → paint → APPLY → launch LOOT SHOWER → the live game instance's `getSprite('COIN')` returns the override; console clean throughout.
- All existing tests stay green; the payout suites act as regression nets for the changed game files.

## Sequence

Sub-project 1 of 4. The store key (`spriteOverrides`) and the `OVERRIDABLE` map are the seams sub-project 2 (Moltbook gallery) will build on; no format work for it happens here.
