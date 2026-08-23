import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { createChatMiddleware } from './server/proxy.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.GEMINI_API_KEY || '';

  // LAN mode (npm run dev:lan): bind all interfaces so a phone on the same
  // Wi-Fi can play. Plain http by default (works everywhere, incl. iOS where
  // self-signed HTTPS is blocked); LAN=2 adds an auto-generated self-signed
  // cert for browsers that allow clicking through (Android Chrome/desktop),
  // which unlocks true PWA install via the service worker.
  const lanMode = process.env.LAN || '';
  const lan = lanMode !== '';

  // Inline plugin: serves the API proxy on the dev/preview server so
  // `npm run dev` runs the app + /api in one process.
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
      include: ['tests/**/*.test.js'],
    },
  };
});