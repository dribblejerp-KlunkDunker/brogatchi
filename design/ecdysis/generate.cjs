// ECDYSIS — canvas generator (pure Node, no native deps)
// Philosophy: dark deep-water ground; concentric strata (growth rings /
// tide bands); one warm mineral accent at the living edge; sparse clinical
// typography set from real font outlines (opentype.js), rasterized with
// coverage anti-aliasing; PNG assembled with node:zlib.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const opentype = require('./.assets/node_modules/opentype.js/dist/opentype.min.js');

const ASSETS = path.join(__dirname, '.assets');
const OUT = path.join(__dirname, 'ecdysis.png');

// ── palette (rationed) ────────────────────────────────────────
const C = {
  ground: [7, 9, 14],        // ink that absorbs
  strata: [64, 88, 110],     // cool structural blue-gray
  strataHi: [118, 148, 172], // brighter structural
  accent: [201, 122, 62],    // warm mineral — shell / rust / amber
  accentHi: [232, 178, 112],
  faint: [38, 46, 58],       // whisper rules
  ink: [176, 188, 200],      // clinical text
  inkDim: [110, 122, 134],
};

// ── raster helpers ────────────────────────────────────────────
const W = 1600, H = 2000;
const buf = Buffer.alloc(W * H * 3, 0);
function px(x, y, rgb, a) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] += (rgb[0] - buf[i]) * a;
  buf[i + 1] += (rgb[1] - buf[i + 1]) * a;
  buf[i + 2] += (rgb[2] - buf[i + 2]) * a;
}
function disc(cx, cy, r, rgb, a) {
  const x0 = Math.floor(cx - r - 1), x1 = Math.ceil(cx + r + 1);
  const y0 = Math.floor(cy - r - 1), y1 = Math.ceil(cy + r + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cov = Math.min(1, Math.max(0, r - d + 0.5));
      if (cov > 0) px(x, y, rgb, a * cov);
    }
  }
}
function ring(cx, cy, r, w, rgb, a) {
  const outer = r + w / 2 + 1;
  const x0 = Math.floor(cx - outer), x1 = Math.ceil(cx + outer);
  const y0 = Math.floor(cy - outer), y1 = Math.ceil(cy + outer);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cov = Math.max(0, Math.min(1, (w / 2 + 0.5) - Math.abs(d - r)));
      if (cov > 0) px(x, y, rgb, a * cov);
    }
  }
}
function line(x0, y0, x1, y1, w, rgb, a) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, rgb, a);
  }
}
function rect(x, y, w, h, rgb, a) {
  for (let yy = Math.round(y); yy < Math.round(y + h); yy++)
    for (let xx = Math.round(x); xx < Math.round(x + w); xx++) px(xx, yy, rgb, a);
}

// ── typography (real outlines → coverage AA) ──────────────────
// Labels are rendered one character at a time via charToGlyph — bypassing
// stringToGlyphs/getAdvanceWidth, whose Bidi machinery unconditionally
// queries `liga` lookups that some shipped fonts carry in a form
// opentype.js can't process (lookupType 6, substFormat 2).

const F_ITALIANA = opentype.parse(fs.readFileSync(path.join(ASSETS, 'Italiana-S.ttf')));
const F_GEIST = opentype.parse(fs.readFileSync(path.join(ASSETS, 'JetBrainsMono-S.ttf')));
const F_PIXEL = opentype.parse(fs.readFileSync(path.join(ASSETS, 'PixelifySans-S.ttf')));

function measure(font, text, size, tracking = 0) {
  const upem = font.unitsPerEm || 1000;
  let w = 0;
  for (const ch of text) w += (font.charToGlyph(ch).advanceWidth || 0) * (size / upem) + tracking;
  return w - (text.length ? tracking : 0);
}

