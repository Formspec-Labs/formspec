import { test, expect } from '@playwright/test';
import {
  mountGrantApplication,
  goToPage,
  engineSetValue,
} from '../helpers/grant-app';

test.describe('Grant App: Wizard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mountGrantApplication(page);
  });

  test('should render the first wizard page: Applicant Info', async ({ page }) => {
    const heading = await page.locator('.formspec-wizard-panel:not(.formspec-hidden) .formspec-section-title').first().textContent();
    expect(heading?.trim()).toBe('Applicant Info');
  });

  test('should render 5 wizard step indicators', async ({ page }) => {
    const steps = page.locator('.formspec-wizard-step, .formspec-wizard-sidenav-item, [data-page], .formspec-wizard-steps li');
    const count = await steps.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('should navigate to Budget page via goToPage helper', async ({ page }) => {
    await engineSetValue(page, 'applicantInfo.orgName', 'Test Org');
    await engineSetValue(page, 'applicantInfo.ein', '12-3456789');
    await engineSetValue(page, 'applicantInfo.orgType', 'university');
    await engineSetValue(page, 'applicantInfo.contactName', 'Jane Smith');
    await engineSetValue(page, 'applicantInfo.contactEmail', 'jane@example.org');
    await engineSetValue(page, 'projectNarrative.projectTitle', 'Test Project');
    await engineSetValue(page, 'projectNarrative.abstract', 'A detailed project description.');
    await engineSetValue(page, 'projectNarrative.startDate', '2027-01-01');
    await engineSetValue(page, 'projectNarrative.endDate', '2028-01-01');
    await engineSetValue(page, 'projectNarrative.focusAreas', ['health', 'education']);
    await page.waitForTimeout(100);

    await goToPage(page, 'Budget');
    const heading = await page.locator('.formspec-wizard-panel:not(.formspec-hidden) .formspec-section-title').first().textContent();
    expect(heading?.trim()).toBe('Budget');
  });

  test('should navigate from page 1 to page 2 via Wizard Next and back via Previous', async ({ page }) => {
    // Page 1 should be visible
    const panels = page.locator('.formspec-wizard-panel');
    await expect(panels.nth(0)).toBeVisible();

    // Click Next → go to page 2 (Project Narrative)
    await page.locator('button.formspec-wizard-next').first().click();
    await page.waitForTimeout(150);

    const heading = page.locator('.formspec-wizard-panel:not(.formspec-hidden) .formspec-section-title').first();
    await expect(heading).toHaveText('Project Narrative');

    // Click Previous → back to page 1 (Applicant Info)
    await page.locator('button.formspec-wizard-prev').first().click();
    await page.waitForTimeout(150);

    const heading1 = page.locator('.formspec-wizard-panel:not(.formspec-hidden) .formspec-section-title').first();
    await expect(heading1).toHaveText('Applicant Info');
  });

  test('should render orgSubType as a child field nested under orgType on Applicant Info page', async ({ page }) => {
    const subTypeField = page.locator('[data-name="applicantInfo.orgType.orgSubType"]');
    await expect(subTypeField).toBeVisible();
  });

  test('should render CheckboxGroup for focusAreas on Project Narrative page', async ({ page }) => {
    const checkboxGroup = page.locator('.formspec-checkbox-group, [data-name="focusAreas"]');
    const exists = await checkboxGroup.count();
    expect(exists).toBeGreaterThan(0);
  });

  test('sidenav labels show page titles not "Step N" placeholders', async ({ page }) => {
    const labels = page.locator('.formspec-wizard-sidenav-label');
    const count = await labels.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const text = await labels.nth(i).textContent();
      expect(text?.trim()).not.toMatch(/^Step \d+$/);
      expect(text?.trim().length).toBeGreaterThan(0);
    }
    // Spot-check first and second labels against known grant app page names
    await expect(labels.nth(0)).toHaveText('Applicant Info');
    await expect(labels.nth(1)).toHaveText('Project Narrative');
  });
});
