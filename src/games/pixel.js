// Tiny pixel-sprite renderer: sprites are arrays of strings, one char per
// pixel, mapped through a palette. Crisp, cheap, and easy to tweak.

import { VIEW_W, VIEW_H } from './GameBase.js';

export function drawSprite(ctx, rows, palette, x, y, opts = {}) {
  const scale = opts.scale || 1;
  const flip = !!opts.flip;
  const shadow = opts.shadow;
  const h = rows.length;
  const w = rows[0].length;
  ctx.save();
  if (flip) {
    ctx.translate(x + w * scale, y);
    ctx.scale(-1, 1);
    x = 0;
    y = 0;
  }
  if (shadow) {
    const dx = (shadow === true ? 2 : shadow.dx) * scale;
    const dy = (shadow === true ? 3 : shadow.dy) * scale;
    const alpha = shadow === true ? 0.35 : shadow.alpha;
    ctx.fillStyle = 'rgba(10,10,18,' + alpha + ')';
    for (let r = 0; r < h; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        if (!palette[row[c]]) continue;
        ctx.fillStyle = 'rgba(10,10,18,' + alpha + ')';
        ctx.fillRect(x + c * scale + dx, y + r * scale + dy, scale, scale);
      }
    }
  }
  for (let r = 0; r < h; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const color = palette[row[c]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }
  ctx.restore();
}

export function drawBackground(ctx, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

export const P = {
  '.' : null, // transparent
};

// Border helper: draws an outlined translucent panel (modal-ish, canvas style)
export function panel(ctx, x, y, w, h, fill, stroke = '#000') {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
}