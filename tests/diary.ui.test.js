// UI test for the MOLT JOURNAL window (DIARY.APP) in the real shell: the
// dock's tenth button opens it, day cards render the rollover lines paired
// with that local day's 🪶 memories, a memory chip jumps to its Moltbook
// thread, the live store subscription re-renders, and diary text (model-
// adjacent) is escaped. Diary rows are seeded via __broStore because the
// rollover only writes them at midnight.
//
// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

const SHELL_HTML = readFileSync('index.html', 'utf8');

let App;
let realGetContext;
let realConsoleError;
let realCreateObjectURL;
let realRevokeObjectURL;
let RealBlob;
let realDownloadDesc;

beforeAll(() => {
  realConsoleError = console.error;
  console.error = (...args) => {
    if (String(args[0]).includes('Not implemented')) return; // jsdom noise
    realConsoleError(...args);
  };
  RealBlob = globalThis.Blob;
  realCreateObjectURL = URL.createObjectURL;
  realRevokeObjectURL = URL.revokeObjectURL;
  realDownloadDesc = Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, 'download');
  // jsdom has no 2D context — the pet viewport draws on boot.
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
  Object.defineProperty(HTMLAnchorElement.prototype, 'download', realDownloadDesc);
});

// Capture EXPORT DAY downloads: jsdom's Blob lacks .text() and its
// FileReader stalls under fake timers, so capture the constructor string
// itself; stub both URL statics (jsdom lacks revokeObjectURL, which
// downloadJSON defers via setTimeout).
function captureDownloads() {
  const downloads = [];
  const filenames = [];
  URL.createObjectURL = vi.fn(() => `blob:test-${downloads.length}`);
  URL.revokeObjectURL = vi.fn();
  globalThis.Blob = class extends RealBlob {
    constructor(parts, opts) {
      super(parts, opts);
      downloads.push({ text: String(Array.isArray(parts) ? parts[0] ?? '' : '') });
    }
  };
  Object.defineProperty(HTMLAnchorElement.prototype, 'download', {
    set(v) { filenames.push(String(v)); realDownloadDesc.set.call(this, v); },
    get() { return realDownloadDesc.get.call(this); },
    configurable: true,
  });
  return { downloads, filenames };
}

afterEach(() => {
  for (const id of [...(App?.windows?.keys?.() ?? [])]) App.close(id, { silent: true });
  window.App = undefined;
  window.__broStore = undefined;
  vi.resetModules();
});

async function bootShell() {
  // CI's jsdom HAS working localStorage (Windows node does not), so the
  // store would otherwise persist across tests in this file and leak
  // seeded diary rows between cases. Every boot starts from a clean soul.
  try { localStorage.clear(); } catch { /* storage-free environments */ }
  try { sessionStorage.clear(); } catch { /* same */ }
  document.head.innerHTML = SHELL_HTML.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
  document.body.innerHTML = SHELL_HTML.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
  document.documentElement.setAttribute('data-theme', 'cyberpunk');
  await import('../src/main.js');
  App = window.App;
}

// Fixed LOCAL timestamp: noon on the 14th, whatever the machine's zone is.
const DAY14 = new Date(2026, 8, 14, 12, 0, 0).getTime();

function seedDiaryDay(store) {
  store.state.diary.push({ t: DAY14, icon: '📖', text: 'ordered 2 pizzas, hacked the mainframe 1 time' });
  store.state.memories.push({ id: 'm-diary-1', t: DAY14, icon: '⛏', text: 'mined the good vein', imp: 3 });
  store.state.memories.push({ id: 'm-diary-2', t: DAY14, icon: '🪶', text: 'echoed into the tide', imp: 2, post: 'seed-crab' });
}

