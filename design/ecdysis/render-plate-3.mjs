#!/usr/bin/env node
// ECDYSIS PLATE 3 — Nautilus Spiral, Cross-Section
// Pure Node.js PNG renderer (no native deps), matching plate 002's
// conventions: same palette family, same primitives, same drafting
// furniture. The subject is the philosophy itself — a logarithmic
// spiral of sealed chambers, each one a shed home.
//
// Geometry: r(θ) = a·e^{kθ}, expansion ×3.3 per revolution (k = ln 3.3/2π),
// the nautilus's own growth constant. What makes a cross-section READ is
// structure, not fill: a shell WALL zone on each chamber's outer edge
// (adjacent whorls' walls merge into the bright seam of real specimens),
// curved SEPTA sweeping toward the apex, alternating chamber shadow,
// the SIPHUNCLE threading every chamber — and the single warm accent
// reserved for the living edge, the aperture now growing.

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const DIR = dirname(fileURLToPath(import.meta.url));

// ─── Canvas ──────────────────────────────────────────────
const W = 1600, H = 2000;
const px = new Uint8Array(W * H * 4);

function set(x, y, r, g, b, a = 255) {
  x |= 0; y |= 0;
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  if (a >= 255) { px[i] = r; px[i+1] = g; px[i+2] = b; px[i+3] = 255; }
  else {
    const sa = a / 255, da = 1 - sa;
    px[i]   = Math.round(r * sa + px[i]   * da);
    px[i+1] = Math.round(g * sa + px[i+1] * da);
    px[i+2] = Math.round(b * sa + px[i+2] * da);
    px[i+3] = Math.min(255, px[i+3] + a);
  }
}

function disc(cx, cy, radius, r, g, b, a = 255) {
  const rr = radius * radius;
  for (let y = Math.ceil(cy - radius); y <= Math.floor(cy + radius); y++)
    for (let x = Math.ceil(cx - radius); x <= Math.floor(cx + radius); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= rr) set(x, y, r, g, b, a);
}

function line(x0, y0, x1, y1, r, g, b, w = 1, a = 255) {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    const x = x0 + dx * t, y = y0 + dy * t;
    for (let ox = -Math.floor(w/2); ox <= Math.floor(w/2); ox++)
      for (let oy = -Math.floor(w/2); oy <= Math.floor(w/2); oy++)
        set(Math.round(x) + ox, Math.round(y) + oy, r, g, b, a);
  }
}

// ─── Palette (plate 002's family) ─────────────────────────
const DARK   = [12, 11, 16];     // #0c0b10 — deep night ground
const COOL1  = [34, 33, 42];     // #22212a — chamber shadow A
const COOL2  = [48, 46, 58];     // #302e3a — living chamber (occupied, lit)
const COOL3  = [62, 59, 74];     // #3e3b4a — deep chamber tone
const GILL   = [28, 27, 36];     // #1c1b24 — chamber shadow B
const WALL   = [72, 69, 86];     // #484556 — shell wall (structure seams)
const LBL    = [80, 78, 96];     // #504e60 — figure labels
const WARM   = [196, 132, 52];   // #c48434 — amber accent (living edge only)
const TEXT   = [140, 136, 160];  // #8c88a0 — subtle text

// ─── Spiral parameters ────────────────────────────────────
const CX = 780, CY = 900;                 // spiral center
const A = 15;                             // protoconch scale (px)
const EXP = 3.3;                          // growth per revolution (nautilus)
const K = Math.log(EXP) / (2 * Math.PI);
const R_MAX = 620;
const T_MAX = Math.log(R_MAX / A) / K;
const DT = Math.PI / 3;                   // ~6 chambers per revolution
const T0 = 0.35;                          // first septum, just past the protoconch
const DELTA = 0.13;                       // septum sweep (curvature toward apex)
const N_SEPTA = Math.floor((T_MAX - T0) / DT);
const T_LIVING = T0 + N_SEPTA * DT;       // newest septum — after it, the animal

const rOf = (t) => A * Math.exp(K * t);
const FILL_A = GILL, FILL_B = COOL1;      // alternating chamber shadow

// ─── Plate background ─────────────────────────────────────
for (let i = 0; i < px.length; i += 4) {
  px[i] = DARK[0]; px[i+1] = DARK[1]; px[i+2] = DARK[2]; px[i+3] = 255;
}

// ─── Chambers: per-pixel classification ───────────────────
// Inside-shell test per whorl band [R/EXP, R]; chamber identity comes from
// the septa that actually CROSS the pixel's radius: septum tn spans radii
// [rOf(tn)/EXP, rOf(tn)], so the crossing septa at radius r are exactly
// tn ∈ [tr, tr+2π] with tr = ln(r/A)/K. Their swept angles at r,
// φS = tn − DELTA·(rOf(tn)−r)/(rOf(tn)·(1−1/EXP)), cut the radius into
// chambers. Septa render as thin bright lines with a soft halo.
const wrap = (a) => { a %= 2 * Math.PI; return a < 0 ? a + 2 * Math.PI : a; };

