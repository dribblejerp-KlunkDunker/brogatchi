#!/usr/bin/env node
// ECDYSIS PLATE 2 — Mushroom Cross-Section
// Pure Node.js PNG renderer (no native deps).
// Renders: concentric cap rings, radiating gills from stem, amber accent
// at the living edge, clinical drafting marks and figure labels.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const DIR = dirname(fileURLToPath(import.meta.url));

// ─── Canvas ──────────────────────────────────────────────
const W = 1600, H = 2000;
const px = new Uint8Array(W * H * 4); // RGBA, init to 0 = black

function set(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  if (a === 255) { px[i] = r; px[i+1] = g; px[i+2] = b; px[i+3] = 255; }
  else {
    const sa = a / 255, da = 1 - sa;
    px[i]   = Math.round(r * sa + px[i]   * da);
    px[i+1] = Math.round(g * sa + px[i+1] * da);
    px[i+2] = Math.round(b * sa + px[i+2] * da);
    px[i+3] = Math.min(255, px[i+3] + a);
  }
}

function line(x0, y0, x1, y1, r, g, b, w = 1) {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    const x = Math.round(x0 + dx * t), y = Math.round(y0 + dy * t);
    for (let ox = -Math.floor(w/2); ox <= Math.floor(w/2); ox++)
      for (let oy = -Math.floor(w/2); oy <= Math.floor(w/2); oy++)
        set(x + ox, y + oy, r, g, b);
  }
}

function circle(cx, cy, radius, r, g, b, strokeW = 1) {
  const circ = 2 * Math.PI * radius;
  const steps = Math.max(Math.ceil(circ * 3), 200);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const x = Math.round(cx + Math.cos(a) * radius);
    const y = Math.round(cy + Math.sin(a) * radius);
    for (let ox = -Math.floor(strokeW/2); ox <= Math.floor(strokeW/2); ox++)
      for (let oy = -Math.floor(strokeW/2); oy <= Math.floor(strokeW/2); oy++)
        set(x + ox, y + oy, r, g, b);
  }
}

function filledCircle(cx, cy, radius, r, g, b) {
  for (let y = Math.ceil(cy - radius); y <= Math.floor(cy + radius); y++) {
    for (let x = Math.ceil(cx - radius); x <= Math.floor(cx + radius); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2)
        set(x, y, r, g, b);
    }
  }
}

function filledEllipse(cx, cy, rx, ry, r, g, b) {
  for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
    for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1)
        set(x, y, r, g, b);
    }
  }
}

// ─── Palette ──────────────────────────────────────────────
const DARK   = [12, 11, 16];     // #0c0b10 — deep night ground
const COOL1  = [34, 33, 42];     // #22212a — cap body
const COOL2  = [48, 46, 58];     // #302e3a — lighter ring
const COOL3  = [62, 59, 74];     // #3e3b4a — gill tone
const GILL   = [28, 27, 36];     // #1c1b24 — gill shadow
const STEM   = [40, 38, 48];     // #282630 — stem
const LBL    = [80, 78, 96];     // #504e60 — figure labels
const WARM   = [196, 132, 52];  // #c48434 — amber accent (living edge)
const TEXT   = [140, 136, 160]; // #8c88a0 — subtle text

// ─── Plate background ─────────────────────────────────────
// Fill entire canvas with dark
for (let i = 0; i < px.length; i += 4) {
  px[i] = DARK[0]; px[i+1] = DARK[1]; px[i+2] = DARK[2]; px[i+3] = 255;
}

// ─── Concentric cap rings ─────────────────────────────────
const capCX = 800, capCY = 780;

// Outer cap silhouette — filled ellipse
filledEllipse(capCX, capCY, 620, 340, COOL1[0], COOL1[1], COOL1[2]);

// Inner rings (concentric growth)
const ringRadii = [590, 560, 520, 480, 430, 370, 310, 250];
const ringColors = [COOL1, COOL2, COOL3, COOL1, COOL2, COOL3, COOL1, COOL2];

