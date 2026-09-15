/** @filedesc Browser E2E: the renderer links its own layout + adapter CSS, so a host imports none. */
import { expect, test } from '@playwright/test';
import { gotoHarness, mountDefinition } from '../browser/helpers/harness';

const DEFINITION = {
  $formspec: '1.0',
  version: '1.0.0',
  url: 'urn:test:renderer-stylesheets',
  title: 'Stylesheet Test',
  items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
};

test.describe('renderer-linked stylesheets', () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
    await mountDefinition(page, DEFINITION);
    await page.waitForSelector('.formspec-field');
  });

  test('links structural layout CSS and the default adapter skin', async ({ page }) => {
    const hrefs = await page.evaluate(() =>
      [...document.head.querySelectorAll('link[data-formspec-theme-href]')].map((l) => (l as HTMLLinkElement).href));
    expect(hrefs.some((h) => h.endsWith('formspec-layout.css'))).toBe(true);
    expect(hrefs.some((h) => h.endsWith('formspec-default.css'))).toBe(true);
  });

  test('applies both — structural rules from layout, field chrome from the skin', async ({ page }) => {
    // .formspec-hidden is layout-owned; the field border-radius is skin-owned.
    const applied = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'formspec-hidden';
      document.body.appendChild(probe);
      const display = getComputedStyle(probe).display;
      probe.remove();
      const input = document.querySelector('.formspec-field input') as HTMLElement;
      return { display, padding: getComputedStyle(input).padding };
    });
    expect(applied.display).toBe('none');
    expect(applied.padding).not.toBe('0px');
  });
});
