/** @filedesc Serve the built static entry and exercise two synthetic exports on the same page. */
import { existsSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, preview } from 'vite';
import { expect, test, type Page } from '@playwright/test';
async function visitBuiltPreview(page: Page, outDir: string, assets?: string) {
  const root = resolve('examples/surface-preview');
  const previousAssets = process.env.FORMSPEC_PREVIEW_ASSETS;
  if (assets === undefined) delete process.env.FORMSPEC_PREVIEW_ASSETS;
  else process.env.FORMSPEC_PREVIEW_ASSETS = assets;
  try {
    await build({ configFile: resolve(root, 'vite.config.ts'), build: { outDir } });
  } finally {
    if (previousAssets === undefined) delete process.env.FORMSPEC_PREVIEW_ASSETS;
    else process.env.FORMSPEC_PREVIEW_ASSETS = previousAssets;
  }
  const site = await preview({ root, configFile: false, build: { outDir },
    preview: { host: '127.0.0.1', port: 0 } });
  try {
    const address = site.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Expected a local HTTP server.');
    await page.goto(`http://127.0.0.1:${address.port}/`);
    return site;
  } catch (error) {
    await site.close();
    throw error;
  }
}

test('static preview builds from a publisher data directory', async ({ page }, info) => {
  const assets = info.outputPath('inputs');
  const control = resolve('spikes/surface-v12-saas-v1-dogfood/artifacts');
  const bundle = 'control.bundle.json';
  const scenario = 'control.preview-scenario.json';
  await mkdir(assets, { recursive: true });
  await Promise.all([
    copyFile(resolve(control, bundle), resolve(assets, bundle)),
    copyFile(resolve(control, scenario), resolve(assets, scenario)),
    writeFile(resolve(assets, 'preview.json'), JSON.stringify({
      editions: [{ scope: 'rooms', bundle, scenario }], fontStylesheet: 'fonts.css',
    })),
    writeFile(resolve(assets, 'fonts.css'), 'aside { font-style: italic; }'),
  ]);
  const site = await visitBuiltPreview(page, info.outputPath('static-preview'), assets);
  try {
    await expect(page.getByRole('complementary', { name: 'Preview posture' })).toHaveCSS('font-style', 'italic');
    await expect(page.getByRole('heading', { name: 'Room availability' })).toBeVisible();
  } finally {
    await site.close();
  }
});

test('passport and service-request run from published assets with hash navigation', async ({ page }, info) => {
  test.skip(!existsSync(resolve('../tools/deployment-tools/examples/packages')),
    'The stack publishes these exports in deployment-tools.');
  const site = await visitBuiltPreview(page, info.outputPath('static-preview'));
  try {
    await expect(page.getByRole('complementary', { name: 'Preview posture' })).toBeVisible();
    await expect(page.locator('[data-route="eligibility"]')).toBeVisible();
    await expect(page.getByLabel('The passport had ten-year validity')).toBeVisible();
    await expect(page).toHaveTitle(/Complete fictional passport renewal/);
    const picker = page.locator('select[data-surface-edition]');
    await picker.selectOption('service-request');
    await expect(page).toHaveURL(/#\/intake\?edition=service-request$/);
    await expect(page.locator('[data-route="intake"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Submit a Municipal Service Request' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Requester Name' }).fill('Sample requester');
    await expect(page).toHaveTitle(/Municipal Service Request Intake/);
    await page.reload();
    await expect(picker).toHaveValue('service-request');
    await page.goBack();
    await expect(page.locator('[data-route="eligibility"]')).toBeVisible();
  } finally {
    await site.close();
  }
});