for (let y = Math.ceil(CY - 660); y <= Math.floor(CY + 660); y++) {
  for (let x = Math.ceil(CX - 660); x <= Math.floor(CX + 660); x++) {
    const dx = x - CX, dy = y - CY;
    const r = Math.hypot(dx, dy);
    if (r > 640) continue;
    const phi = wrap(Math.atan2(dy, dx));
    let t = phi + 2 * Math.PI * Math.floor((T_MAX - phi) / (2 * Math.PI));
    if (t > T_MAX) t -= 2 * Math.PI;
    if (t < 0) continue;                       // outside the shell entirely

    let R = A * Math.exp(K * t);
    while (r < R / EXP && t - 2 * Math.PI >= 0) { t -= 2 * Math.PI; R /= EXP; }
    if (r < R / EXP || r > R) continue;        // in a gap between whorls
    const RIN = R / EXP;

    if (r <= 10) { set(x, y, COOL2[0], COOL2[1], COOL2[2]); continue; }  // protoconch
    if (r <= 14) { set(x, y, LBL[0], LBL[1], LBL[2]); continue; }        // its rim

    // septa crossing this radius, with their swept angles here
    // (wrapped into [0,2π) — phi is wrapped, so the comparison domain must be)
    const tr = Math.log(r / A) / K;
    const crossings = [];
    for (let tn = T0 + Math.ceil((tr - T0) / DT) * DT; tn <= Math.min(tr + 2 * Math.PI, T_LIVING); tn += DT) {
      const Rt = rOf(tn);
      crossings.push({ tn, phiS: wrap(tn - DELTA * ((Rt - r) / (Rt * (1 - 1 / EXP)))) });
    }
    crossings.sort((a, b) => a.phiS - b.phiS);

    // chamber = gap between consecutive swept angles containing phi
    let lower = null, upper = null;
    for (let ci = 0; ci < crossings.length; ci++) {
      if (crossings[ci].phiS <= phi) lower = crossings[ci];
      else { upper = crossings[ci]; break; }
    }
    if (!lower && crossings.length) { upper = crossings[0]; lower = { tn: upper.tn - DT, phiS: upper.phiS - DT }; }
    if (!lower) continue;                      // before the first septum
    const n = Math.round((lower.tn - T0) / DT);
    const living = n >= N_SEPTA;

    // shell wall: outer 3.2% of a sealed band (the living chamber's lip is
    // painted warm further down — an edge still growing has no finished wall)
    if (!living && r > R - (R - RIN) * 0.032) {
      set(x, y, WALL[0], WALL[1], WALL[2]);
      continue;
    }

    // chamber fill — sealed chambers alternate shadow; the living chamber
    // is lit (occupied, pearl)
    const fill = living ? COOL2 : ((n % 2 === 0) ? FILL_A : FILL_B);
    set(x, y, fill[0], fill[1], fill[2]);

    // septum rendering: thin bright line (WALL) with a soft darker halo
    if (upper) {
      let dphi = Math.abs(phi - upper.phiS);
      if (dphi > Math.PI) dphi = 2 * Math.PI - dphi;
      const w1 = Math.max(0.012, 2.6 / r);
      if (dphi <= w1) set(x, y, WALL[0], WALL[1], WALL[2]);
      else if (dphi <= w1 * 2.4) set(x, y, COOL3[0], COOL3[1], COOL3[2]);
    }
  }
}

// ─── Siphuncle — the thread through every chamber, near the wall ──
for (let t = T0 + 0.15; t < T_LIVING; t += 0.004) {
  const rho = rOf(t) * 0.9;
  disc(CX + Math.cos(t) * rho, CY + Math.sin(t) * rho,
    Math.max(0.8, 0.0045 * rho), COOL3[0], COOL3[1], COOL3[2], 200);
}
// beads where it pierces each septum
for (let n = 1; n <= N_SEPTA; n++) {
  const tn = T0 + n * DT;
  const rho = rOf(tn) * 0.9;
  disc(CX + Math.cos(tn) * rho, CY + Math.sin(tn) * rho,
    Math.max(1.5, 0.009 * rOf(tn)), LBL[0], LBL[1], LBL[2], 190);
}

// ─── The living edge: the growing lip, warm and tapered ────
for (let t = T_LIVING; t <= T_MAX; t += 0.0025) {
  const rho = rOf(t);
  const frac = (t - T_LIVING) / (T_MAX - T_LIVING);
  const taper = Math.pow(Math.sin(Math.PI * frac), 0.6);
  disc(CX + Math.cos(t) * rho, CY + Math.sin(t) * rho,
    Math.max(1.6, 0.016 * rho), WARM[0], WARM[1], WARM[2], Math.round(90 + 165 * taper));
}