function typeset(text, font, size, ox, oy, { color = C.ink, alpha = 1, align = 'left', tracking = 0 } = {}) {
  const w = measure(font, text, size, tracking);
  let x = ox - (align === 'center' ? w / 2 : align === 'right' ? w : 0);
  const upem = font.unitsPerEm || 1000;
  const STROKE_W = Math.max(0.9, size / 90);
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    const p = glyph.getPath(x, oy, size);
    let mx = 0, my = 0;
    for (const cmd of p.commands) {
      if (cmd.type === 'M') { mx = cmd.x; my = cmd.y; }
      else if (cmd.type === 'L') { line(mx, my, cmd.x, cmd.y, STROKE_W, color, alpha); mx = cmd.x; my = cmd.y; }
      else if (cmd.type === 'C') {
        let px0 = mx, py0 = my;
        for (let i = 1; i <= 16; i++) {
          const t = i / 16, u = 1 - t;
          const nx = u*u*u*px0 + 3*u*u*t*cmd.x1 + 3*u*t*t*cmd.x2 + t*t*t*cmd.x;
          const ny = u*u*u*py0 + 3*u*u*t*cmd.y1 + 3*u*t*t*cmd.y2 + t*t*t*cmd.y;
          line(px0, py0, nx, ny, STROKE_W, color, alpha);
          px0 = nx; py0 = ny;
        }
        mx = cmd.x; my = cmd.y;
      }
      else if (cmd.type === 'Q') {
        let px0 = mx, py0 = my;
        for (let i = 1; i <= 12; i++) {
          const t = i / 12, u = 1 - t;
          const nx = u*u*px0 + 2*u*t*cmd.x1 + t*t*cmd.x;
          const ny = u*u*py0 + 2*u*t*cmd.y1 + t*t*cmd.y;
          line(px0, py0, nx, ny, STROKE_W, color, alpha);
          px0 = nx; py0 = ny;
        }
        mx = cmd.x; my = cmd.y;
      }
    }
    x += (glyph.advanceWidth || 0) * (size / upem) + tracking;
  }
  return w;
}

// ── PNG assembly (truecolor, no filter, zlib) ─────────────────
function crc32_TABLE() {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
}
const CRC_T = crc32_TABLE();
function crc32(b) {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function writePNG() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolor
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0; // filter none
    buf.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(OUT, png);
  console.log('wrote', OUT, (png.length / 1024).toFixed(0) + 'KB');
}

