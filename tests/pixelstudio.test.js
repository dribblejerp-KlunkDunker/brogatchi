// PIXEL.STUDIO tests: the editor module headless (canvas via a recording
// Proxy stub — jsdom has no 2D context) and the full UI flow through the
// real shell (card → studio, palette, paint, fill, resize, save-to-soul,
// exports). Exports must speak the games' NATIVE sprite format.
// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { X } from '../src/games/sprites.js';
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

describe('pixelstudio module (headless)', () => {
  function host() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const audio = { click: vi.fn() };
    const store = { rememberEvent: vi.fn() };
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

  it('SAVE TO SOUL writes a real memory through the store', () => {
    const { el, store } = host();
    el.querySelector('#px-name').value = 'doom.blade';
    el.querySelector('#px-save').click();
    expect(store.rememberEvent).toHaveBeenCalledOnce();
    const [text, opts] = store.rememberEvent.mock.calls[0];
    expect(text).toContain('doom.blade');
    expect(opts).toEqual({ icon: '🎨', imp: 2 });
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
});
