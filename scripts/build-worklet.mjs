// Bundles the AudioWorklet processor into ONE self-contained script (no imports).
// The renderer loads it through a Blob URL, so it cannot pull in other modules at run time.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

mkdirSync('out/worklet', { recursive: true });

await build({
  entryPoints: ['src/engine/worklet/processor.ts'],
  outfile: 'out/worklet/processor.js',
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: false,
  logLevel: 'info',
  // resolves the @shared / @engine path aliases
  tsconfig: resolve('tsconfig.web.json'),
});
