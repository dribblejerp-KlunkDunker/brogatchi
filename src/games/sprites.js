// The pixel-art bank — Bro OS edition.
// Shared 8-bit conventions: near-black outlines, top-left highlight,
// bottom-right shade, 2-3 tones per material, consistent palette tokens.
// drawSprite() looks up row chars in `X`; '.' = transparent.
// Every sprite is a uniform grid — tests enforce equal row widths.

export function spr(rows, palette) {
  return { r: rows, p: palette };
}

// ---- master palette (every sprite uses these tokens) ----
// NOTE: keys must be unique — the last definition wins.
export const X = {
  // outline & ink
  O: '#0a0a12',
  K: '#111827',
  k: '#1f2937',
  // whites / grays
  W: '#ffffff',
  w: '#e2e8f0',
  N: '#94a3b8',
  n: '#64748b',
  Z: '#cbd5e1',
  // skin
  S: '#fcd34d',
  s: '#f0b429',
  Y: '#fde68a',
  // hair / dark cloth
  H: '#1f2937',
  // blues
  B: '#3b82f6',
  b: '#1d4ed8',
  C: '#93c5fd',
  // reds
  R: '#ef4444',
  r: '#b91c1c',
  a: '#fca5a5',
  // oranges / brick
  o: '#c2410c',
  // golds
  G: '#eab308',
  g: '#a16207',
  Q: '#fde047',
  // greens
  M: '#22c55e',
  m: '#16803d',
  E: '#86efac',
  // purples
  P: '#a855f7',
  p: '#7e22ce',
  U: '#d8b4fe',
  // cyans
  V: '#38bdf8',
  v: '#0284c7',
  // browns
  D: '#78350f',
  d: '#451a03',
  // pinks
  F: '#f472b6',
};

// ============================================================
// FLAPPY BRO — mini Ryan, 16x18, 2 wing frames
// ============================================================
export const FLAPPY = [
  spr([
    '..OOOOOOOOOOOO..',
    '.OHHHHHHHHHHHO..',
    '.OHSSSSSSSSSSO..',
    '.OHSSSSSSSSSSO..',
    '.OSBBBBBBBBBBO..',
    '.OSBBBBBBBBBBO..',
    '.OSBBBBBBBBBBOO.',
    '.OSBBBBWWKKBBOO.',
    '.OSBBWBWWKBBBBO.',
    '.OSSBBBSKSBBSSO.',
    '.OSSSSSSSSSSSO..',
    '..OSSSSSSSSSSO..',
    '..OSSSSSSSSSSO..',
    '..OSSWWWWWSSS...',
    '..OSsSSsSSSS....',
    '..OSsSSSSSS.....',
    '...OSSSSSSO.....',
    '....OOOOOO......',
  ], X),
  spr([
    '..OOOOOOOOOOOO..',
    '.OHHHHHHHHHHHO..',
    '.OHSSSSSSSSSHO..',
    '.OHSSSSSSSSSSO..',
    '.OSBBBBBBBBBBO..',
    '.OSBBBBBBBBBBO..',
    '.OSBBBBBBBBBBOO.',
    '.OSBBBBWWBBBBOO.',
    '.OSBBWBWWKBBBBO.',
    '.OSSBBSKSBBSBO..',
    '.OSSSSSSSSSSSO..',
    '..OSSSSSSSSSSO..',
    '..OSSSSSSSSSSO..',
    '..OSSWWWWSSSS...',
    '..OSsSSsSSSS....',
    '...OSsSSSSS.....',
    '....OSSSSSO.....',
    '.....OOOO.......',
  ], X),
];

