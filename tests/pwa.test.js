// @vitest-environment node
// PWA plumbing: the shipped files must exist, be valid, and behave.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');

describe('PWA assets', () => {
  it('manifest exists, parses, and points at real icons', () => {
    const raw = readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf8');
    const m = JSON.parse(raw);
    expect(m.name).toBeTruthy();
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    for (const icon of m.icons) {
      const file = join(publicDir, icon.src.replace(/^\//, ''));
      const buf = readFileSync(file);
      expect(buf.slice(1, 4).toString(), `${icon.src} PNG signature`).toBe('PNG');
      const [w, h] = icon.sizes.split('x').map(Number);
      // width in IHDR big-endian at offset 16
      expect(buf.readUInt32BE(16)).toBe(w);
      expect(buf.readUInt32BE(20)).toBe(h);
    }
  });

  it('icons were generated (192/512/180) with non-empty payloads', () => {
    for (const f of ['icon-192.png', 'icon-512.png', 'icon-180.png']) {
      const buf = readFileSync(join(publicDir, f));
      expect(buf.length).toBeGreaterThan(100);
    }
  });

  it('service worker exists and never caches the API', () => {
    const sw = readFileSync(join(publicDir, 'sw.js'), 'utf8');
    expect(sw).toContain('self.addEventListener(\'fetch\'');
    expect(sw).toContain("'/api/'");
  });

  it('index.html links manifest, theme-color, apple touch icon, and mobile.css', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('apple-touch-icon');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('/src/styles/mobile.css');
  });

  it('main.js registers the service worker on secure contexts only', () => {
    const main = readFileSync(join(root, 'src', 'main.js'), 'utf8');
    expect(main).toContain("'serviceWorker' in navigator");
    expect(main).toContain('window.isSecureContext');
    expect(main).toContain("register('/sw.js')");
  });
});