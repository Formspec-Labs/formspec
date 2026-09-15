/** @filedesc E2E: the USWDS render root is USWDS's own form, and a Theme width stop still narrows its input. */
import { test, expect, type Page } from '@playwright/test';
import { gotoHarness, mountDefinition } from './helpers/harness';

const URL = 'urn:test:uswds-form-root';

/** Resolves once the USWDS layers apply: the render root holds USWDS's large form column. */
async function uswdsStylesApplied(page: Page): Promise<void> {
  await expect
    .poll(() => page.locator('formspec-render .formspec-container').evaluate((el) => getComputedStyle(el).maxWidth))
    .toBe('480px');
}

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
    await uswdsStylesApplied(page);
  });

  test('a width stop narrows its input below the column the other inputs fill', async ({ page }) => {
    const width = (key: string) =>
      page.locator(`formspec-render [data-name="${key}"] input`).evaluate((el) => el.getBoundingClientRect().width);
    await uswdsStylesApplied(page);
    const city = await width('city');
    const zip = await width('zip');
    // usa-form clears the input cap so fields fill the column; the md stop must still win over that clear.
    expect(city).toBeGreaterThan(400);
    expect(zip).toBeLessThan(city / 2);
  });
});

test.describe('USWDS rhythm around a group whose title is hidden', () => {
  const HIDDEN_URL = 'urn:test:uswds-hidden-title-rhythm';

  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
    await page.evaluate((url) => {
      (window as any).globalRegistry.setAdapter('uswds');
      const renderer: any = document.querySelector('formspec-render');
      renderer.themeDocument = {
        $formspecTheme: '1.0',
        version: '1.0.0',
        targetDefinition: { url },
        items: { hours: { labelPosition: 'hidden' }, contact: { labelPosition: 'hidden' } },
      };
    }, HIDDEN_URL);
    await mountDefinition(page, {
      $formspec: '1.0',
      url: HIDDEN_URL,
      version: '1.0.0',
      title: 'Hidden title rhythm',
      items: [
        { key: 'first', type: 'field', dataType: 'string', label: 'First question' },
        { key: 'second', type: 'field', dataType: 'string', label: 'Second question' },
        {
          key: 'hours', type: 'group', label: 'Hours worked', hint: 'Enter 99 if you worked more.',
          children: [{ key: 'count', type: 'field', dataType: 'integer', label: 'Hours' }],
        },
        {
          key: 'contact', type: 'group', label: 'Contact',
          children: [{ key: 'phone', type: 'field', dataType: 'string', label: 'Phone' }],
        },
      ],
    });
  });

  test('takes the one gap a question takes, whether it opens with a hint or a question', async ({ page }) => {
    await uswdsStylesApplied(page);
    const gaps = await page.evaluate(() => {
      const form = document.querySelector('formspec-render')!;
      const box = (el: Element) => el.getBoundingClientRect();
      const field = (key: string) => form.querySelector(`[data-name="${key}"]`)!;
      const hint = form.querySelector('fieldset > legend.usa-sr-only + .usa-hint')!;
      return {
        question: Math.round(box(field('second')).top - box(field('first')).bottom),
        hint: Math.round(box(hint).top - box(field('second')).bottom),
        question_after_hidden_title: Math.round(box(field('contact.phone')).top - box(field('hours.count')).bottom),
      };
    });
    expect(gaps.question).toBeGreaterThan(0);
    expect(gaps.hint).toBe(gaps.question);
    expect(gaps.question_after_hidden_title).toBe(gaps.question);
  });
});