// ============================================================
// SUPER BRO LAND — Ryan platformer dude, 16x20 (run frames)
// ============================================================
export const RYAN_RUN1 = spr([
  '...OOOOOOOOO....',
  '..OHHHHHHHHHO...',
  '.OHHHHHHHHHHHO..',
  '.OHSSSSSSSSSHO..',
  '.OHSSSSSSSSSSO..',
  '.OSKBBBBBBBBSS..',
  '.OSKBBBBBBBBSS..',
  '.OSBBBBBBBBBBSS.',
  '.OSBBBBBBBBBBSS.',
  '.OSKKKKKKKKSS...',
  '.OSSSSSSSSSS....',
  '..OSSSSSSSS.....',
  '..OSSSSSSSS.....',
  '..OSSSSSSSS.....',
  '..OSSWWWWSSS....',
  '...OSSSSSSS.....',
  '...OSsSSSS......',
  '....OSsSS.......',
  '....OSSS........',
  '.....OO.........',
], X);

export const RYAN_RUN2 = spr([
  '...OOOOOOOOO....',
  '..OHHHHHHHHHO...',
  '.OHHHHHHHHHHHO..',
  '.OHSSSSSSSSSHO..',
  '.OHSSSSSSSSSSO..',
  '.OSKBBBBBBBBSS..',
  '.OSKBBBBBBBBSS..',
  '.OSBBBBBBBBBBSS.',
  '.OSBBBBBBBBBBSS.',
  '.OSKKKKKKKKSS...',
  '.OSSSSSSSSSS....',
  '..OSSSSSSSS.....',
  '..OSSSSSSSS.....',
  '..OSSSSSSSS.....',
  '..OSSWWWSSSS....',
  '.OSSSWWSSSSS....',
  '.OSsSSsSSS......',
  '..OSsSSSS.......',
  '...OSSSS........',
  '....OOO.........',
], X);

// ============================================================
// REPTOID — the Man-in-Black reptile agent (2 walk frames, 16x14)
// ============================================================
export const REPTOID = [
  spr([
    '..OOOOOOOOOOO..',
    '.OOGGGGGGGGO...',
    '.OOGGGGGGGGGO..',
    '.OGKKKKKKKKGO..',
    'OGGKKRRRRKKGO..',
    'OGGKRRRRRRKGO..',
    'OGGKKKKKKKKGO..',
    'OGKRRRRRRRRKO..',
    '.OGKKRRRRKKG...',
    '.OOBBBBBBBGO...',
    'O.OBBBBBBBBO...',
    '.OBBBBBBBBBB...',
    '.OBBOWWBBBBO...',
    '..OBBBBBBBB....',
    '...OOO.OOO.....',
  ], X),
  spr([
    '..OOOOOOOOOOO...',
    '.OOGGGGGGGGO....',
    '.OOGGGGGGGGO....',
    '.OGKKKKKKKKO....',
    '.OGKKRRRRKKO....',
    'OGGKKRRRRKGO....',
    'OGGKKKKKKKGO....',
    '.OGBBBBBBBGO....',
    '.OBBBBBBBBBBO...',
    '..OBBBBBBBBBO...',
    '..OBWBBBWBBB....',
    '..OBBBBBBBBB....',
    '...OBBBBBBBB....',
    '....OOO.OOO.....',
  ], X),
];

// ============================================================
// COIN — 2-frame spin with sparkle, 12x11
// ============================================================
export const COIN = [
  spr([
    '...QQQQQQ...',
    '..QQQQQQQQ..',
    '.QQQQQQQQQQ.',
    '.QQYYYYYYQQ.',
    '.QQYYGGYYQQ.',
    '.QQYYYYYYQQ.',
    '.QQYYYYYYQQ.',
    '.QQQQQQQQQQ.',
    '..QQQQQQQQ..',
    '...QQQQQQ...',
  ], X),
  spr([
    '...........',
    '..QQQQQQQ..',
    '.QQQQQQQQQ.',
    '.QQYQQQYQQ.',
    '.QQYYQYYQQ.',
    '..QQYYYQQ..',
    '..QQYYYQQ..',
    '.QQYYQYYQQ.',
    '.QQYQQQYQQ.',
    '.QQQQQQQQQ.',
    '..QQQQQQQ..',
  ], X),
];

