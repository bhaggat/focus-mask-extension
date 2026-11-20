import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const src = resolve(import.meta.dirname, 'src');

export default defineConfig({
  root: src,
  publicDir: resolve(import.meta.dirname, 'public'),
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome116',
    modulePreload: { polyfill: false },
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(src, 'popup.html'),
        options: resolve(src, 'options.html'),
        offscreen: resolve(src, 'offscreen.html'),
        background: resolve(src, 'background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: {
    root: import.meta.dirname,
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
  },
});
