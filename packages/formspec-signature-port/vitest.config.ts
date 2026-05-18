/** @filedesc Vitest configuration for the Formspec signature port package. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
