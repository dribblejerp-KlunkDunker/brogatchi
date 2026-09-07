import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { createChatMiddleware } from './server/proxy.mjs';

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
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api', createChatMiddleware(apiKey));
    },
  };

  const plugins = [tailwindcss(), proxyPlugin];
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