// ============================================================
// BLOCKS — 16x16, shaded & outlined
// ============================================================
export const BRICK = spr([
  'OOOOOOOOOOOOOOOO',
  'OKRRRRRRRRRRRRKO',
  'OKRRRRRRRRRRRRKO',
  'ORKRRRRRRRRRRKRO',
  'ORKRRRRRRRRRRKRO',
  'OKKKRRRRRRRRRRKO',
  'ORKRRRRRRRRRRKRO',
  'ORKRRRRRRRRRRKRO',
  'OOOOOOOOOOOOOOOO',
  'OKKKKKKKKKKKKKKO',
  'ORKKKKKKKKKKKKRO',
  'ORKKKKKKKKKKKKRO',
  'ORKKKKKKKKKKKKRO',
  'ORKKKKKKKKKKKKRO',
  'OKKKKKKKKKKKKKKO',
  'OOOOOOOOOOOOOOOO',
], X);

export const QBLOCK = spr([
  'OQQQQQQQQQQQQQO',
  'QYYYYYYYYYYYYYQ',
  'QYYggYYYYYYggYQ',
  'QYYYYYYYYYYYYYQ',
  'QYYYYYgYYYYYYYQ',
  'QYYYYYgYYYYYYYQ',
  'QYYYYYgYYYYYYYQ',
  'QYYggGGGGggYYYQ',
  'QYYgGGGGGGgYYYQ',
  'QYYYGGGGGGYYY.Q',
  'QYYYGGGGGGYYY.Q',
  'QYYYYYggYYYYYYQ',
  'QYYYYYggYYYYYYQ',
  'QYYYYYYYYYYYYYQ',
  'QYYYYYYYYYYYYYQ',
  'OQQQQQQQQQQQQQO',
], X);

export const QBLOCK_EMPTY = spr([
  'ONNNNNNNNNNNNNNO',
  'NNNNNNNNNNNNNNNN',
  'NNNNnNNNNNNNNNNN',
  'NNNNNNNNNNnNNNNN',
  'NNnNNNNNNNNNNNNN',
  'NNNNNNNNNNNNNNNN',
  'NNNNnNNNNNNnNNNN',
  'NNNNNNNNNNNNNNNN',
  'NNNNNNNnNNNNNNNN',
  'NNNNNNNNNNNNNNNN',
  'NNnNNNNNNNNNNNNN',
  'NNNNNNNNnNNNNNNN',
  'NNNNNNNNNNNNNNNN',
  'NNNNnNNNNNNNNNNN',
  'NNNNNNNNNNNNNNNN',
  'ONNNNNNNNNNNNNNO',
], X);

// ============================================================
// PIPE BODY — 16x16 tile, tiles vertically/horizontally
// ============================================================
export const PIPE = spr([
  'OEMMMMMMMMMMMMo',
  'OEMMMMMMmmMMMMo',
  'OEMMMMMMMMMMMMo',
  'OEMMMMMMMMMMMMo',
  'OEMMmMMMMMMMMMo',
  'OEMMMMMMMMMMMMo',
  'OEMMMMMMMmmMMMo',
  'OEMMMMMMMMMMMMo',
  'OEMMMMMMMMMMMMo',
  'OEMMmMMMMMMMMMo',
  'OEMMMMMMMMMMMMo',
  'OEMMMMMMMMMMMMo',
  'OEmmmmmmmmmmmmo',
  'OEmmmmmmmmmmmmo',
  'OEmmmmmmmmmmmmo',
  'OmooooooooooooO',
], X);

