import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// Boots the real index.html in jsdom and runs the real main.js against it.
// Catches id/class drift between the shell HTML and the shell JS.
describe('shell smoke (jsdom)', () => {
  it('main.js boots and the window manager works', async () => {
    const html = readFileSync('index.html', 'utf8'); // vitest cwd = project root
    document.head.innerHTML = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
    document.documentElement.setAttribute('data-theme', 'cyberpunk');

    await import('../src/main.js');
    const App = window.App;
    expect(App).toBeTruthy();

    // live rendering happened (coins padded, clock element filled by ticker)
    expect(document.getElementById('sys-coins').textContent).toBe('060');
    expect(document.getElementById('sys-log').children.length).toBeGreaterThan(0);

    // open every windowed app; each template must wire without throwing
    for (const id of ['chat', 'arcade', 'shop', 'composer', 'moltbook', 'jooh', 'journal', 'settings']) {
      App.open(id);
      expect(document.querySelector(`#window-layer .os-window`), `window ${id}`).toBeTruthy();
      const w = App.windows.get(id);
      expect(w, `registered ${id}`).toBeTruthy();
      expect(w.el.querySelector('.window-content').children.length, `content ${id}`).toBeGreaterThan(0);
    }
    expect(App.windows.size).toBe(8);

    // quick actions must not throw
    App.feed(); App.play(); App.toggleMine(); App.rest(); App.rest();

    // shop purchase path: enough coins for a pizza
    const shopContent = App.windows.get('shop').el.querySelector('.window-content');
    const buyBtn = shopContent.querySelector('.buy-btn');
    buyBtn.dispatchEvent(new window.Event('click', { bubbles: true }));

    // settings theme switch must flip <html data-theme>
    const settingsContent = App.windows.get('settings').el.querySelector('.window-content');
    const select = settingsContent.querySelector('#theme-select');
    select.value = 'area51';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(document.documentElement.dataset.theme).toBe('area51');

    // close everything cleanly (teardowns must not throw)
    for (const id of ['chat', 'arcade', 'shop', 'composer', 'moltbook', 'jooh', 'journal', 'settings']) {
      App.close(id);
    }
    expect(App.windows.size).toBe(0);
  }, 20000);
});
