/**
 * @filedesc E2E: a click or tap on an option lands even when the press makes another control lose focus and show
 * its required error. That error's arrival moves the layout; shown between press and release it moves the target
 * out from under the pointer, and the click is lost (fs-us1l). The renderer defers it to the release.
 */
import { test, expect, type Page } from '@playwright/test';
import { gotoHarness, mountDefinition } from './helpers/harness';
import { engineValue } from './helpers/engine-harness';

const definition = {
  $formspec: '1.0',
  url: 'urn:test:focus-then-click',
  version: '1.0.0',
  title: 'Focus then click',
  items: [
    { key: 'lead', type: 'field', dataType: 'string', label: 'Lead' },
    { key: 'choice', type: 'field', dataType: 'choice', label: 'Choice', presentation: { widgetHint: 'RadioGroup' }, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
    { key: 'picks', type: 'field', dataType: 'multiChoice', label: 'Picks', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] },
  ],
  binds: [
    { path: 'lead', required: 'true' },
    { path: 'choice', required: 'true' },
    { path: 'picks', required: 'true' },
  ],
};

async function mount(page: Page, adapter: 'default' | 'uswds') {
  await gotoHarness(page);
  await page.evaluate((name: string) => (window as any).globalRegistry.setAdapter(name), adapter);
  await mountDefinition(page, definition);
  await page.locator('input[name="choice"]').first().waitFor({ state: 'attached' });
}

const errorText = (page: Page, field: string) =>
  page.evaluate((f: string) => document.querySelector(`[data-name="${f}"] .formspec-error, [data-name="${f}"] .usa-error-message`)?.textContent?.trim() ?? '', field);
/** The option's label, by its text: the default adapter wraps the input in it, USWDS points at it with `for`. */
const optionLabel = (page: Page, field: string, text: string) =>
  page.locator(`[data-name="${field}"] label`).filter({ hasText: new RegExp(`^\\s*${text}\\s*$`) });

for (const adapter of ['default', 'uswds'] as const) {
  test.describe(`${adapter} adapter`, () => {
    test.beforeEach(async ({ page }) => mount(page, adapter));

    test('Tab into a required radio group, then click another option: it is selected on the first click', async ({ page }) => {
      await page.locator('input[name="lead"]').focus();
      await page.keyboard.press('Tab');
      await expect(page.locator('input[name="choice"][value="a"]')).toBeFocused();

      await optionLabel(page, 'choice', 'B').click();

      expect(await engineValue(page, 'choice')).toBe('b');
      await expect(page.locator('input[name="choice"][value="b"]')).toBeChecked();
      expect(await errorText(page, 'choice')).toBe('');
    });

    test('focus on an option, click its own label: it is selected', async ({ page }) => {
      await page.locator('input[name="choice"][value="a"]').focus();
      await optionLabel(page, 'choice', 'A').click();
      expect(await engineValue(page, 'choice')).toBe('a');
      expect(await errorText(page, 'choice')).toBe('');
    });

    test('Tab into a required checkbox group, then click another option: it is checked on the first click', async ({ page }) => {
      await page.locator('input[name="choice"][value="a"]').focus();
      await page.keyboard.press('Tab');
      await expect(page.locator('input[type="checkbox"][value="x"]')).toBeFocused();

      await optionLabel(page, 'picks', 'Y').click();

      expect(await engineValue(page, 'picks')).toEqual(['y']);
      expect(await errorText(page, 'picks')).toBe('');
    });

    test('focus in an empty required text field above, click an option below: the option is selected and the text field shows its error', async ({ page }) => {
      await page.locator('input[name="lead"]').focus();
      await optionLabel(page, 'choice', 'B').click();
      expect(await engineValue(page, 'choice')).toBe('b');
      await expect.poll(() => errorText(page, 'lead')).not.toBe('');
    });

    test('leaving the group without answering still shows the required error', async ({ page }) => {
      await page.locator('input[name="choice"][value="a"]').focus();
      await page.locator('input[name="lead"]').click();
      await expect.poll(() => errorText(page, 'choice')).not.toBe('');
    });

    test('press an option, drag out, release: nothing selected, and the error the departure earned shows', async ({ page }) => {
      await page.locator('input[name="choice"][value="a"]').focus();
      // Press on the label's text (its right end), not on the input the default adapter's label wraps.
      const box = await optionLabel(page, 'choice', 'B').boundingBox();
      await page.mouse.move(box!.x + box!.width - 4, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.move(box!.x - 300, box!.y - 300);
      await page.mouse.up();
      expect(await engineValue(page, 'choice')).toBeNull();
      await expect.poll(() => errorText(page, 'choice')).not.toBe('');
    });

    test.describe('by touch', () => {
      test.use({ hasTouch: true });

      test('focus on an option, tap another: it is selected on the first tap', async ({ page }) => {
        await page.locator('input[name="choice"][value="a"]').focus();
        await optionLabel(page, 'choice', 'B').tap();
        expect(await engineValue(page, 'choice')).toBe('b');
        expect(await errorText(page, 'choice')).toBe('');
      });

      test('focus on a checkbox, tap another: it is checked on the first tap', async ({ page }) => {
        await page.locator('input[type="checkbox"][value="x"]').focus();
        await optionLabel(page, 'picks', 'Y').tap();
        expect(await engineValue(page, 'picks')).toEqual(['y']);
      });

      test('focus in an empty required text field above, tap an option below: the option is selected', async ({ page }) => {
        await page.locator('input[name="lead"]').focus();
        await optionLabel(page, 'choice', 'B').tap();
        expect(await engineValue(page, 'choice')).toBe('b');
        await expect.poll(() => errorText(page, 'lead')).not.toBe('');
      });
    });
  });
}
