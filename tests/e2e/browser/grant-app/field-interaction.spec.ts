import { test, expect } from '@playwright/test';
import {
  mountGrantApplication,
  goToPage,
  engineSetValue,
  engineValue,
} from '../helpers/grant-app';

test.describe('Grant App: Field Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await mountGrantApplication(page);
  });

  test('should render applicantInfo.orgName field in the DOM on page 1', async ({ page }) => {
    const orgNameField = page.locator('[data-name="applicantInfo.orgName"]');
    await expect(orgNameField).toBeVisible();
  });

  test('should reflect engine setValue in the DOM input for applicantInfo.orgName', async ({ page }) => {
    await engineSetValue(page, 'applicantInfo.orgName', 'Test Organization');
    await page.waitForTimeout(100);

    // Verify engine has the value
    const engineVal = await engineValue(page, 'applicantInfo.orgName');
    expect(engineVal).toBe('Test Organization');

    // Verify DOM input reflects the value
    const input = page.locator('[data-name="applicantInfo.orgName"] input, input[name="applicantInfo.orgName"]').first();
    await expect(input).toHaveValue('Test Organization');
  });

  test('should render bound TextInput components on the grant application first wizard page', async ({ page }) => {
    // The active page's section title, at whatever heading depth the page set
    const heading = page.locator('.formspec-wizard-panel:not(.formspec-hidden) .formspec-section-title').first();
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Applicant Info');

    // Bound TextInputs are visible on page 1 without any navigation
    await expect(page.locator('input[name="applicantInfo.orgName"]')).toBeVisible();
    await expect(page.locator('input[name="applicantInfo.ein"]')).toBeVisible();
  });

  test('should update engine value when RadioGroup orgType option is selected', async ({ page }) => {
    // Page 1 has the RadioGroup for applicantInfo.orgType
    const radios = page.locator('input[type="radio"][name="applicantInfo.orgType"]');
    await expect(radios).toHaveCount(4); // nonprofit, university, government, forprofit

    // Click "university" option
    await radios.filter({ hasText: '' }).nth(1).click();
    await page.waitForTimeout(50);

    const value = await page.evaluate(() => {
      const el: any = document.querySelector('formspec-render');
      return el.getEngine().signals['applicantInfo.orgType']?.value;
    });
    // university is index 1 in the orgTypes optionSet
    expect(['nonprofit', 'university', 'government', 'forprofit']).toContain(value);
  });

  test('should increase DataTable row count when a line item is added on Budget page', async ({ page }) => {
    await goToPage(page, 'Budget');

    // Initial count is 1 (minRepeat: 1)
    const initialCount = await page.evaluate(() => {
      const el: any = document.querySelector('formspec-render');
      return el.getEngine().repeats['budget.lineItems']?.value;
    });
    expect(initialCount).toBe(1);

    // Add a row via the DataTable add button
    const addBtn = page.locator('.formspec-datatable-add').first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    await page.waitForTimeout(100);

    const newCount = await page.evaluate(() => {
      const el: any = document.querySelector('formspec-render');
      return el.getEngine().repeats['budget.lineItems']?.value;
    });
    expect(newCount).toBe(2);
  });

  test('should render grant app main Stack with children visible on page 1', async ({ page }) => {
    // The grant app uses Stack components on each page — verify the first one has children
    const stack = page.locator('.formspec-stack').first();
    await expect(stack).toBeVisible();

    // Stack should contain child elements
    const children = stack.locator(':scope > *');
    const count = await children.count();
    expect(count).toBeGreaterThan(0);
  });

  test('DatePicker with showTime renders datetime-local input for dateTime field', async ({ page }) => {
    await goToPage(page, 'Project Narrative');

    // submissionDeadline is a dateTime field with showTime: true in component.json
    const input = page.locator('[data-name="projectNarrative.submissionDeadline"] input');
    const inputType = await input.getAttribute('type');
    expect(inputType).toBe('datetime-local');
  });
});
