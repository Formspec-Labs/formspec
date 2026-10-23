import { test, expect } from '@playwright/test';
import {
  mountGrantApplication,
  goToPage,
  engineSetValue,
} from '../helpers/grant-app';

test.describe('Grant App: Review & Submit Page', () => {
  test.beforeEach(async ({ page }) => {
    await mountGrantApplication(page);
  });

  test('should resolve orgType optionSet label in Summary on Review & Submit page', async ({ page }) => {
    // Set orgType to 'nonprofit' before navigating
    await engineSetValue(page, 'applicantInfo.orgType', 'nonprofit');

    // Navigate to Review & Submit page
    await goToPage(page, 'Review & Submit');

    // Expand the Applicant Information collapsible
    const collapsible = page.locator('.formspec-collapsible').filter({ hasText: 'Applicant Information' }).first();
    await collapsible.click();

    // The Summary should show the label "Nonprofit Organization" not the raw value "nonprofit"
    const summary = collapsible.locator('.formspec-summary');
    await expect(summary).toContainText('Nonprofit Organization');
    await expect(summary).not.toContainText('"nonprofit"');
  });

  test('should render both FileUpload components with drag-drop zones on Review page', async ({ page }) => {
    await goToPage(page, 'Review & Submit');
    const dropZones = page.locator('.formspec-file-drop-zone');
    // Both narrativeDoc and budgetJustification should have drop zones
    await expect(dropZones).toHaveCount(2);
  });

  test('should constrain Signature canvas width to container with max-width CSS', async ({ page }) => {
    await goToPage(page, 'Review & Submit');
    const canvas = page.locator('.formspec-signature-canvas');
    await expect(canvas).toBeVisible();
    // Canvas should not exceed its container width
    const { canvasWidth, containerWidth } = await canvas.evaluate(el => ({
      canvasWidth: el.getBoundingClientRect().width,
      containerWidth: (el.parentElement?.getBoundingClientRect().width || 9999),
    }));
    expect(canvasWidth).toBeLessThanOrEqual(containerWidth);
    // Canvas should have a reasonable height (not giant)
    const height = await canvas.evaluate(el => el.getBoundingClientRect().height);
    expect(height).toBeLessThanOrEqual(210);
  });
});
