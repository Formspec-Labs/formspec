/** @filedesc Run the desktop screen-reader gate against the neutral browser fixture. */
import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { FORMSPEC_E2E_ORIGIN, FORMSPEC_E2E_PORT } from './tests/e2e/harness-server';

if (process.env.FORMSPEC_WALK_SR !== 'os') throw new Error('Set FORMSPEC_WALK_SR=os for the native date speech gate');
const packaged = existsSync('browser/surface-browser.html');

export default defineConfig({
  testDir: './tests/e2e/playwright',
  testMatch: 'react-native-date-speech.spec.ts',
  workers: 1,
  timeout: 150_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  // Guidepup drives the installed browser. Let Chrome identify its actual operating system.
  use: { channel: 'chrome', baseURL: FORMSPEC_E2E_ORIGIN, trace: 'retain-on-failure' },
  webServer: {
    command: packaged ? `node scripts/serve-native-date-speech.mjs ${FORMSPEC_E2E_PORT}` : 'npm run test:serve',
    url: `${FORMSPEC_E2E_ORIGIN}/surface-browser.html`,
    reuseExistingServer: false,
  },
});
