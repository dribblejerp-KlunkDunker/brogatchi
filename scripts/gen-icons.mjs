// Generates the Bro OS PWA icons — zero dependencies, pure Node.
// Draws pixel-Ryan on a 24x24 grid, nearest-neighbor upscaled, navy background
// sized to stay inside the maskable safe zone (80%).
// Usage: node scripts/gen-icons.mjs   (writes public/icon-*.png)

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });

// ---- minimal PNG encoder (RGBA, 8-bit) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, get) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = get(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- art: pixel Ryan, 24x24, '.' = navy background ----
const NAVY = [15, 23, 42];
const HAIR = [31, 41, 55];
const SKIN = [252, 211, 77];
const EYE = [255, 255, 255];
const PUPIL = [17, 24, 39];
const SHIRT = [59, 130, 246];
const SHIRT_LINE = [29, 78, 216];

const G = 24; // art grid
const ART = [
  '........................',
  '........................',
  '........................',
  '......HHHHHHHHHHHH......',
  '.....HHHHHHHHHHHHHH.....',
  '.....HSSSSSSSSSSSSH.....',
  '.....HSSSSSSSSSSSSH.....',
  '.....HSSWKSSSKWSSSH.....',
  '.....HSSSSSSSSSSSSH.....',
  '.....HSSSMMSSMMSSSH.....',
  '.....HSSSSSSSSSSSSH.....',
  '.....HSSSSSSSSSSSSH.....',
  '.....HBBBBBBBBBBBBH.....',
  '.....HBBBBBBBBBBBBH.....',
  '.....HBBKBBBBBBKBBH.....',
  '.....HBBBBBBBBBBBBH.....',
  '.....HBBBBBBBBBBBBH.....',
  '.....HBBBBBBBBBBBBH.....',
  '.....HHHHHHHHHHHHHH.....',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];

const PAL = {
  H: HAIR,
  S: SKIN,
  W: EYE,
  K: PUPIL,
  B: SHIRT,
  M: SHIRT_LINE,
};

// nearest-neighbor sampling keeps the pixels crisp at any size
function render(size) {
  return png(size, (x, y) => {
    const gx = Math.floor((x * G) / size);
    const gy = Math.floor((y * G) / size);
    const ch = ART[gy][gx];
    const px = PAL[ch] || NAVY;
    return [px[0], px[1], px[2], ch === '.' ? 0 : 255];
  });
}

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-180.png', 180],
];

for (const [name, size] of targets) {
  writeFileSync(join(outDir, name), render(size));
  console.log(`wrote public/${name} (${size}x${size})`);
}