import { mergeConfig } from 'vite';
import base from './vite.config.js';

// Preview-only build: single IIFE bundle so it can be inlined as a
// classic <script> (maximum compatibility with sandboxed viewers).
export default mergeConfig(base({ mode: 'production' }), {
  build: {
    outDir: 'dist-preview',
    rollupOptions: {
      output: { format: 'iife', inlineDynamicImports: true },
    },
  },
});
