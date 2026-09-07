// UI test for EXPORT FOR BRIDGE in the real shell: the SOUL window's button
// must POST the store's live v3 envelope to /api/bridge-soul and write the
// handoff into Ryan's memory panel.

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('EXPORT FOR BRIDGE (jsdom shell)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts the live v3 envelope and remembers the handoff', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const html = readFileSync('index.html', 'utf8'); // vitest cwd = project root
    document.head.innerHTML = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
    await import('../src/main.js');
    const App = window.App;
    expect(App).toBeTruthy();

    App.open('journal'); // the SOUL.FILE window
    const content = App.windows.get('journal').el.querySelector('.window-content');
    const btn = content.querySelector('#soul-export-bridge');
    expect(btn, 'EXPORT FOR BRIDGE button').toBeTruthy();

    btn.dispatchEvent(new window.Event('click', { bubbles: true }));
    // the boot makes its own fetches (bridge sync) — assert the bridge POST specifically
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => u === '/api/bridge-soul')).toBe(true),
    );

    const [url, init] = fetchMock.mock.calls.find(([u]) => u === '/api/bridge-soul');
    expect(url).toBe('/api/bridge-soul');
    expect(init.method).toBe('POST');
    const envelope = JSON.parse(init.body);
    expect(envelope.v).toBe(3);
    expect(envelope.kind).toBe('bro-os-soul-export');
    expect(envelope.state.soul.who).toBeTruthy();
    expect(envelope.state.soul.quirks.length).toBeGreaterThan(0);

    // the handoff is a lived memory and the window re-rendered with it
    await vi.waitFor(() =>
      expect(content.textContent).toContain('Handed my live soul to the autonomy bridge.'),
    );
    expect(content.textContent).toContain('MEMORIES (1');
  });
});
