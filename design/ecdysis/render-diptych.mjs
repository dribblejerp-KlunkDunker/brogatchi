// ECDYSIS DIPTYCH — both plates mounted side by side on one night ground.
//
// Reads plate-001 (ecdysis.png, 8-bit RGB) and plate-002 (8-bit RGBA),
// decodes their filter-none IDAT streams (exactly what both generators
// write), composes them onto a single canvas with an outer margin and a
// breathing seam in the deep-night ground, and writes ecdysis-diptych.png.
//
//   node design/ecdysis/render-diptych.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const PLATE_1 = join(DIR, 'ecdysis.png');                    // 1600×2000, RGB
const PLATE_2 = join(DIR, 'plate-002-cross-section.png');    // 1600×2000, RGBA
const OUT = join(DIR, 'ecdysis-diptych.png');

// The deep-night ground (plate 2's), used for margins and seam.
const GROUND = [12, 11, 16];

// ─── filter-none PNG decode (the generators' exact dialect) ───
function decodeFilterNonePNG(path) {
  const b = readFileSync(path);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path}: not a PNG`);
  const w = b.readUInt32BE(16);
  const h = b.readUInt32BE(20);
  const depth = b[24];
  const ctype = b[25];
  if (depth !== 8 || (ctype !== 2 && ctype !== 6)) {
    throw new Error(`${path}: expected 8-bit RGB(2) or RGBA(6), got depth ${depth} ctype ${ctype}`);
  }
  const ch = ctype === 6 ? 4 : 3;
  const rowLen = w * ch;

  // concatenate IDAT payloads
  const idats = [];
  let off = 8;
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idats.push(b.subarray(off + 8, off + 8 + len));
    off += 12 + len;
    if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(idats));
  if (raw.length !== (rowLen + 1) * h) {
    throw new Error(`${path}: unexpected raw size ${raw.length} for ${w}x${h}x${ch}`);
  }

  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (rowLen + 1)];
    if (filter !== 0) throw new Error(`${path}: row ${y} uses filter ${filter}; decoder handles none(0) only`);
    const src = y * (rowLen + 1) + 1;
    const dst = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (ch === 4) {
        rgba[dst + x * 4] = raw[src + x * 4];
        rgba[dst + x * 4 + 1] = raw[src + x * 4 + 1];
        rgba[dst + x * 4 + 2] = raw[src + x * 4 + 2];
        rgba[dst + x * 4 + 3] = raw[src + x * 4 + 3];
      } else {
        rgba[dst + x * 4] = raw[src + x * 3];
        rgba[dst + x * 4 + 1] = raw[src + x * 3 + 1];
        rgba[dst + x * 4 + 2] = raw[src + x * 3 + 2];
        rgba[dst + x * 4 + 3] = 255;
      }
    }
  }
  return { w, h, rgba };
}

// ─── PNG encode (same dialect as the plate generators) ───
function crc32(buf) {
  let c = 0xFFFFFFFF;
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let v = i;
    for (let j = 0; j < 8; j++) v = (v & 1) ? (v >>> 1) ^ 0xEDB88320 : v >>> 1;
    t[i] = v;
  }
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const tbd = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tbd));
  return Buffer.concat([len, tbd, crc]);
}
function buildPNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = [];
  for (let y = 0; y < h; y++) {
    raw.push(0);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      raw.push(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
    }
  }
  const { deflateSync } = awaitImportZlib();
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(raw), { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// zlib is imported at module top; this shim exists only so buildPNG
// reads like the plate generators.
function awaitImportZlib() { return { deflateSync }; }

// ─── compose ───
const p1 = decodeFilterNonePNG(PLATE_1);
const p2 = decodeFilterNonePNG(PLATE_2);
if (p1.h !== p2.h) throw new Error(`plate heights differ: ${p1.h} vs ${p2.h}`);

const H = p1.h;
const MARGIN = 120;                       // outer night margin
const SEAM = 160;                         // the gap between plates — wide enough to breathe
const W = p1.w + p2.w + MARGIN * 2 + SEAM;

const out = Buffer.alloc(W * H * 4);
const put = (x, y, r, g, b, a = 255) => {
  const i = (y * W + x) * 4;
  // source-over blend so RGBA plates composite onto the night ground
  const al = a / 255;
  out[i] = Math.round(GROUND[0] * (1 - al) + r * al);
  out[i + 1] = Math.round(GROUND[1] * (1 - al) + g * al);
  out[i + 2] = Math.round(GROUND[2] * (1 - al) + b * al);
  out[i + 3] = 255;
};

// fill with the night ground
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, GROUND[0], GROUND[1], GROUND[2]);

// mount the plates
const x1 = MARGIN;
const x2 = MARGIN + p1.w + SEAM;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < p1.w; x++) {
    const i = (y * p1.w + x) * 4;
    put(x1 + x, y, p1.rgba[i], p1.rgba[i + 1], p1.rgba[i + 2], p1.rgba[i + 3]);
    const j = (y * p2.w + x) * 4;
    put(x2 + x, y, p2.rgba[j], p2.rgba[j + 1], p2.rgba[j + 2], p2.rgba[j + 3]);
  }
}

// the breathing seam: a vertical whisper of the warm mineral accent, brighter
// at neither end — a slow swell so the eye reads it as light in water, not a
// divider. Sine over the full height, ~14% peak alpha, ±3px soft edge.
const SEAM_X = MARGIN + p1.w + SEAM / 2;
const ACCENT = [214, 148, 92]; // the shell/rust amber both plates ration
for (let y = 0; y < H; y++) {
  const swell = 0.5 + 0.5 * Math.sin((y / H) * Math.PI * 2 - Math.PI / 2); // 0..1, gentle
  const alpha = 0.14 * (0.35 + 0.65 * swell);
  for (let dx = -3; dx <= 3; dx++) {
    const falloff = 1 - Math.abs(dx) / 4;
    const a = Math.round(255 * alpha * falloff);
    put(SEAM_X + dx, y, ACCENT[0], ACCENT[1], ACCENT[2], a);
  }
}

const png = buildPNG(W, H, out);
writeFileSync(OUT, png);
console.log(`wrote ${OUT} (${W}x${H}, ${png.length} bytes)`);