for (let ri = 0; ri < ringRadii.length; ri++) {
  const cr = ringRadii[ri];
  const steps = Math.max(Math.ceil(2 * Math.PI * cr * 3), 400);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    // Cap is an ellipse: apply ry scaling
    const cx = Math.round(capCX + Math.cos(a) * 620);
    const cy = Math.round(capCY + Math.sin(a) * 340);
    const dx = cx - capCX, dy = (cy - capCY) * (620 / 340);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= cr - 2 && dist <= cr + 2) {
      const c = ringColors[ri];
      set(cx, cy, c[0], c[1], c[2]);
    }
  }
}

// Amber accent at the living edge (outer ring)
const accentSteps = 600;
for (let i = 0; i < accentSteps; i++) {
  const a = (i / accentSteps) * 2 * Math.PI;
  // Only the outer rim, tapering
  const frac = i / accentSteps;
  const arcLen = 0.15 + 0.1 * Math.sin(frac * Math.PI * 6); // jagged arc
  const startFrac = 0.15;
  const endFrac = startFrac + arcLen;
  if (frac < startFrac || frac > endFrac) continue;
  const taper = Math.sin(((frac - startFrac) / arcLen) * Math.PI);
  const rr = 605 + (1 - taper) * 20;
  const cx = Math.round(capCX + Math.cos(a) * rr);
  const cy = Math.round(capCY + Math.sin(a) * 340 * (rr / 620));
  const alpha = Math.round(80 + 175 * taper);
  set(cx, cy, WARM[0], WARM[1], WARM[2], alpha);
}

// ─── Stem ─────────────────────────────────────────────────
const stemW = 90, stemH = 560;
const stemTop = capCY + 120;
const stemBot = stemTop + stemH;
const stemX = capCX - stemW / 2;

// Stem body
filledEllipse(capCX, stemTop + stemH / 2, stemW / 2, stemH / 2, STEM[0], STEM[1], STEM[2]);
// Stem edge lines
circle(capCX, stemTop + stemH / 2, stemW / 2 - 2, COOL2[0], COOL2[1], COOL2[2], 2);
// Stem top (where cap attaches) — slight flare
filledEllipse(capCX, stemTop, stemW / 2 + 30, 20, COOL2[0], COOL2[1], COOL2[2]);
// Stem bottom (root flare)
filledEllipse(capCX, stemBot, stemW / 2 + 15, 25, COOL2[0], COOL2[1], COOL2[2]);
// Stem edge flare lines
circle(capCX, stemBot, stemW / 2 + 12, LBL[0], LBL[1], LBL[2], 1);

// ─── Gills (radiating from stem center down from cap) ─────
const gillCenter = { x: capCX, y: stemTop + 30 };
const gillCount = 48;
const gillStartR = 50;
const gillEndR = 280;

for (let gi = 0; gi < gillCount; gi++) {
  const angle = (gi / gillCount) * Math.PI - Math.PI / 2;
  // Only draw gills below the cap midpoint (bottom half)
  const x0 = Math.round(gillCenter.x + Math.cos(angle) * gillStartR);
  const y0 = Math.round(gillCenter.y + Math.sin(angle) * gillStartR);
  const x1 = Math.round(gillCenter.x + Math.cos(angle) * gillEndR);
  const y1 = Math.round(gillCenter.y + Math.sin(angle) * gillEndR);
  const w = (gi % 3 === 0) ? 2 : 1;
  line(x0, y0, x1, y1, GILL[0], GILL[1], GILL[2], w);
}

// ─── Annotation rings (fine dashed circles — scientific style) ─
const annRadii = [150, 320, 460];
for (const ar of annRadii) {
  const steps = 1200;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const cx = Math.round(capCX + Math.cos(a) * ar);
    const cy = Math.round(capCY + Math.sin(a) * (ar * 340 / 620));
    if ((i % 8) < 4) set(cx, cy, LBL[0], LBL[1], LBL[2]);
  }
}

// ─── Leader lines ─────────────────────────────────────────
// Leader to cap edge
line(800 + 620, 780, 1380, 650, LBL[0], LBL[1], LBL[2], 1);
set(1380, 650, LBL[0], LBL[1], LBL[2]);
set(1381, 650, LBL[0], LBL[1], LBL[2]);
set(1380, 651, LBL[0], LBL[1], LBL[2]);

