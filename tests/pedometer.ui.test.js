// UI test for STEP.SYNC in the real shell: the SYSTEM.CFG section renders
// status/toggle/desk-job/progress, the ENABLE click runs the permission
// flow (DeviceMotionEvent stubbed — CI has no sensors), the IRL.QUEST row
// appears in the quest widget only while enabled, DESK JOB drives the same
// addSteps path with the reward landing once, and everything stays
// console-silent. Seeded/read via __broStore (house pattern).
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
  window.__broTick?.stop?.(); // the 1s tick must not outlive its test
  window.__broBootOverlay?.stop?.(); // boot timers must not outlive the env
  for (const id of [...(App?.windows?.keys?.() ?? [])]) App.close(id, { silent: true });
  window.App = undefined;
  window.__broStore = undefined;
  window.DeviceMotionEvent = undefined;
  vi.resetModules();
});

async function bootShell() {
  // CI's jsdom HAS working localStorage (Windows node does not), so every
  // boot starts from a clean soul — no pedometer state leaks between cases.
  try { localStorage.clear(); } catch { /* storage-free environments */ }
  try { sessionStorage.clear(); } catch { /* same */ }
  document.head.innerHTML = SHELL_HTML.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
  document.body.innerHTML = SHELL_HTML.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
  document.documentElement.setAttribute('data-theme', 'cyberpunk');
  await import('../src/main.js');
  App = window.App;
}

function openSettings() {
  App.open('settings');
  return App.windows.get('settings');
}

function openMainViewport() {
  // The quest widget lives in the main viewport — App.open('chat') is the
  // neutral dock default; the widget is in the DOM regardless.
  return document;
}

describe('STEP.SYNC — the SYSTEM.CFG section', () => {
  it('renders OFF with ENABLE + DESK JOB buttons and the progress readout', async () => {
    await bootShell();
    const win = openSettings();
    expect(win.el.querySelector('#pedometer-status')?.textContent).toBe('OFF');
    expect(win.el.querySelector('#pedometer-toggle')?.textContent).toBe('ENABLE');
    expect(win.el.querySelector('#pedometer-desk')?.textContent).toContain('DESK JOB');
    expect(win.el.querySelector('#pedometer-bar')).toBeTruthy();
    expect(win.el.querySelector('#pedometer-progress')?.textContent).toContain('today');
    // the IRL quest row is hidden while the pedometer is off
    expect(document.querySelector('#irl-quest-row')?.classList.contains('hidden')).toBe(true);
  });

  it('ENABLE runs the permission flow and flips the status to LISTENING', async () => {
    // jsdom has no DeviceMotionEvent — stub the class the layer checks for
    window.DeviceMotionEvent = class DeviceMotionEvent {};
    await bootShell();
    const win = openSettings();
    win.el.querySelector('#pedometer-toggle').click();
    // requestPermission is absent on the stub → granted implicitly
    await new Promise((r) => setTimeout(r, 0));
    expect(win.el.querySelector('#pedometer-status')?.textContent).toBe('LISTENING');
    expect(win.el.querySelector('#pedometer-toggle')?.textContent).toBe('DISABLE');
    expect(window.__broStore.state.pedometer.enabled).toBe(true);
    // the IRL quest row appears in the quest widget
    expect(document.querySelector('#irl-quest-row')?.classList.contains('hidden')).toBe(false);
  });

  it('a sensorless boot reports UNSUPPORTED and keeps the save disabled', async () => {
    await bootShell(); // no DeviceMotionEvent stub — CI truth
    const win = openSettings();
    win.el.querySelector('#pedometer-toggle').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(win.el.querySelector('#pedometer-status')?.textContent).toContain('NO SENSOR');
    expect(window.__broStore.state.pedometer.enabled).toBe(false);
  });

  it('DISABLE severs the sensor and the row disappears', async () => {
    window.DeviceMotionEvent = class DeviceMotionEvent {};
    await bootShell();
    const win = openSettings();
    win.el.querySelector('#pedometer-toggle').click();
    await new Promise((r) => setTimeout(r, 0));
    win.el.querySelector('#pedometer-toggle').click(); // back off
    await new Promise((r) => setTimeout(r, 0));
    expect(win.el.querySelector('#pedometer-status')?.textContent).toBe('OFF');
    expect(window.__broStore.state.pedometer.enabled).toBe(false);
    expect(document.querySelector('#irl-quest-row')?.classList.contains('hidden')).toBe(true);
  });
});

