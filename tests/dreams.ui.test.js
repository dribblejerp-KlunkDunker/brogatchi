// UI test for the dream overlay in the real shell: a save with a stale
// lastTick + material dreams on the first tick, the overlay renders the
// stored text after the splash, WAKE HIM (or Escape) dismisses with the
// once-only +2 happy and the SYS.LOG line, and a reload does not re-show.
// The stale save is injected via main.js's own storage seam (safeStorage
// probes window.localStorage first — jsdom provides one when the URL is
// set, so writes land in the real key the boot will read).
//
// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

const SHELL_HTML = readFileSync('index.html', 'utf8');
const SAVE_KEY = 'bro_os_3';

let App;
let realGetContext;
let realConsoleError;

beforeAll(() => {
  realConsoleError = console.error;
  console.error = (...args) => {
    if (String(args[0]).includes('Not implemented')) return; // jsdom noise
    realConsoleError(...args);
  };
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
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => ctxStub, configurable: true });
});

afterAll(() => {
  console.error = realConsoleError;
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', realGetContext);
});

afterEach(() => {
  window.__broTick?.stop?.(); // the 1s tick must not outlive its test
  window.__broBootOverlay?.stop?.();
  for (const id of [...(App?.windows?.keys?.() ?? [])]) App.close(id, { silent: true });
  window.App = undefined;
  window.__broStore = undefined;
  document.querySelectorAll('[aria-label="Ryan\'s dream"]').forEach((n) => n.remove());
  vi.resetModules();
});

// jsdom localStorage is feature-detectable per environment (this suite skips
// itself where it's absent — the store-level suite covers the seam there).
const HAS_STORAGE = typeof localStorage !== 'undefined';

/**
 * Seed a save whose lastTick is `gapMs` in the past, with one vivid pinned
 * memory — exactly what a returning player's storage looks like.
 */
function seedStaleSave(gapMs, now) {
  const base = {
    v: 3,
    petName: 'RYAN',
    coins: 60,
    steps: 0,
    xp: 0,
    stats: { happy: 82, hunger: 74, energy: 90, greed: 6 },
    sleeping: false,
    mining: false,
    shield: 0,
    goldenShell: false,
    theme: 'cyberpunk',
    scanlines: true,
    vol: { bgm: 0.7, sfx: 0.8 },
    bgmMuted: false,
    remixes: {},
    spriteOverrides: {},
    best: { snake: 0, flappy: 0, breaker: 0, mario: 0, rpg: 0, loot: 5 },
    quest: { date: '2026-09-16', mined: 0, goal: 20, rewarded: false },
    pedometer: { enabled: false, goal: 2000, today: { date: '2026-09-16', steps: 0, rewarded: false } },
    dreams: { lastDreamedAt: null, entries: [] },
    memories: [{ id: 'm-seed-1', icon: '🎮', text: 'Won LOOT SHOWER with 5 points. First run on record.', imp: 4, pinned: true, t: now - gapMs - 3600e3, day: 'Sep 12, 2026' }],
    diary: [],
    lastTick: now,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(base));
}

async function bootShell() {
  try { localStorage.clear(); } catch { /* storage-free environments */ }
  document.head.innerHTML = SHELL_HTML.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
  document.body.innerHTML = SHELL_HTML.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
  document.documentElement.setAttribute('data-theme', 'cyberpunk');
  await import('../src/main.js');
  App = window.App;
}

describe('DREAM.CYCLE — the overlay in the real shell', () => {
  it.skipIf(!HAS_STORAGE)('a stale save renders the overlay with the stored dream; WAKE HIM pays once and logs', async () => {
    const NOW = new Date(2026, 8, 16, 12, 0, 0).getTime();
    seedStaleSave(3 * 24 * 3600 * 1000, NOW);
    await bootShell();
    window.__broBootOverlay?.stop?.(); // splash gone; overlay should be up

    const overlay = document.querySelector('[aria-label="Ryan\'s dream"]');
    expect(overlay).toBeTruthy();
    const text = overlay.querySelector('#dream-text')?.textContent ?? '';
    expect(text).toContain('I dreamed'); // the composed opener
    expect(text).toContain('LOOT SHOWER'); // the real memory strand

    // the store already dreamed (first tick) — memory + gate set
    const store = window.__broStore;
    expect(store.state.dreams.entries).toHaveLength(1);
    expect(store.state.dreams.entries[0].readAt).toBeNull();

    // dismiss by button
    overlay.querySelector('#dream-dismiss').click();
    expect(document.querySelector('[aria-label="Ryan\'s dream"]')).toBeNull();
    expect(store.state.dreams.entries[0].readAt).not.toBeNull();
    expect(store.state.stats.happy).toBe(82 + 2); // exactly the +2
    const logText = document.querySelector('#sys-log')?.textContent ?? '';
    expect(logText).toContain('dream reel acknowledged');
  });

  it.skipIf(!HAS_STORAGE)('Escape dismisses too; a reload does not re-show the read dream', async () => {
    const NOW = new Date(2026, 8, 16, 12, 0, 0).getTime();
    seedStaleSave(3 * 24 * 3600 * 1000, NOW);
    await bootShell();
    window.__broBootOverlay?.stop?.();
    expect(document.querySelector('[aria-label="Ryan\'s dream"]')).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[aria-label="Ryan\'s dream"]')).toBeNull();
    const store = window.__broStore;
    expect(store.state.stats.happy).toBe(84);

    // reload: the dream is read, the gate is recent — no overlay, no new dream
    window.__broBootOverlay?.stop?.();
    for (const id of [...(App?.windows?.keys?.() ?? [])]) App.close(id, { silent: true });
    window.App = undefined;
    window.__broStore = undefined;
    vi.resetModules();
    await import('../src/main.js');
    App = window.App;
    window.__broBootOverlay?.stop?.();
    expect(document.querySelector('[aria-label="Ryan\'s dream"]')).toBeNull();
    expect(window.__broStore.state.dreams.entries).toHaveLength(1); // no second dream
  });

  it.skipIf(!HAS_STORAGE)('a short-gap save shows no overlay at all', async () => {
    const NOW = new Date(2026, 8, 16, 12, 0, 0).getTime();
    seedStaleSave(2 * 3600 * 1000, NOW); // 2h — a nap, not a dream
    await bootShell();
    window.__broBootOverlay?.stop?.();
    expect(document.querySelector('[aria-label="Ryan\'s dream"]')).toBeNull();
    expect(window.__broStore.state.dreams.entries).toHaveLength(0);
    const logText = document.querySelector('#sys-log')?.textContent ?? '';
    expect(logText).not.toContain('dream reel');
  });

  it('a save with no dreams field (or a fresh boot) shows no overlay', async () => {
    await bootShell(); // fresh storage or volatile — either way, nothing dreamed
    window.__broBootOverlay?.stop?.();
    expect(document.querySelector('[aria-label="Ryan\'s dream"]')).toBeNull();
  });
});