// Leader to gill
line(900, 920, 1250, 950, LBL[0], LBL[1], LBL[2], 1);
set(1250, 950, LBL[0], LBL[1], LBL[2]);

// Leader to stem
line(capCX + stemW / 2, stemTop + stemH / 2, 1100, stemTop + stemH / 2 + 80, LBL[0], LBL[1], LBL[2], 1);

// Leader to amber accent
line(800 + 605, 780 - 20, 1300, 600, WARM[0], WARM[1], WARM[2], 1);

// ─── Figure labels (small, systematic, clinical) ──────────
function drawChar(ch, x, y, r, g2, b, scale = 1) {
  // Ultra-minimal bitmap font (8×8 at scale)
  const glyphs = {
    'C': [0x3c,0x66,0x60,0x60,0x60,0x66,0x3c,0x00],
    'A': [0x18,0x3c,0x66,0x7e,0x66,0x66,0x66,0x00],
    'P': [0x7c,0x66,0x66,0x7c,0x60,0x60,0x60,0x00],
    '.': [0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x00],
    ' ': [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],
    'i': [0x18,0x18,0x00,0x18,0x18,0x18,0x3c,0x00],
    'l': [0x18,0x18,0x18,0x18,0x18,0x18,0x3c,0x00],
    'g': [0x00,0x00,0x3c,0x66,0x66,0x3c,0x06,0x3c],
    's': [0x00,0x00,0x7c,0x60,0x3c,0x06,0x7c,0x00],
    't': [0x18,0x3c,0x18,0x18,0x18,0x18,0x0c,0x00],
    'e': [0x00,0x3c,0x66,0x7e,0x60,0x62,0x3c,0x00],
    'm': [0x00,0x00,0x6c,0x7e,0x6a,0x6a,0x6a,0x00],
    'r': [0x00,0x00,0x6c,0x76,0x60,0x60,0x60,0x00],
    'h': [0x60,0x60,0x7c,0x66,0x66,0x66,0x66,0x00],
    'o': [0x00,0x00,0x3c,0x66,0x66,0x66,0x3c,0x00],
    'n': [0x00,0x00,0x6c,0x76,0x66,0x66,0x66,0x00],
    'p': [0x00,0x00,0x7c,0x66,0x66,0x7c,0x60,0x60],
    'a': [0x00,0x00,0x3c,0x06,0x3e,0x66,0x3e,0x00],
    'd': [0x06,0x06,0x3e,0x66,0x66,0x66,0x3e,0x00],
    'x': [0x00,0x00,0x66,0x3c,0x18,0x3c,0x66,0x00],
    'f': [0x0c,0x18,0x3c,0x18,0x18,0x18,0x18,0x00],
    'w': [0x00,0x00,0x63,0x6b,0x7f,0x7e,0x36,0x00],
    'u': [0x00,0x00,0x66,0x66,0x66,0x6e,0x3e,0x00],
    'v': [0x00,0x00,0x66,0x66,0x66,0x3c,0x18,0x00],
    'b': [0x60,0x60,0x7c,0x66,0x66,0x66,0x7c,0x00],
    'y': [0x00,0x00,0x66,0x66,0x66,0x3c,0x18,0x30],
    'G': [0x3c,0x66,0x60,0x6e,0x66,0x66,0x3c,0x00],
    'I': [0x3c,0x18,0x18,0x18,0x18,0x18,0x3c,0x00],
    'L': [0x60,0x60,0x60,0x60,0x60,0x60,0x7e,0x00],
    'S': [0x3c,0x66,0x60,0x3c,0x06,0x66,0x3c,0x00],
    'T': [0x7e,0x18,0x18,0x18,0x18,0x18,0x18,0x00],
    'E': [0x7e,0x60,0x60,0x7c,0x60,0x60,0x7e,0x00],
    'M': [0x63,0x77,0x7f,0x6b,0x63,0x63,0x63,0x00],
    'B': [0x7c,0x66,0x66,0x7c,0x66,0x66,0x7c,0x00],
    'R': [0x7c,0x66,0x66,0x7c,0x6c,0x66,0x66,0x00],
    'O': [0x3c,0x66,0x66,0x66,0x66,0x66,0x3c,0x00],
    'N': [0x63,0x73,0x7f,0x7f,0x6b,0x63,0x63,0x00],
    '0': [0x3c,0x66,0x6e,0x76,0x66,0x66,0x3c,0x00],
    '1': [0x18,0x18,0x38,0x18,0x18,0x18,0x3c,0x00],
    '2': [0x3c,0x66,0x06,0x0c,0x18,0x30,0x7e,0x00],
    '3': [0x3c,0x66,0x06,0x1c,0x06,0x66,0x3c,0x00],
    '4': [0x0c,0x1c,0x3c,0x6c,0x7e,0x0c,0x0c,0x00],
    '5': [0x7e,0x60,0x7c,0x06,0x06,0x66,0x3c,0x00],
    '6': [0x1c,0x30,0x60,0x7c,0x66,0x66,0x3c,0x00],
    '7': [0x7e,0x06,0x0c,0x18,0x30,0x30,0x30,0x00],
    '8': [0x3c,0x66,0x66,0x3c,0x66,0x66,0x3c,0x00],
    '9': [0x3c,0x66,0x66,0x3e,0x06,0x0c,0x38,0x00],
  };
  const glyph = glyphs[ch] || glyphs[' '];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (glyph[row] & (0x80 >> col)) {
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++)
            set(x + col * scale + sx, y + row * scale + sy, r, g2, b);
      }
    }
  }
}

