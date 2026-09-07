import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { createChatMiddleware } from './server/proxy.mjs';
import { createBridgeSoulMiddleware } from './server/bridge-soul.mjs';
import fs from 'node:fs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.GEMINI_API_KEY || '';

  // LAN mode: set LAN=1 to bind all interfaces so a phone on the same Wi-Fi
  // can play; LAN=2 adds an auto-generated self-signed cert (Android
  // Chrome/desktop) which unlocks true PWA install via service worker.
  const lanMode = process.env.LAN || '';
  const lan = lanMode !== '';

  // Inline plugin: serves the API proxy on the dev/preview server so
  // `npm run dev` runs the app + /api in one process. Without a
  // GEMINI_API_KEY the proxy answers 503 and Ryan falls back to his
  // offline dialogue brain — the OS still fully works.
  const proxyPlugin = {
    name: 'bro-os-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api', createChatMiddleware(apiKey));
      server.middlewares.use('/api', createBridgeSoulMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api', createChatMiddleware(apiKey));
      server.middlewares.use('/api', createBridgeSoulMiddleware());
    },
  };

  const plugins = [tailwindcss(), proxyPlugin];

  // sw.js is emitted as a bundle asset (not copied from public/) so every
  // build stamps it: the bytes change per deploy → the browser reinstalls the
  // worker → activate() prunes every previous shell cache. Without this the
  // cache grows forever (statics are SWR-cached under one never-changing name).
  const stampSwPlugin = {
    name: 'bro-os-stamp-sw',
    generateBundle() {
      const stamp = Date.now().toString(36);
      const source = fs.readFileSync('src/sw.js', 'utf8').replaceAll('__BUILD_STAMP__', stamp);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
  plugins.push(stampSwPlugin);
  if (lanMode === '2') plugins.push(basicSsl());

  return {
    // Relative base so the built bundle deploys anywhere (GitHub Pages
    // project sites serve from /<repo>/, where absolute /assets/ would 404).
    base: './',
    plugins,
    server: {
      host: lan ? true : '127.0.0.1',
      port: 5173,
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
    },
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.js', 'bridge/test/**/*.test.js'],
    },
  };
});
