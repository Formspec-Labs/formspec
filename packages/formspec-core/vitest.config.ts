/** @filedesc Vitest configuration for the formspec-core package. */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Subpaths before `@formspec-org/engine` so Vite does not treat them as package subpaths on the main alias.
      '@formspec-org/engine/fel-runtime': path.resolve(__dirname, '../formspec-engine/src/fel/fel-api-runtime.ts'),
      '@formspec-org/engine/fel-tools': path.resolve(__dirname, '../formspec-engine/src/fel/fel-api-tools.ts'),
      '@formspec-org/engine/init-formspec-engine': path.resolve(
        __dirname,
        '../formspec-engine/src/init-formspec-engine.ts',
      ),
      '@formspec-org/engine/render': path.resolve(__dirname, '../formspec-engine/src/engine-render-entry.ts'),
      '@formspec-org/engine/static-presentation': path.resolve(
        __dirname,
        '../formspec-engine/src/static-presentation-entry.ts',
      ),
      '@formspec-org/engine': path.resolve(__dirname, '../formspec-engine/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
