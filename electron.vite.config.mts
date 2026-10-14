import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

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
      rollupOptions: { input: { studio: resolve('src/preload/studio.ts'), quick: resolve('src/preload/quick.ts') } },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: { alias },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          studio: resolve('src/renderer/studio.html'),
          quick: resolve('src/renderer/quick.html'),
          icon: resolve('src/renderer/icon.html'),
        },
      },
    },
  },
});