// ── composition ───────────────────────────────────────────────
function build() {
  // ground: vertical depth falloff (darker at the bottom of the water column)
  for (let y = 0; y < H; y++) {
    const depth = y / H;
    const g = C.ground.map((v, i) => Math.round(v - depth * [1, 1.4, 2][i]));
    rect(0, y, W, 1, g, 1);
  }

  // fine tide-gauge rhythm across the whole field
  for (let y = 240; y <= 1760; y += 8) {
    const a = 0.12 + 0.06 * Math.sin(y * 0.011);
    rect(120, y, W - 240, 1, C.faint, a);
  }

  // ── the strata: concentric rings, center-left ──
  const cx = 640, cy = 1010;
  const N = 26;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const r = 90 + t * 440;
    const breathe = 0.5 + 0.5 * Math.sin(i * 0.9);
    const w = 1.6 + 2.2 * (1 - t) + 0.5 * breathe;
    let alpha = 0.30 + 0.34 * (1 - t) + 0.07 * breathe;
    let col = t < 0.62 ? C.strata : C.strataHi;
    ring(cx, cy, r, w, col, alpha);
  }

  // vacated shells: dashed rings offset from the living core
  for (let k = 0; k < 3; k++) {
    const rr = 205 + k * 108;
    const dash = 26 + k * 6;
    for (let a0 = 0; a0 < 360; a0 += dash + 14) {
      const rad = (a0 * Math.PI) / 180 + k * 0.7;
      const x0 = cx + rr * Math.cos(rad), y0 = cy + rr * Math.sin(rad);
      const x1 = cx + rr * Math.cos(rad + (dash * Math.PI) / 180);
      const y1 = cy + rr * Math.sin(rad + (dash * Math.PI) / 180);
      line(x0, y0, x1, y1, 2.1, C.strataHi, 0.52 - k * 0.11);
    }
  }

  // the living core: filled, with its own fine banding
  for (let i = 0; i < 9; i++) ring(cx, cy, 14 + i * 9, 3.0, C.strataHi, 0.36 + 0.035 * i);
  disc(cx, cy, 9, C.accentHi, 0.95);
  disc(cx, cy, 4, [255, 231, 186], 0.98);

  // the seam: one radial warm line — where the form leaves itself
  const seamA = -Math.PI / 3.2;
  line(cx, cy, cx + 520 * Math.cos(seamA), cy + 520 * Math.sin(seamA), 2.2, C.accent, 1);
  // seam ticks: the record of shedding events along the radial
  for (let i = 1; i <= 7; i++) {
    const rr = 90 + i * 60;
    const sx = cx + rr * Math.cos(seamA), sy = cy + rr * Math.sin(seamA);
    line(sx - 8, sy, sx + 8, sy, 2, C.accentHi, 1);
  }

  // echo cores: where previous bodies stood
  const echoes = [
    [cx + 470, cy - 320, 34, 0.30],
    [cx - 500, cy + 260, 26, 0.22],
    [cx + 380, cy + 430, 20, 0.16],
  ];
  for (const [ex, ey, er, ea] of echoes) {
    ring(ex, ey, er, 1.4, C.strata, ea);
    ring(ex, ey, er * 0.55, 1.2, C.strata, ea * 0.8);
    disc(ex, ey, 1.8, C.accent, ea + 0.25);
  }

  // ── clinical apparatus ──
  // frame
  rect(90, 120, W - 180, 2, C.faint, 0.9);
  rect(90, H - 130, W - 180, 2, C.faint, 0.9);
  rect(90, 120, 2, H - 250, C.faint, 0.9);
  rect(W - 92, 120, 2, H - 250, C.faint, 0.9);

  // ruler ticks on the top rule
  for (let x = 120; x <= W - 120; x += 20) {
    const major = (x - 120) % 100 === 0;
    rect(x, 120, 1, major ? 14 : 7, C.inkDim, major ? 0.8 : 0.45);
  }

  // leader lines from seam ticks to the index column
  for (let i = 1; i <= 7; i++) {
    const rr = 90 + i * 60;
    const sx = cx + rr * Math.cos(seamA), sy = cy + rr * Math.sin(seamA);
    line(sx, sy, 1322, 330 + i * 26, 1.0, C.faint, 0.65);
  }

  // index column: the shed-log table
  const rows = [
    'SHED 01   R+060   0.41',
    'SHED 02   R+120   0.38',
    'SHED 03   R+180   0.35',
    'SHED 04   R+240   0.31',
    'SHED 05   R+300   0.26',
    'SHED 06   R+360   0.20',
    'SHED 07   R+420   0.13',
  ];
  typeset('SHED INDEX', F_GEIST, 20, 1330, 300, { color: C.ink, tracking: 6 });
  rect(1330, 316, 170, 1, C.faint, 0.8);
  rows.forEach((r, i) => {
    typeset(r, F_GEIST, 13, 1330, 348 + i * 26, { color: i === 0 ? C.accentHi : C.inkDim });
  });
  rect(1330, 530, 170, 1, C.faint, 0.8);
  typeset('SEAM ANGLE -57.4°', F_GEIST, 11, 1330, 556, { color: C.inkDim });
  typeset('STRATA N=26', F_GEIST, 11, 1330, 578, { color: C.inkDim });
  typeset('CORE R=9', F_GEIST, 11, 1330, 600, { color: C.inkDim });

  // marginal folio marks
  typeset('FIG. 1', F_GEIST, 13, 120, 168, { color: C.inkDim, tracking: 4 });
  typeset('PLATE SERIES — MOLT RECORDS', F_GEIST, 11, W - 120, 168, { color: C.inkDim, align: 'right', tracking: 4 });

  // the monumental word — engraved across the water
  typeset('ECDYSIS', F_ITALIANA, 150, W / 2, 1860, { color: C.ink, align: 'center', tracking: 34 });
  rect(W / 2 - 320, 1892, 640, 1, C.faint, 0.7);
  typeset('THE RECORD OF LEAVING ONESELF BEHIND', F_GEIST, 13, W / 2, 1918, { color: C.inkDim, align: 'center', tracking: 8 });

  // pixel-glyph specimen tag (the quiet nod)
  typeset('EXUVIAE · 26 STRATA · 7 SHEDS', F_PIXEL, 13, 120, 1918, { color: C.inkDim, tracking: 2 });
  typeset('OBS. 001', F_GEIST, 11, W - 120, 1918, { color: C.inkDim, align: 'right', tracking: 3 });

  writePNG();
}

build();
