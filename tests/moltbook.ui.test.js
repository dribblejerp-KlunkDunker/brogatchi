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
let realGetContext;
beforeAll(() => {
  console.error = (...args) => {
    if (String(args[0]).includes('Not implemented')) return;
    realConsoleError(...args);
  };
  // jsdom has no 2D context — same absorbing stub as the other UI suites, so
  // PIXEL.STUDIO and the gallery's sprite canvases both really run here.
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

describe('moltbook UI: sprite gallery', () => {
  it('shows the pilgrim shelf and shares a creation onto the feed', async () => {
    await bootShell();
    const c = moltbookContent();
    c.querySelector('#molt-tab-gallery').click();

    const cells = [...c.querySelectorAll('#molt-feed [data-creation-id]')];
    expect(cells.length).toBeGreaterThanOrEqual(2);
    expect(cells.some((el) => el.textContent.includes('@crab_404'))).toBe(true);
    expect(cells[0].querySelector('canvas'), 'creations render as sprites').toBeTruthy();

    const crab = cells.find((el) => el.textContent.includes('BRASS CRAB'));
    crab.querySelector('.molt-share-btn').click();

    // The share lands the painting at the top of the LIVE feed, sprite attached
    expect(c.querySelector('#molt-tab-live').getAttribute('aria-selected')).toBe('true');
    const top = c.querySelector('#molt-feed [data-molt-id]');
    expect(top.textContent).toContain('BRASS CRAB');
    expect(top.querySelector('.molt-sprite-slot canvas')).toBeTruthy();

    const log = [...document.querySelectorAll('#sys-log div')].map((d) => d.textContent);
    expect(log.some((t) => t.includes('[MOLT]') && t.includes('shared to the tidepool'))).toBe(true);
  });

  it('a painting posted from PIXEL.STUDIO lands in the gallery and the feed', async () => {
    await bootShell();
    App.open('pixelstudio');
    const studio = App.windows.get('pixelstudio').el.querySelector('.window-content');
    studio.querySelector('#px-name').value = 'MOONSPUD';
    studio.querySelector('#px-post').click();
    expect(studio.querySelector('#px-status').textContent).toContain('POSTED');

    const c = moltbookContent();
    const top = c.querySelector('#molt-feed [data-molt-id]');
    expect(top.textContent).toContain('MOONSPUD');
    expect(top.querySelector('.molt-sprite-slot canvas')).toBeTruthy();

    c.querySelector('#molt-tab-gallery').click();
    expect(c.querySelector('#molt-feed').textContent).toContain('MOONSPUD');
  });
});

describe('moltbook UI: 🪶 memory echo', () => {
  function soulRow(needle) {
    App.open('journal'); // SOUL.FILE
    const soul = App.windows.get('journal').el.querySelector('.window-content');
    return [...soul.querySelectorAll('[data-mem-id]')].find((li) => li.textContent.includes(needle));
  }

  it('a post leaves a linked 🪶 memory that hands you back to the thread', async () => {
    await bootShell();
    postViaComposer('echo regression: hello tide');
    const threadId = [...moltbookContent().querySelectorAll('#molt-feed > div')]
      .find((d) => d.textContent.includes('echo regression')).dataset.moltId;
    postViaComposer('a later, unrelated post'); // so the echo is NOT the newest thread

    const row = soulRow('echo regression');
    expect(row.textContent).toContain('🪶');
    const link = row.querySelector('.mem-echo-btn');
    expect(link.dataset.echoPost).toBe(threadId);

    // park the tidepool on the gallery tab — the link has to find the thread
    // anyway, come back to the feed, and light up that exact post
    const c = moltbookContent();
    c.querySelector('#molt-tab-gallery').click();
    expect(c.querySelector('#molt-tab-live').getAttribute('aria-selected')).toBe('false');

    link.click();
    const after = moltbookContent();
    expect(after.querySelector('#molt-tab-live').getAttribute('aria-selected')).toBe('true');
    const lit = after.querySelector('#molt-feed .molt-echo');
    expect(lit).toBeTruthy();
    expect(lit.dataset.moltId).toBe(threadId);
    expect(lit.dataset.moltId).not.toBe(after.querySelector('#molt-feed [data-molt-id]').dataset.moltId);
  });

  it('a link whose thread has drifted out of the tideline says so', async () => {
    await bootShell();
    App.open('journal');
    const soul = App.windows.get('journal').el.querySelector('.window-content');
    soul.querySelector('#soul-copy').click(); // fills the textarea with the live export
    const ta = soul.querySelector('#soul-io-text');
    const save = JSON.parse(ta.value); // { v, kind, state, legacySnapshot }
    save.state.memories = [{
      id: 'ghost', icon: '🪶', text: 'Posted to the tidepool: "long gone"', imp: 2, t: Date.now(), post: 'm-drifted',
    }];
    ta.value = JSON.stringify(save);
    soul.querySelector('#soul-import-apply').click();

    const link = soulRow('long gone').querySelector('.mem-echo-btn');
    expect(link.dataset.echoPost).toBe('m-drifted');
    link.click();

    expect(moltbookContent().querySelector('#molt-feed .molt-echo')).toBeNull();
    expect(document.getElementById('toast-layer').textContent).toContain('DRIFTED');
  });
});

describe('moltbook UI: equipped sprites', () => {
  // jsdom has no PointerEvent; the studio listens for pointerdown and only
  // reads coordinates, so a MouseEvent carries them fine.
  function press(canvas, px, py) {
    canvas.dispatchEvent(new window.MouseEvent('pointerdown', { clientX: px, clientY: py, bubbles: true }));
  }

  it('gallery EQUIP benches in PIXEL.STUDIO; APPLY posts it equipped, the tide comments, the shelf reads EQUIPPED', async () => {
    await bootShell();
    vi.spyOn(Math, 'random').mockReturnValue(0); // force the tide to answer (0 < 0.55)
    vi.useFakeTimers();

    // Paint a COIN-shaped creation and hang it on the shelf.
    App.open('pixelstudio');
    const studio = App.windows.get('pixelstudio').el.querySelector('.window-content');
    const slotEl = studio.querySelector('#px-slot');
    slotEl.value = 'COIN'; // bank COIN art (12×10) loads onto the bench
    slotEl.dispatchEvent(new window.Event('change', { bubbles: true }));
    const canvas = studio.querySelector('#px-canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 256, height: 256 });
    press(canvas, 8, 8); // one red pixel — art no bank sprite has
    studio.querySelector('#px-name').value = 'TIDE_COIN';
    studio.querySelector('#px-save').click();

    // The gallery offers EQUIP on it; taking it benches the creation.
    const c = moltbookContent();
    c.querySelector('#molt-tab-gallery').click();
    const cell = [...c.querySelectorAll('[data-creation-id]')].find((el) => el.textContent.includes('TIDE_COIN'));
    expect(cell.querySelector('.molt-equip-btn')).toBeTruthy();
    cell.querySelector('.molt-equip-btn').click();

    const benched = App.windows.get('pixelstudio').el.querySelector('.window-content');
    expect(benched.querySelector('#px-name').value).toBe('TIDE_COIN');
    expect(benched.querySelector('#px-status').textContent).toContain('FITS COIN');

    // Pick the slot and APPLY — the painting goes live in the cabinet.
    const slotEl2 = benched.querySelector('#px-slot');
    slotEl2.value = 'COIN';
    slotEl2.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(benched.querySelector('#px-status').textContent).toContain('SHELF ART ON BENCH');
    benched.querySelector('#px-apply').click();

    // The equipped post lands on the feed with the badge, and the tide's
    // reply (deferred 3.5s+) arrives inside its thread.
    vi.advanceTimersByTime(4000);
    c.querySelector('#molt-tab-live').click(); // the equip left the tidepool on the gallery
    const top = c.querySelector('#molt-feed [data-molt-id]');
    expect(top.textContent).toContain('EQUIPPED → COIN');
    expect(top.textContent).toContain('TIDE_COIN');
    expect(top.querySelector('.molt-sprite-slot canvas')).toBeTruthy();
    // the tide's reply names the slot and the game in the pilgrim's voice
    expect(top.querySelector('.molt-replies').textContent).toContain('COIN');
    expect(top.querySelector('.molt-replies').textContent).toContain('LOOT SHOWER');

    // Back to the shelf: the creation now reads as equipped, not shareable.
    c.querySelector('#molt-tab-gallery').click();
    const after = [...c.querySelectorAll('[data-creation-id]')].find((el) => el.textContent.includes('TIDE_COIN'));
    expect(after.className).toContain('border-neon-green');
    expect(after.textContent).toContain('EQUIPPED → COIN');
    expect(after.querySelector('.molt-share-btn')).toBeNull();
    // an unequipped creation keeps both controls
    const crab = [...c.querySelectorAll('[data-creation-id]')].find((el) => el.textContent.includes('BRASS CRAB'));
    expect(crab.querySelector('.molt-equip-btn')).toBeTruthy();
    expect(crab.querySelector('.molt-share-btn')).toBeTruthy();
  });
});

describe('moltbook UI: thread holds (📌)', () => {
  it('the hold button pins the echo, marks the thread HELD, and a held thread survives a 40-post tide', async () => {
    await bootShell();
    const c = moltbookContent();

    // post through the real composer, then hold it through the real button
    postViaComposer('the one worth keeping');
    const card = [...c.querySelectorAll('#molt-feed > div')].find((d) => d.dataset.moltId);
    const holdBtn = card.querySelector('.molt-hold-btn');
    expect(holdBtn).toBeTruthy();
    expect(holdBtn.getAttribute('aria-pressed')).toBe('false');

    holdBtn.click();
    // echo memory for this post is now pinned in the soul
    const post = window.__broStore.state.molt.posts.find((p) => p.id === card.dataset.moltId);
    expect(window.__broStore.state.memories.some((m) => m.pinned && m.post === String(post.id))).toBe(true);

    // re-render shows HELD state
    const heldBtn = [...moltbookContent().querySelectorAll('.molt-hold-btn')]
      .find((b) => b.dataset.holdPost === post.id);
    expect(heldBtn.getAttribute('aria-pressed')).toBe('true');
    expect(heldBtn.textContent).toBe('📌');

    // flood the feed past the cap — the held thread must not drift out
    for (let i = 0; i < 40; i++) postViaComposer(`tide noise ${i}`);
    const feed = [...moltbookContent().querySelectorAll('#molt-feed > div')].map((d) => d.dataset.moltId);
    expect(feed).toContain(post.id);
    expect(feed.length).toBeLessThanOrEqual(31);

    // release it: the pin lifts (button back to 📍), and the thread —
    // surfaced to the front while held — drifts out over the next tide
    [...moltbookContent().querySelectorAll('.molt-hold-btn')]
      .find((b) => b.dataset.holdPost === post.id).click();
    expect(window.__broStore.state.memories.some((m) => m.pinned && m.post === String(post.id))).toBe(false);
    const releasedBtn = [...moltbookContent().querySelectorAll('.molt-hold-btn')]
      .find((b) => b.dataset.holdPost === post.id);
    expect(releasedBtn.textContent).toBe('📍');
    for (let i = 40; i < 71; i++) postViaComposer(`tide noise ${i}`);
    expect([...moltbookContent().querySelectorAll('#molt-feed > div')].map((d) => d.dataset.moltId))
      .not.toContain(post.id);
  });

  it('unpinning the 🪶 memory in SOUL.FILE releases the thread too — one pin, two views', async () => {
    await bootShell();
    const c = moltbookContent();
    postViaComposer('single source of truth');
    const post = window.__broStore.state.molt.posts[0];
    [...c.querySelectorAll('.molt-hold-btn')].find((b) => b.dataset.holdPost === post.id).click();

    // release from the SOUL side instead of the tideline
    window.__broStore.toggleMemoryPin(
      window.__broStore.state.memories.find((m) => m.post === String(post.id)).id,
    );
    expect(window.__broStore.state.memories.some((m) => m.pinned && m.post === String(post.id))).toBe(false);

    // the store-level hold view agrees: unheld, the next tide takes it
    for (let i = 0; i < 31; i++) postViaComposer(`wave ${i}`);
    expect(window.__broStore.state.molt.posts.some((p) => p.id === post.id)).toBe(false);
  });
});
