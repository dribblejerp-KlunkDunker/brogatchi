// ═══════════════════════════════════════════════════════════════
// BRO_OS 3.0 // src/apps/pixelstudio.js — PIXEL.STUDIO
// The sealed J.O.O.H. cabinet slot, unsealed: a real pixel-art editor
// that paints sprites in the games' NATIVE format — uniform char rows
// keyed to the shared master palette (src/games/sprites.js `X`), the
// exact shape `spr(rows, palette)` and `drawSprite(ctx, rows, p)`
// already consume. Paint free-form and export, or pick a game sprite
// slot and APPLY TO GAME to make the cabinets draw your art.
// ═══════════════════════════════════════════════════════════════

import { X } from '../games/sprites.js';
import { drawSprite } from '../games/pixel.js';
import { OVERRIDABLE, bankRows, slotSize } from '../games/overrides.js';

const DRAFT_KEY = 'bro_os_px_draft';
const SIZES = [8, 16, 24, 32];
const CELL = 16; // editor pixels per sprite pixel

// Master palette as swatches, in definition order ('H' duplicates 'K').
export const STUDIO_PALETTE = Object.keys(X)
  .filter((ch) => ch !== 'H')
  .map((char) => ({ char, color: X[char] }));

const TRANSPARENT = '.';

function blankGrid(w, h) {
  return Array.from({ length: h }, () => TRANSPARENT.repeat(w));
}

// Games' slots vary in shape (COIN is 12×10, RYAN RUN1 is 16×20), so the
// canvas is a grid of uniform rows — not necessarily square.
function normalizeGrid(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const w = typeof raw[0] === 'string' ? raw[0].length : 0;
  if (!w || raw.some((r) => typeof r !== 'string' || r.length !== w)) return null;
  return raw.map((row) => row.split('').map((c) => (X[c] || c === TRANSPARENT ? c : TRANSPARENT)).join(''));
}

// The slot picker, grouped by cabinet. Static labels, so this is plain markup.
const SLOT_OPTIONS = (() => {
  const groups = new Map();
  for (const [name, meta] of Object.entries(OVERRIDABLE)) {
    if (!groups.has(meta.game)) groups.set(meta.game, []);
    groups.get(meta.game).push([name, meta.label]);
  }
  return [...groups].map(([game, entries]) =>
    `<optgroup label="${game}">${entries.map(([name, label]) => `<option value="${name}">${label}</option>`).join('')}</optgroup>`,
  ).join('');
})();

