// DEPLOYED-SITE VERIFICATION — the "did it actually ship" check, permanently.
//
// CI's verify-deploy job points BRO_DEPLOY_URL at the fresh Pages URL after
// a deploy; this suite fetches the live bytes, proves the server is serving
// the SAME bundle this commit tracks (content-hash filename equality), and
// boots the deployed HTML+JS through the real shell harness in jsdom —
// dock buttons, a window opening, the tick loop — with zero console errors.
//
// The temp probe that first proved this (2026-09-19, v3.3.0's MOLT JOURNAL)
// is what this suite generalizes: it now runs on every deploy, not by hand.
//
// Skipped unless BRO_DEPLOY_URL is set (network-independent locally) or the
// URL does not answer (a Pages hiccup shouldn't fail the whole workflow —
// the deploy job itself already reported the real state).

import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

const DEPLOY_URL = (process.env.BRO_DEPLOY_URL || '').replace(/\/+$/, '');
const HAS_URL = DEPLOY_URL.startsWith('http');

// ── fetch the live site once for the whole file ─────────────────────────────
let live = null;

// The deployed bundle lands here so the runtime import in bootDeployed()
// has a real file to load. Paths are process.cwd()-based and file URLs are
// built with pathToFileURL — the jsdom realm's URL constructor mis-resolves
// relative URLs against file: bases (it falls back to http://localhost),
// so new URL(..., import.meta.url) is off-limits here.
const BUNDLE_CACHE = join(process.cwd(), '.bro-deployed', 'deployed-bundle.js');
if (HAS_URL) {
  // Only written when actually deploying — nothing litters the tree on local runs.
  mkdirSync(dirname(BUNDLE_CACHE), { recursive: true });
  writeFileSync(BUNDLE_CACHE, '// stub — overwritten in beforeAll before the runtime import\n');
}

function curl(url, out) {
  // node:fetch needs no proxy gymnastics here, but Pages + corporate nets are
  // flaky; curl with retries is what the drill proved works on this host.
  // Hard ceilings (connect + total) so a stalled CDN can never hang the run.
  execFileSync('curl', ['-sSL', '--retry', '4', '--retry-delay', '3', '--connect-timeout', '10', '--max-time', '45', '-o', out, url], { stdio: 'pipe' });
  return readFileSync(out, 'utf8');
}

// 300s: two curls, each with up to 4 retries at --max-time 45 on a crawling CDN.
beforeAll(() => {
  if (!HAS_URL) return;
  const dir = mkdtempSync(join(tmpdir(), 'bro-deployed-'));
  live = { dir };
  try {
    live.html = curl(`${DEPLOY_URL}/index.html`, join(dir, 'index.html'));
    const bundle = live.html.match(/<script[^>]+src="\.?\/?(assets\/[^"]+\.js)"/)?.[1];
    if (!bundle) throw new Error('no hashed bundle reference in deployed index.html');
    live.bundleRef = bundle;
    live.bundle = curl(`${DEPLOY_URL}/${bundle}`, join(dir, 'app.js'));
    live.htmlForBoot = live.html
      // strip the hashed asset reference; the captured bytes are imported at runtime instead
      .replace(/<script[^>]+src="\.?\/?assets\/[^"]+\.js"[^>]*><\/script>/, '');
  } catch (err) {
    live.error = `deployed site did not answer cleanly: ${err.message}`;
  }
}, 300_000);

afterAll(() => {
  if (realConsoleError) console.error = realConsoleError;
  if (realGetContext) Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', realGetContext);
  // Top-level afterAll: runs after every test in the file, so the runtime
  // imports are done and the captured bundle can go.
  if (HAS_URL) rmSync(dirname(BUNDLE_CACHE), { recursive: true, force: true });
});

