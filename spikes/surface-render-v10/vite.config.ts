/**
 * @filedesc Dev server / static build for the surface-render spike.
 *
 * Two things here are load-bearing for the spike's honesty:
 *
 * 1. `server.fs.allow` reaches up to the stack root because the spike reads the
 *    lifecycle spike's evidence **in place**. Nothing is copied into this
 *    directory, so the bytes the browser verifies are the bytes on disk.
 * 2. `resolve.dedupe` pins one React. `@formspec-org/react` resolves its own
 *    `react` from `formspec/node_modules`; without dedupe the shipped renderer
 *    would run on a second React instance and its hooks would throw.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const stackRoot = resolve(here, '..', '..', '..');

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 4173,
    strictPort: true,
    fs: { allow: [stackRoot] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
