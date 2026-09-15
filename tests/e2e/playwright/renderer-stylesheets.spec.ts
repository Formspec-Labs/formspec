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

  // A host that pre-loads the sheets gets no link and no wait; this harness pre-loads nothing, so the
  // element links them and must stay hidden rather than paint the form unstyled for a round-trip.
  test('never paints unstyled: hidden until the sheets it linked answer', async ({ page }) => {
    const state = await page.evaluate(() => {
      const el = document.querySelector('formspec-render') as HTMLElement;
      const probe = document.createElement('div');
      probe.className = 'formspec-container';
      document.body.appendChild(probe);
      const layoutApplied = getComputedStyle(probe).getPropertyValue('--formspec-layout').trim() !== '';
      probe.remove();
      return { visibility: getComputedStyle(el).visibility, layoutApplied };
    });
    // By now the sheets have loaded, so the form is visible AND styled — never visible-and-unstyled.
    expect(state.visibility).toBe('visible');
    expect(state.layoutApplied).toBe(true);
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
