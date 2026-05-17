import { test, expect } from '@playwright/test';
import {
  mountTribalLong,
  goToPage,
  engineValue,
  engineSetValue,
  isRelevant,
  getValidationReport,
} from '../helpers/grant-report';
import {
  waitForEngineValue,
  waitForRelevant,
  waitForValidationMatch,
  waitForWizardPageTitle,
} from '../helpers/engine-harness';

// ---------------------------------------------------------------------------
// Smoke: Initial render and wizard page count
// ---------------------------------------------------------------------------

test.describe('Tribal Long: Smoke', () => {
  test.beforeEach(async ({ page }) => {
    await mountTribalLong(page);
  });

  test('renders the wizard with Basic Information as first page', async ({ page }) => {
    const heading = await page
      .locator('.formspec-wizard-panel:not(.formspec-hidden) h2')
      .first()
      .textContent();
    expect(heading?.trim()).toBe('Basic Information');
  });

  test('basic info fields are visible on first page', async ({ page }) => {
    await expect(page.locator('.formspec-field[data-name="basicInfo.orgName"]')).toBeVisible();
    await expect(page.locator('.formspec-field[data-name="basicInfo.contactName"]')).toBeVisible();
  });

  test('wizard has exactly 5 pages', async ({ page }) => {
    const expectedPages = [
      'Basic Information',
      'Expenditure Categories',
      'Expenditure Details',
      'Demographic Information',
      'Review & Submit',
    ];

    // Collect all page titles by advancing through wizard
    const titles: string[] = [];

    for (let i = 0; i < 5; i++) {
      const heading = await page
        .locator('.formspec-wizard-panel:not(.formspec-hidden) h2')
        .first()
        .textContent()
        .catch(() => '');
      titles.push(heading?.trim() ?? '');

      // Advance to next page if not on the last one
      if (i < 4) {
        const nextBtn = page.locator('button.formspec-wizard-next').first();
        await nextBtn.click();
        await waitForWizardPageTitle(page, expectedPages[i + 1]!);
      }
    }

    expect(titles).toEqual(expectedPages);
  });
});

// ---------------------------------------------------------------------------
// Wizard navigation: traverse all 5 pages, verify titles, back navigation
// ---------------------------------------------------------------------------

test.describe('Tribal Long: Wizard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mountTribalLong(page);
  });

  test('can navigate forward through all 5 pages', async ({ page }) => {
    const pages = [
      'Basic Information',
      'Expenditure Categories',
      'Expenditure Details',
      'Demographic Information',
      'Review & Submit',
    ];

    for (const title of pages) {
      const heading = await page
        .locator('.formspec-wizard-panel:not(.formspec-hidden) h2')
        .first()
        .textContent()
        .catch(() => '');
      expect(heading?.trim()).toBe(title);

      if (title !== 'Review & Submit') {
        const nextTitle = pages[pages.indexOf(title) + 1]!;
        await page.locator('button.formspec-wizard-next').first().click();
        await waitForWizardPageTitle(page, nextTitle);
      }
    }
  });

  test('can navigate backward from Expenditure Details to Expenditure Categories', async ({ page }) => {
    await goToPage(page, 'Expenditure Details');

    const headingBefore = await page
      .locator('.formspec-wizard-panel:not(.formspec-hidden) h2')
      .first()
      .textContent();
    expect(headingBefore?.trim()).toBe('Expenditure Details');

    await page.locator('button.formspec-wizard-prev').first().click();
    await waitForWizardPageTitle(page, 'Expenditure Categories');

    const headingAfter = await page
      .locator('.formspec-wizard-panel:not(.formspec-hidden) h2')
      .first()
      .textContent();
    expect(headingAfter?.trim()).toBe('Expenditure Categories');
  });

  test('can navigate backward from Demographic Information to Expenditure Details', async ({ page }) => {
    await goToPage(page, 'Demographic Information');

    await page.locator('button.formspec-wizard-prev').first().click();
    await waitForWizardPageTitle(page, 'Expenditure Details');

    const heading = await page
      .locator('.formspec-wizard-panel:not(.formspec-hidden) h2')
      .first()
      .textContent();
    expect(heading?.trim()).toBe('Expenditure Details');
  });
});

