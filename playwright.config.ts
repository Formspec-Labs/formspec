import { defineConfig, devices } from '@playwright/test';
import { FORMSPEC_E2E_HEALTH_PATH, FORMSPEC_E2E_ORIGIN } from './tests/e2e/harness-server';

export default defineConfig({
  testDir: './tests',
  /* Storybook lives on :6006 — run via `npm run test:storybook:dom` (playwright.storybook.config.ts). */
  testIgnore: ['**/storybook/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: FORMSPEC_E2E_ORIGIN,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run test:serve',
      url: `${FORMSPEC_E2E_ORIGIN}${FORMSPEC_E2E_HEALTH_PATH}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run --workspace=formspec-references dev',
      port: 8082,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev --prefix examples/react-demo',
      port: 5200,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
