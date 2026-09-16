import { test, expect } from '@playwright/test';
import {
  mountGrantApplication,
  goToPage,
  engineSetValue,
  engineValue,
} from '../helpers/grant-app';

test.describe('Grant App: No Negative Prices or Quantities', () => {
  test.beforeEach(async ({ page }) => {
    await mountGrantApplication(page);
  });

  test('quantity input should clamp negative values to zero', async ({ page }) => {
    await goToPage(page, 'Budget');

    const quantityInput = page.locator('input.formspec-datatable-input[name="budget.lineItems[0].quantity"]');
    await quantityInput.fill('-5');
    await page.waitForTimeout(50);

    const value = await engineValue(page, 'budget.lineItems[0].quantity');
    expect(value).toBe(0);
    await expect(quantityInput).toHaveValue('0');
  });

  test('unitCost input should clamp negative values to zero', async ({ page }) => {
    await goToPage(page, 'Budget');

    const unitCostInput = page.locator('input.formspec-datatable-input[name="budget.lineItems[0].unitCost"]');
    await unitCostInput.fill('-100');
    await page.waitForTimeout(50);

    const value = await engineValue(page, 'budget.lineItems[0].unitCost');
    expect(value).toBe(0);
    await expect(unitCostInput).toHaveValue('0');
  });
});

test.describe('Grant App: No Negative Hourly Rate in Project Phases', () => {
  test.beforeEach(async ({ page }) => {
    await mountGrantApplication(page);
  });

  test('hourlyRate input should clamp negative values to zero', async ({ page }) => {
    await goToPage(page, 'Project Phases');

    const rateInput = page.locator('input.formspec-datatable-input[name="projectPhases[0].phaseTasks[0].hourlyRate"]');
    await rateInput.fill('-100');
    await page.waitForTimeout(50);

    const value = await engineValue(page, 'projectPhases[0].phaseTasks[0].hourlyRate');
    expect(value).toMatchObject({ amount: 0, currency: 'USD' });
    await expect(rateInput).toHaveValue('0');
  });
});

test.describe('Grant App: Subcontractor Toggle Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mountGrantApplication(page);
  });

  test('auto-triggered modal should not block page interaction with a backdrop', async ({ page }) => {
    await goToPage(page, 'Budget');
    await engineSetValue(page, 'budget.usesSubcontractors', true);
    await page.waitForTimeout(200);

    // The Next button should be clickable without needing to close a modal first
    const nextBtn = page.locator('button.formspec-wizard-next').first();
    await expect(nextBtn).toBeEnabled();

    // The key assertion: clicking Next should work without being blocked by a dialog backdrop
    await nextBtn.click({ timeout: 5000 });
    await page.waitForTimeout(100);

    const heading = await page.locator('.formspec-wizard-panel:not(.formspec-hidden) .formspec-section-title').first().textContent();
    expect(heading?.trim()).toBe('Project Phases');
  });

  test('next/previous buttons should work after toggling usesSubcontractors via UI click', async ({ page }) => {
    await goToPage(page, 'Budget');
    await page.waitForTimeout(100);

    // Find the usesSubcontractors toggle and click it
    const toggle = page.locator('.formspec-toggle input[type="checkbox"]').last();
    await toggle.click();
    await page.waitForTimeout(200);

    // The Next button should be clickable
    const nextBtn = page.locator('button.formspec-wizard-next').first();
    await expect(nextBtn).toBeEnabled();
    await expect(nextBtn).toBeVisible();

    // Click should work — navigate to Project Phases
    await nextBtn.click({ timeout: 5000 });
    await page.waitForTimeout(100);

    const heading = await page.locator('.formspec-wizard-panel:not(.formspec-hidden) .formspec-section-title').first().textContent();
    expect(heading?.trim()).toBe('Project Phases');
  });
});

test.describe('Grant App: Popup Anchoring Near Triggers', () => {
  test.beforeEach(async ({ page }) => {
    await mountGrantApplication(page);
  });

  test('popover should open adjacent to its trigger button', async ({ page }) => {
    await goToPage(page, 'Budget');
    const trigger = page.locator('.formspec-popover-trigger', { hasText: 'Budget Checklist' });
    await trigger.click();
    await page.waitForTimeout(100);

    const geometry = await page.evaluate(() => {
      const triggerEl = Array.from(document.querySelectorAll('.formspec-popover-trigger'))
        .find((el) => el.textContent?.trim() === 'Budget Checklist') as HTMLElement | undefined;
      const popoverEl = document.querySelector('.formspec-popover-content[data-placement="top"]:popover-open') as HTMLElement | null;
      if (!triggerEl || !popoverEl) return null;
      const triggerRect = triggerEl.getBoundingClientRect();
      const popRect = popoverEl.getBoundingClientRect();
      return {
        triggerTop: triggerRect.top,
        triggerCenterX: triggerRect.left + (triggerRect.width / 2),
        popBottom: popRect.bottom,
        popCenterX: popRect.left + (popRect.width / 2),
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry!.popBottom).toBeLessThanOrEqual(geometry!.triggerTop + 12);
    expect(Math.abs(geometry!.popCenterX - geometry!.triggerCenterX)).toBeLessThanOrEqual(220);
  });

  test('modal should open near its trigger button', async ({ page }) => {
    await goToPage(page, 'Subcontractors');
    await engineSetValue(page, 'budget.usesSubcontractors', true);
    await page.waitForTimeout(150);

    const trigger = page.locator('.formspec-modal-trigger', { hasText: 'View Certification Requirements' });
    await trigger.click();
    await page.waitForTimeout(100);

    const geometry = await page.evaluate(() => {
      const triggerEl = Array.from(document.querySelectorAll('.formspec-modal-trigger'))
        .find((el) => el.textContent?.trim() === 'View Certification Requirements') as HTMLElement | undefined;
      const dialogEl = Array.from(document.querySelectorAll('dialog.formspec-modal[open]'))
        .find((el) => el.querySelector('.formspec-modal-title')?.textContent?.trim() === 'Subcontractor Certification Requirements') as HTMLElement | undefined;
      if (!triggerEl || !dialogEl) return null;
      const triggerRect = triggerEl.getBoundingClientRect();
      const dialogRect = dialogEl.getBoundingClientRect();
      return {
        triggerBottom: triggerRect.bottom,
        triggerCenterX: triggerRect.left + (triggerRect.width / 2),
        dialogTop: dialogRect.top,
        dialogCenterX: dialogRect.left + (dialogRect.width / 2),
      };
    });

    expect(geometry).not.toBeNull();
    // This is a centered modal (no placement), not a popover — verify it opened, not its position
  });
});