// ---------------------------------------------------------------------------
// Expenditure categories: selection drives detail field relevance
// ---------------------------------------------------------------------------

test.describe('Tribal Long: Expenditure Category Relevance', () => {
  test.beforeEach(async ({ page }) => {
    await mountTribalLong(page);
    await goToPage(page, 'Expenditure Categories');
  });

  test('expenditure fields are non-relevant when no categories are selected', async ({ page }) => {
    expect(await isRelevant(page, 'expenditures.employment')).toBe(false);
    expect(await isRelevant(page, 'expenditures.housing')).toBe(false);
    expect(await isRelevant(page, 'expenditures.health')).toBe(false);
  });

  test('selecting categories makes corresponding expenditure fields relevant', async ({ page }) => {
    await engineSetValue(page, 'expenditures.applicableTopics', ['employment', 'housing']);
    await waitForRelevant(page, 'expenditures.employment', true);
    await waitForRelevant(page, 'expenditures.housing', true);
    await waitForRelevant(page, 'expenditures.health', false);

    expect(await isRelevant(page, 'expenditures.employment')).toBe(true);
    expect(await isRelevant(page, 'expenditures.housing')).toBe(true);
    expect(await isRelevant(page, 'expenditures.health')).toBe(false);
  });

  test('deselecting a category removes expenditure field relevance', async ({ page }) => {
    await engineSetValue(page, 'expenditures.applicableTopics', ['employment']);
    await waitForRelevant(page, 'expenditures.employment', true);
    expect(await isRelevant(page, 'expenditures.employment')).toBe(true);

    await engineSetValue(page, 'expenditures.applicableTopics', []);
    await waitForRelevant(page, 'expenditures.employment', false);
    expect(await isRelevant(page, 'expenditures.employment')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Expenditure Details page: detail field cards appear for selected categories
// ---------------------------------------------------------------------------

test.describe('Tribal Long: Expenditure Details Page', () => {
  test.beforeEach(async ({ page }) => {
    await mountTribalLong(page);
    await goToPage(page, 'Expenditure Details');
  });

  test('shows Alert hint when no categories are selected', async ({ page }) => {
    // The Alert component with severity=info and the hint text should be visible
    // when applicableTopics is empty. We look for the alert text in the DOM
    // without assuming a particular element type since Alert may render as a div.
    const alertText = page.locator(
      '.formspec-wizard-panel:not(.formspec-hidden) :text("Select expenditure categories on the previous page")'
    );
    await expect(alertText).toBeVisible();
  });

  test('detail card for employment appears when employment is selected', async ({ page }) => {
    await engineSetValue(page, 'expenditures.applicableTopics', ['employment']);
    await waitForRelevant(page, 'descriptions.employmentDesc', true);

    // The Alert hint should no longer be visible
    const alertText = page.locator(
      '.formspec-wizard-panel:not(.formspec-hidden) :text("Select expenditure categories on the previous page")'
    );
    await expect(alertText).not.toBeVisible();

    // The description field for employment should be relevant and visible
    expect(await isRelevant(page, 'descriptions.employmentDesc')).toBe(true);
    await expect(page.locator('.formspec-field[data-name="descriptions.employmentDesc"]')).toBeVisible();
  });

  test('detail cards for housing and health appear when those categories are selected', async ({ page }) => {
    await engineSetValue(page, 'expenditures.applicableTopics', ['housing', 'health']);
    await waitForRelevant(page, 'descriptions.housingDesc', true);
    await waitForRelevant(page, 'descriptions.healthDesc', true);
    await waitForRelevant(page, 'descriptions.employmentDesc', false);

    expect(await isRelevant(page, 'descriptions.housingDesc')).toBe(true);
    expect(await isRelevant(page, 'descriptions.healthDesc')).toBe(true);
    expect(await isRelevant(page, 'descriptions.employmentDesc')).toBe(false);
  });

  test('no detail cards are visible when no categories are selected', async ({ page }) => {
    expect(await isRelevant(page, 'descriptions.employmentDesc')).toBe(false);
    expect(await isRelevant(page, 'descriptions.housingDesc')).toBe(false);
    expect(await isRelevant(page, 'descriptions.healthDesc')).toBe(false);
    expect(await isRelevant(page, 'descriptions.educationDesc')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Demographics: numeric grid auto-calculation
// ---------------------------------------------------------------------------

test.describe('Tribal Long: Demographics Grid Auto-Calculation', () => {
  test.beforeEach(async ({ page }) => {
    await mountTribalLong(page);
    await goToPage(page, 'Demographic Information');
  });

  test('sex breakdown total auto-calculates from male + female', async ({ page }) => {
    await engineSetValue(page, 'demographics.sexBreakdown.male', 30);
    await engineSetValue(page, 'demographics.sexBreakdown.female', 20);
    await waitForEngineValue(page, 'demographics.sexBreakdown.sexTotal', 50);

    const sexTotal = await engineValue(page, 'demographics.sexBreakdown.sexTotal');
    expect(sexTotal).toBe(50);
  });

  test('employment status total auto-calculates from all status fields', async ({ page }) => {
    await engineSetValue(page, 'demographics.employmentStatus.fullTime', 10);
    await engineSetValue(page, 'demographics.employmentStatus.partTime', 5);
    await engineSetValue(page, 'demographics.employmentStatus.migrantSeasonal', 2);
    await engineSetValue(page, 'demographics.employmentStatus.unemployedShort', 3);
    await engineSetValue(page, 'demographics.employmentStatus.unemployedLong', 4);
    await engineSetValue(page, 'demographics.employmentStatus.notInLaborForce', 6);
    await engineSetValue(page, 'demographics.employmentStatus.retired', 7);
    await engineSetValue(page, 'demographics.employmentStatus.unknown', 3);
    await waitForEngineValue(page, 'demographics.employmentStatus.employmentTotal', 40);

    const employmentTotal = await engineValue(page, 'demographics.employmentStatus.employmentTotal');
    expect(employmentTotal).toBe(40);
  });

  test('sex breakdown total field is readonly', async ({ page }) => {
    const field = page.locator('.formspec-field[data-name="demographics.sexBreakdown.sexTotal"]');
    await expect(field).toBeVisible();
    const totalInput = field.locator('input');
    if ((await totalInput.count()) > 0) {
      await expect(totalInput).toHaveAttribute('readonly', '');
    } else {
      await expect(field).toHaveClass(/formspec-field--readonly/);
    }
  });

  test('employment total field is readonly', async ({ page }) => {
    const field = page.locator('.formspec-field[data-name="demographics.employmentStatus.employmentTotal"]');
    await expect(field).toBeVisible();
    const totalInput = field.locator('input');
    if ((await totalInput.count()) > 0) {
      await expect(totalInput).toHaveAttribute('readonly', '');
    } else {
      await expect(field).toHaveClass(/formspec-field--readonly/);
    }
  });
});

// ---------------------------------------------------------------------------
// Shape constraints: cross-field validation errors on submit
// ---------------------------------------------------------------------------

test.describe('Tribal Long: Shape Constraints', () => {
  test.beforeEach(async ({ page }) => {
    await mountTribalLong(page);
  });

  test('sexBreakdownMatchesTotal shape fires when sex totals do not match totalServedOver18', async ({ page }) => {
    // totalServedOver18 = 60, but sex breakdown = 30 + 20 = 50 → mismatch
    await engineSetValue(page, 'demographics.totalServed', 100);
    await engineSetValue(page, 'demographics.totalServedOver18', 60);
    await engineSetValue(page, 'demographics.sexBreakdown.male', 30);
    await engineSetValue(page, 'demographics.sexBreakdown.female', 20);
    await waitForEngineValue(page, 'demographics.sexBreakdown.sexTotal', 50);

    const report = await getValidationReport(page, 'submit');
    const shapeError = report.results.filter(
      (r: any) =>
        r.id === 'sexBreakdownMatchesTotal' ||
        (r.path === 'demographics.sexBreakdown.sexTotal' && r.code === 'SHAPE_FAILED')
    );
    expect(shapeError.length).toBeGreaterThan(0);
    expect(shapeError[0].message).toContain('Sex breakdown total must equal total individuals served over 18');
  });

  test('sexBreakdownMatchesTotal shape passes when totals match', async ({ page }) => {
    await engineSetValue(page, 'demographics.totalServed', 100);
    await engineSetValue(page, 'demographics.totalServedOver18', 50);
    await engineSetValue(page, 'demographics.sexBreakdown.male', 30);
    await engineSetValue(page, 'demographics.sexBreakdown.female', 20);
    await waitForEngineValue(page, 'demographics.sexBreakdown.sexTotal', 50);

    const report = await getValidationReport(page, 'submit');
    const shapeError = report.results.filter(
      (r: any) =>
        r.id === 'sexBreakdownMatchesTotal' ||
        (r.path === 'demographics.sexBreakdown.sexTotal' && r.code === 'SHAPE_FAILED')
    );
    expect(shapeError).toHaveLength(0);
  });

  test('employmentMatchesTotal shape fires when employment status total does not match totalServedOver18', async ({ page }) => {
    // totalServedOver18 = 50, but employment total = 10 + 5 = 15 → mismatch
    await engineSetValue(page, 'demographics.totalServed', 100);
    await engineSetValue(page, 'demographics.totalServedOver18', 50);
    await engineSetValue(page, 'demographics.employmentStatus.fullTime', 10);
    await engineSetValue(page, 'demographics.employmentStatus.partTime', 5);
    await engineSetValue(page, 'demographics.employmentStatus.migrantSeasonal', 0);
    await engineSetValue(page, 'demographics.employmentStatus.unemployedShort', 0);
    await engineSetValue(page, 'demographics.employmentStatus.unemployedLong', 0);
    await engineSetValue(page, 'demographics.employmentStatus.notInLaborForce', 0);
    await engineSetValue(page, 'demographics.employmentStatus.retired', 0);
    await engineSetValue(page, 'demographics.employmentStatus.unknown', 0);
    await waitForEngineValue(page, 'demographics.employmentStatus.employmentTotal', 15);

    const report = await getValidationReport(page, 'submit');
    const shapeError = report.results.filter(
      (r: any) =>
        r.id === 'employmentMatchesTotal' ||
        (r.path === 'demographics.employmentStatus.employmentTotal' && r.code === 'SHAPE_FAILED')
    );
    expect(shapeError.length).toBeGreaterThan(0);
    expect(shapeError[0].message).toContain('Employment status total must equal total individuals served over 18');
  });

  test('employmentMatchesTotal shape passes when totals match', async ({ page }) => {
    await engineSetValue(page, 'demographics.totalServed', 100);
    await engineSetValue(page, 'demographics.totalServedOver18', 15);
    await engineSetValue(page, 'demographics.employmentStatus.fullTime', 10);
    await engineSetValue(page, 'demographics.employmentStatus.partTime', 5);
    await engineSetValue(page, 'demographics.employmentStatus.migrantSeasonal', 0);
    await engineSetValue(page, 'demographics.employmentStatus.unemployedShort', 0);
    await engineSetValue(page, 'demographics.employmentStatus.unemployedLong', 0);
    await engineSetValue(page, 'demographics.employmentStatus.notInLaborForce', 0);
    await engineSetValue(page, 'demographics.employmentStatus.retired', 0);
    await engineSetValue(page, 'demographics.employmentStatus.unknown', 0);
    await waitForEngineValue(page, 'demographics.employmentStatus.employmentTotal', 15);

    const report = await getValidationReport(page, 'submit');
    const shapeError = report.results.filter(
      (r: any) =>
        r.id === 'employmentMatchesTotal' ||
        (r.path === 'demographics.employmentStatus.employmentTotal' && r.code === 'SHAPE_FAILED')
    );
    expect(shapeError).toHaveLength(0);
  });

  test('totalServedOver18 constraint fires when it exceeds totalServed', async ({ page }) => {
    await engineSetValue(page, 'demographics.totalServed', 50);
    await engineSetValue(page, 'demographics.totalServedOver18', 100);
    await waitForValidationMatch(
      page,
      { path: 'demographics.totalServedOver18', code: 'CONSTRAINT_FAILED' },
      'continuous'
    );

    const report = await getValidationReport(page, 'continuous');
    const constraintError = report.results.filter(
      (r: any) => r.path === 'demographics.totalServedOver18' && r.code === 'CONSTRAINT_FAILED'
    );
    expect(constraintError.length).toBeGreaterThan(0);
    expect(constraintError[0].message).toContain('Cannot exceed total individuals served');
  });
});

// ---------------------------------------------------------------------------
// Expenditure total auto-calculation
// ---------------------------------------------------------------------------

test.describe('Tribal Long: Expenditure Total Calculation', () => {
  test.beforeEach(async ({ page }) => {
    await mountTribalLong(page);
  });

  test('total expenditures auto-calculates from selected topics', async ({ page }) => {
    await engineSetValue(page, 'expenditures.applicableTopics', ['employment', 'housing']);
    await waitForRelevant(page, 'expenditures.employment', true);
    await waitForRelevant(page, 'expenditures.housing', true);
    await engineSetValue(page, 'expenditures.employment', 45000);
    await engineSetValue(page, 'expenditures.housing', 32000);
    await waitForEngineValue(page, 'expenditures.total', { amount: 77000, currency: 'USD' });

    const total = await engineValue(page, 'expenditures.total');
    // The calculate expression uses moneySum, which returns a money object {amount, currency}
    // when any operand is already a money object (default bind applies { amount: "0", currency: "USD" }).
    // Normalise: accept either a plain number or a money object.
    const totalAmount =
      total !== null && typeof total === 'object' && 'amount' in total
        ? Number(total.amount)
        : Number(total);
    expect(totalAmount).toBe(77000);
  });

  test('adding new topics after interaction does not trigger TYPE_MISMATCH on expenditure fields', async ({ page }) => {
    // Step 1: Select one topic and set its value
    await engineSetValue(page, 'expenditures.applicableTopics', ['employment']);
    await waitForRelevant(page, 'expenditures.employment', true);
    await engineSetValue(page, 'expenditures.employment', 45000);
    await waitForEngineValue(page, 'expenditures.employment', { amount: 45000, currency: 'USD' });

    // Step 2: Add a second topic (housing becomes relevant, gets default)
    await engineSetValue(page, 'expenditures.applicableTopics', ['employment', 'housing']);
    await waitForRelevant(page, 'expenditures.housing', true);

    // The validation report should have NO TYPE_MISMATCH errors on any expenditure field
    const report = await getValidationReport(page, 'continuous');
    const typeMismatches = report.results.filter(
      (r: any) => r.code === 'TYPE_MISMATCH' && r.path?.startsWith('expenditures.')
    );
    expect(typeMismatches).toHaveLength(0);
  });

  test('money field defaults produce valid money objects (numeric amount)', async ({ page }) => {
    // Selecting a topic makes its expenditure field relevant with default { amount: "0", currency: "USD" }
    // The default amount is a string "0" — the engine should coerce it to numeric 0
    await engineSetValue(page, 'expenditures.applicableTopics', ['employment']);
    await waitForRelevant(page, 'expenditures.employment', true);

    const val = await engineValue(page, 'expenditures.employment');
    // The amount must be a number (not string "0") for validateDataType to pass
    if (val && typeof val === 'object' && 'amount' in val) {
      expect(typeof val.amount).toBe('number');
    }

    // No TYPE_MISMATCH on the field
    const report = await getValidationReport(page, 'continuous');
    const typeMismatches = report.results.filter(
      (r: any) => r.code === 'TYPE_MISMATCH' && r.path === 'expenditures.employment'
    );
    expect(typeMismatches).toHaveLength(0);
  });
});
