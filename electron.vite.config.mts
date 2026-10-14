import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

/** Strict Content-Security-Policy for the packaged renderer (the dev server needs inline scripts for HMR). */
const csp: Plugin = {
  name: 'voice-studio-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'self'",
      "script-src 'self' blob:",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data:",
      "media-src 'self' blob:",
      "connect-src 'self' blob:",
    ].join('; ');
    return html.replace(
      '<head>',
      `<head>
    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    );
  },
};

const alias = {
  '@shared': resolve('src/shared'),
  '@engine': resolve('src/engine'),
  '@renderer': resolve('src/renderer'),
  '@main': resolve('src/main'),
};

export default defineConfig({
  main: {
    resolve: { alias },
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } },
  },
  preload: {
    resolve: { alias },
    // sandboxed preload scripts must be single self-contained files
    build: {
      isolatedEntries: true,
      externalizeDeps: false,
      rollupOptions: {
        input: { studio: resolve('src/preload/studio.ts'), quick: resolve('src/preload/quick.ts') },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: { alias },
    plugins: [react(), csp],
    build: {
      rollupOptions: {
        input: {
          splash: resolve('src/renderer/splash.html'),
          studio: resolve('src/renderer/studio.html'),
          quick: resolve('src/renderer/quick.html'),
          icon: resolve('src/renderer/icon.html'),
        },
      },
    },
  },
});
