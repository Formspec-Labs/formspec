/** @filedesc Configurable local Vite host for one data-only Formspec bundle. */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'FORMSPEC_DEMO_');
  const configuredPort = Number(env.FORMSPEC_DEMO_PORT ?? 4185);
  if (!Number.isInteger(configuredPort) || configuredPort < 1) {
    throw new Error('FORMSPEC_DEMO_PORT must be a positive integer.');
  }
  return {
    plugins: [react()],
    resolve: {
      dedupe: ['react', 'react-dom', '@preact/signals-core'],
    },
    server: {
      host: env.FORMSPEC_DEMO_HOST ?? '127.0.0.1',
      port: configuredPort,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
