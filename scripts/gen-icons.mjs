#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/gen-icons.mjs — PWA icon generator for Bro OS 3.0
// Zero dependencies: renders a pixel-art terminal icon into raw
// RGBA, then hand-encodes a valid PNG (IHDR/IDAT/IEND + CRC32).
// Run: npm run icons  →  public/icon-192.png + public/icon-512.png
// ═══════════════════════════════════════════════════════════════

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── minimal PNG encoder ── */

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

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── pixel-art icon: a tiny cyberpunk terminal window ── */

function makeIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 512;
  const pxAt = (x, y) => (y * size + x) * 4;

  function fill(x, y, w, h, [r, g, b, a = 255]) {
    const x0 = Math.max(0, Math.round(x * s)), y0 = Math.max(0, Math.round(y * s));
    const x1 = Math.min(size, Math.round((x + w) * s)), y1 = Math.min(size, Math.round((y + h) * s));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = pxAt(xx, yy);
        px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
      }
    }
  }
  function ring(x, y, w, h, t, color) {
    fill(x, y, w, t, color); fill(x, y + h - t, w, t, color);
    fill(x, y, t, h, color); fill(x + w - t, y, t, h, color);
  }

  const VOID = [4, 5, 10], BORDER = [26, 29, 51], CYAN = [0, 240, 255],
    MAGENTA = [255, 0, 60], AMBER = [255, 208, 0], GREEN = [0, 255, 157], MUTED = [100, 116, 139];

  fill(0, 0, 512, 512, VOID);
  for (let i = 64; i < 512; i += 64) { // faint circuit grid
    fill(i, 0, 2, 512, BORDER); fill(0, i, 512, 2, BORDER);
  }
  ring(32, 32, 448, 448, 20, CYAN);              // window frame
  fill(72, 64, 24, 24, MAGENTA);                 // header dots
  fill(112, 64, 24, 24, AMBER);
  fill(152, 64, 24, 24, GREEN);
  fill(96, 176, 72, 192, CYAN);                  // terminal cursor █
  fill(216, 200, 216, 16, MUTED);                // data lines
  fill(216, 244, 168, 16, MUTED);
  fill(216, 288, 192, 16, MUTED);
  fill(392, 392, 48, 48, AMBER);                 // coin

  return encodePNG(size, size, px);
}

mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public', 'icon-192.png'), makeIcon(192));
writeFileSync(join(root, 'public', 'icon-512.png'), makeIcon(512));
console.log('[icons] wrote public/icon-192.png + public/icon-512.png');
