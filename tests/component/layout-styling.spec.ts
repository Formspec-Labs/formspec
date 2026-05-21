import { test, expect } from '@playwright/test';
import {
  mountGrantApplication,
  goToPage,
  engineSetValue,
} from '../e2e/browser/helpers/grant-app';

test.describe('Grant App: Readonly Field Visual Treatment', () => {
  test.beforeEach(async ({ page }) => {
    await mountGrantApplication(page);
  });

  test('readonly fields should have a visual readonly class on the wrapper', async ({ page }) => {
    // Duration on the Project Narrative page is readonly when both dates are set.
    await goToPage(page, 'Project Narrative');
    await engineSetValue(page, 'projectNarrative.startDate', '2027-01-01');
    await engineSetValue(page, 'projectNarrative.endDate', '2028-06-01');
    await page.waitForTimeout(100);

    // Duration field should now be readonly and have a visual class
    const durationField = page.locator('.formspec-field[data-name="projectNarrative.duration"]');
    await expect(durationField).toHaveClass(/formspec-field--readonly/);
  });

  test('readonly field input should appear visually distinct (background color)', async ({ page }) => {
    await goToPage(page, 'Project Narrative');
    await engineSetValue(page, 'projectNarrative.startDate', '2027-01-01');
    await engineSetValue(page, 'projectNarrative.endDate', '2028-06-01');
    await page.waitForTimeout(100);

    const durationInput = page.locator('.formspec-field[data-name="projectNarrative.duration"] input');
    // Readonly fields should have the readonly attribute and their wrapper class
    await expect(durationInput).toHaveAttribute('readonly', '');
    const field = page.locator('.formspec-field[data-name="projectNarrative.duration"]');
    await expect(field).toHaveClass(/formspec-field--readonly/);
  });

  test('computed readonly fields on other pages should use stronger readonly styling', async ({ page }) => {
    await goToPage(page, 'Budget');
    await page.waitForTimeout(100);

    const subtotalInput = page.locator('input.formspec-datatable-input[name="budget.lineItems[0].subtotal"]');
    await expect(subtotalInput).toBeDisabled();

    const styles = await subtotalInput.evaluate((el) => {
      const computed = getComputedStyle(el);
      return {
        backgroundColor: computed.backgroundColor,
        borderTopColor: computed.borderTopColor,
      };
    });

    expect(styles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles.borderTopColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles.borderTopColor).not.toBe('transparent');
  });

  test('readonly field labels should display a read-only badge', async ({ page }) => {
    await goToPage(page, 'Project Narrative');
    await engineSetValue(page, 'projectNarrative.startDate', '2027-01-01');
    await engineSetValue(page, 'projectNarrative.endDate', '2028-06-01');
    await page.waitForTimeout(100);

    const durationLabel = page.locator('.formspec-field[data-name="projectNarrative.duration"] .formspec-label');
    const readonlyBadgeContent = await durationLabel.evaluate((label) =>
      getComputedStyle(label, '::after').content
    );
    expect(readonlyBadgeContent).toContain('Read only');
  });
});

test.describe('Grant App: Website Field', () => {
  test.beforeEach(async ({ page }) => {
    await mountGrantApplication(page);
  });

  test('website field should not have a .org suffix that restricts URLs', async ({ page }) => {
    const suffix = page.locator('.formspec-field[data-name="applicantInfo.projectWebsite"] .formspec-suffix');
    await expect(suffix).toHaveCount(0);
  });
});

test.describe('Grant App: Contact Detail Labels', () => {
  test.beforeEach(async ({ page }) => {
    await mountGrantApplication(page);
  });

  test('contact detail labels render for all three contact fields', async ({ page }) => {
    const contactLabels = page.locator('.formspec-field[data-name="applicantInfo.contactName"] .formspec-label, .formspec-field[data-name="applicantInfo.contactEmail"] .formspec-label, .formspec-field[data-name="applicantInfo.contactPhone"] .formspec-label');

    const count = await contactLabels.count();
    expect(count).toBe(3);
  });
});

test.describe('Grant App: Tab Spacing', () => {
  test.beforeEach(async ({ page }) => {
    await mountGrantApplication(page);
  });

  test('tab content should have spacing below top tabs before fields', async ({ page }) => {
    await goToPage(page, 'Project Narrative');
    await page.waitForTimeout(50);

    const topPadding = await page.locator(
      '.formspec-tabs:not([data-placement]) .formspec-tab-panels, .formspec-tabs[data-placement="top"] .formspec-tab-panels'
    ).first().evaluate((el) => getComputedStyle(el).paddingTop);

    expect(topPadding).not.toBe('0px');
  });
});

test.describe('Grant App: Stack Direction', () => {
  test.beforeEach(async ({ page }) => {
    await mountGrantApplication(page);
  });

  test('Stack horizontal renders as flex-direction row', async ({ page }) => {
    await goToPage(page, 'Project Narrative');

    const flexDir = await page.evaluate(() => {
      const el = document.querySelector('.formspec-stack--horizontal');
      if (!el) return null;
      return window.getComputedStyle(el).flexDirection;
    });
    expect(flexDir).toBe('row');
  });
});