describe('DESK JOB — the honest desktop lane', () => {
  it('drives the real addSteps path: lifetime, lane, and the once-only reward', async () => {
    window.DeviceMotionEvent = class DeviceMotionEvent {};
    await bootShell();
    const win = openSettings();
    win.el.querySelector('#pedometer-toggle').click();
    await new Promise((r) => setTimeout(r, 0));

    const desk = win.el.querySelector('#pedometer-desk');
    const coins0 = window.__broStore.state.coins;
    desk.click();
    desk.click();
    expect(window.__broStore.state.steps).toBe(500);
    expect(window.__broStore.state.pedometer.today.steps).toBe(500);

    // cross the goal — exactly one reward
    for (let i = 0; i < 6; i++) desk.click();
    const s = window.__broStore.state;
    expect(s.pedometer.today.steps).toBe(2000);
    expect(s.pedometer.today.rewarded).toBe(true);
    expect(s.coins).toBe(coins0 + 40);
    expect(s.memories.filter((m) => m.icon === '👟')).toHaveLength(1);

    // more walking pays nothing more
    desk.click();
    expect(window.__broStore.state.coins).toBe(coins0 + 40);
  });

  it('the STP reward reaches the SYS.LOG via the deferred queue, not a crash', async () => {
    window.DeviceMotionEvent = class DeviceMotionEvent {};
    await bootShell();
    const win = openSettings();
    win.el.querySelector('#pedometer-toggle').click();
    await new Promise((r) => setTimeout(r, 0));
    const desk = win.el.querySelector('#pedometer-desk');
    for (let i = 0; i < 8; i++) desk.click(); // 2000 in one pass
    // the deferred event drains on the next 1s tick
    await new Promise((r) => setTimeout(r, 1300));
    const logText = document.querySelector('#sys-log')?.textContent ?? '';
    expect(logText).toContain('IRL.QUEST complete');
  });
});

describe('persistence in the real shell', () => {
  // This case only means something where jsdom actually provides
  // localStorage (CI's does; some local environments genuinely don't —
  // main.js then falls back to a per-module Map that resetModules wipes).
  // The store-level suite covers lane persistence with injected storage;
  // this one adds "did main.js wire the real storage" on top.
  const HAS_STORAGE = typeof localStorage !== 'undefined';

  it.skipIf(!HAS_STORAGE)('enabled state and today’s lane survive a reload', async () => {
    window.DeviceMotionEvent = class DeviceMotionEvent {};
    await bootShell();
    const win = openSettings();
    win.el.querySelector('#pedometer-toggle').click();
    await new Promise((r) => setTimeout(r, 0));
    win.el.querySelector('#pedometer-desk').click();
    window.__broBootOverlay?.stop?.();
    for (const id of [...(App?.windows?.keys?.() ?? [])]) App.close(id, { silent: true });
    window.App = undefined;
    window.__broStore = undefined;
    vi.resetModules();

    // reload — same storage, fresh boot (DeviceMotionEvent is still stubbed:
    // auto-resume reaches LISTENING; where it would refuse, the save stays
    // enabled and CFG shows TAP TO RESUME — the toggle is the re-arm)
    document.head.innerHTML = SHELL_HTML.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
    document.body.innerHTML = SHELL_HTML.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
    await import('../src/main.js');
    App = window.App;
    const store = window.__broStore;
    expect(store.state.pedometer.enabled).toBe(true);
    expect(store.state.pedometer.today.steps).toBe(250);
    const win2 = openSettings();
    expect(win2.el.querySelector('#pedometer-toggle')?.textContent).toBe('DISABLE');
  });

  it('a fresh boot with no save starts the pedometer off', async () => {
    await bootShell();
    const p = window.__broStore.state.pedometer;
    expect(p.enabled).toBe(false);
    expect(p.today.steps).toBe(0);
    expect(p.today.rewarded).toBe(false);
    expect(p.goal).toBe(2000);
  });
});
