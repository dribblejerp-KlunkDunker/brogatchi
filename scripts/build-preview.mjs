#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/build-preview.mjs — single-file playable build
// Produces preview.html: full Bro OS 3.0 with compiled CSS + JS
// inlined (IIFE → classic <script> at end of body), runnable in
// sandboxed viewers / offline / double-clicked from disk.
// A static <style> keeps the UI styled (and auto-fades the boot
// overlay) even if a host viewer blocks JS entirely.
// Run: npm run preview:app
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

console.log('[preview] building ES bundle (for standalone CSS)…');
execSync('npx vite build', { cwd: root, stdio: 'inherit' });
console.log('[preview] building IIFE bundle (for classic <script>)…');
execSync('npx vite build --config vite.preview.config.mjs', { cwd: root, stdio: 'inherit' });

const distAssets = join(root, 'dist', 'assets');
const prevAssets = join(root, 'dist-preview', 'assets');
const css = readFileSync(join(distAssets, readdirSync(distAssets).find((f) => f.endsWith('.css'))), 'utf8');
let js = readFileSync(join(prevAssets, readdirSync(prevAssets).find((f) => f.endsWith('.js'))), 'utf8');

// Keep the inline classic <script> from terminating early
if (js.includes('</script')) js = js.split('</script').join('<\\/script');

let html = readFileSync(join(root, 'dist-preview', 'index.html'), 'utf8');

// Static CSS first: styles apply even if JS is stripped/blocked, and the
// boot overlay's CSS safety net can never trap the user. (The IIFE also
// injects its own copy at runtime — identical rules, harmless.)
html = html.replace('<head>', () => `<head>\n<style>${css}</style>`);

// Sandbox-friendliness: these links just 404 noisily without a server
html = html.replace(/<link rel="manifest"[^>]*>/, '');
html = html.replace(/<link rel="apple-touch-icon"[^>]*>/, '');

// Classic scripts run immediately on parse: strip the head tag and
// append the bundle where the DOM already exists.
html = html.replace(/<script type="module"[^>]*src="[^"]*"[^>]*><\/script>/, '');
html = html.replace('</body>', () => `<script>${js}</script>\n</body>`);

writeFileSync(join(root, 'preview.html'), html);
console.log(`[preview] wrote preview.html (${(html.length / 1024).toFixed(0)} KB) — open it anywhere, no server needed`);
