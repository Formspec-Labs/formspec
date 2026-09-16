import { test, expect } from '@playwright/test';
import {
  mountTribalShort,
  goToPage,
  engineValue,
  engineSetValue,
  isRelevant,
  getValidationReport,
} from '../helpers/grant-report';

test.describe('Grant Report: Tribal Short Form Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await mountTribalShort(page);
  });

  test('renders the wizard with Basic Information as first page', async ({ page }) => {
    const heading = await page.locator('.formspec-wizard-panel:not(.formspec-hidden) .formspec-section-title').first().textContent();
    expect(heading?.trim()).toBe('Basic Information');
  });

  test('basic info fields are visible on first page', async ({ page }) => {
    await expect(page.locator('.formspec-field[data-name="basicInfo.orgName"]')).toBeVisible();
    await expect(page.locator('.formspec-field[data-name="basicInfo.contactName"]')).toBeVisible();
  });
});

test.describe('Grant Report: multiChoice → Expenditure Relevance', () => {
  test.beforeEach(async ({ page }) => {
    await mountTribalShort(page);
    await goToPage(page, 'Expenditure Categories');
  });

  test('expenditure fields are non-relevant when no topics selected', async ({ page }) => {
    expect(await isRelevant(page, 'expenditures.employment')).toBe(false);
    expect(await isRelevant(page, 'expenditures.housing')).toBe(false);
    expect(await isRelevant(page, 'expenditures.health')).toBe(false);
  });

  test('selecting a topic makes the corresponding expenditure field relevant', async ({ page }) => {
    await engineSetValue(page, 'expenditures.applicableTopics', ['employment', 'housing']);
    await page.waitForTimeout(100);

    expect(await isRelevant(page, 'expenditures.employment')).toBe(true);
    expect(await isRelevant(page, 'expenditures.housing')).toBe(true);
    expect(await isRelevant(page, 'expenditures.health')).toBe(false);
  });

  test('deselecting a topic makes expenditure field non-relevant again', async ({ page }) => {
    await engineSetValue(page, 'expenditures.applicableTopics', ['employment']);
    await page.waitForTimeout(100);
    expect(await isRelevant(page, 'expenditures.employment')).toBe(true);

    await engineSetValue(page, 'expenditures.applicableTopics', []);
    await page.waitForTimeout(100);
    expect(await isRelevant(page, 'expenditures.employment')).toBe(false);
  });
});

test.describe('Grant Report: Default Bind Re-relevance', () => {
  test.beforeEach(async ({ page }) => {
    await mountTribalShort(page);
  });

  test('default value applied on relevance transition', async ({ page }) => {
    // Select employment → field becomes relevant
    await engineSetValue(page, 'expenditures.applicableTopics', ['employment']);
    await page.waitForTimeout(100);
    expect(await isRelevant(page, 'expenditures.employment')).toBe(true);

    // Set a value (setValue coerces numbers to money objects for money-typed fields)
    await engineSetValue(page, 'expenditures.employment', 45000);
    const setVal = await engineValue(page, 'expenditures.employment');
    expect(setVal).toEqual(expect.objectContaining({ amount: 45000 }));

    // Deselect → non-relevant
    await engineSetValue(page, 'expenditures.applicableTopics', []);
    await page.waitForTimeout(100);
    expect(await isRelevant(page, 'expenditures.employment')).toBe(false);

    // Re-select → relevant again, default should apply (value was cleared/null)
    // Clear the value first to simulate the non-relevant→relevant path
    await engineSetValue(page, 'expenditures.employment', null);
    await engineSetValue(page, 'expenditures.applicableTopics', ['employment']);
    await page.waitForTimeout(100);

    // The default bind should set the value to money object with amount 0
    const val = await engineValue(page, 'expenditures.employment');
    expect(val).toEqual(expect.objectContaining({ amount: 0, currency: 'USD' }));
  });

  test('no constraint errors for default value 0 with $ >= 0', async ({ page }) => {
    // Select employment → default 0 applied
    await engineSetValue(page, 'expenditures.employment', null);
    await engineSetValue(page, 'expenditures.applicableTopics', ['employment']);
    await page.waitForTimeout(100);

    const report = await getValidationReport(page, 'continuous');
    const constraintErrors = report.results.filter(
      (r: any) => r.path === 'expenditures.employment' && r.code === 'CONSTRAINT_FAILED'
    );
    expect(constraintErrors).toHaveLength(0);
  });
});

test.describe('Grant Report: Calculate + Admin Gate', () => {
  test.beforeEach(async ({ page }) => {
    await mountTribalShort(page);
  });

  test('total expenditures auto-calculates from selected topics', async ({ page }) => {
    await engineSetValue(page, 'expenditures.applicableTopics', ['employment', 'housing']);
    await page.waitForTimeout(100);
    await engineSetValue(page, 'expenditures.employment', 45000);
    await engineSetValue(page, 'expenditures.housing', 32000);
    await page.waitForTimeout(100);

    const total = await engineValue(page, 'expenditures.total');
    // moneySum returns a money object; verify amount
    const totalAmount = total && typeof total === 'object' && 'amount' in total
      ? Number(total.amount) : Number(total);
    expect(totalAmount).toBe(77000);
  });

  test('administration expenditure only relevant when hasAdministrationCosts is true', async ({ page }) => {
    expect(await isRelevant(page, 'expenditures.administrationExpenditure')).toBe(false);

    await engineSetValue(page, 'expenditures.hasAdministrationCosts', true);
    await page.waitForTimeout(100);
    expect(await isRelevant(page, 'expenditures.administrationExpenditure')).toBe(true);

    await engineSetValue(page, 'expenditures.hasAdministrationCosts', false);
    await page.waitForTimeout(100);
    expect(await isRelevant(page, 'expenditures.administrationExpenditure')).toBe(false);
  });
});
