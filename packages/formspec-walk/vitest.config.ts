/** @filedesc Vitest configuration for the walk package. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // The accessibility tests start Chromium and run axe; the check's own cap is 60 s.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
