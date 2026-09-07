import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// Boots the REAL index.html + main.js in jsdom and exercises the Moltbook
// UI flows end-to-end: composer → post, reply-into-thread, adopt with the
// pre-mutation roster backup download, and the completed-quest renderAll
// regression (destroyed #quest-mined / #quest-goal-2 spans).
//
// jsdom has no usable localStorage here, so main.js boots in VOLATILE mode
// (in-memory fallback). Persistence itself is covered by state/persist unit
// tests; these tests assert on the DOM and on the captured download payloads.

const SHELL_HTML = readFileSync('index.html', 'utf8');

// jsdom cannot navigate (anchor clicks, location.reload in factory reset) and
// warns via console.error — filter just that noise, keep real errors visible.
const realConsoleError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (String(args[0]).includes('Not implemented')) return;
    realConsoleError(...args);
  };
});
afterAll(() => { console.error = realConsoleError; });

let App;
let realCreateObjectURL;
let realRevokeObjectURL;
let RealBlob;
let realDownloadDesc;

async function bootShell() {
  document.head.innerHTML = SHELL_HTML.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
  document.body.innerHTML = SHELL_HTML.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
  document.documentElement.setAttribute('data-theme', 'cyberpunk');
  await import('../src/main.js'); // re-executed per test (vi.resetModules in afterEach)
  App = window.App;
  // Deterministic slate: module state can leak between tests in this
  // environment, so wipe it through the app's own factory reset.
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  App.open('settings');
  App.windows.get('settings').el.querySelector('.window-content #reset-data').click();
  confirmSpy.mockRestore();
  App.close('settings', { silent: true });
}

// Capture roster-backup downloads. jsdom's Blob has no .text() and its
// FileReader stalls under fake timers, so we capture the constructor string
// itself. Also stubs both URL statics (jsdom lacks revokeObjectURL, which
// downloadJSON calls from a deferred setTimeout).
function captureDownloads() {
  const downloads = []; // { text }
  const filenames = []; // anchor `download` attribute values
  URL.createObjectURL = vi.fn(() => `blob:test-${downloads.length}`);
  URL.revokeObjectURL = vi.fn();
  globalThis.Blob = class extends RealBlob {
    constructor(parts, opts) {
      super(parts, opts);
      downloads.push({ text: String(Array.isArray(parts) ? parts[0] ?? '' : '') });
    }
  };
  // downloadJSON appends + clicks + removes the anchor synchronously, so it
  // never lingers in the DOM — intercept the download property on the
  // prototype instead (safe receiver, no document patching).
  Object.defineProperty(HTMLAnchorElement.prototype, 'download', {
    set(v) { filenames.push(String(v)); realDownloadDesc.set.call(this, v); },
    get() { return realDownloadDesc.get.call(this); },
    configurable: true,
  });
  return { downloads, filenames };
}

function stubBlockedDownload() {
  URL.createObjectURL = vi.fn(() => { throw new Error('sandbox blocks downloads'); });
  URL.revokeObjectURL = vi.fn();
}

function moltbookContent() {
  App.open('moltbook');
  return App.windows.get('moltbook').el.querySelector('.window-content');
}

function postViaComposer(text) {
  const c = moltbookContent();
  c.querySelector('#molt-new-btn').click();
  c.querySelector('#molt-input').value = text;
  c.querySelector('#molt-post').click();
}

function crabCard() {
  return [...moltbookContent().querySelectorAll('#molt-feed > div')]
    .find((d) => d.textContent.includes('@crab_404'));
}

// Run the real 1s tick loop until the daily quest completes (20 mined CR at
// 1 CR / 6s). This recreates the exact UI state that used to crash
// renderAll(): the quest card's innerHTML is rewritten to COMPLETE ✓,
// destroying the #quest-mined / #quest-goal-2 spans it also dereferences.
function completeDailyQuest() {
  vi.advanceTimersByTime(126 * 1000); // 126 ticker seconds → 21 mining intervals
  expect(document.getElementById('quest-state').textContent).toContain('COMPLETE ✓');
}

