/** @filedesc Serve the built static entry and exercise two synthetic exports on the same page. */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { build, preview } from 'vite';
import { expect, test, type Page } from '@playwright/test';
import { runAxePass, Walk } from '@formspec-org/walk';
import type { FormDefinition } from '@formspec-org/types';
import { surfaceWalkExport } from '../fixtures/surface-walk-export';

const run = promisify(execFile);

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


test('the published preview runs the emitted walk for every form slot', async ({ page }, info) => {
  test.setTimeout(90_000);
  const assets = info.outputPath('inputs');
  const generated = info.outputPath('generated');
  const bundle = resolve(assets, 'registration.bundle.json');
  await Promise.all([mkdir(assets, { recursive: true }), mkdir(generated, { recursive: true })]);
  await Promise.all([
    writeFile(bundle, JSON.stringify(surfaceWalkExport)),
    writeFile(resolve(assets, 'preview.json'), JSON.stringify({
      editions: [{ scope: 'registration', bundle: 'registration.bundle.json' }],
    })),
  ]);
  const site = await visitBuiltPreview(page, info.outputPath('static-preview'), assets);
  try {
    const cli = resolve('packages/formspec-walk/bin/formspec-walk.mjs');
    const url = new URL('/#/?edition=registration', page.url());
    await run(process.execPath, [cli, 'emit', '--bundle', bundle, '--url', url.href, '--params', '{"state":"ny"}',
      '--out', resolve(generated, 'registration.spec.ts')]);
    const { stdout } = await run(process.execPath, [cli, 'test', '--workers=1', '--output', resolve(generated, 'results')],
      { cwd: generated, timeout: 45_000 })
      .catch(error => { throw new Error(error.stdout || error.message, { cause: error }); });
    await info.attach('emitted-walk-results', { body: stdout, contentType: 'text/plain' });
    expect(stdout).toContain('3 passed');
    expect(stdout).toContain('registration/contact/details');
    expect(stdout).toContain('registration/equipment/details');
    expect(stdout).toContain('registration/equipment/inventory');

    url.hash = '/equipment/ny?edition=registration&slot=inventory';
    await page.goto(url.href);
    const contactRoot = '[data-slot="details"] [data-formspec-render-root]';
    const inventoryRoot = '[data-slot="inventory"] [data-formspec-render-root]';
    const walk = await Walk.open(page, { root: inventoryRoot });
    try {
      const tabs = walk.root.getByRole('tab');
      await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
      expect(await walk.nextStep()).toBe(false);
      expect(await walk.previousStep()).toBe(true);
      expect(await walk.previousStep()).toBe(false);
      await tabs.nth(1).evaluate(el => el.addEventListener('click', e => e.stopPropagation(), { capture: true }));
      await expect(walk.nextStep()).rejects.toThrow(/tab.*did not activate/);
    } finally {
      await walk.sr.stop();
    }

    // Remove the planted click handler by reopening the route so axe can visit both tabs.
    await page.reload();
    await expect(page.locator(inventoryRoot).getByRole('tab').nth(1)).toBeVisible();
    await page.locator(inventoryRoot).evaluate(root => {
      const input = document.createElement('input');
      input.id = 'unlabelled-inventory-input';
      root.appendChild(input);
    });
    const scan = async (root: string, key: string) => {
      const definition = surfaceWalkExport.documents[`urn:example:form:${key}`] as FormDefinition;
      const report = await runAxePass(page, { root, documents: { definition } });
      return report.violations.flatMap(rule => rule.nodes.map(node => node.html));
    };
    expect(await scan(contactRoot, 'contact')).not.toContainEqual(expect.stringContaining('unlabelled-inventory-input'));
    expect(await scan(inventoryRoot, 'equipment')).toContainEqual(expect.stringContaining('unlabelled-inventory-input'));
  } finally {
    await site.close();
  }
});
