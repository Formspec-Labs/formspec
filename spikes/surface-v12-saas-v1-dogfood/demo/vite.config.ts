/**
 * @filedesc Local Vite host for the v12 SaaS dogfood bundle.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', '@preact/signals-core'],
  },
  server: {
    host: '127.0.0.1',
    port: 4183,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