// ─── Figure labels (bitmap font, plate 002's + U, V, H, D, hyphen) ──
function drawChar(ch, x, y, r, g2, b, scale = 2) {
  const glyphs = {
    'C': [0x3c,0x66,0x60,0x60,0x60,0x66,0x3c,0x00],
    'A': [0x18,0x3c,0x66,0x7e,0x66,0x66,0x66,0x00],
    'P': [0x7c,0x66,0x66,0x7c,0x60,0x60,0x60,0x00],
    '.': [0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x00],
    '-': [0x00,0x00,0x00,0x7e,0x00,0x00,0x00,0x00],
    ' ': [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],
    'U': [0x66,0x66,0x66,0x66,0x66,0x66,0x7e,0x00],
    'V': [0x66,0x66,0x66,0x66,0x66,0x3c,0x18,0x00],
    'H': [0x66,0x66,0x7e,0x66,0x66,0x66,0x66,0x00],
    'D': [0x7c,0x66,0x66,0x66,0x66,0x66,0x7c,0x00],
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
    'G': [0x3c,0x66,0x60,0x6e,0x66,0x66,0x3c,0x00],
    '0': [0x3c,0x66,0x6e,0x76,0x66,0x66,0x3c,0x00],
    '3': [0x3c,0x66,0x06,0x1c,0x06,0x66,0x3c,0x00],
  };
  const glyph = glyphs[ch] || glyphs[' '];
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++)
      if (glyph[row] & (0x80 >> col))
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++)
            set(x + col * scale + sx, y + row * scale + sy, r, g2, b);
}
function text(str, x, y, r, g, b, scale = 2) {
  for (let i = 0; i < str.length; i++) drawChar(str[i], x + i * 8 * scale, y, r, g, b, scale);
}

// ─── Leader lines + labels ────────────────────────────────
const pt = (t, frac = 1) => {   // point on the spiral (frac < 1 pulls into the band)
  const rho = rOf(t) * frac;
  return [CX + Math.cos(t) * rho, CY + Math.sin(t) * rho];
};
const leader = (t, frac, lx, ly, warm = false) => {
  const [sx, sy] = pt(t, frac);
  const c = warm ? WARM : LBL;
  line(lx, ly, sx, sy, c[0], c[1], c[2], 1);
  set(sx, sy, c[0], c[1], c[2]); set(sx + 1, sy, c[0], c[1], c[2]); set(sx, sy + 1, c[0], c[1], c[2]);
};

leader(T0 + 16 * DT, 0.5, 330, 690);             text('SEPTUM', 240, 680, LBL[0], LBL[1], LBL[2]);
leader(T0 + 14 * DT, 0.6, 410, 1100);            text('CHAMBER', 250, 1110, LBL[0], LBL[1], LBL[2]);
leader(12.6, 0.9, 1060, 700);                    text('SIPHUNCLE', 960, 690, LBL[0], LBL[1], LBL[2]);
leader(0.8, 1, 480, 590);                        text('PROTOCONCH', 310, 550, LBL[0], LBL[1], LBL[2]);
leader(T_LIVING + DT * 0.5, 0.55, 1250, 1180);   text('LIVING CHAMBER', 1020, 1190, TEXT[0], TEXT[1], TEXT[2]);
leader(T_MAX - 0.02, 1.0, 1180, 1340, true);     text('LIVING EDGE', 1180, 1310, WARM[0], WARM[1], WARM[2]);

// ─── Plate number ─────────────────────────────────────────
text('PLATE 003', 80, H - 120, LBL[0], LBL[1], LBL[2], 2);
text('NAUTILUS SPIRAL', 80, H - 90, TEXT[0], TEXT[1], TEXT[2], 2);

// ─── Margin ticks (plate 002's tide-gauge furniture) ──────
for (let y = 100; y < H - 100; y += 80) {
  const tickW = (y % 400 === 0) ? 20 : 10;
  line(40, y, 40 + tickW, y, LBL[0], LBL[1], LBL[2], 1);
}
for (let x = 100; x < W - 100; x += 80) {
  const tickH = (x % 400 === 0) ? 20 : 10;
  line(x, H - 40, x, H - 40 - tickH, LBL[0], LBL[1], LBL[2], 1);
}

// ─── PNG encode (identical to plate 002) ──────────────────
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
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = [];
  for (let y = 0; y < h; y++) {
    raw.push(0);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      raw.push(rgba[i], rgba[i+1], rgba[i+2], rgba[i+3]);
    }
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(raw), { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const png = buildPNG(W, H, px);
const out = join(DIR, 'plate-003-nautilus-spiral.png');
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
