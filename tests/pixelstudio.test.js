// PIXEL.STUDIO tests: the editor module headless (canvas via a recording
// Proxy stub — jsdom has no 2D context) and the full UI flow through the
// real shell (card → studio, palette, paint, fill, resize, save-to-soul,
// exports). Exports must speak the games' NATIVE sprite format.
// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { X, RYAN_RUN1, RYAN_RUN2, COIN } from '../src/games/sprites.js';
import { OVERRIDABLE, getSprite, slotSize, bankRows } from '../src/games/overrides.js';
import { startPixelStudio } from '../src/apps/pixelstudio.js';

const SHELL_HTML = readFileSync('index.html', 'utf8');

const realConsoleError = console.error;
let realGetContext;
beforeAll(() => {
  // This jsdom setup exposes no window.localStorage (the app's safeStorage
  // fallback exists precisely for that) — install a Map-backed stand-in so
  // the studio's draft autosave can be asserted end to end.
  if (typeof window.localStorage === 'undefined' || window.localStorage === null) {
    const m = new Map();
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
        clear: () => m.clear(),
      },
      configurable: true,
    });
  }
  console.error = (...args) => {
    if (String(args[0]).includes('Not implemented')) return;
    realConsoleError(...args);
  };
  // jsdom canvas has no 2D context — self-recording stub that absorbs
  // every call and property write (fillStyle, imageSmoothingEnabled…).
  realGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
  const ctxStub = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'canvas') return null;
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') {
        return () => ({ addColorStop() {} });
      }
      if (prop === 'measureText') return () => ({ width: 10 });
      return typeof prop === 'string' ? () => {} : undefined;
    },
    set() { return true; },
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => ctxStub,
    configurable: true,
  });
});
afterAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', realGetContext);
  console.error = realConsoleError;
});

let App;

// Body minus scripts (main.js is imported directly; inline scripts never
// execute from innerHTML anyway).
function insideBody(html) {
  return html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1]?.replace(/<script[\s\S]*?<\/script>/g, '') ?? '';
}

async function bootShell() {
  document.head.innerHTML = SHELL_HTML.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
  document.body.innerHTML = insideBody(SHELL_HTML);
  document.documentElement.setAttribute('data-theme', 'cyberpunk');
  await import('../src/main.js');
  App = window.App;
}

beforeEach(() => {
  window.localStorage?.clear?.();
});

let teardowns = [];
afterEach(() => {
  teardowns.splice(0).forEach((fn) => { try { fn(); } catch { /* noop */ } });
});

// MouseEvent carries clientX/clientY in jsdom; dispatching it for a
// 'pointerdown' listener works (listeners only read the coordinates).
function press(canvas, px, py, type = 'pointerdown') {
  canvas.dispatchEvent(new window.MouseEvent(type, { clientX: px, clientY: py, bubbles: true }));
}
function rect256(canvas) {
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 256, height: 256 });
}

