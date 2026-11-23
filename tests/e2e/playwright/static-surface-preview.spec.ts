/** @filedesc Serve the built static entry and exercise two synthetic exports on the same page. */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, symlink, writeFile } from 'node:fs/promises';
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
  // Playwright's output directory can sit outside this checkout's dependency tree.
  await symlink(resolve('node_modules'), resolve(generated, 'node_modules'), 'junction');
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

test('published seeded scenario shows In progress, hydrates answers across reload, and preserves exact decimal precision through Submit', async ({ page }, info) => {
  const surfaceUrl = 'https://example.test/surface';
  const reportUrl = 'https://example.test/definitions/report';
  const actionsUrl = 'https://example.test/actions/report';
  const formCompUrl = 'https://example.test/components/report';
  const exactDecimal = '0.3333333333333333333333333333';
  const source = {
    manifest: {
      $formspecBundle: '2.4',
      id: 'https://example.test/app',
      title: 'Filing Preview',
      surfaces: [{ url: surfaceUrl }],
      entrySurface: surfaceUrl,
      definitions: [{ url: reportUrl, version: '1.0.0' }],
      responseActionDocuments: [{ url: actionsUrl }],
      components: [{ url: formCompUrl }],
    },
    documents: {
      [surfaceUrl]: {
        $formspecSurface: '0.4',
        id: 'app',
        entry: 'overview',
        routes: [
          {
            id: 'overview',
            path: '/overview',
            title: 'Overview',
            slots: [{
              id: 'tracker',
              slotType: 'filing-status',
              binding: {
                groups: [{
                  id: 'annual',
                  label: 'Annual reports',
                  forms: [{
                    routeRef: 'report',
                    slotRef: 'form',
                    params: { unit: { value: 'north' } },
                  }],
                }],
              },
            }],
          },
          {
            id: 'report',
            path: '/report/{unit}',
            title: 'Annual Report',
            routeClass: 'intake',
            params: [{ name: 'unit', type: 'string' }],
            slots: [{
              id: 'form',
              slotType: 'definition-form',
              binding: {
                definitionRef: reportUrl,
                subjectKeys: { unit: 'unit' },
              },
            }],
          },
        ],
      },
      [reportUrl]: {
        $formspec: '1.0',
        url: reportUrl,
        version: '1.0.0',
        title: 'Annual Report',
        status: 'active',
        subject: {
          type: reportUrl,
          keys: { unit: { dataType: 'string' } },
        },
        items: [{
          key: 'details',
          type: 'group',
          label: 'Details',
          children: [
            { key: 'summary', type: 'field', dataType: 'string', label: 'Summary' },
            { key: 'rate', type: 'field', dataType: 'decimal', label: 'Exact rate' },
            { key: 'contact', type: 'field', dataType: 'string', label: 'Contact email' },
          ],
        }],
        binds: [
          { path: 'details.summary', required: 'true' },
          { path: 'details.contact', required: 'true' },
        ],
      },
      [actionsUrl]: {
        $formspecResponseActions: '1.0',
        version: '1.0.0',
        scope: 'response',
        targetDefinition: { url: reportUrl },
        actions: [
          { id: 'autosave', intent: 'autosave', effects: [{ type: 'hostEvent', eventName: 'formspec-autosave' }] },
          { id: 'submitReport', intent: 'submit', label: { literal: 'Submit report' }, effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }] },
        ],
      },
      [formCompUrl]: {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: reportUrl },
        tree: {
          component: 'Stack',
          children: [
            { component: 'TextInput', bind: 'details.summary' },
            { component: 'NumberInput', bind: 'details.rate' },
            { component: 'TextInput', bind: 'details.contact' },
            { component: 'ActionButton', actionRef: 'submitReport', label: { literal: 'Submit report' } },
          ],
        },
      },
    },
  };

  const scenario = {
    $formspecSurfaceScenario: '0.1',
    version: '1.0.0',
    initialPath: '/overview',
    defaultProfile: 'inProgress',
    profiles: {
      inProgress: {
        authorization: { default: 'authorized' },
        sources: [],
        drafts: [{
          definitionUrl: reportUrl,
          subject: { type: reportUrl, keys: { unit: 'north' } },
          data: { details: { summary: 'Seeded draft answer', rate: '__EXACT_DECIMAL__' } },
        }],
      },
    },
    actions: { default: { status: 'complete' } },
  };

  const assets = info.outputPath('published-seeded-inputs');
  await mkdir(assets, { recursive: true });
  await Promise.all([
    writeFile(resolve(assets, 'bundle.json'), JSON.stringify(source)),
    writeFile(
      resolve(assets, 'scenario.json'),
      JSON.stringify(scenario).replace('"__EXACT_DECIMAL__"', exactDecimal),
    ),
    writeFile(
      resolve(assets, 'preview.json'),
      JSON.stringify({ editions: [{ scope: 'published', bundle: 'bundle.json', scenario: 'scenario.json' }] }),
    ),
  ]);

  const site = await visitBuiltPreview(page, info.outputPath('static-seeded-preview'), assets);
  try {
    const trackerLink = page.locator('main').getByRole('link', { name: 'Annual Report', exact: true });
    await expect(trackerLink).toHaveAccessibleDescription('In progress');
    await trackerLink.click();
    await expect(page.getByLabel('Summary')).toHaveValue('Seeded draft answer');
    await expect(page.getByLabel('Exact rate')).toHaveValue(exactDecimal);
    await page.reload();
    await expect(page.getByLabel('Summary')).toHaveValue('Seeded draft answer');
    await expect(page.getByLabel('Exact rate')).toHaveValue(exactDecimal);

    const snapshotJson = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolveDb, rejectDb) => {
        const req = indexedDB.open('formspec-surface-drafts');
        req.onsuccess = () => resolveDb(req.result);
        req.onerror = () => rejectDb(req.error);
      });
      try {
        return await new Promise<string>((resolveRow, rejectRow) => {
          const req = db.transaction('editable').objectStore('editable').getAll();
          req.onsuccess = () => resolveRow((req.result[0] as { snapshotJson: string }).snapshotJson);
          req.onerror = () => rejectRow(req.error);
        });
      } finally {
        db.close();
      }
    });
    expect(snapshotJson).toContain(exactDecimal);

    await page.getByLabel('Contact email').fill('sample@example.test');
    const submitReport = page.getByRole('button', { name: 'Submit report' });
    await submitReport.click();
    // The button names its own outcome status, so the check survives other status regions on the page.
    await expect(submitReport).toHaveAccessibleDescription('Completed.');
    await page.reload();

    const completedResponseJson = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolveDb, rejectDb) => {
        const req = indexedDB.open('formspec-surface-drafts');
        req.onsuccess = () => resolveDb(req.result);
        req.onerror = () => rejectDb(req.error);
      });
      try {
        return await new Promise<string>((resolveRow, rejectRow) => {
          const req = db.transaction('filings').objectStore('filings').getAll();
          req.onsuccess = () => resolveRow((req.result[0] as { responseJson: string }).responseJson);
          req.onerror = () => rejectRow(req.error);
        });
      } finally {
        db.close();
      }
    });
    expect(completedResponseJson).toContain(`"rate":${exactDecimal}`);

    await page.getByRole('navigation', { name: 'Pages in this app' }).getByRole('link', { name: 'Overview' }).click();
    await expect(page.locator('main').getByRole('link', { name: 'Annual Report', exact: true }))
      .toHaveAccessibleDescription(/Filed/);
  } finally {
    await site.close();
  }
});

