/** @filedesc Serve the built static entry and exercise two synthetic exports on the same page. */
import { resolve } from 'node:path';
import { build, preview } from 'vite';
import { expect, test } from '@playwright/test';

test('passport and service-request run from published assets with hash navigation', async ({ page }, info) => {
  const root = resolve('examples/surface-preview');
  const outDir = info.outputPath('static-preview');
  await build({ configFile: resolve(root, 'vite.config.ts'), build: { outDir } });
  const site = await preview({ root, configFile: false, build: { outDir },
    preview: { host: '127.0.0.1', port: 0 } });
  try {
    const address = site.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Expected a local HTTP server.');
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await expect(page.getByRole('complementary', { name: 'Preview posture' })).toBeVisible();
    await expect(page.locator('[data-route="eligibility"]')).toBeVisible();
    await expect(page).toHaveTitle(/Complete fictional passport renewal/);
    const picker = page.locator('select[data-surface-edition]');
    await picker.selectOption('service-request');
    await expect(page).toHaveURL(/#\/intake\?edition=service-request$/);
    await expect(page.locator('[data-route="intake"]')).toBeVisible();
    await expect(page).toHaveTitle(/Municipal Service Request Intake/);
    await page.reload();
    await expect(picker).toHaveValue('service-request');
    await page.goBack();
    await expect(page.locator('[data-route="eligibility"]')).toBeVisible();
  } finally {
    await site.close();
  }
});
