import { test, expect } from '@playwright/test';
import { mountGrantApplication, goToPage, engineSetValue } from '../helpers/grant-app';

// A button-triggered Modal without `placement` is the native centered modal (Component spec): the open
// dialog stays in the browser's top layer instead of dropping into page flow, and tall content scrolls.
test.describe('Grant App: Modal opens in the top layer', () => {
  test('the Subcontractors modal is fixed, inside the viewport, and scrollable', async ({ page }) => {
    await mountGrantApplication(page);
    // The Subcontractors content (and its modals) sits behind the budget's usesSubcontractors switch.
    await engineSetValue(page, 'budget.usesSubcontractors', true);
    await goToPage(page, 'Subcontractors');

    await page.getByRole('button', { name: 'View Certification Requirements' }).click();
    const dialog = page.locator('dialog.formspec-modal[open]').first();
    await expect(dialog).toBeVisible();

    const box = await dialog.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { position: style.position, overflowY: style.overflowY, top: rect.top, bottom: rect.bottom, viewport: window.innerHeight };
    });
    expect(box.position).toBe('fixed');
    expect(box.overflowY).toBe('auto');
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.viewport);
  });
});
