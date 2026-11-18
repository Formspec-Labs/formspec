/** @filedesc Native browser navigation and color-scheme checks for Surface. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
