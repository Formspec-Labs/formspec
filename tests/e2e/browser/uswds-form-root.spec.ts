/** @filedesc E2E: the USWDS render root is USWDS's own form, and a Theme width stop still narrows its input. */
import { test, expect } from '@playwright/test';
import { gotoHarness, mountDefinition } from './helpers/harness';

const URL = 'urn:test:uswds-form-root';

test.describe('USWDS render root', () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
    await page.evaluate((url) => {
      (window as any).globalRegistry.setAdapter('uswds');
      const renderer: any = document.querySelector('formspec-render');
      renderer.themeDocument = {
        $formspecTheme: '1.0',
        version: '1.0.0',
        targetDefinition: { url },
        items: { zip: { widgetConfig: { width: 'md' } } },
      };
    }, URL);
    await mountDefinition(page, {
      $formspec: '1.0',
      url: URL,
      version: '1.0.0',
      title: 'USWDS form root',
      items: [
        { key: 'city', type: 'field', dataType: 'string', label: 'City' },
        { key: 'zip', type: 'field', dataType: 'string', label: 'ZIP code' },
      ],
    });
  });

  test("takes USWDS's large form column from the adapter's root classes", async ({ page }) => {
    const root = page.locator('formspec-render .formspec-container');
    await expect(root).toHaveClass(/\busa-form\b/);
    await expect(root).toHaveClass(/\busa-form--large\b/);
    await expect.poll(() => root.evaluate((el) => getComputedStyle(el).maxWidth)).toBe('480px');
  });

  test('a width stop narrows its input below the column the other inputs fill', async ({ page }) => {
    const width = (key: string) =>
      page.locator(`formspec-render [data-name="${key}"] input`).evaluate((el) => el.getBoundingClientRect().width);
    await expect.poll(() => page.locator('formspec-render .formspec-container').evaluate((el) => getComputedStyle(el).maxWidth)).toBe('480px');
    const city = await width('city');
    const zip = await width('zip');
    // usa-form clears the input cap so fields fill the column; the md stop must still win over that clear.
    expect(city).toBeGreaterThan(400);
    expect(zip).toBeLessThan(city / 2);
  });
});
