// UI test for the BRIDGE.SYS window in the real shell: the dock opens it,
// the panel renders the harness's live state/caps/log from the fixture
// endpoint (with log text escaped — actions.log carries model output), and
// SYNC re-reads. Closing the window clears the auto-refresh interval.

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';

const STATUS_FIXTURE = {
  ok: true,
  handle: 'KlunkDunker',
  autonomy: true,
  registered: false,
  agentId: null,
  day: '2026-09-07',
  lastTickAt: '2026-09-07T01:14:04.227Z',
  lastPostAt: '2026-09-07T01:06:24.301Z',
  lastCommentAt: null,
  caps: { posts: 2, comments: 6, dms: 2 },
  today: { posts: 1, comments: 2, dms: 0 },
  actions: [
    { t: '2026-09-07T01:06:24.300Z', kind: 'dry', text: 'DRY-RUN POST /posts <img src=x onerror=alert(1)>' },
    { t: '2026-09-07T01:14:04.227Z', kind: 'dry', text: 'DRY-RUN GET /posts?sort=hot&limit=10' },
  ],
};

describe('BRIDGE.SYS window (jsdom shell)', () => {
  afterEach(() => {
    window.__broBootOverlay?.stop?.(); // boot timers must not outlive the env
    window.App?.close('bridge', { silent: true });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders live autonomy state, caps, and escaped actions.log; SYNC re-reads; teardown stops the loop', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => STATUS_FIXTURE,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const html = readFileSync('index.html', 'utf8'); // vitest cwd = project root
    document.head.innerHTML = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
    await import('../src/main.js');
    const App = window.App;
    expect(App).toBeTruthy();

    App.open('bridge');
    const content = App.windows.get('bridge').el.querySelector('.window-content');

    // live state + caps rendered from the fixture
    await vi.waitFor(() => expect(content.textContent).toContain('@KlunkDunker'));
    expect(content.textContent).toContain('ON');
    expect(content.textContent).toContain('POSTS 1/2');
    expect(content.textContent).toContain('COMMENTS 2/6');
    expect(content.textContent).toContain('DMS 0/2');

    // actions.log carries model output — tags must be escaped, not injected
    const bodyHtml = content.querySelector('#bridge-body').innerHTML;
    expect(bodyHtml).not.toContain('<img');
    expect(bodyHtml).toContain('&lt;img');

    // SYNC re-reads (initial boot fetches excluded from the count)
    const readsAfterBoot = fetchMock.mock.calls.filter(([u]) => u === '/api/bridge-status').length;
    content.querySelector('#bridge-refresh').dispatchEvent(new window.Event('click', { bubbles: true }));
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.filter(([u]) => u === '/api/bridge-status').length).toBeGreaterThan(readsAfterBoot),
    );

    // teardown clears the 15s auto-refresh interval
    const intervalSpy = vi.spyOn(window, 'clearInterval');
    App.close('bridge');
    expect(intervalSpy).toHaveBeenCalled();
  });

  it('renders an offline note when the endpoint is unreachable (static hosting)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    const html = readFileSync('index.html', 'utf8');
    document.head.innerHTML = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
    await import('../src/main.js');

    window.App.open('bridge');
    const content = window.App.windows.get('bridge').el.querySelector('.window-content');
    await vi.waitFor(() => expect(content.textContent).toContain('BRIDGE OFFLINE'));
    expect(content.textContent).toContain('dev/preview server');
  });
});
