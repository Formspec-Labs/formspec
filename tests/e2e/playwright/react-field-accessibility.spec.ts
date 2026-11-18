/** @filedesc Check readonly, upload, and native date announcements on a synthetic Surface intake route. */
import { expect, test as base } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Walk, WCAG_TAGS } from '../../../packages/formspec-walk/src/index';

const route = '/surface-browser.html?workspace&accessibleFields#/filing/ny';

base('the keyboard and reader reach the readonly value and the named upload action', async ({ page }) => {
  await page.goto(route);
  const walk = await Walk.open(page, {});
  try {
    const toggle = page.getByRole('switch', { name: 'Approved' });
    await walk.field('intro.approved', { label: 'Approved' });
    await expect(toggle).toBeFocused();
    await expect(toggle).toBeChecked();
    await expect(toggle).toHaveAttribute('aria-readonly', 'true');
    await page.keyboard.press('Space');
    await expect(toggle).toBeChecked();
    await page.keyboard.press('Tab');
    const browse = page.getByRole('button', { name: /Evidence.*required.*Upload a file/i });
    await expect(browse).toBeFocused();
    await expect(browse).toHaveAccessibleDescription('Attach a receipt');
    await toggle.focus();
    await walk.field('intro.evidence', { label: 'Evidence', required: true, hint: 'Attach a receipt' });
    walk.expectClean();
    const result = await new AxeBuilder({ page }).include('[data-slot="filing"]').withTags([...WCAG_TAGS]).analyze();
    expect(result.violations).toEqual([]);
  } finally {
    await walk.sr.stop();
  }
});

if (process.env.FORMSPEC_WALK_SR === 'os') {
  const { screenReaderTest } = require('@guidepup/playwright') as typeof import('@guidepup/playwright');
  screenReaderTest.use({ headless: false });
  screenReaderTest('the OS reader announces the required native date', async ({ page, screenReader }, info) => {
    await page.goto(route);
    await screenReader.navigateToWebContent();
    // Start on an optional field so an earlier required announcement cannot satisfy the check.
    await page.getByRole('textbox', { name: 'Contact name' }).focus();
    await screenReader.clearSpokenPhraseLog();
    await page.locator('input[type=date]').focus();
    try {
      await expect.poll(async () => (await screenReader.spokenPhraseLog()).join(' ')).toMatch(/(?=.*due date)(?=.*required)/i);
    } finally {
      await info.attach('native-date-speech', { body: (await screenReader.spokenPhraseLog()).join('\n'), contentType: 'text/plain' });
    }
  });
}