describe('MOLT JOURNAL (DIARY.APP)', () => {
  it('is the tenth dock app and opens onto blank pages on a fresh soul', async () => {
    await bootShell();
    const dockBtns = document.querySelectorAll('#dock .dock-btn');
    expect(dockBtns.length).toBe(10);
    // jsdom cannot bind module globals into inline onclick handlers (same
    // harness-realm quirk the button sweep documents), so parse the handler
    // and open through App — the exact behavior the handler performs.
    const btn = [...dockBtns].find((b) => b.getAttribute('onclick')?.includes("'diary'"));
    expect(btn.getAttribute('onclick')).toMatch(/App\.open\('diary'\)/);
    App.open('diary');
    const w = App.windows.get('diary');
    expect(w).toBeTruthy();
    expect(w.el.querySelector('.window-title').textContent).toContain('MOLT JOURNAL');
    expect(w.el.querySelector('#diary-body').textContent).toContain('Blank pages');
  });

  it('pairs each day\u2019s rollover lines with that day\u2019s memories, newest day first', async () => {
    await bootShell();
    seedDiaryDay(window.__broStore);
    // an older day with only memories (no rollover lines that day)
    window.__broStore.state.memories.push({ id: 'm-old', t: DAY14 - 86400000, icon: '🕹', text: 'set the Breaker record', imp: 4, pinned: true });
    App.open('diary');
    const body = App.windows.get('diary').el.querySelector('#diary-body');
    const text = body.textContent;
    expect(text).toContain('2 DAY(S)'); // grouped, not per-row
    expect(text).toContain('2026-09-14');
    expect(text).toContain('ordered 2 pizzas');
    expect(text).toContain('mined the good vein');
    expect(text).toContain('set the Breaker record');
    expect(text).toContain('📌'); // pinned marker survives the projection
    const headers = [...body.querySelectorAll('.text-neon-amber')].map((h) => h.textContent);
    expect(headers.findIndex((h) => h.includes('2026-09-14'))).toBeLessThan(headers.findIndex((h) => h.includes('2026-09-13')));
  });

  it('memory chips jump to their Moltbook thread through the real handler', async () => {
    await bootShell();
    seedDiaryDay(window.__broStore);
    App.open('diary');
    const chip = App.windows.get('diary').el.querySelector('.diary-echo-btn');
    expect(chip?.dataset.echoPost).toBe('seed-crab');
    chip.click();
    expect(App.windows.get('moltbook')).toBeTruthy(); // the thread's window opened
  });

  it('re-renders live when a new memory lands while the window is open', async () => {
    await bootShell();
    App.open('diary');
    window.__broStore.rememberEvent('learned to juggle int32s', { icon: '🎪', imp: 2 });
    const body = App.windows.get('diary').el.querySelector('#diary-body');
    expect(body.textContent).toContain('learned to juggle int32s');
  });

  it('escapes diary and memory text — no injection from model-adjacent strings', async () => {
    await bootShell();
    window.__broStore.state.diary.push({ t: DAY14, icon: '📖', text: '<img src=x onerror=alert(1)> quiet day' });
    App.open('diary');
    const body = App.windows.get('diary').el.querySelector('#diary-body');
    expect(body.querySelector('img')).toBeNull();
    expect(body.textContent).toContain('<img src=x');
  });

  it('EXPORT DAY saves that day\u2019s lines + memories as a plain-text file', async () => {
    await bootShell();
    seedDiaryDay(window.__broStore);
    const { downloads, filenames } = captureDownloads();
    App.open('diary');
    const btn = App.windows.get('diary').el.querySelector('.diary-export-btn');
    expect(btn.dataset.exportDay).toBe('2026-09-14');
    btn.click();
    expect(filenames).toEqual(['ryan-diary-2026-09-14.txt']);
    const text = downloads[0].text;
    expect(text).toContain('MOLT JOURNAL — 2026-09-14');
    expect(text).toContain('DIARY (rollover)');
    expect(text).toContain('ordered 2 pizzas, hacked the mainframe 1 time');
    expect(text).toContain('mined the good vein');
    expect(text).toContain('(from moltbook thread seed-crab)');
    expect(text.includes('\r\n')).toBe(true); // Notepad-friendly line endings
    // exactly one day: the memory from the day before must NOT be in the file
    expect(text).not.toContain('set the Breaker record');
  });

  it('EXPORT DAY on a sparse day emits the honest placeholders, not silence', async () => {
    await bootShell();
    window.__broStore.state.memories.push({ id: 'm-only', t: DAY14, icon: '🕹', text: 'played all night', imp: 2 });
    const { downloads, filenames } = captureDownloads();
    App.open('diary');
    App.windows.get('diary').el.querySelector('.diary-export-btn').click();
    expect(filenames[0]).toBe('ryan-diary-2026-09-14.txt');
    const text = downloads[0].text;
    expect(text).toContain('(no rollover entry)');
    expect(text).toContain('played all night');
    expect(text).toContain('MEMORIES (1)');
  });
});
