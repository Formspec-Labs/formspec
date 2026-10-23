import { test, expect } from '@playwright/test';
import {
  mountGrantApplication,
  goToPage,
  engineSetValue,
} from '../helpers/grant-app';

test.describe('Grant App: Conditional Visibility', () => {
  test.beforeEach(async ({ page }) => {
    await mountGrantApplication(page);
  });

  test('should show indirectRate field for non-government org types', async ({ page }) => {
    await engineSetValue(page, 'applicantInfo.orgType', 'nonprofit');

    const rateField = page.locator('[data-name="projectNarrative.indirectRate"]');
    await expect(rateField).not.toHaveClass(/formspec-hidden/);
  });

  test('should hide indirectRate field when orgType is government', async ({ page }) => {
    await engineSetValue(page, 'applicantInfo.orgType', 'government');

    const rateField = page.locator('[data-name="projectNarrative.indirectRate"]');
    await expect(rateField).toHaveClass(/formspec-hidden/);
  });

  test('should show and hide ConditionalGroup content when its when-expression changes', async ({ page }) => {
    // The Subcontractors page has ConditionalGroup with when: "$budget.usesSubcontractors"
    await goToPage(page, 'Subcontractors');

    // Default: usesSubcontractors is null/false — conditional content is hidden
    const activePanel = page.locator('.formspec-wizard-panel:not(.formspec-hidden)');
    const wrapper = activePanel.locator('.formspec-when').first();
    await expect(wrapper).toHaveClass(/formspec-hidden/);

    // Enable subcontractors via engine
    await engineSetValue(page, 'budget.usesSubcontractors', true);

    // Content should now be visible
    await expect(wrapper).not.toHaveClass(/formspec-hidden/);
  });

  test('should show fallback text when ConditionalGroup condition is false', async ({ page }) => {
    // Subcontractors page — usesSubcontractors defaults to false
    await goToPage(page, 'Subcontractors');
    // The fallback text should be visible
    const fallback = page.locator('.formspec-conditional-fallback');
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText('subcontractor');
  });

  test('Compliance alert is not visible when usesSubcontractors is false', async ({ page }) => {
    await goToPage(page, 'Subcontractors');

    // usesSubcontractors is false by default, so the conditional group (and alert) should be hidden
    const alertVisible = await page.evaluate(() => {
      const alerts = document.querySelectorAll('.formspec-alert--info');
      for (const a of alerts) {
        if (a.textContent?.includes('Compliance reminder') && a.offsetParent !== null) return true;
      }
      return false;
    });
    expect(alertVisible).toBe(false);
  });

  test('Compliance alert appears when usesSubcontractors becomes true', async ({ page }) => {
    await goToPage(page, 'Subcontractors');

    // Enable subcontractors to show the compliance alert
    await engineSetValue(page, 'budget.usesSubcontractors', true);

    const panel = page.locator('.formspec-wizard-panel:not(.formspec-hidden)');
    await expect(panel.locator('.formspec-alert--info', { hasText: 'Compliance reminder' })).toBeVisible();
  });
});