describe('deployed site serves the tracked bundle', () => {
  const NET = 120_000; // slow-CDN headroom for the fetch phase

  it.skipIf(!HAS_URL)('fetches the live site (CI: verify-deploy sets BRO_DEPLOY_URL)', { timeout: NET }, () => {
    expect(HAS_URL).toBe(true);
    if (live.error) throw new Error(live.error); // unreachable: skip, not fail
    expect(live.html).toContain('<!DOCTYPE html>');
  }, NET);

  it.skipIf(!HAS_URL)('serves exactly the bundle this commit tracks (no stale deploy)', { timeout: NET }, () => {
    if (live.error) throw new Error(live.error);
    // The build stamps content hashes into filenames, so name equality is
    // byte equality — the same trick the dist-freshness guard relies on.
    const tracked = readFileSync('dist/index.html', 'utf8').match(/assets\/[^"]+\.js/)?.[0];
    expect(tracked).toBeTruthy();
    expect(live.bundleRef).toBe(tracked);
    expect(live.bundle).toContain('MOLT JOURNAL'); // the release's headline feature is in the served bytes
  }, NET);
});

// ── boot the deployed bundle in the real shell ──────────────────────────────
// Same harness discipline as the UI suites: canvas stub (jsdom has no 2D),
// storage cleared per boot (CI jsdom HAS localStorage), boot-overlay timers
// stopped, console.error surfaced. The difference: HTML and JS come from the
// live site, not from src/.

let realConsoleError;
let realGetContext;
let consoleErrors = [];

beforeAll(() => {
  if (!HAS_URL || !live?.bundle) return;
  realConsoleError = console.error;
  console.error = (...args) => {
    if (String(args[0]).includes('Not implemented')) return; // jsdom noise
    consoleErrors.push(args.map(String).join(' '));
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

  if (!live?.bundle) return; // fetch failed in the other beforeAll — boot tests skip themselves

  // Overwrite the module-scope stub with the real captured production bytes
  // before any test imports them (content is read at import execution,
  // which happens after beforeAll).
  writeFileSync(BUNDLE_CACHE, live.bundle);
});

afterAll(() => {
  if (realConsoleError) console.error = realConsoleError;
  if (realGetContext) Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', realGetContext);
  // Top-level afterAll: runs after every test in the file, so the runtime
  // imports are done and the captured bundle can go.
  if (HAS_URL) rmSync(dirname(BUNDLE_CACHE), { recursive: true, force: true });
});

let App;
const booted = [];

afterEach(() => {
  window.__broBootOverlay?.stop?.();
  for (const id of [...(App?.windows?.keys?.() ?? [])]) App.close(id, { silent: true });
  window.App = undefined;
  window.__broStore = undefined;
  vi.resetModules();
  booted.length = 0;
});

async function bootDeployed() {
  try { localStorage.clear(); } catch { /* storage-free environments */ }
  try { sessionStorage.clear(); } catch { /* same */ }
  const html = live.htmlForBoot;
  document.head.innerHTML = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
  document.documentElement.setAttribute('data-theme', 'cyberpunk');
  // vite's import-analysis resolves static import strings at TRANSFORM time
  // (before this module executes, so the cache write can't have happened
  // yet) — the @vite-ignore + runtime file URL makes the import native and
  // runtime-resolved instead. The bundle is a plain IIFE, so native import
  // executes it against jsdom's globals exactly like a browser would.
  await import(/* @vite-ignore */ pathToFileURL(BUNDLE_CACHE).href);
  App = window.App;
  booted.push(true);
  expect(App).toBeTruthy(); // the deployed bundle must expose the same debug/test handle
}

describe('deployed bundle boots the real shell', () => {
  const NET = 120_000;

  it.skipIf(!HAS_URL)('boots with all ten dock buttons, zero console errors', { timeout: NET }, async () => {
    if (live.error) throw new Error(live.error);
    const before = consoleErrors.length;
    await bootDeployed();
    expect(document.querySelectorAll('#dock .dock-btn').length).toBe(10);
    expect(window.__broStore).toBeTruthy(); // the live store came up
    expect(consoleErrors.slice(before)).toEqual([]); // nothing logged while booting
  }, NET);

  it.skipIf(!HAS_URL)('opens MOLT JOURNAL from the deployed dock and the store ticks', { timeout: NET }, async () => {
    if (live.error) throw new Error(live.error);
    const before = consoleErrors.length;
    await bootDeployed();
    const btn = [...document.querySelectorAll('#dock .dock-btn')]
      .find((b) => b.getAttribute('onclick')?.includes("'diary'"));
    expect(btn).toBeTruthy();
    // jsdom harness-realm quirk (documented in the UI suites): inline onclick
    // cannot see module globals, so a click would throw — the handler STRING
    // is the contract; open through App, which is what the handler performs.
    App.open('diary');
    const w = App.windows.get('diary');
    expect(w).toBeTruthy();
    expect(w.el.querySelector('.window-title').textContent).toContain('MOLT JOURNAL');
    // the real 1s tick loop of the DEPLOYED code decays the vitals
    const h0 = window.__broStore.state.stats.hunger;
    await new Promise((r) => setTimeout(r, 1300));
    const h1 = window.__broStore.state.stats.hunger;
    expect(h1).toBeLessThan(h0); // applyDecay ran — the loop is alive
    expect(consoleErrors.slice(before)).toEqual([]);
  }, NET);
});
