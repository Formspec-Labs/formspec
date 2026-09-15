/** @filedesc E2E: core §4.2.5.3 styleHints render in every adapter — tone bar, muted text, size — beneath states. */
import { test, expect, type Page } from '@playwright/test';
import { gotoHarness, mountDefinition } from './helpers/harness';

const DEFINITION = {
  $formspec: '1.0',
  url: 'urn:test:style-hints',
  version: '1.0.0',
  title: 'Style hints',
  items: [
    { key: 'plain', type: 'field', dataType: 'string', label: 'Plain' },
    {
      key: 'featured', type: 'field', dataType: 'string', label: 'Featured',
      presentation: { styleHints: { emphasis: 'primary', size: 'large' } },
    },
    {
      key: 'aside', type: 'display', label: 'Only needed if your address changed.',
      presentation: { styleHints: { emphasis: 'muted', size: 'compact' } },
    },
    {
      key: 'mustFix', type: 'field', dataType: 'string', label: 'Must fix',
      presentation: { styleHints: { emphasis: 'primary' } },
    },
  ],
  binds: [{ path: 'mustFix', required: 'true' }],
};

async function mount(page: Page, adapter: string): Promise<void> {
  await gotoHarness(page);
  await page.evaluate((name) => (window as any).globalRegistry.setAdapter(name), adapter);
  await mountDefinition(page, DEFINITION);
  await page.waitForSelector('formspec-render [data-name="featured"]');
}

/** One computed style property of the first element matching `selector` inside the form. */
function styleOf(page: Page, selector: string, property: string): Promise<string> {
  return page.locator(`formspec-render ${selector}`).first().evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);
}

for (const { adapter, textSelector, loaded } of [
  // USWDS wraps display text in a prose block that takes the item's classes; the default adapter's text is the root.
  { adapter: 'uswds', textSelector: '.formspec-emphasis-muted .formspec-text', loaded: '480px' },
  { adapter: 'default', textSelector: '.formspec-emphasis-muted', loaded: null },
]) {
  test.describe(`styleHints under the ${adapter} adapter`, () => {
    test.beforeEach(async ({ page }) => {
      await mount(page, adapter);
      if (loaded) {
        await expect.poll(() => styleOf(page, '.formspec-container', 'max-width')).toBe(loaded);
      } else {
        await expect.poll(() => styleOf(page, '.formspec-container', '--formspec-default-skin')).toBe('1');
      }
    });

    test('a tone is a leading bar, muted recedes the text, and size scales the item', async ({ page }) => {
      const plainColor = await styleOf(page, '[data-name="plain"] label', 'color');

      expect(await styleOf(page, '[data-name="featured"]', 'border-left-style')).toBe('solid');
      expect(parseFloat(await styleOf(page, '[data-name="featured"]', 'border-left-width'))).toBeGreaterThan(1);
      expect(await styleOf(page, '[data-name="featured"]', 'zoom')).toBe('1.125');
      expect(await styleOf(page, '[data-name="plain"]', 'border-left-style')).toBe('none');

      expect(await styleOf(page, textSelector, 'color')).not.toBe(plainColor);
      expect(await styleOf(page, '.formspec-emphasis-muted', 'zoom')).toBe('0.875');
    });
  });
}

test('under USWDS, the error bar wins over a tone', async ({ page }) => {
  await mount(page, 'uswds');
  await expect.poll(() => styleOf(page, '.formspec-container', 'max-width')).toBe('480px');
  const tone = await styleOf(page, '[data-name="mustFix"]', 'border-left-color');

  await page.evaluate(() => (document.querySelector('formspec-render') as any).submit({ emitEvent: false }));
  await expect(page.locator('formspec-render [data-name="mustFix"]')).toHaveClass(/usa-form-group--error/);

  const errorBar = await styleOf(page, '[data-name="mustFix"]', 'border-left-color');
  expect(errorBar).not.toBe(tone);
  expect(errorBar).toBe('rgb(181, 9, 9)');
});
