// UI test for the petition desk in the real SOUL.FILE window: the desk
// renders the one live ask (title/argument/ask/expiry), GRANT mutates
// state and pins the memory, DENY shifts traits, both empty the desk,
// and text is escaped. Seeded via __broStore (same pattern as the
// MOLT JOURNAL suite).
//
// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

const SHELL_HTML = readFileSync('index.html', 'utf8');

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
  for (const id of [...(App?.windows?.keys?.() ?? [])]) App.close(id, { silent: true });
  window.App = undefined;
  window.__broStore = undefined;
  vi.resetModules();
});

async function bootShell() {
  document.head.innerHTML = SHELL_HTML.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
  document.body.innerHTML = SHELL_HTML.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
  document.documentElement.setAttribute('data-theme', 'cyberpunk');
  await import('../src/main.js');
  App = window.App;
}

// Seed a live FEAST petition the way maybeGeneratePetition would —
// the desk reads state.petitions.live directly.
function seedFeast(store) {
  store.state.personality.gluttony = 60;
  store.state.stats.hunger = 30;
  store.state.petitions.live = {
    id: 'pet-test-feast',
    kind: 'feast',
    title: 'THE FEAST',
    argument: 'Two pizzas. The machine hungers.',
    request: 'Two pizzas, no questions.',
    params: {},
    draftedAt: Date.now(),
    expiresAt: Date.now() + 48 * 3600 * 1000,
  };
}

describe('petition desk (SOUL.FILE)', () => {
  it('an empty desk says nothing is pending and lists recent decisions', async () => {
    await bootShell();
    window.__broStore.state.petitions.history.push(
      { kind: 'feast', title: 'THE FEAST', decision: 'granted', decidedAt: Date.parse('2026-09-15T12:00:00Z'), params: {} },
    );
    App.open('journal');
    const desk = App.windows.get('journal').el.querySelector('#petition-desk');
    expect(desk.textContent).toContain('nothing pending');
    expect(desk.textContent).toContain('THE FEAST — granted');
  });

  it('renders the live ask: title, argument, request, expiry, both buttons', async () => {
    await bootShell();
    seedFeast(window.__broStore);
    App.open('journal');
    const desk = App.windows.get('journal').el.querySelector('#petition-desk');
    expect(desk.textContent).toContain('THE FEAST');
    expect(desk.textContent).toContain('Two pizzas. The machine hungers.');
    expect(desk.textContent).toContain('Two pizzas, no questions.');
    expect(desk.textContent).toMatch(/expires in \d+h/);
    expect(desk.querySelector('#petition-grant')).toBeTruthy();
    expect(desk.querySelector('#petition-deny')).toBeTruthy();
  });

  it('GRANT mutates state, pins the 2.0-phrased memory, empties the desk', async () => {
    await bootShell();
    const store = window.__broStore;
    seedFeast(store);
    App.open('journal');
    const pizzasBefore = store.state.counters.pizzas;
    const hungerBefore = store.state.stats.hunger;
    App.windows.get('journal').el.querySelector('#petition-grant').click();
    expect(store.state.counters.pizzas).toBe(pizzasBefore + 2);
    expect(store.state.stats.hunger).toBeGreaterThan(hungerBefore);
    const mem = store.state.memories.find((m) => m.icon === '📜');
    expect(mem.text).toBe('Petitioned you: "THE FEAST" — and you said yes.');
    expect(mem.pinned).toBe(true);
    // Desk re-rendered empty via the subscription.
    const desk = App.windows.get('journal').el.querySelector('#petition-desk');
    expect(desk.textContent).toContain('nothing pending');
    expect(desk.textContent).toContain('THE FEAST — granted');
  });

  it('DENY leaves state untouched, applies deny shifts, unpinned memory', async () => {
    await bootShell();
    const store = window.__broStore;
    seedFeast(store);
    App.open('journal');
    const pizzasBefore = store.state.counters.pizzas;
    const glutBefore = store.state.personality.gluttony;
    const happyBefore = store.state.stats.happy;
    App.windows.get('journal').el.querySelector('#petition-deny').click();
    expect(store.state.counters.pizzas).toBe(pizzasBefore); // no mutation
    expect(store.state.personality.gluttony).toBeGreaterThan(glutBefore); // +4 deny
    expect(store.state.stats.happy).toBeLessThan(happyBefore); // -5 deny
    const mem = store.state.memories.find((m) => m.icon === '📜');
    expect(mem.text).toBe('Petitioned you: "THE FEAST" — and you said no.');
    expect(mem.pinned).toBeFalsy();
  });

  it('model-adjacent petition text is escaped', async () => {
    await bootShell();
    const store = window.__broStore;
    seedFeast(store);
    store.state.petitions.live.argument = '<img src=x onerror=alert(1)>';
    App.open('journal');
    const desk = App.windows.get('journal').el.querySelector('#petition-desk');
    expect(desk.querySelector('img')).toBeNull();
    expect(desk.innerHTML).toContain('&lt;img');
  });
});