// Avoid variable name conflict with graphics context
function text(str, x, y, r, g, b, scale = 2) {
  for (let i = 0; i < str.length; i++) {
    drawChar(str[i], x + i * 8 * scale, y, r, g, b, scale);
  }
}

// Figure labels
text('CAP', 1400, 640, LBL[0], LBL[1], LBL[2], 2);
text('GILLS', 1260, 940, LBL[0], LBL[1], LBL[2], 2);
text('STEM', 1110, stemTop + stemH / 2 + 70, LBL[0], LBL[1], LBL[2], 2);

// Amber label
text('LIVING EDGE', 1100, 580, WARM[0], WARM[1], WARM[2], 2);

// Figure number (bottom-left, small)
text('PLATE 002', 80, H - 120, LBL[0], LBL[1], LBL[2], 2);
text('CROSS-SECTION', 80, H - 90, TEXT[0], TEXT[1], TEXT[2], 2);

// ─── Fine horizontal rules (tide-gauge lines) ─────────────
for (let y = 100; y < H - 100; y += 80) {
  // Short ticks along left margin
  const tickW = (y % 400 === 0) ? 20 : 10;
  line(40, y, 40 + tickW, y, LBL[0], LBL[1], LBL[2], 1);
}
for (let x = 100; x < W - 100; x += 80) {
  const tickH = (x % 400 === 0) ? 20 : 10;
  line(x, H - 40, x, H - 40 - tickH, LBL[0], LBL[1], LBL[2], 1);
}

// ─── Ring index marks (small ticks at annotation radii) ──
for (const ar of [150, 320, 460]) {
  for (let angle = 0; angle < Math.PI; angle += Math.PI / 12) {
    const ix = Math.round(capCX + Math.cos(angle) * ar);
    const iy = Math.round(capCY + Math.sin(angle) * (ar * 340 / 620));
    set(ix, iy, LBL[0], LBL[1], LBL[2]);
    set(ix + 1, iy, LBL[0], LBL[1], LBL[2]);
  }
}

// ─── PNG encode ────────────────────────────────────────────
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
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const raw = [];
  for (let y = 0; y < h; y++) {
    raw.push(0); // filter: none
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      raw.push(rgba[i], rgba[i+1], rgba[i+2], rgba[i+3]);
    }
  }
  const compressed = deflateSync(Buffer.from(raw), { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const png = buildPNG(W, H, px);
const out = join(DIR, 'plate-002-cross-section.png');
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