export function startPixelStudio(container, { audio = {}, store = null } = {}) {
  // ── state ──────────────────────────────────────────────────
  let grid = blankGrid(16, 16);
  let slot = ''; // '' = free canvas, else a bank sprite name
  let active = STUDIO_PALETTE[0];
  let tool = 'paint'; // paint | erase | pick | fill
  let gridOn = true;
  let painting = false;
  let raf = 0;

  const w = () => grid[0].length;
  const h = () => grid.length;
  const overrideFor = (name) => store?.state?.spriteOverrides?.[name]?.rows ?? null;

  // Draft autosave: a closed window must not eat the artist's work.
  try {
    const draft = normalizeGrid(JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null'));
    if (draft) grid = draft;
  } catch { /* corrupt draft → fresh canvas */ }

  // ── markup ─────────────────────────────────────────────────
  container.innerHTML = `
    <div class="flex flex-col gap-2 font-mono text-[11px]">
      <div class="flex items-center justify-between border-b border-border pb-2">
        <span class="text-neon-magenta text-glow-magenta">PIXEL.STUDIO // LIVE CANVAS</span>
        <span class="text-text-muted text-[9px]">J.O.O.H. LICENSE: FORGED</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select id="px-slot" class="bg-void border border-border text-[10px] px-1 py-0.5 max-w-[190px]" aria-label="Game sprite slot">
          <option value="">— FREE CANVAS —</option>
          ${SLOT_OPTIONS}
        </select>
        <button id="px-apply" class="btn-cyber text-[9px]">APPLY TO GAME</button>
        <button id="px-reset" class="btn-cyber text-[9px] border-border text-text-muted">RESET SLOT</button>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-[9px] text-text-muted">BANK // CLICK A BUILT-IN SPRITE TO REMIX IT</span>
        <div id="px-bank" class="flex flex-wrap gap-1 items-end"></div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select id="px-size" class="bg-void border border-border text-[10px] px-1 py-0.5" aria-label="Canvas size">
          ${SIZES.map((s) => `<option value="${s}">${s}×${s}</option>`).join('')}
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
          <canvas id="px-canvas" width="${w() * CELL}" height="${h() * CELL}"
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
        <button id="px-post" class="btn-cyber text-[9px]">🎨 POST TO MOLTBOOK</button>
        <button id="px-export" class="btn-cyber text-[9px]">⬇ EXPORT .SPRITE.JSON</button>
        <button id="px-import" class="btn-cyber text-[9px]">⬆ IMPORT .SPRITE.JSON</button>
        <button id="px-png" class="btn-cyber text-[9px]">⬇ EXPORT PNG</button>
        <button id="px-source" class="btn-cyber text-[9px]">{ } SPRITE SOURCE</button>
        <input id="px-import-input" type="file" accept=".json,application/json" class="hidden" aria-label="Import a .sprite.json file" />
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
  const slotEl = container.querySelector('#px-slot');
  const sizeEl = container.querySelector('#px-size');
  const importInput = container.querySelector('#px-import-input');

  const status = (msg) => { statusEl.textContent = msg; };

  function resizeCanvas() {
    canvas.width = w() * CELL;
    canvas.height = h() * CELL;
  }

  // ── grid edits ─────────────────────────────────────────────
  function saveDraft() {
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(grid)); } catch { /* quota */ }
  }

  function setCell(cx, cy, ch) {
    if (cx < 0 || cy < 0 || cx >= w() || cy >= h()) return;
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
      if (x < 0 || y < 0 || x >= w() || y >= h() || grid[y][x] !== target) continue;
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
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < h(); y++) {
      for (let x = 0; x < w(); x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#0b0e14' : '#070a10'; // transparency checker
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        const color = X[grid[y][x]];
        if (color) { ctx.fillStyle = color; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
      }
    }
    if (gridOn) {
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let x = 1; x < w(); x++) {
        ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, h() * CELL); ctx.stroke();
      }
      for (let y = 1; y < h(); y++) {
        ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(w() * CELL, y * CELL); ctx.stroke();
      }
    }
  }

  function previewFrame(t) {
    const bob = Math.floor(t / 400) % 2 === 0 ? 0 : -3;
    pctx.clearRect(0, 0, preview.width, preview.height);
    pctx.fillStyle = '#04050a';
    pctx.fillRect(0, 0, preview.width, preview.height);
    const scale = Math.max(1, Math.floor(Math.min(preview.width / w(), preview.height / h())));
    const ox = Math.floor((preview.width - w() * scale) / 2) + bob;
    const oy = Math.floor((preview.height - h() * scale) / 2);
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
    const cx = Math.floor(((e.clientX - rect.left) / rect.width) * w());
    const cy = Math.floor(((e.clientY - rect.top) / rect.height) * h());
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
    grid = blankGrid(w(), h());
    saveDraft();
    repaint();
    status('CANVAS CLEARED.');
    audio.click?.();
  });

  // Keep the top-left overlap when the free canvas changes size — rows are
  // padded, not truncated, so the grid stays square and uniform (the old
  // version could leave ragged rows when growing).
  function setGridSize(nw, nh) {
    const next = blankGrid(nw, nh);
    const keepW = Math.min(w(), nw);
    const keepH = Math.min(h(), nh);
    for (let y = 0; y < keepH; y++) next[y] = grid[y].slice(0, keepW).padEnd(nw, TRANSPARENT);
    grid = next;
    resizeCanvas();
    saveDraft();
    repaint();
  }

  sizeEl.addEventListener('change', (e) => {
    if (slot) return; // the slot owns the grid while one is picked
    const next = parseInt(e.target.value, 10);
    if (!SIZES.includes(next)) return;
    setGridSize(next, next);
    status(`CANVAS RESIZED → ${next}×${next} (top-left preserved)`);
    audio.click?.();
  });

  // ── game sprite slots: paint a real cabinet sprite ─────────
  // The size control must never claim 8×8 while a 12×10 canvas is on the
  // bench. A square free canvas shows its square; anything else (a picked
  // slot, or a slot-shaped grid carried back to free mode) shows its real
  // dimensions, so the control always describes what is being painted.
  function syncSizeSelect() {
    sizeEl.querySelector('option[data-slot-size]')?.remove();
    sizeEl.disabled = !!slot;
    if (!slot && w() === h() && SIZES.includes(w())) {
      sizeEl.value = String(w());
      return;
    }
    const opt = document.createElement('option');
    opt.dataset.slotSize = '1';
    opt.textContent = `${w()}×${h()}`;
    sizeEl.appendChild(opt);
    sizeEl.value = opt.value;
  }

  function selectSlot(name) {
    slot = name;
    bankEl.querySelectorAll('[data-slot]').forEach((b) =>
      b.classList.toggle('px-selected', b.dataset.slot === name));
    if (!name) {
      syncSizeSelect();
      status(`FREE CANVAS — ${w()}×${h()}. Pick a game slot to paint its art.`);
      return;
    }
    const mine = overrideFor(name);
    const rows = normalizeGrid(mine ?? bankRows(name));
    if (rows) grid = rows;
    resizeCanvas();
    saveDraft();
    repaint();
    syncSizeSelect();
    const { w: tw, h: th, frames } = slotSize(name);
    status(`SLOT ${name} — ${tw}×${th}${frames > 1 ? ` × ${frames} FRAMES` : ''} · ${mine ? 'YOUR ART' : 'BANK ART'}`);
  }

  slotEl.addEventListener('change', (e) => {
    selectSlot(e.target.value);
    audio.click?.();
  });

  // The bank, drawn with its real art: one button per overridable sprite, so
  // you can SEE what you are about to remix before you load it.
  const bankEl = container.querySelector('#px-bank');
  for (const [name, meta] of Object.entries(OVERRIDABLE)) {
    const rows = bankRows(name);
    const btn = document.createElement('button');
    btn.className = 'px-bank-btn border border-border bg-void p-0.5 cursor-pointer';
    btn.dataset.slot = name;
    btn.title = `${meta.label} · ${meta.game}`;
    btn.setAttribute('aria-label', `Load ${meta.label} (${meta.game})`);
    const thumb = document.createElement('canvas');
    thumb.width = rows[0].length;
    thumb.height = rows.length;
    thumb.style.imageRendering = 'pixelated';
    const thumbCtx = typeof thumb.getContext === 'function' ? thumb.getContext('2d') : null;
    if (thumbCtx) drawSprite(thumbCtx, rows, X, 0, 0, { scale: 1 });
    btn.appendChild(thumb);
    btn.addEventListener('click', () => {
      slotEl.value = name;
      selectSlot(name);
      audio.click?.();
    });
    bankEl.appendChild(btn);
  }

  container.querySelector('#px-apply').addEventListener('click', () => {
    if (!slot) { status('APPLY FAILED — PICK A GAME SLOT FIRST'); audio.error?.(); return; }
    const name = spriteName();
    const res = store?.setSpriteOverride?.(slot, grid, name);
    if (!res?.ok) { status(`APPLY FAILED — ${res?.reason ?? 'NO SOUL CONNECTION'}`); audio.error?.(); return; }
    status(`APPLIED → ${slot} now draws "${name}". Every cabinet sees it.`);
    audio.levelUp?.();
  });

  container.querySelector('#px-reset').addEventListener('click', () => {
    if (!slot) { status('RESET FAILED — PICK A GAME SLOT FIRST'); audio.error?.(); return; }
    const res = store?.resetSpriteOverride?.(slot);
    if (!res?.ok) { status(`RESET FAILED — ${res?.reason ?? 'NO SOUL CONNECTION'}`); audio.error?.(); return; }
    grid = normalizeGrid(bankRows(slot)) ?? grid;
    resizeCanvas();
    saveDraft();
    repaint();
    status(`RESET → ${slot} is bank art again.`);
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
    const res = store?.saveCreation?.(name, grid);
    if (!res?.ok) { status(`SAVE FAILED — ${res?.reason ?? 'NO SOUL CONNECTION'}`); audio.error?.(); return; }
    status(`SAVED → "${name}" hung in the MOLTBOOK gallery.`);
    audio.click?.();
  });

  // Save the painting, then put it on the tide where pilgrims answer it.
  container.querySelector('#px-post').addEventListener('click', () => {
    const name = spriteName();
    const saved = store?.saveCreation?.(name, grid);
    if (!saved?.ok) { status(`POST FAILED — ${saved?.reason ?? 'NO SOUL CONNECTION'}`); audio.error?.(); return; }
    const posted = store.postCreation(saved.creation.id);
    if (!posted.ok) { status(`POST FAILED — ${posted.reason}`); audio.error?.(); return; }
    status(`POSTED → "${name}" is on the tide. MOLTBOOK › GALLERY shows the shelf.`);
    audio.click?.();
  });

  container.querySelector('#px-export').addEventListener('click', () => {
    const name = spriteName();
    const payload = {
      format: 'bro-sprite-1',
      name,
      size: [w(), h()],
      rows: [...grid],
      palette: X,
      hint: 'spr(rows, X) from src/games/sprites.js renders this directly.',
    };
    const ok = downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      `${name}.sprite.json`);
    status(ok ? `EXPORTED → ${name}.sprite.json` : 'DOWNLOAD BLOCKED — use SPRITE SOURCE to copy');
    audio.click?.();
  });

  // ── .sprite.json round-trip ────────────────────────────────
  // The exported payload is the import format: `rows` in the games' native
  // shape is the truth, so `size` and `palette` are advisory only — a sprite
  // painted against another palette imports with the unknown inks blanked.
  async function importSprite(file) {
    if (!file || typeof file.text !== 'function') { status('IMPORT FAILED — UNREADABLE FILE'); audio.error?.(); return; }
    let payload;
    try { payload = JSON.parse(await file.text()); } catch { status('IMPORT FAILED — THAT FILE IS NOT JSON'); audio.error?.(); return; }
    const rows = normalizeGrid(payload?.rows);
    if (!rows) { status('IMPORT FAILED — NO USABLE SPRITE ROWS IN THAT FILE'); audio.error?.(); return; }
    if (rows.length > 32 || rows[0].length > 32) {
      status(`IMPORT FAILED — ${rows[0].length}×${rows.length} EXCEEDS THE 32×32 CANVAS`);
      audio.error?.();
      return;
    }
    const unknownInk = payload.rows.join('').split('').filter((c) => c !== TRANSPARENT && !X[c]).length;
    grid = rows;
    slot = '';
    slotEl.value = '';
    if (typeof payload.name === 'string' && payload.name.trim()) nameEl.value = payload.name.trim().slice(0, 24);
    resizeCanvas();
    saveDraft();
    repaint();
    syncSizeSelect();
    status(`IMPORTED → "${spriteName()}" ${w()}×${h()}. FREE CANVAS — remix it, or pick a slot to apply.`
      + (unknownInk ? ` ${unknownInk} UNKNOWN INK EXISTED → TRANSPARENT` : ''));
    audio.click?.();
  }

  container.querySelector('#px-import').addEventListener('click', () => {
    importInput.value = ''; // so re-picking the same file fires change again
    importInput.click();
    audio.click?.();
  });
  importInput.addEventListener('change', (e) => importSprite(e.target.files?.[0]));

  container.querySelector('#px-png').addEventListener('click', () => {
    if (typeof canvas.toBlob !== 'function') { status('PNG EXPORT UNAVAILABLE IN THIS SANDBOX'); return; }
    const name = spriteName();
    const scale = 8;
    const out = document.createElement('canvas');
    out.width = w() * scale;
    out.height = h() * scale;
    drawSprite(out.getContext('2d'), grid, X, 0, 0, { scale });
    out.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${name}.png`);
      status(blob ? `EXPORTED → ${name}.png (${w() * scale}px)` : 'PNG EXPORT FAILED');
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
  syncSizeSelect();
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
