import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@engine': resolve('src/engine'),
      '@renderer': resolve('src/renderer'),
      '@main': resolve('src/main'),
    },
  },
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/engine/**', 'src/shared/**', 'src/main/**', 'src/renderer/**'],
      exclude: ['src/**/*.d.ts', 'src/**/main.tsx', 'src/main/index.ts', 'src/main/app.ts', 'src/preload/**'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'tests/engine/**/*.test.ts',
            'tests/main/**/*.test.ts',
            'tests/shared/**/*.test.ts',
            'tests/renderer/lib/**/*.test.ts',
            'tests/renderer/runtime/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/renderer/**/*.test.tsx'],
          setupFiles: ['tests/setup.ts'],
        },
      },
    ],
  },
});
