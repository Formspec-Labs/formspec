/** @filedesc Vitest configuration for the Formspec signature COSE package. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
