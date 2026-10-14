// Bundles the AudioWorklet processor into ONE self-contained file (no imports),
// because worklet modules are loaded from a Blob / file URL inside the renderer.
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('out/worklet', { recursive: true });
await build({
  entryPoints: ['src/engine/worklet/processor.ts'],
  outfile: 'out/worklet/processor.js',
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: false,
  logLevel: 'info',
  alias: { '@engine': 'src/engine', '@shared': 'src/shared' },
});