test('a route app-shell component never replaces the form-bound presentation in published preview', async ({ page }, info) => {
  const surfaceUrl = 'https://example.test/surface';
  const reportUrl = 'https://example.test/definitions/report';
  const actionsUrl = 'https://example.test/actions/report';
  const shellCompUrl = 'https://example.test/components/shell';
  const formCompUrl = 'https://example.test/components/report';
  const exactDecimal = '0.3333333333333333333333333333';
  const source = {
    manifest: {
      $formspecBundle: '2.4',
      id: 'https://example.test/app',
      title: 'Component Targeting Preview',
      surfaces: [{ url: surfaceUrl }],
      entrySurface: surfaceUrl,
      definitions: [{ url: reportUrl, version: '1.0.0' }],
      responseActionDocuments: [{ url: actionsUrl }],
      components: [{ url: shellCompUrl }, { url: formCompUrl }],
    },
    documents: {
      [surfaceUrl]: {
        $formspecSurface: '0.4',
        id: 'app',
        entry: 'report',
        routes: [{
          id: 'report',
          path: '/report/{unit}',
          title: 'Annual Report',
          routeClass: 'intake',
          params: [{ name: 'unit', type: 'string' }],
          slots: [{
            id: 'form',
            slotType: 'definition-form',
            binding: { definitionRef: reportUrl, subjectKeys: { unit: 'unit' } },
          }],
        }],
      },
      [reportUrl]: {
        $formspec: '1.0',
        url: reportUrl,
        version: '1.0.0',
        title: 'Annual Report',
        status: 'active',
        subject: { type: reportUrl, keys: { unit: { dataType: 'string' } } },
        items: [{ key: 'rate', type: 'field', dataType: 'decimal', label: 'Exact rate' }],
      },
      [actionsUrl]: {
        $formspecResponseActions: '1.0',
        version: '1.0.0',
        scope: 'response',
        targetDefinition: { url: reportUrl },
        actions: [
          { id: 'submitReport', intent: 'submit', label: { literal: 'Submit report' }, effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }] },
        ],
      },
      [shellCompUrl]: {
        $formspecComponent: '1.2',
        version: '1.0.0',
        targetSurfaceRoutes: [{ surface: { url: surfaceUrl }, route: 'report', role: 'app-shell' }],
        tree: { component: 'Heading', level: 2, text: 'Shell-only heading' },
      },
      [formCompUrl]: {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: reportUrl },
        tree: {
          component: 'Stack',
          children: [
            { component: 'NumberInput', bind: 'rate' },
            { component: 'ActionButton', actionRef: 'submitReport', label: { literal: 'Submit report' } },
          ],
        },
      },
    },
  };
  const scenario = {
    $formspecSurfaceScenario: '0.1',
    version: '1.0.0',
    initialPath: '/report/north',
    routeParams: { unit: 'north' },
    defaultProfile: 'inProgress',
    profiles: {
      inProgress: {
        authorization: { default: 'authorized' },
        sources: [],
        drafts: [{
          definitionUrl: reportUrl,
          subject: { type: reportUrl, keys: { unit: 'north' } },
          data: { rate: '__EXACT_DECIMAL__' },
        }],
      },
    },
    actions: { default: { status: 'complete' } },
  };
  const assets = info.outputPath('published-component-inputs');
  await mkdir(assets, { recursive: true });
  await Promise.all([
    writeFile(resolve(assets, 'bundle.json'), JSON.stringify(source)),
    writeFile(resolve(assets, 'scenario.json'), JSON.stringify(scenario).replace('"__EXACT_DECIMAL__"', exactDecimal)),
    writeFile(resolve(assets, 'preview.json'), JSON.stringify({ editions: [{ scope: 'published-comp', bundle: 'bundle.json', scenario: 'scenario.json' }] })),
  ]);

  const site = await visitBuiltPreview(page, info.outputPath('static-component-preview'), assets);
  try {
    await expect(page.getByRole('button', { name: 'Submit report' })).toBeVisible();
    await expect(page.getByLabel('Exact rate')).toHaveValue(exactDecimal);
    expect(await page.getByRole('heading', { name: 'Shell-only heading' }).count()).toBe(0);
  } finally {
    await site.close();
  }
});