// ============================================================
// FINAL BRO-TASY — party, 16x16 with flair
// ============================================================
export const RYAN_RPG = spr([
  '....OOOOOOOO....',
  '...OOOHHHHHHOOO.',
  '...OHSSSSSSSHOO.',
  '...OHSSSSSSSSO..',
  '...OHSSKBBBBSS..',
  '...OSSKBBBBBS...',
  '..OSSKBBBBBBSS..',
  '..OSBBBBBBBBSS..',
  '..OSBBBBBBBBSS..',
  '..OSBBBBBBBBSS..',
  '..OSKKKKKKKKSS..',
  '..OSSSSSSSSSSS..',
  '..OSSSSSSSSSSS..',
  '..OSSSWWWWSSS...',
  '..OSsSSsSSSSS...',
  '..OOSSSSSSOO....',
  '...OSSSSSSO.....',
  '...OOOOOOOO.....',
], X);

export const ZEKE_RPG = spr([
  '....OOOOOOOO....',
  '...OOOPPPPPPO...',
  '..OPPPPPPPPPOO..',
  '..OPKKKKKKKKPO..',
  '..OPKVVVVVVKPO..',
  '..OPKVVVVVVKPO..',
  '..OPKKVVVVKKPO..',
  '..OPKKKKKKKKPO..',
  '..OPPPPPPPPPO...',
  '..OPPPPPPPPPPO..',
  '..OPPPPPPPPPPO..',
  '..OPPPPPPPPPPO..',
  '..OPPPPPPPPPO...',
  '..OKKKKKKKKKO...',
  '..OKWKKKWWKK....',
  '..OOO.KK.OOO....',
], X);

export const CHAD_RPG = spr([
  '....OOOOOOO.....',
  '...OOYYYYYYO....',
  '..OYYYYYYYYYO...',
  '..OYYWWWWYYYO...',
  '..OYYWWWWWWYO...',
  '..OYYWWWWWWYO...',
  '..OYYWWWWYYYO...',
  '..OYSSSSSSYOO...',
  '..OYYYYYYYYO....',
  '.OOOOOOOOOOO....',
  '.OODDDDDDDDO....',
  '.OODWDWWWDDDO...',
  '.OODDDDDDDDO....',
  '.OODDDDDDDDO....',
  '..OSSDDSKSDD....',
  '..OOOSSSOSOO....',
  '...OO...OO......',
], X);

export const DRONE_RPG = spr([
  '..OOOOOOOOOOO...',
  '.OOCCCCCCCCCOO..',
  '.OCCKCCCCCCCOO..',
  '.OCCKRRRRRCCCO..',
  'OCCKKRRRRRRCCCO.',
  'OCCKKRRRRRRCCCO.',
  'OCCKCCCCCCCCCO..',
  '.OCCCCCCCCCCCO..',
  '.OOCCCCCCCCCO...',
  '..OCCCCCCCCCO...',
  '..OCCKCCCKCOO...',
  '..OCCCKCCCCOO...',
  '..OCCCCCCCCCO...',
  '..OOOOOOOOOOO...',
  '...OOO...OOO....',
  '....O.....O.....',
], X);

export const AGENT_RPG = spr([
  '....OOOOOO..O...',
  '..OOGGGGGGOOO...',
  '.OOGKKKKKKGO....',
  '.OGKKRRRRKKGO...',
  '.OGKRRRRRRKGO...',
  '.OGKKKKKKKKGO...',
  '.OGKKKKKKKKGO...',
  '.OOKKKKKKKOO....',
  '..OOBBBBBBOOO...',
  'OBBBBBBBBBBBBO..',
  'OBBRRBBBBBRBBO..',
  '.OBBBBWBBBB.BO..',
  '.OBB.WBBB.BBBO..',
  '..OBB..BB..BBO..',
  '..OOO..OO..OO...',
  '...OO..OO..OO...',
], X);

// ============================================================
// HEART (HUD / pickups) 10x8
// ============================================================
export const HEART = spr([
  '.RRO..RRO.',
  'RRRRRRRRRR',
  'RRRRRRRRRR',
  'RROOOROOOR',
  '.RROOORRO.',
  '..ROOOOR..',
  '...RORR...',
  '...O..O...',
], X);