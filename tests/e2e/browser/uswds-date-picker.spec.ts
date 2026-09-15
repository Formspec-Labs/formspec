/** @filedesc E2E: USWDS adapter DatePicker mounts USWDS's own date-picker JS (calendar + ISO value sync). */
import { test, expect } from '@playwright/test';
import { mountUswdsForm } from './helpers/uswds';
import { engineValue, getValidationReport } from './helpers/engine-harness';

test.describe('USWDS DatePicker: usa-date-picker JS mount', () => {
  test.beforeEach(async ({ page }) => {
    await mountUswdsForm(page, [
      { key: 'expectedReturnDate', type: 'field', dataType: 'date', label: 'Expected return date' },
    ]);
  });

  test('typing MM/DD/YYYY commits an ISO engine value with no Invalid date finding', async ({ page }) => {
    const input = page.locator('input.usa-date-picker__external-input');
    await input.waitFor({ state: 'visible', timeout: 5000 });

    await input.fill('12/22/2026');
    await input.blur();

    await expect.poll(async () => engineValue(page, 'expectedReturnDate')).toBe('2026-12-22');

    const report = await getValidationReport(page);
    const invalidDateFinding = (report.results ?? []).find((r: any) => /invalid date/i.test(r.message ?? ''));
    expect(invalidDateFinding).toBeUndefined();
  });

  test('the calendar button opens the month grid', async ({ page }) => {
    const button = page.locator('.usa-date-picker__button');
    await button.waitFor({ state: 'visible', timeout: 5000 });

    const calendar = page.locator('.usa-date-picker__calendar');
    await expect(calendar).toHaveAttribute('hidden', '');

    await button.click();
    await expect(calendar).not.toHaveAttribute('hidden', '');
  });
});