// Feed a file through the studio's real <input type="file"> handler. jsdom's
// Blob has no .text(), so the picker is handed the shape the handler reads.
function importFile(el, text, name = 'x.sprite.json') {
  const input = el.querySelector('#px-import-input');
  Object.defineProperty(input, 'files', { value: [{ name, text: async () => text }], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  return new Promise((r) => setTimeout(r, 0)); // let the async read land
}

describe('pixelstudio module (headless)', () => {
  function host() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const audio = { click: vi.fn() };
    const store = {
      state: { spriteOverrides: {} },
      saveCreation: vi.fn(() => ({ ok: true, creation: { id: 'c1', name: 'TEST' } })),
      postCreation: vi.fn(() => ({ ok: true })),
      setSpriteOverride: vi.fn(() => ({ ok: true, slot: 'HEART' })),
      resetSpriteOverride: vi.fn(() => ({ ok: true, slot: 'HEART' })),
    };
    const stop = startPixelStudio(el, { audio, store });
    teardowns.push(stop);
    return { el, audio, store };
  }

  it('builds the editor with palette swatches for the master palette (minus H)', () => {
    const { el } = host();
    const chars = [...el.querySelectorAll('#px-palette button')].map((b) => b.dataset.char);
    expect(chars).toContain('O');
    expect(chars).toContain('F');
    expect(chars).toContain('.'); // eraser swatch
    expect(chars).not.toContain('H'); // duplicate of K, filtered out
    expect(chars.filter((c) => c !== '.').length).toBe(Object.keys(X).length - 1);
  });

  it('painting applies the active ink and autosaves the draft in native format', () => {
    const { el } = host();
    const red = [...el.querySelectorAll('#px-palette button')].find((b) => b.dataset.char === 'R');
    red.click();
    const canvas = el.querySelector('#px-canvas');
    rect256(canvas);
    press(canvas, 4, 4);
    const draft = JSON.parse(window.localStorage.getItem('bro_os_px_draft'));
    expect(draft.length).toBe(16);
    expect(draft.every((r) => typeof r === 'string' && r.length === 16)).toBe(true);
    expect(draft[0][0]).toBe('R');
  });

  it('fill flood-fills a bounded region', () => {
    const { el } = host();
    const canvas = el.querySelector('#px-canvas');
    rect256(canvas);
    const blue = [...el.querySelectorAll('#px-palette button')].find((b) => b.dataset.char === 'B');
    blue.click();
    const paint = (x, y) => press(canvas, (x + 0.5) * 16, (y + 0.5) * 16);
    // A full wall across row 8 partitions the canvas...
    for (let x = 0; x < 16; x++) paint(x, 8);
    // ...flood from the top-left corner...
    el.querySelector('#px-tool-fill').click();
    paint(0, 0);
    const grid = JSON.parse(window.localStorage.getItem('bro_os_px_draft'));
    // ...and everything above the wall fills; below stays transparent.
    expect(grid[0][0]).toBe('B');
    expect(grid[7][15]).toBe('B');
    expect([...grid[8]].every((c) => c === 'B')).toBe(true); // the wall itself
    expect(grid[9][0]).toBe('.');
    expect(grid[15][15]).toBe('.');
  });

  it('resize preserves the top-left overlap', () => {
    const { el } = host();
    const canvas = el.querySelector('#px-canvas');
    rect256(canvas);
    const red = [...el.querySelectorAll('#px-palette button')].find((b) => b.dataset.char === 'R');
    red.click();
    press(canvas, 4, 4);
    el.querySelector('#px-size').value = '8';
    el.querySelector('#px-size').dispatchEvent(new window.Event('change', { bubbles: true }));
    const draft = JSON.parse(window.localStorage.getItem('bro_os_px_draft'));
    expect(draft.length).toBe(8);
    expect(draft.every((r) => r.length === 8)).toBe(true);
    expect(draft[0][0]).toBe('R');
  });

  it('the slot picker offers every overridable bank sprite, grouped by cabinet', () => {
    const { el } = host();
    const values = [...el.querySelectorAll('#px-slot option')].map((o) => o.value).filter(Boolean);
    expect(values.sort()).toEqual(Object.keys(OVERRIDABLE).sort());
    expect(el.querySelectorAll('#px-slot optgroup').length).toBeGreaterThan(1);
  });

  it('picking a game slot loads that slot\'s native, non-square grid', () => {
    const { el } = host();
    const slotEl = el.querySelector('#px-slot');
    slotEl.value = 'RYAN_RUN1';
    slotEl.dispatchEvent(new window.Event('change', { bubbles: true }));

    const { w, h } = slotSize('RYAN_RUN1');
    expect(w).not.toBe(h); // the reason the canvas had to stop being square
    const canvas = el.querySelector('#px-canvas');
    expect(canvas.width).toBe(w * 16);
    expect(canvas.height).toBe(h * 16);
    const sizeEl = el.querySelector('#px-size');
    expect(sizeEl.disabled).toBe(true);           // size is the slot's job now
    expect(sizeEl.value).toBe(`${w}×${h}`);       // and it must not claim a square
    expect(el.querySelector('#px-status').textContent).toContain('BANK ART');

    // back to a free canvas: editable again, and still honest about the shape
    slotEl.value = '';
    slotEl.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(sizeEl.disabled).toBe(false);
    expect(sizeEl.value).toBe(`${w}×${h}`);
  });

  it('APPLY TO GAME writes the painting through; RESET hands the slot back', () => {
    const { el, store } = host();
    const slotEl = el.querySelector('#px-slot');
    slotEl.value = 'HEART';
    slotEl.dispatchEvent(new window.Event('change', { bubbles: true }));

    const canvas = el.querySelector('#px-canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: canvas.width, height: canvas.height });
    [...el.querySelectorAll('#px-palette button')].find((b) => b.dataset.char === 'R').click();
    press(canvas, 8, 8); // top-left pixel
    el.querySelector('#px-apply').click();

    expect(store.setSpriteOverride).toHaveBeenCalledOnce();
    const [slotArg, rowsArg, nameArg] = store.setSpriteOverride.mock.calls[0];
    expect(slotArg).toBe('HEART');
    expect(rowsArg).toHaveLength(slotSize('HEART').h);
    expect(rowsArg[0][0]).toBe('R');
    expect(nameArg).toBe('UNTITLED');
    expect(el.querySelector('#px-status').textContent).toContain('APPLIED');

    el.querySelector('#px-reset').click();
    expect(store.resetSpriteOverride).toHaveBeenCalledWith('HEART');
    expect(el.querySelector('#px-status').textContent).toContain('RESET');
  });

  it('refuses to apply with no slot picked, or when the store rejects the grid', () => {
    const { el, store } = host();
    el.querySelector('#px-apply').click();
    expect(store.setSpriteOverride).not.toHaveBeenCalled();
    expect(el.querySelector('#px-status').textContent).toContain('PICK A GAME SLOT');

    const slotEl = el.querySelector('#px-slot');
    slotEl.value = 'PIPE';
    slotEl.dispatchEvent(new window.Event('change', { bubbles: true }));
    store.setSpriteOverride.mockReturnValueOnce({ ok: false, reason: 'NEEDS 16×16' });
    el.querySelector('#px-apply').click();
    expect(el.querySelector('#px-status').textContent).toContain('NEEDS 16×16');
  });

  it('SAVE TO SOUL hangs the painting in the gallery, in native format', () => {
    const { el, store } = host();
    el.querySelector('#px-name').value = 'doom.blade';
    el.querySelector('#px-save').click();
    expect(store.saveCreation).toHaveBeenCalledOnce();
    const [name, rows] = store.saveCreation.mock.calls[0];
    expect(name).toBe('doom.blade');
    expect(rows).toHaveLength(16);
    expect(rows.every((r) => typeof r === 'string' && r.length === 16)).toBe(true);
    expect(el.querySelector('#px-status').textContent).toContain('SAVED');
  });

  it('POST TO MOLTBOOK saves the painting and shares it to the feed', () => {
    const { el, store } = host();
    el.querySelector('#px-name').value = 'crab.sign';
    el.querySelector('#px-post').click();
    expect(store.saveCreation).toHaveBeenCalledOnce();
    expect(store.postCreation).toHaveBeenCalledWith('c1');
    expect(el.querySelector('#px-status').textContent).toContain('POSTED');
  });

  it('surfaces a share failure instead of pretending it landed', () => {
    const { el, store } = host();
    store.postCreation.mockReturnValueOnce({ ok: false, reason: 'CREATION NOT FOUND' });
    el.querySelector('#px-post').click();
    expect(el.querySelector('#px-status').textContent).toContain('CREATION NOT FOUND');
  });

  it('the bank strip loads a built-in sprite to remix', () => {
    const { el } = host();
    const btn = el.querySelector('[data-slot="FLAPPY"]');
    expect(btn).toBeTruthy();
    expect(btn.querySelector('canvas'), 'the bank shows real art').toBeTruthy();

    btn.click();
    const { w, h } = slotSize('FLAPPY');
    expect(el.querySelector('#px-slot').value).toBe('FLAPPY'); // picker stays in sync
    expect(el.querySelector('#px-canvas').width).toBe(w * 16);
    expect(el.querySelector('#px-canvas').height).toBe(h * 16);
    expect(btn.classList.contains('px-selected')).toBe(true);
    expect(el.querySelector('#px-status').textContent).toContain('FLAPPY');
    expect(JSON.parse(window.localStorage.getItem('bro_os_px_draft'))).toEqual(bankRows('FLAPPY'));
  });

  it('.sprite.json round-trips: the file we export imports back unchanged', async () => {
    const { el } = host();
    const canvas = el.querySelector('#px-canvas');
    rect256(canvas);
    [...el.querySelectorAll('#px-palette button')].find((b) => b.dataset.char === 'B').click();
    press(canvas, 8, 8);
    press(canvas, 24, 24);
    el.querySelector('#px-name').value = 'round.trip';

    const RealBlob = window.Blob;
    const parts = [];
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:mock';
    URL.revokeObjectURL = () => {};
    window.Blob = class extends RealBlob {
      constructor(init, opts) { parts.push(String(init[0])); super(init, opts); }
    };
    let payload;
    try {
      el.querySelector('#px-export').click();
      payload = JSON.parse(parts[0]);
    } finally {
      window.Blob = RealBlob;
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
    }
    expect(payload.rows[0][0]).toBe('B');

    // wipe the canvas, then import the very file the studio just wrote
    el.querySelector('#px-clear').click();
    el.querySelector('#px-name').value = '';
    await importFile(el, JSON.stringify(payload));

    expect(el.querySelector('#px-status').textContent).toContain('IMPORTED');
    expect(el.querySelector('#px-name').value).toBe('round.trip');
    expect(JSON.parse(window.localStorage.getItem('bro_os_px_draft'))).toEqual(payload.rows);
  });

  it('import blanks inks the master palette cannot draw, and says so', async () => {
    const { el } = host();
    await importFile(el, JSON.stringify({ name: 'off.palette', rows: ['AB', 'BA'] })); // 'A' is not an ink
    expect(el.querySelector('#px-status').textContent).toContain('IMPORTED');
    expect(el.querySelector('#px-status').textContent).toContain('2 UNKNOWN INK');
    expect(JSON.parse(window.localStorage.getItem('bro_os_px_draft'))).toEqual(['.B', 'B.']);
  });

  it('import refuses junk instead of quietly wiping the canvas', async () => {
    const { el } = host();
    await importFile(el, 'not json at all');
    expect(el.querySelector('#px-status').textContent).toContain('NOT JSON');

    await importFile(el, JSON.stringify({ format: 'bro-sprite-1', name: 'no rows here' }));
    expect(el.querySelector('#px-status').textContent).toContain('NO USABLE SPRITE ROWS');

    await importFile(el, JSON.stringify({ rows: ['OO', 'O'] })); // ragged
    expect(el.querySelector('#px-status').textContent).toContain('NO USABLE SPRITE ROWS');

    await importFile(el, JSON.stringify({ rows: ['O'.repeat(33)] })); // beyond the canvas
    expect(el.querySelector('#px-status').textContent).toContain('EXCEEDS THE 32×32 CANVAS');
  });

  it('EXPORT .SPRITE.JSON downloads valid native-format data', () => {
    const { el } = host();
    rect256(el.querySelector('#px-canvas'));
    el.querySelector('#px-name').value = 'test.spr';
    // jsdom's Blob has no .text() — capture the constructor parts instead.
    const RealBlob = window.Blob;
    const parts = [];
    window.Blob = class extends RealBlob {
      constructor(init, opts) { parts.push(String(init[0])); super(init, opts); }
    };
    const created = [];
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (blob) => { created.push(blob); return 'blob:mock'; };
    URL.revokeObjectURL = () => {};
    try {
      el.querySelector('#px-export').click();
      expect(created).toHaveLength(1);
      expect(created[0]).toBeInstanceOf(RealBlob);
      const payload = JSON.parse(parts[0]);
      expect(payload.format).toBe('bro-sprite-1');
      expect(payload.name).toBe('test.spr');
      expect(payload.size).toEqual([16, 16]);
      expect(payload.rows).toHaveLength(16);
      expect(payload.rows.every((r) => typeof r === 'string' && r.length === 16)).toBe(true);
      expect(payload.palette.O).toBe(X.O); // the master palette itself
    } finally {
      window.Blob = RealBlob;
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
    }
  });

  it('SPRITE SOURCE emits a drop-in spr() module snippet', () => {
    const { el } = host();
    el.querySelector('#px-name').value = 'my.thing';
    el.querySelector('#px-source').click();
    const src = el.querySelector('#px-source-out').value;
    expect(src).toContain("export const MY_THING = spr([");
    expect(src).toContain("], X);");
    expect(src.split('\n').filter((l) => l.trim().startsWith("'")).length).toBe(16);
  });
});

describe('pixelstudio UI integration (real shell)', () => {
  beforeAll(async () => { await bootShell(); });

  function openFromCabinet() {
    App.open('arcade');
    const content = App.windows.get('arcade').el.querySelector('.window-content');
    const card = content.querySelector('button[data-game="pixelstudio"]');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('NOW OPEN');
    card.click();
    return App.windows.get('arcade').el.querySelector('.window-content');
  }

  it('the cabinet card is unlocked and launches the studio', () => {
    const content = openFromCabinet();
    expect(content.querySelector('#px-canvas')).toBeTruthy();
    expect(content.textContent).toContain('LICENSE: FORGED');
    App.close('arcade', { silent: true });
  });

  it('the dock opens a standalone studio window whose teardown cancels the preview loop', () => {
    const rafSpy = vi.spyOn(window, 'cancelAnimationFrame');
    App.open('pixelstudio');
    const content = App.windows.get('pixelstudio').el.querySelector('.window-content');
    expect(content.querySelector('#px-canvas')).toBeTruthy();
    App.close('pixelstudio', { silent: true });
    expect(rafSpy).toHaveBeenCalled();
    rafSpy.mockRestore();
  });

  it('BACK TO ARCADE stops the studio and the grid can host a game again', () => {
    const content = openFromCabinet();
    expect(content.querySelector('#px-canvas')).toBeTruthy();
    content.querySelector('#game-back').click();
    // resetGrid rebuilds the arcade window (close + reopen) — re-read live content.
    const fresh = App.windows.get('arcade').el.querySelector('.window-content');
    expect(fresh.querySelector('button[data-game="loot"]')).toBeTruthy();
    expect(fresh.querySelector('#px-canvas')).toBeNull();
    App.close('arcade', { silent: true });
  });

  it('the transparent-pixel guard: the studio slot is unlocked, the mystery slot stays sealed', () => {
    App.open('arcade');
    const content = App.windows.get('arcade').el.querySelector('.window-content');
    expect(content.textContent).not.toContain('LICENSE PENDING'); // PIXEL.STUDIO slot unsealed
    expect(content.textContent).toContain('SIGNAL NOT FOUND');    // ??? .EXE stays sealed by design
    App.close('arcade', { silent: true });
  });

  it('APPLY TO GAME makes the cabinets draw the painting', () => {
    const content = openFromCabinet();
    const slotEl = content.querySelector('#px-slot');
    slotEl.value = 'RYAN_RUN1';
    slotEl.dispatchEvent(new window.Event('change', { bubbles: true }));

    const canvas = content.querySelector('#px-canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: canvas.width, height: canvas.height });
    [...content.querySelectorAll('#px-palette button')].find((b) => b.dataset.char === 'R').click();
    press(canvas, 8, 8); // paint the runner's top-left pixel
    content.querySelector('#px-apply').click();
    expect(content.querySelector('#px-status').textContent).toContain('APPLIED');

    // the resolver now hands every cabinet the painted art — and only that slot
    expect(getSprite('RYAN_RUN1').r[0][0]).toBe('R');
    expect(getSprite('RYAN_RUN1').r).toHaveLength(slotSize('RYAN_RUN1').h);
    expect(getSprite('RYAN_RUN2')).toBe(RYAN_RUN2); // only the painted slot changed
    expect(getSprite('COIN')).toBe(COIN);           // bank art everywhere else

    // and LOOT SHOWER (which draws RYAN_RUN1) runs with the override in place
    content.querySelector('#game-back').click();
    const arc = App.windows.get('arcade').el.querySelector('.window-content');
    arc.querySelector('button[data-game="loot"]').click();
    const game = arc.querySelector('#game-canvas')?.__game;
    expect(game).toBeTruthy();
    expect(game.running).toBe(true);
    App.close('arcade', { silent: true });
  });

  it('the bank strip and .sprite.json import work in the running studio', async () => {
    const content = openFromCabinet();
    content.querySelector('[data-slot="COIN"]').click();
    expect(content.querySelector('#px-slot').value).toBe('COIN');
    expect(content.querySelector('#px-status').textContent).toContain('COIN');

    await importFile(content, JSON.stringify({
      format: 'bro-sprite-1', name: 'TIDE COIN', size: [2, 2], rows: ['MM', 'MM'],
    }));
    expect(content.querySelector('#px-status').textContent).toContain('IMPORTED');
    expect(content.querySelector('#px-name').value).toBe('TIDE COIN');
    expect(content.querySelector('#px-canvas').width).toBe(2 * 16);
    expect(content.querySelector('#px-slot').value).toBe(''); // imported art starts free
    App.close('arcade', { silent: true });
  });

  it('RESET SLOT restores the bank art', () => {
    const content = openFromCabinet();
    const slotEl = content.querySelector('#px-slot');
    slotEl.value = 'RYAN_RUN1';
    slotEl.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(content.querySelector('#px-status').textContent).toContain('YOUR ART'); // shows what is applied

    content.querySelector('#px-reset').click();
    expect(content.querySelector('#px-status').textContent).toContain('RESET');
    expect(getSprite('RYAN_RUN1')).toBe(RYAN_RUN1);
    App.close('arcade', { silent: true });
  });
});
