/** @filedesc Native browser navigation and color-scheme checks for Surface. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Walk } from '@formspec-org/walk';
import { expect, test } from '@playwright/test';
import { SURFACE_APPEARANCE_SCRIPT } from '../../../packages/formspec-surface-react/src/browser-appearance';

test('hash links survive reload and Back/Forward while section changes preserve the form', async ({ page }) => {
  await page.goto('/surface-browser.html');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('Overview – Example filing');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).not.toBeFocused();
  await page.getByRole('link', { name: 'Filing', exact: true }).click();
  await expect(page).toHaveTitle('Filing – Example filing');
  await expect(page.getByRole('heading', { name: 'Filing', exact: true })).toBeFocused();
  const contact = page.getByRole('textbox', { name: 'Contact name' });
  await contact.fill('Example');
  await page.getByRole('link', { name: 'Details' }).click();
  await expect(page).toHaveURL(/#\/filing\/ny\?slot=filing&section=details$/);
  await expect(contact).toHaveValue('Example');
  await page.goBack();
  await expect(page.locator('[data-fixture-section]')).toHaveText('intro');
  await expect(contact).toHaveValue('Example');
  await page.goForward();
  await expect(page.locator('[data-fixture-section]')).toHaveText('details');
  await expect(contact).toHaveValue('Example');
  await page.reload();
  await expect(page.locator('[data-fixture-section]')).toHaveText('details');
  await expect(page.getByRole('link', { name: 'Filing', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('the browser restores appearance and announces one draft save result', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/surface-browser.html#/filing/ny');
  const app = page.locator('.fs-surface-app');
  const form = page.locator('.formspec-container');
  await expect(form).toHaveCSS('color-scheme', 'dark');
  await expect(app).toHaveCSS('color-scheme', 'dark');
  await page.getByLabel('Appearance').selectOption('light');
  await page.reload();
  await expect(page.getByLabel('Appearance')).toHaveValue('light');
  await expect(form).toHaveCSS('color-scheme', 'light');
  await expect(app).toHaveCSS('color-scheme', 'light');
  await page.evaluate(() => {
    document.documentElement.dataset.fsAppearance = 'light';
    document.body.dataset.fsAppearance = 'dark';
  });
  await expect(form).toHaveCSS('color-scheme', 'dark');
  await expect(app).toHaveCSS('color-scheme', 'dark');
  await expect(page.locator('article')).toHaveCSS('color-scheme', 'dark');
  await page.evaluate(() => document.body.removeAttribute('data-fs-appearance'));
  await expect(form).toHaveCSS('color-scheme', 'light');
  await page.getByRole('button', { name: 'Save draft' }).click();
  const notices = app.locator('[role="status"], [aria-live="polite"]').filter({ hasText: /\S/ });
  await expect(notices).toHaveCount(1);
  await expect(notices).toHaveText('Completed.');
  await expect(form.getByRole('status')).toHaveText('Completed.');
  await page.getByRole('link', { name: 'Staff' }).click();
  await expect(page.locator('article')).toHaveAttribute('data-tenant-theme', 'refused');
  await expect(app).not.toHaveCSS('--formspec-color-primary', '#123456');
  await expect(notices).toHaveCount(0);
});

test('the head script applies saved appearance before the Surface mounts', async ({ page }) => {
  const css = readFileSync(resolve(__dirname, '../../../packages/formspec-surface-react/src/formspec-surface.css'), 'utf8');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('formspec:surface-appearance:v1', 'dark'));
  await page.route('**/surface-browser.html?prepaint', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="en"><head>
      <script>${SURFACE_APPEARANCE_SCRIPT}</script><style>${css}</style>
      </head><body><div id="root"></div></body></html>`,
  }));
  await page.goto('/surface-browser.html?prepaint');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await expect(page.locator('#root')).toBeEmpty();
});

test('hash anchors use native focus and keep the routed form through history and reload', async ({ page }) => {
  await page.goto('/surface-browser.html#/filing/ny?slot=filing&section=details');
  const contact = page.getByRole('textbox', { name: 'Contact name' });
  await contact.fill('Example');
  await page.getByRole('link', { name: 'Skip to report controls' }).click();
  await expect(page).toHaveURL(/#fixture-anchor$/);
  await expect(page.locator('#fixture-anchor')).toBeFocused();
  await expect(contact).toHaveValue('Example');
  await expect(page.locator('[data-fixture-section]')).toHaveText('details');
  await page.getByRole('link', { name: 'Overview' }).click();
  await page.goBack();
  await expect(page).toHaveURL(/#fixture-anchor$/);
  await expect(contact).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-fixture-section]')).toHaveText('details');
});

test('history links reload under a base path and modified clicks leave the original page', async ({ page, context }) => {
  // Serve the app shell for all document addresses under the history mount.
  await context.route('**/surface-browser-history/**', async route => {
    const url = new URL('/surface-browser.html', route.request().url());
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });
  await page.goto('/surface-browser-history/');
  const filing = page.getByRole('link', { name: 'Filing', exact: true });
  await expect(filing).toHaveAttribute('href', '/surface-browser-history/filing/ny');
  const modifier = await page.evaluate(() => navigator.platform.startsWith('Mac') ? 'Meta' : 'Control');
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    filing.click({ modifiers: [modifier] }),
  ]);
  await expect(opened.getByRole('textbox', { name: 'Contact name' })).toBeVisible();
  await expect(page).toHaveURL(/\/surface-browser-history\/$/);

  await filing.click();
  await page.getByRole('link', { name: 'Details' }).click();
  await page.reload();
  await expect(page).toHaveURL(/\/surface-browser-history\/filing\/ny\?slot=filing&section=details$/);
  await expect(page.locator('[data-fixture-section]')).toHaveText('details');
  await page.goBack();
  await expect(page.locator('[data-fixture-section]')).toHaveText('intro');
  await page.getByRole('link', { name: 'Root route' }).click();
  await expect(page.getByRole('heading', { name: 'Root route' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Root route' })).toBeVisible();
});

test('the authored workspace updates focus and title through section links and browser history', async ({ page }) => {
  await page.goto('/surface-browser.html?workspace#/filing/ny?slot=filing&section=stale');
  const contact = page.getByRole('textbox', { name: 'Contact name' });
  const intro = page.getByRole('heading', { name: 'Introduction', exact: true });
  const details = page.getByRole('heading', { name: 'Details', exact: true });
  await expect(intro).toBeVisible();
  await expect(page).toHaveTitle('Introduction – Filing – Example filing');
  await contact.fill('Example');
  await page.getByRole('link', { name: 'Details', exact: true }).click();
  await expect(page).toHaveURL(/#\/filing\/ny\?slot=filing&section=details$/);
  await expect(details).toBeFocused();
  await expect(page).toHaveTitle('Details – Filing – Example filing');
  await expect(contact).toHaveCount(0);
  await page.goBack();
  await expect(intro).toBeFocused();
  await expect(page).toHaveTitle('Introduction – Filing – Example filing');
  await expect(contact).toHaveValue('Example');
  await page.goForward();
  await expect(details).toBeFocused();
  await expect(page).toHaveTitle('Details – Filing – Example filing');
  await page.reload();
  await expect(details).toBeVisible();
  await expect(page).toHaveTitle('Details – Filing – Example filing');
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page).toHaveTitle('Overview – Example filing');
});

test('only the workspace selected by the URL moves focus when a route has multiple forms', async ({ page }) => {
  await page.goto('/surface-browser.html?workspace&twoForms#/filing/ny?slot=additional&section=details');
  const first = page.locator('[data-slot="filing"]');
  const second = page.locator('[data-slot="additional"]');
  await expect(second.getByRole('heading', { name: 'Details', exact: true })).toBeVisible();
  await first.getByRole('link', { name: 'Introduction', exact: true }).click();
  await expect(first.getByRole('heading', { name: 'Introduction', exact: true })).toBeFocused();
  await expect(second.getByRole('heading', { name: 'Details', exact: true })).toBeVisible();
  await first.getByRole('link', { name: 'Details', exact: true }).click();
  await expect(first.getByRole('heading', { name: 'Details', exact: true })).toBeFocused();
  await expect(second.getByRole('heading', { name: 'Details', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveTitle('Introduction – Filing – Example filing');
  await page.goBack();
  await expect(second.getByRole('heading', { name: 'Details', exact: true })).toBeFocused();
  await expect(page).toHaveTitle('Details – Filing – Example filing');
});

test('workspace search announces results and relates them to the search box', async ({ page }) => {
  await page.goto('/surface-browser.html?workspace#/filing/ny');
  const search = page.getByRole('searchbox', { name: 'Search questions' });
  const navigation = page.locator('.formspec-workspace__navigation');
  const status = navigation.getByRole('status');
  const results = navigation.getByRole('list', { name: 'Search questions' });
  await expect(status).toBeEmpty();
  await search.fill('notes');
  await expect(status).toHaveText('Matching questions (1)');
  await expect(search).toHaveAccessibleDescription('Matching questions (1)');
  await expect(results.getByRole('button', { name: 'Notes Details' })).toBeVisible();
  await expect(search).toHaveAttribute('aria-controls', (await results.getAttribute('id'))!);
  await search.fill('no such question');
  await expect(status).toHaveText('No matching questions.');
  await expect(search).toHaveAccessibleDescription('No matching questions.');
  await search.clear();
  await expect(status).toBeEmpty();
});

test('workspace stacks when its Surface column is narrow on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/surface-browser.html?workspace#/filing/ny');
  const workspace = page.locator('.formspec-workspace');
  const slot = page.locator('[data-slot="filing"]');
  const columns = () => workspace.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
  await slot.evaluate(node => { node.style.inlineSize = '64rem'; });
  await expect.poll(columns).toBe(3);
  await slot.evaluate(node => { node.style.inlineSize = '32rem'; });
  await expect.poll(columns).toBe(1);
});

test('Definition Walk uses the workspace bridge for choices, page changes, repeats and validation', async ({ page }) => {
  await page.goto('/surface-browser.html?workspace#/filing/ny');
  const walk = await Walk.open(page, {});
  try {
    const choice = page.getByLabel('Filing type');
    await choice.selectOption('revision');
    await expect(choice).toHaveValue('revision');
    expect(await walk.show('details.rows[0].entry')).toBe(true);
    await expect(page.getByRole('textbox', { name: 'Entry' })).toBeVisible();
    await page.getByRole('button', { name: 'Add Rows' }).click();
    await expect(page.getByRole('textbox', { name: 'Entry' })).toHaveCount(2);
    expect(await walk.show('intro.contact')).toBe(true);
    await expect(choice).toHaveValue('revision');
    expect(await walk.summary([{ path: 'details.notes', label: 'Notes' }])).toBe(1);
    expect(walk.findings).toEqual([]);
    await expect(page.getByRole('textbox', { name: 'Notes' })).toBeFocused();
  } finally {
    await walk.sr.stop();
  }
});

test('Definition Walk opens a workspace before any question is mounted', async ({ page }) => {
  await page.goto('/surface-browser.html?workspace&displayFirst#/filing/ny');
  await expect(page.getByRole('heading', { name: 'Instructions' })).toBeVisible();
  await expect(page.locator('[data-name]')).toHaveCount(0);
  const walk = await Walk.open(page, {});
  try {
    expect(await walk.show('intro.contact')).toBe(true);
    await expect(page.getByRole('textbox', { name: 'Contact name' })).toBeVisible();
  } finally {
    await walk.sr.stop();
  }
});

test('Definition Walk waits for a control in an empty React root outside workspace', async ({ page }) => {
  await Walk.open(page, {
    mount: async () => {
      await page.setContent('<div data-formspec-render-root style="min-height: 1rem"></div>');
      await page.evaluate(() => {
        window.setTimeout(() => {
          const root = document.querySelector<HTMLElement>('[data-formspec-render-root]')!;
          root.dataset.summaryReadyBeforeControl = String(root.hasAttribute('show-validation-summary'));
          root.innerHTML = '<input data-name="contact">';
        }, 750);
      });
    },
  });
  await expect(page.locator('[data-formspec-render-root]')).toHaveAttribute('data-summary-ready-before-control', 'false');
});

test('Definition Walk finds the right empty repeat when two workspace sections use the same Add label', async ({ page }) => {
  await page.goto('/surface-browser.html?workspace&emptyRepeat#/filing/ny');
  const walk = await Walk.open(page, {});
  try {
    await walk.repeat('details.rows', {
      firstField: 'details.rows.entry', rowName: 'Rows', addLabel: 'Add Rows', removeLabel: 'Remove Rows 1',
    });
    expect(walk.findings).toEqual([]);
    await expect(page.getByRole('button', { name: 'Add Rows' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Entry' })).toHaveCount(0);
    expect(await walk.live('intro.otherRows.otherEntry')).toBeUndefined();
  } finally {
    await walk.sr.stop();
  }
});
