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
    await toggle.focus();
    await expect(toggle).toBeFocused();
    expect(await walk.sr.lastSpokenPhrase()).toMatch(/(?:^|, )(checked|on)(?:,|$)/i);
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

for (const { locale, label, optionalLabel, required } of [
  { locale: 'en-US', label: 'Due date', optionalLabel: 'Follow-up date', required: 'Required' },
  { locale: 'fr-FR', label: 'Date limite', optionalLabel: 'Date de suivi', required: 'Obligatoire' },
]) {
  base.describe(`date labels (${locale})`, () => {
    base.use({ locale });
    base('announces the localized requirement once and keeps the visible label and asterisk', async ({ page }, info) => {
      const walk = await Walk.open(page, { url: route });
      try {
        const due = page.locator('[data-name="intro.due"]');
        const optional = page.locator('[data-name="intro.followUp"]');
        const date = due.locator('input[type="date"]');
        const optionalDate = optional.locator('input[type="date"]');
        await expect(date).toHaveJSProperty('required', true);
        await expect(date).toHaveAttribute('aria-required', 'true');
        await expect(date).toHaveAccessibleName(`${label} ${required}`);
        await expect(optionalDate).toHaveJSProperty('required', false);
        await expect(optionalDate).toHaveAccessibleName(optionalLabel);
        expect(await due.locator('label').evaluate(el => el.firstChild?.textContent)).toBe(label);
        const asterisk = due.locator('label .formspec-required');
        await expect(asterisk).toBeVisible();
        await expect(asterisk).toHaveText('*');
        await expect(asterisk).toHaveAttribute('aria-hidden', 'true');
        await expect(due.locator('label .formspec-sr-only')).toHaveCSS('clip', 'rect(0px, 0px, 0px, 0px)');
        await expect(optional.locator('label .formspec-required')).toHaveCount(0);
        await walk.field('intro.followUp', { label: optionalLabel, required: false });
        await walk.field('intro.due', { label, required: true });
        walk.expectClean();
        const speech = await walk.sr.lastSpokenPhrase();
        expect(speech).toContain(`${label} ${required}`);
        await info.attach('virtual-date-speech', { body: speech, contentType: 'text/plain' });
      } finally {
        await walk.sr.stop();
      }
    });
  });
}
