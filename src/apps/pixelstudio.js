// ═══════════════════════════════════════════════════════════════
// BRO_OS 3.0 // src/apps/pixelstudio.js — PIXEL.STUDIO
// The sealed J.O.O.H. cabinet slot, unsealed: a real pixel-art editor
// that paints sprites in the games' NATIVE format — uniform char rows
// keyed to the shared master palette (src/games/sprites.js `X`), the
// exact shape `spr(rows, palette)` and `drawSprite(ctx, rows, p)`
// already consume. Exports drop straight into the sprite bank.
// ═══════════════════════════════════════════════════════════════

import { X } from '../games/sprites.js';
import { drawSprite } from '../games/pixel.js';

const DRAFT_KEY = 'bro_os_px_draft';
const SIZES = [8, 16, 24, 32];

// Master palette as swatches, in definition order ('H' duplicates 'K').
export const STUDIO_PALETTE = Object.keys(X)
  .filter((ch) => ch !== 'H')
  .map((char) => ({ char, color: X[char] }));

const TRANSPARENT = '.';
const ERASER = { char: TRANSPARENT, color: null };

function blankGrid(size) {
  return Array.from({ length: size }, () => TRANSPARENT.repeat(size));
}

function normalizeGrid(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const size = raw.length;
  if (raw.some((r) => typeof r !== 'string' || r.length !== size)) return null;
  return raw.map((row) => row.split('').map((c) => (X[c] || c === TRANSPARENT ? c : TRANSPARENT)).join(''));
}