beforeEach(() => {
  vi.useFakeTimers();
  realCreateObjectURL = URL.createObjectURL;
  realRevokeObjectURL = URL.revokeObjectURL;
  RealBlob = globalThis.Blob;
  realDownloadDesc = Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, 'download');
});
afterEach(() => {
  vi.runOnlyPendingTimers(); // flush deferred revokes / tide replies
  URL.createObjectURL = realCreateObjectURL;
  URL.revokeObjectURL = realRevokeObjectURL;
  globalThis.Blob = RealBlob;
  Object.defineProperty(HTMLAnchorElement.prototype, 'download', realDownloadDesc);
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const id of [...(App?.windows?.keys?.() ?? [])]) App.close(id, { silent: true });
  window.App = undefined;
  vi.resetModules(); // fresh store + fresh 1s ticker under the NEXT test's fake timers
});

describe('moltbook UI: post flow', () => {
  it('empty posts are rejected — no feed entry, no SYSLOG line', async () => {
    await bootShell();
    const c = moltbookContent();
    const feedBefore = c.querySelectorAll('#molt-feed > div').length;
    const logBefore = document.querySelectorAll('#sys-log div').length;

    c.querySelector('#molt-new-btn').click();
    c.querySelector('#molt-input').value = '   ';
    c.querySelector('#molt-post').click();

    expect(c.querySelectorAll('#molt-feed > div').length).toBe(feedBefore);
    expect(document.querySelectorAll('#sys-log div').length).toBe(logBefore);
  });

  it('transmit lands the post at the top of the feed, escaped, +3 XP, composer hides', async () => {
    await bootShell();
    postViaComposer('regression sweep: hello tide <script>alert(1)</script>');

    const first = moltbookContent().querySelector('#molt-feed > div');
    expect(first.textContent).toContain('regression sweep');
    expect(first.innerHTML).toContain('&lt;script&gt;'); // escaped as text, not markup
    expect(document.getElementById('stat-xp').textContent).toBe('3/60');
    expect(App.windows.get('moltbook').el.querySelector('#molt-composer').classList.contains('hidden')).toBe(true);
  });

  it('transmit logs a MOLT line to SYSLOG and lights the third eye', async () => {
    await bootShell();
    postViaComposer('syslog check');
    const log = [...document.querySelectorAll('#sys-log div')].map((d) => d.textContent);
    expect(log.some((t) => t.includes('[MOLT]') && t.includes('post transmitted to tidepool'))).toBe(true);
    expect(Number(document.getElementById('molt-eye-xp').textContent)).toBeGreaterThanOrEqual(3);
  });
});

describe('moltbook UI: in-thread replies', () => {
  it('SIGNAL posts the reply into the thread, bumps heat +2, re-renders inline', async () => {
    await bootShell();
    const heatBefore = Number(crabCard().querySelector('.molt-heat-btn').textContent.replace(/\D/g, ''));
    const seedReplies = crabCard().querySelectorAll('.molt-reply').length; // seed thread ships with one

    crabCard().querySelector('.molt-reply-toggle').click();
    crabCard().querySelector('.molt-reply-input').value = 'ui reply regression';
    crabCard().querySelector('.molt-reply-send').click();

    const after = crabCard();
    expect(after.querySelector('.molt-reply-toggle').textContent).toContain(`${seedReplies + 1} REPLIES`);
    expect(Number(after.querySelector('.molt-heat-btn').textContent.replace(/\D/g, ''))).toBe(heatBefore + 2);
    expect([...after.querySelectorAll('.molt-reply')].at(-1).textContent).toContain('ui reply regression');
  });

  it('the tide answers inside the thread ~55% of the time (forced)', async () => {
    await bootShell();
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0); // force the reply branch
    postViaComposer('summon the tide deterministically');
    spy.mockRestore();

    vi.advanceTimersByTime(3500);
    const mine = [...moltbookContent().querySelectorAll('#molt-feed > div')]
      .find((d) => d.textContent.includes('summon the tide'));
    expect(mine.querySelector('.molt-reply-toggle').textContent).toContain('1 REPLY');
    expect(mine.querySelector('.molt-reply').textContent).toContain('@crab_404');
  });

  it('after the daily quest completes, tide replies still schedule (renderAll crash regression)', async () => {
    await bootShell();
    completeDailyQuest(); // spans destroyed — the old bug threw here every second

    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    postViaComposer('must not crash on rewarded quest');
    spy.mockRestore();

    vi.advanceTimersByTime(3500);
    const mine = [...moltbookContent().querySelectorAll('#molt-feed > div')]
      .find((d) => d.textContent.includes('must not crash'));
    expect(mine, 'post rendered').toBeTruthy();
    expect(mine.querySelector('.molt-reply-toggle').textContent).toContain('1 REPLY');
  });
});

