/** @filedesc Vitest configuration for the Surface shell core package. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