export function startPixelStudio(container, { audio = {}, store = null } = {}) {
  // ── state ──────────────────────────────────────────────────
  let size = 16;
  let grid = blankGrid(size);
  let active = STUDIO_PALETTE[0];
  let tool = 'paint'; // paint | erase | pick | fill
  let gridOn = true;
  let painting = false;
  let raf = 0;

  // Draft autosave: a closed window must not eat the artist's work.
  try {
    const draft = normalizeGrid(JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null'));
    if (draft) { grid = draft; size = draft.length; }
  } catch { /* corrupt draft → fresh canvas */ }

  // ── markup ─────────────────────────────────────────────────
  container.innerHTML = `
    <div class="flex flex-col gap-2 font-mono text-[11px]">
      <div class="flex items-center justify-between border-b border-border pb-2">
        <span class="text-neon-magenta text-glow-magenta">PIXEL.STUDIO // LIVE CANVAS</span>
        <span class="text-text-muted text-[9px]">J.O.O.H. LICENSE: FORGED</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select id="px-size" class="bg-void border border-border text-[10px] px-1 py-0.5" aria-label="Canvas size">
          ${SIZES.map((s) => `<option value="${s}" ${s === size ? 'selected' : ''}>${s}×${s}</option>`).join('')}
        </select>
        <input id="px-name" class="bg-void border border-border text-[10px] px-2 py-0.5 w-40" maxlength="24"
          placeholder="sprite name…" aria-label="Sprite name" />
        <button id="px-tool-paint" class="btn-cyber text-[9px]">PAINT</button>
        <button id="px-tool-fill" class="btn-cyber text-[9px]">FILL</button>
        <button id="px-tool-pick" class="btn-cyber text-[9px]">PICK</button>
        <button id="px-tool-erase" class="btn-cyber text-[9px]">ERASE</button>
        <button id="px-clear" class="btn-cyber text-[9px]">CLEAR</button>
        <button id="px-grid" class="btn-cyber text-[9px]">GRID</button>
      </div>
      <div class="flex gap-2">
        <div class="flex flex-col gap-1 shrink-0">
          <div id="px-palette" class="grid gap-[2px]" style="grid-template-columns:repeat(4, 18px)"></div>
          <div id="px-current" class="text-[9px] text-text-muted whitespace-nowrap">INK: —</div>
        </div>
        <div class="flex flex-col items-center gap-2">
          <canvas id="px-canvas" width="${size * 16}" height="${size * 16}"
            class="border border-neon-magenta/40 bg-void max-w-full cursor-crosshair" style="image-rendering:pixelated"></canvas>
          <div class="text-[9px] text-text-muted">DRAG TO PAINT · '.' = TRANSPARENT</div>
        </div>
        <div class="flex flex-col items-center gap-1 shrink-0">
          <span class="text-[9px] text-text-muted">GAME PREVIEW</span>
          <canvas id="px-preview" width="96" height="96" class="border border-border bg-void" style="image-rendering:pixelated"></canvas>
          <span class="text-[8px] text-text-muted">AS THE GAMES SEE IT</span>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 border-t border-border pt-2">
        <button id="px-save" class="btn-cyber text-[9px]">💾 SAVE TO SOUL</button>
        <button id="px-export" class="btn-cyber text-[9px]">⬇ EXPORT .SPRITE.JSON</button>
        <button id="px-png" class="btn-cyber text-[9px]">⬇ EXPORT PNG</button>
        <button id="px-source" class="btn-cyber text-[9px]">{ } SPRITE SOURCE</button>
      </div>
      <textarea id="px-source-out" readonly class="hidden bg-void border border-border text-[9px] p-2 h-28 w-full" aria-label="Sprite source"></textarea>
      <div id="px-status" class="text-[9px] text-neon-green min-h-[14px]"></div>
    </div>`;

  const canvas = container.querySelector('#px-canvas');
  const preview = container.querySelector('#px-preview');
  const ctx = canvas.getContext('2d');
  const pctx = preview.getContext('2d');
  const statusEl = container.querySelector('#px-status');
  const sourceOut = container.querySelector('#px-source-out');
  const nameEl = container.querySelector('#px-name');

  const status = (msg) => { statusEl.textContent = msg; };

  // ── grid edits ─────────────────────────────────────────────
  function saveDraft() {
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(grid)); } catch { /* quota */ }
  }

  function setCell(cx, cy, ch) {
    if (cx < 0 || cy < 0 || cx >= size || cy >= size) return;
    const row = grid[cy].split('');
    row[cx] = ch;
    grid[cy] = row.join('');
  }

  function fillAt(cx, cy, ch) {
    const target = grid[cy]?.[cx];
    if (target === undefined || target === ch) return;
    const queue = [[cx, cy]];
    while (queue.length) {
      const [x, y] = queue.pop();
      if (x < 0 || y < 0 || x >= size || y >= size || grid[y][x] !== target) continue;
      setCell(x, y, ch);
      queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  function applyAt(cx, cy) {
    if (tool === 'pick') {
      const ch = grid[cy]?.[cx];
      const hit = STUDIO_PALETTE.find((s) => s.char === ch);
      if (hit) { active = hit; setActiveSwatch(); status(`PICKED INK ${ch}`); }
      else status('PICKED TRANSPARENT — eraser ink');
      tool = 'paint';
      markTools();
      return;
    }
    const ch = tool === 'erase' ? TRANSPARENT : active.char;
    if (tool === 'fill') fillAt(cx, cy, ch);
    else setCell(cx, cy, ch);
    saveDraft();
    repaint();
  }

  // ── rendering ──────────────────────────────────────────────
  function repaint() {
    const cell = 16;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#0b0e14' : '#070a10'; // transparency checker
        ctx.fillRect(x * cell, y * cell, cell, cell);
        const color = X[grid[y][x]];
        if (color) { ctx.fillStyle = color; ctx.fillRect(x * cell, y * cell, cell, cell); }
      }
    }
    if (gridOn) {
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let i = 1; i < size; i++) {
        ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size * cell); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(size * cell, i * cell); ctx.stroke();
      }
    }
  }

  function previewFrame(t) {
    const bob = Math.floor(t / 400) % 2 === 0 ? 0 : -3;
    pctx.clearRect(0, 0, preview.width, preview.height);
    pctx.fillStyle = '#04050a';
    pctx.fillRect(0, 0, preview.width, preview.height);
    const scale = Math.floor(preview.width / size) || 1;
    const ox = Math.floor((preview.width - size * scale) / 2) + bob;
    const oy = Math.floor((preview.height - size * scale) / 2);
    drawSprite(pctx, grid, X, ox, oy, { scale });
  }

  function loop(t) {
    previewFrame(t);
    raf = requestAnimationFrame(loop);
  }

  // ── palette UI ─────────────────────────────────────────────
  const palEl = container.querySelector('#px-palette');
  STUDIO_PALETTE.forEach(({ char, color }) => {
    const b = document.createElement('button');
    b.className = 'w-[18px] h-[18px] border border-border cursor-pointer';
    b.style.background = color;
    b.dataset.char = char;
    b.title = `ink ${char}`;
    b.setAttribute('aria-label', `ink ${char} ${color}`);
    b.addEventListener('click', () => {
      active = { char, color };
      if (tool === 'erase' || tool === 'pick') { tool = 'paint'; markTools(); }
      setActiveSwatch();
      audio.click?.();
    });
    palEl.appendChild(b);
  });
  // eraser swatch (checkerboard)
  const eraserBtn = document.createElement('button');
  eraserBtn.className = 'w-[18px] h-[18px] border border-border cursor-pointer';
  eraserBtn.style.background = 'repeating-conic-gradient(#333 0% 25%, #111 0% 50%) 0 0/8px 8px';
  eraserBtn.dataset.char = TRANSPARENT;
  eraserBtn.title = 'eraser';
  eraserBtn.setAttribute('aria-label', 'eraser');
  eraserBtn.addEventListener('click', () => {
    tool = 'erase';
    markTools();
    audio.click?.();
  });
  palEl.appendChild(eraserBtn);

  function setActiveSwatch() {
    palEl.querySelectorAll('button').forEach((b) =>
      b.classList.toggle('px-selected', b.dataset.char === active.char && tool !== 'erase'));
    container.querySelector('#px-current').textContent = `INK: ${active.char} ${active.color || ''}`;
  }

  function markTools() {
    ['paint', 'fill', 'pick', 'erase'].forEach((t) => {
      const btn = container.querySelector(`#px-tool-${t}`);
      if (btn) btn.classList.toggle('px-selected', tool === t);
    });
  }

  // ── canvas input (pointer events; mouse + touch + pen) ─────
  function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = Math.floor(((e.clientX - rect.left) / rect.width) * size);
    const cy = Math.floor(((e.clientY - rect.top) / rect.height) * size);
    return [cx, cy];
  }

  const onPointerDown = (e) => {
    e.preventDefault();
    painting = true;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
    applyAt(...cellFromEvent(e));
  };
  const onPointerMove = (e) => {
    if (!painting || tool === 'fill' || tool === 'pick') return;
    applyAt(...cellFromEvent(e));
  };
  const onPointerUp = () => { painting = false; };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ── toolbar ────────────────────────────────────────────────
  container.querySelector('#px-tool-paint').addEventListener('click', () => { tool = 'paint'; markTools(); audio.click?.(); });
  container.querySelector('#px-tool-fill').addEventListener('click', () => { tool = 'fill'; markTools(); audio.click?.(); });
  container.querySelector('#px-tool-pick').addEventListener('click', () => { tool = 'pick'; markTools(); audio.click?.(); });
  container.querySelector('#px-tool-erase').addEventListener('click', () => { tool = 'erase'; markTools(); audio.click?.(); });
  container.querySelector('#px-grid').addEventListener('click', (e) => {
    gridOn = !gridOn;
    e.currentTarget.classList.toggle('px-selected', gridOn);
    repaint();
    audio.click?.();
  });
  container.querySelector('#px-clear').addEventListener('click', () => {
    grid = blankGrid(size);
    saveDraft();
    repaint();
    status('CANVAS CLEARED.');
    audio.click?.();
  });
  container.querySelector('#px-size').addEventListener('change', (e) => {
    const next = parseInt(e.target.value, 10);
    if (!SIZES.includes(next)) return;
    const nextGrid = blankGrid(next);
    const keep = Math.min(size, next);
    for (let y = 0; y < keep; y++) nextGrid[y] = grid[y].slice(0, next);
    size = next;
    grid = nextGrid;
    canvas.width = size * 16;
    canvas.height = size * 16;
    saveDraft();
    repaint();
    status(`CANVAS RESIZED → ${size}×${size} (top-left preserved)`);
    audio.click?.();
  });

  // ── outputs ────────────────────────────────────────────────
  function spriteName() {
    return (nameEl.value.trim() || 'UNTITLED').replace(/[^\w.-]+/g, '_').slice(0, 24);
  }

  function downloadBlob(blob, filename) {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return true;
    } catch { return false; }
  }

  container.querySelector('#px-save').addEventListener('click', () => {
    const name = spriteName();
    if (store?.rememberEvent) {
      store.rememberEvent(`Painted a new sprite: "${name}" (${size}×${size}).`, { icon: '🎨', imp: 2 });
    }
    status(`SAVED → "${name}" written to the soul. The tidepool curates.`);
    audio.click?.();
  });

  container.querySelector('#px-export').addEventListener('click', () => {
    const name = spriteName();
    const payload = {
      format: 'bro-sprite-1',
      name,
      size: [size, size],
      rows: [...grid],
      palette: X,
      hint: 'spr(rows, X) from src/games/sprites.js renders this directly.',
    };
    const ok = downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      `${name}.sprite.json`);
    status(ok ? `EXPORTED → ${name}.sprite.json` : 'DOWNLOAD BLOCKED — use SPRITE SOURCE to copy');
    audio.click?.();
  });

  container.querySelector('#px-png').addEventListener('click', () => {
    if (typeof canvas.toBlob !== 'function') { status('PNG EXPORT UNAVAILABLE IN THIS SANDBOX'); return; }
    const name = spriteName();
    const scale = 8;
    const out = document.createElement('canvas');
    out.width = size * scale;
    out.height = size * scale;
    drawSprite(out.getContext('2d'), grid, X, 0, 0, { scale });
    out.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${name}.png`);
      status(blob ? `EXPORTED → ${name}.png (${size * scale}px)` : 'PNG EXPORT FAILED');
    }, 'image/png');
    audio.click?.();
  });

  container.querySelector('#px-source').addEventListener('click', () => {
    const name = spriteName();
    // A valid JS identifier for pasted source (spriteName keeps dots for filenames).
    const constName = name.replace(/\W+/g, '_').replace(/^\d/, '_').toUpperCase() || 'UNTITLED';
    sourceOut.value = `import { spr, X } from './sprites.js';\n\nexport const ${constName} = spr([\n${grid.map((r) => `  '${r}',`).join('\n')}\n], X);\n`;
    sourceOut.classList.remove('hidden');
    status('SOURCE READY → paste into src/games/sprites.js');
    audio.click?.();
  });

  // ── boot ───────────────────────────────────────────────────
  setActiveSwatch();
  markTools();
  container.querySelector('#px-grid').classList.add('px-selected');
  repaint();
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };
}