describe('moltbook UI: adopt + roster backup', () => {
  it('ADOPT creates the backup blob BEFORE mutation, ushers, and blocks re-adopt', async () => {
    await bootShell();
    const { downloads, filenames } = captureDownloads();

    const c = moltbookContent();
    expect(c.querySelector('[data-adopt="rookie"]')).toBeTruthy();
    c.querySelector('[data-adopt="rookie"]').click();

    // 1) exactly one JSON payload captured, and it is a PRE-mutation backup
    expect(downloads).toHaveLength(1);
    const payload = JSON.parse(downloads[0].text);
    expect(payload.kind).toBe('bro-os-roster-backup');
    expect(payload.roster).toEqual([]); // roster still empty at backup time
    expect(payload.molt.posts.length).toBeGreaterThan(0);
    expect(payload.soul).toBeTruthy();

    // 2) anchor carried the dated filename (captured at creation — the
    // anchor is removed from the DOM synchronously after the click)
    expect(filenames).toEqual([`roster-backup-${new Date().toISOString().slice(0, 10)}.json`]);

    // 3) UI mutated after the backup: roster count, card state
    expect(c.querySelector('#roster-count').textContent).toBe('1');
    expect(c.querySelector('[data-adopt="rookie"]')).toBeNull();
    expect(c.textContent).toContain('USHERED ✓');

    // 4) adoption logged
    const log = [...document.querySelectorAll('#sys-log div')].map((d) => d.textContent);
    expect(log.some((t) => t.includes('[MOLT]') && t.includes('MOLT-ROOKIE ushered'))).toBe(true);
  });

  it('backup download failing (sandbox) still completes the adoption', async () => {
    await bootShell();
    stubBlockedDownload();

    moltbookContent().querySelector('[data-adopt="blitz"]').click();

    expect(moltbookContent().querySelector('#roster-count').textContent).toBe('1');
    expect(moltbookContent().textContent).toContain('USHERED ✓');
    const toast = [...document.querySelectorAll('#toast-layer .toast')].map((t) => t.textContent).join(' ');
    expect(toast).toContain('sandbox blocked the backup file');
  });

  it('second ADOPT backs up a roster that already contains the first pilgrim', async () => {
    await bootShell();
    const { downloads } = captureDownloads();

    const c = moltbookContent();
    c.querySelector('[data-adopt="rookie"]').click();
    c.querySelector('[data-adopt="doze"]').click();

    expect(downloads).toHaveLength(2);
    const second = JSON.parse(downloads[1].text);
    expect(second.roster.map((r) => r.id)).toEqual(['rookie']); // pre-2nd-adopt snapshot
    expect(c.querySelector('#roster-count').textContent).toBe('2');
    expect(c.textContent).toContain('DOZE-BARNACLE');
  });
});
