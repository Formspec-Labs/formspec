/** @filedesc E2E: section and field rhythm — each adapter's own gaps when the Theme is silent, the Theme's tokens when set. */
import { test, expect, type Page } from '@playwright/test';
import { gotoHarness, mountDefinition } from './helpers/harness';

const URL = 'urn:test:section-spacing';

const DEFINITION = {
  $formspec: '1.0',
  url: URL,
  version: '1.0.0',
  title: 'Section spacing',
  items: [
    { key: 'first', type: 'field', dataType: 'string', label: 'First question' },
    { key: 'second', type: 'field', dataType: 'string', label: 'Second question' },
    {
      key: 'address', type: 'group', label: 'Mailing address',
      children: [
        { key: 'street', type: 'field', dataType: 'string', label: 'Street' },
        { key: 'city', type: 'field', dataType: 'string', label: 'City' },
      ],
    },
  ],
};

async function mount(page: Page, adapter: string, tokens?: Record<string, string>): Promise<void> {
  await gotoHarness(page);
  await page.evaluate(({ name, url, tokens }) => {
    (window as any).globalRegistry.setAdapter(name);
    if (tokens) {
      (document.querySelector('formspec-render') as any).themeDocument = {
        $formspecTheme: '1.0', version: '1.0.0', targetDefinition: { url }, tokens,
      };
    }
  }, { name: adapter, url: URL, tokens });
  await mountDefinition(page, DEFINITION);
  await page.waitForSelector('formspec-render [data-name="address.city"]');
}

/** Gaps between the rendered boxes: question to question, question to the section's box, and inside the section. */
function gaps(page: Page) {
  return page.evaluate(() => {
    const form = document.querySelector('formspec-render')!;
    const box = (selector: string) => form.querySelector(selector)!.getBoundingClientRect();
    // The group's own box: both adapters mark a group root `formspec-themed-group` (the platform selector).
    const title = form.querySelector('.formspec-themed-group')!.getBoundingClientRect();
    return {
      question: Math.round(box('[data-name="second"]').top - box('[data-name="first"]').bottom),
      section: Math.round(title.top - box('[data-name="second"]').bottom),
      inside: Math.round(box('[data-name="address.city"]').top - box('[data-name="address.street"]').bottom),
    };
  });
}

test.describe('USWDS rhythm', () => {
  const stylesApplied = (page: Page) => expect
    .poll(() => page.locator('formspec-render .formspec-container').evaluate((el) => getComputedStyle(el).maxWidth))
    .toBe('480px');

  test("with no rhythm tokens, questions and sections take USWDS's own margins", async ({ page }) => {
    await mount(page, 'uswds');
    await stylesApplied(page);
    expect(await gaps(page)).toEqual({ question: 24, section: 48, inside: 24 });
  });

  test('the Theme retunes each rhythm on its own', async ({ page }) => {
    await mount(page, 'uswds', { 'spacing.field': '2rem', 'spacing.section': '4rem' });
    await stylesApplied(page);
    expect(await gaps(page)).toEqual({ question: 32, section: 64, inside: 32 });
  });
});

test.describe('default skin rhythm', () => {
  test('a section sits a section gap below the question before it, questions a field gap apart', async ({ page }) => {
    await mount(page, 'default', { 'spacing.field': '0.75rem', 'spacing.section': '2.5rem' });
    await expect.poll(() => page.locator('formspec-render .formspec-container')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--formspec-default-skin'))).toBe('1');
    const measured = await gaps(page);
    expect(measured.question).toBe(12);
    expect(measured.section).toBe(40);
  });
});
