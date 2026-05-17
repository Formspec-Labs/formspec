import { test, expect } from '@playwright/test';
import {
  mountClinicalIntake,
  mountClinicalIntakeWithScreener,
  completeScreener,
  goToPage,
  engineValue,
  engineVariable,
  engineSetValue,
  addRepeatInstance,
  getValidationReport,
  getResponse,
} from './helpers/clinical-intake';

// ── Screener ──────────────────────────────────────────────────────────────────

test.describe('Clinical Intake: Screener', () => {
  test('renders screener panel and hides wizard before completion', async ({ page }) => {
    await mountClinicalIntakeWithScreener(page);

    const screener = page.locator('.formspec-screener');
    await expect(screener).toBeVisible();

    // Main wizard must not exist until screener is completed
    const wizard = page.locator('.formspec-wizard');
    await expect(wizard).toHaveCount(0);
  });

  test('renders both screener fields: chief complaint (select) and pain level (number)', async ({ page }) => {
    await mountClinicalIntakeWithScreener(page);

    const complaintSelect = page.locator('[data-name="sChiefComplaint"] select');
    await expect(complaintSelect).toBeVisible();

    const painInput = page.locator('[data-name="sPainLevel"] input[type="number"]');
    await expect(painInput).toBeVisible();
  });

  test('renders Continue button', async ({ page }) => {
    await mountClinicalIntakeWithScreener(page);

    const btn = page.locator('.formspec-screener-continue');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Continue');
  });

  // ── Screener Validation ─────────────────────────────────────────────────

  test('clicking Continue with no answers stays on screener and shows errors', async ({ page }) => {
    await mountClinicalIntakeWithScreener(page);

    await page.locator('.formspec-screener-continue').click();
    await page.waitForTimeout(200);

    // Should still be on the screener — not routed anywhere
    const screener = page.locator('.formspec-screener-fields');
    await expect(screener).toBeVisible();

    // Should show error styling on unfilled fields
    const errors = page.locator('.formspec-screener-field .formspec-error');
    const errorCount = await errors.count();
    expect(errorCount).toBeGreaterThan(0);
  });

  test('clicking Continue with one field filled proceeds (partial answers allowed)', async ({ page }) => {
    await mountClinicalIntakeWithScreener(page);

    const routePromise = page.evaluate(() =>
      new Promise<any>((resolve) => {
        document.querySelector('formspec-render')!.addEventListener(
          'formspec-screener-route',
          (e: any) => resolve(e.detail),
          { once: true }
        );
      })
    );

    // Fill only the chief complaint, leave pain level empty
    await page.locator('[data-name="sChiefComplaint"] select').selectOption('preventive');
    await page.locator('.formspec-screener-continue').click();

    // Should route successfully — partial answers are fine
    const detail = await routePromise;
    expect(detail.route).not.toBeNull();
  });

  test('emergency route: selecting "emergency" routes to emergency intake', async ({ page }) => {
    await mountClinicalIntakeWithScreener(page);

    const routePromise = page.evaluate(() =>
      new Promise<any>((resolve) => {
        document.querySelector('formspec-render')!.addEventListener(
          'formspec-screener-route',
          (e: any) => resolve(e.detail),
          { once: true }
        );
      })
    );

    await page.locator('[data-name="sChiefComplaint"] select').selectOption('emergency');
    await page.locator('[data-name="sPainLevel"] input[type="number"]').fill('3');
    await page.locator('.formspec-screener-continue').click();

    const detail = await routePromise;
    expect(detail.route.target).toBe('https://formspec.org/examples/emergency-intake');
    expect(detail.route.label).toBe('Route to Emergency Intake');
  });

  test('emergency route: pain level >= 8 routes to emergency intake regardless of complaint', async ({ page }) => {
    await mountClinicalIntakeWithScreener(page);

    const routePromise = page.evaluate(() =>
      new Promise<any>((resolve) => {
        document.querySelector('formspec-render')!.addEventListener(
          'formspec-screener-route',
          (e: any) => resolve(e.detail),
          { once: true }
        );
      })
    );

    await page.locator('[data-name="sChiefComplaint"] select').selectOption('preventive');
    await page.locator('[data-name="sPainLevel"] input[type="number"]').fill('9');
    await page.locator('.formspec-screener-continue').click();

    const detail = await routePromise;
    expect(detail.route.target).toBe('https://formspec.org/examples/emergency-intake');
  });

  test('urgent route: acute complaint + pain >= 5 routes to urgent care intake', async ({ page }) => {
    await mountClinicalIntakeWithScreener(page);

    const routePromise = page.evaluate(() =>
      new Promise<any>((resolve) => {
        document.querySelector('formspec-render')!.addEventListener(
          'formspec-screener-route',
          (e: any) => resolve(e.detail),
          { once: true }
        );
      })
    );

    await page.locator('[data-name="sChiefComplaint"] select').selectOption('acute');
    await page.locator('[data-name="sPainLevel"] input[type="number"]').fill('6');
    await page.locator('.formspec-screener-continue').click();

    const detail = await routePromise;
    expect(detail.route.target).toBe('https://formspec.org/examples/urgent-intake');
    expect(detail.route.label).toBe('Route to Urgent Care Intake');
  });

  test('standard route: preventive care + low pain routes to standard clinical intake and shows wizard', async ({ page }) => {
    await mountClinicalIntakeWithScreener(page);

    const routePromise = page.evaluate(() =>
      new Promise<any>((resolve) => {
        document.querySelector('formspec-render')!.addEventListener(
          'formspec-screener-route',
          (e: any) => resolve(e.detail),
          { once: true }
        );
      })
    );

    await completeScreener(page, 'preventive', 2);

    const detail = await routePromise;
    expect(detail.route.target).toBe('https://formspec.org/examples/clinical-intake');
    expect(detail.route.label).toBe('Continue to Standard Intake');

    // Since route target matches definition URL, main wizard should appear
    const wizard = page.locator('.formspec-wizard');
    await expect(wizard).toBeVisible();

    // Screener should be gone
    const screener = page.locator('.formspec-screener');
    await expect(screener).toHaveCount(0);
  });

  test('screener answers are included in the route event detail', async ({ page }) => {
    await mountClinicalIntakeWithScreener(page);

    const routePromise = page.evaluate(() =>
      new Promise<any>((resolve) => {
        document.querySelector('formspec-render')!.addEventListener(
          'formspec-screener-route',
          (e: any) => resolve(e.detail),
          { once: true }
        );
      })
    );

    await page.locator('[data-name="sChiefComplaint"] select').selectOption('chronic');
    await page.locator('[data-name="sPainLevel"] input[type="number"]').fill('4');
    await page.locator('.formspec-screener-continue').click();

    const detail = await routePromise;
    expect(detail.answers.sChiefComplaint).toBe('chronic');
    expect(detail.answers.sPainLevel).toBe(4);
  });

  test('skipScreener bypasses screener and shows wizard directly', async ({ page }) => {
    await mountClinicalIntake(page);

    const wizard = page.locator('.formspec-wizard');
    await expect(wizard).toBeVisible();

    const screener = page.locator('.formspec-screener');
    await expect(screener).toHaveCount(0);
  });

  // ── External Route UX ───────────────────────────────────────────────────
  // When a screener selects an external route, the user should see feedback
  // instead of a dead-end where clicking Continue does nothing visible.

  test('external route: screener panel is replaced with route result after Continue', async ({ page }) => {
    await mountClinicalIntakeWithScreener(page);

    await page.locator('[data-name="sChiefComplaint"] select').selectOption('emergency');
    await page.locator('[data-name="sPainLevel"] input[type="number"]').fill('3');
    await page.locator('.formspec-screener-continue').click();
    await page.waitForTimeout(200);

    // Screener fields should no longer be visible
    const screenerFields = page.locator('.formspec-screener-fields');
    await expect(screenerFields).toHaveCount(0);

    // A route result panel should be visible
    const routeResult = page.locator('.formspec-screener-routed');
    await expect(routeResult).toBeVisible();
  });

  test('external route: route result displays the route label', async ({ page }) => {
    await mountClinicalIntakeWithScreener(page);

    await page.locator('[data-name="sChiefComplaint"] select').selectOption('emergency');
    await page.locator('[data-name="sPainLevel"] input[type="number"]').fill('3');
    await page.locator('.formspec-screener-continue').click();
    await page.waitForTimeout(200);

    const routeResult = page.locator('.formspec-screener-routed');
    await expect(routeResult).toContainText('Route to Emergency Intake');
  });

  test('external route: route result has a back button to restart screener', async ({ page }) => {
    await mountClinicalIntakeWithScreener(page);

    await page.locator('[data-name="sChiefComplaint"] select').selectOption('emergency');
    await page.locator('[data-name="sPainLevel"] input[type="number"]').fill('3');
    await page.locator('.formspec-screener-continue').click();
    await page.waitForTimeout(200);

    const backBtn = page.locator('.formspec-screener-routed button');
    await expect(backBtn).toBeVisible();

    // Clicking back should return to the screener
    await backBtn.click();
    await page.waitForTimeout(200);

    const screenerFields = page.locator('.formspec-screener-fields');
    await expect(screenerFields).toBeVisible();
  });
});

// ── Instance Pre-population ───────────────────────────────────────────────────

test.describe('Clinical Intake: Instance Pre-population', () => {
  test.beforeEach(async ({ page }) => {
    await mountClinicalIntake(page);
  });

  test('patient first name is pre-populated from instance data', async ({ page }) => {
    const value = await engineValue(page, 'patient.firstName');
    expect(value).toBe('Jamie');
  });

  test('patient last name is pre-populated from instance data', async ({ page }) => {
    const value = await engineValue(page, 'patient.lastName');
    expect(value).toBe('Rivera');
  });

  test('patient date of birth is pre-populated from instance data', async ({ page }) => {
    const value = await engineValue(page, 'patient.dob');
    expect(value).toBe('1980-05-14');
  });

  test('patient sex is pre-populated from instance data', async ({ page }) => {
    const value = await engineValue(page, 'patient.sex');
    expect(value).toBe('female');
  });

  test('patient phone is pre-populated from instance data', async ({ page }) => {
    const value = await engineValue(page, 'patient.phone');
    expect(value).toBe('(202) 555-0199');
  });

  test('patient email is pre-populated from instance data', async ({ page }) => {
    const value = await engineValue(page, 'patient.email');
    expect(value).toBe('jamie.rivera@example.test');
  });

  test('patient insurance member ID is pre-populated from instance data', async ({ page }) => {
    const value = await engineValue(page, 'patient.insuranceMemberId');
    expect(value).toBe('ABC1234567');
  });

  test('pre-populated first name input shows the pre-filled value', async ({ page }) => {
    const input = page.locator('input[name="patient.firstName"]');
    await expect(input).toHaveValue('Jamie');
  });

  test('pre-populated last name input shows the pre-filled value', async ({ page }) => {
    const input = page.locator('input[name="patient.lastName"]');
    await expect(input).toHaveValue('Rivera');
  });

  test('pre-populated phone input shows the pre-filled value', async ({ page }) => {
    const input = page.locator('input[name="patient.phone"]');
    await expect(input).toHaveValue('(202) 555-0199');
  });

  test('pre-populated email input shows the pre-filled value', async ({ page }) => {
    const input = page.locator('input[name="patient.email"]');
    await expect(input).toHaveValue('jamie.rivera@example.test');
  });
});

// ── Instance Source Fetching ─────────────────────────────────────────────────

test.describe('Clinical Intake: Instance Source Fetching', () => {
  test('patient and drugDatabase instance sources load without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await mountClinicalIntake(page);

    // Wait for instance source fetches to settle
    await page.evaluate(async () => {
      const el: any = document.querySelector('formspec-render');
      await el.engine.waitForInstanceSources();
    });

    const instanceErrors = consoleErrors.filter(t => t.includes('instance source'));
    expect(instanceErrors).toEqual([]);
  });

  test('fetched patient instance data is accessible via getInstanceData', async ({ page }) => {
    await mountClinicalIntake(page);

    await page.evaluate(async () => {
      const el: any = document.querySelector('formspec-render');
      await el.engine.waitForInstanceSources();
    });

    const patientData = await page.evaluate(() => {
      const el: any = document.querySelector('formspec-render');
      return el.engine.getInstanceData('patient');
    });

    expect(patientData).toBeTruthy();
    expect(patientData.firstName).toBe('Jamie');
    expect(patientData.lastName).toBe('Rivera');
    expect(patientData.insuranceMemberId).toBe('ABC1234567');
  });

  test('fetched drugDatabase instance data is accessible via getInstanceData', async ({ page }) => {
    await mountClinicalIntake(page);

    await page.evaluate(async () => {
      const el: any = document.querySelector('formspec-render');
      await el.engine.waitForInstanceSources();
    });

    const drugs = await page.evaluate(() => {
      const el: any = document.querySelector('formspec-render');
      return el.engine.getInstanceData('drugDatabase');
    });

    expect(Array.isArray(drugs)).toBe(true);
    expect(drugs.length).toBe(5);
    expect(drugs[0].name).toBe('Lisinopril');
  });
});

// ── Read-only Fields ──────────────────────────────────────────────────────────

test.describe('Clinical Intake: Read-only Pre-populated Fields', () => {
  test.beforeEach(async ({ page }) => {
    await mountClinicalIntake(page);
  });

  test('firstName field is readonly (editable: false)', async ({ page }) => {
    const input = page.locator('input[name="patient.firstName"]');
    await expect(input).toHaveAttribute('readonly', '');
  });

  test('lastName field is readonly (editable: false)', async ({ page }) => {
    const input = page.locator('input[name="patient.lastName"]');
    await expect(input).toHaveAttribute('readonly', '');
  });

  test('insuranceMemberId field is readonly (editable: false)', async ({ page }) => {
    const input = page.locator('input[name="patient.insuranceMemberId"]');
    await expect(input).toHaveAttribute('readonly', '');
  });

  test('phone field is editable (editable: true)', async ({ page }) => {
    // phone has editable: true so it should NOT have readonly attribute
    const input = page.locator('input[name="patient.phone"]');
    await expect(input).not.toHaveAttribute('readonly', '');
  });

  test('email field is editable (editable: true)', async ({ page }) => {
    // email has editable: true so it should NOT have readonly attribute
    const input = page.locator('input[name="patient.email"]');
    await expect(input).not.toHaveAttribute('readonly', '');
  });

  test('firstName field wrapper has readonly styling class', async ({ page }) => {
    const field = page.locator('.formspec-field[data-name="patient.firstName"]');
    await expect(field).toHaveClass(/formspec-field--readonly/);
  });

  test('lastName field wrapper has readonly styling class', async ({ page }) => {
    const field = page.locator('.formspec-field[data-name="patient.lastName"]');
    await expect(field).toHaveClass(/formspec-field--readonly/);
  });
});

// ── Wizard Navigation ─────────────────────────────────────────────────────────

test.describe('Clinical Intake: Wizard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mountClinicalIntake(page);
  });

  test('first page is "Patient Information"', async ({ page }) => {
    const heading = await page
      .locator('.formspec-wizard-panel:not(.formspec-hidden) h2')
      .first()
      .textContent();
    expect(heading?.trim()).toBe('Patient Information');
  });

  test('can navigate to "Current Visit" page via Next', async ({ page }) => {
    await goToPage(page, 'Current Visit');
    const heading = await page
      .locator('.formspec-wizard-panel:not(.formspec-hidden) h2')
      .first()
      .textContent();
    expect(heading?.trim()).toBe('Current Visit');
  });

  test('can navigate to "Medical History" page', async ({ page }) => {
    await goToPage(page, 'Medical History');
    const heading = await page
      .locator('.formspec-wizard-panel:not(.formspec-hidden) h2')
      .first()
      .textContent();
    expect(heading?.trim()).toBe('Medical History');
  });

  test('can navigate to "Summary" page', async ({ page }) => {
    await goToPage(page, 'Summary');
    const heading = await page
      .locator('.formspec-wizard-panel:not(.formspec-hidden) h2')
      .first()
      .textContent();
    expect(heading?.trim()).toBe('Summary');
  });

  test('can traverse all four wizard pages in sequence', async ({ page }) => {
    const expectedPages = ['Patient Information', 'Current Visit', 'Medical History', 'Summary'];

    for (const title of expectedPages) {
      await goToPage(page, title);
      const heading = await page
        .locator('.formspec-wizard-panel:not(.formspec-hidden) h2')
        .first()
        .textContent();
      expect(heading?.trim()).toBe(title);
    }
  });

  test('Previous button navigates back from Current Visit to Patient Information', async ({ page }) => {
    await goToPage(page, 'Current Visit');

    await page.locator('button.formspec-wizard-prev').first().click();
    await page.waitForTimeout(150);

    const heading = await page
      .locator('.formspec-wizard-panel:not(.formspec-hidden) h2')
      .first()
      .textContent();
    expect(heading?.trim()).toBe('Patient Information');
  });

  test('Patient Information page renders demographic fields', async ({ page }) => {
    await expect(page.locator('[data-name="patient.firstName"]')).toBeVisible();
    await expect(page.locator('[data-name="patient.lastName"]')).toBeVisible();
    await expect(page.locator('[data-name="patient.dob"]')).toBeVisible();
    await expect(page.locator('[data-name="patient.age"]')).toBeVisible();
  });

  test('Current Visit page renders symptom and onset fields', async ({ page }) => {
    await goToPage(page, 'Current Visit');
    await expect(page.locator('[data-name="currentVisit.symptoms"]')).toBeVisible();
    await expect(page.locator('[data-name="currentVisit.onsetDate"]')).toBeVisible();
  });

  test('Medical History page renders allergies toggle', async ({ page }) => {
    await goToPage(page, 'Medical History');
    await expect(page.locator('[data-name="medicalHistory.hasAllergies"]')).toBeVisible();
  });

  test('Summary page renders assessment fields and Submit button', async ({ page }) => {
    await goToPage(page, 'Summary');
    await expect(page.locator('[data-name="assessment.totalConditions"]')).toBeVisible();
    await expect(page.locator('[data-name="assessment.maskedInsuranceId"]')).toBeVisible();
    // Submit button is rendered with class 'formspec-submit'
    const submitBtn = page.locator('button.formspec-submit').first();
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toContainText('Submit Intake');
  });
});

// ── Computed Fields ───────────────────────────────────────────────────────────

test.describe('Clinical Intake: Computed Fields', () => {
  test.beforeEach(async ({ page }) => {
    await mountClinicalIntake(page);
  });

  test('patientAgeYears variable is computed from pre-populated DOB', async ({ page }) => {
    // DOB is 1980-05-14; today is 2026-03-09 so age should be 45
    const age = await engineVariable(page, 'patientAgeYears');
    expect(typeof age).toBe('number');
    expect(age).toBeGreaterThanOrEqual(45);
    expect(age).toBeLessThan(120);
  });

  test('patient.age field is calculated from patientAgeYears variable', async ({ page }) => {
    const age = await engineValue(page, 'patient.age');
    expect(typeof age).toBe('number');
    expect(age).toBeGreaterThanOrEqual(45);
    expect(age).toBeLessThan(120);
  });

  test('patient.age field is rendered as readonly (calculated)', async ({ page }) => {
    const input = page.locator('input[name="patient.age"]');
    // The age field is calculated and bound readonly:true
    await expect(input).toHaveAttribute('readonly', '');
  });

  test('maskedInsuranceId is computed from insuranceMemberId using let...in', async ({ page }) => {
    // insuranceMemberId is "ABC1234567" (10 chars)
    // Expression: let id = string($patient.insuranceMemberId) in
    //   if empty(id) then null
    //   else if length(id) <= 4 then id
    //   else ('****' & substring(id, length(id) - 3, 4))
    // length("ABC1234567") = 10, so:
    //   substring("ABC1234567", 7, 4) — FEL substring is 1-indexed
    //   chars 7,8,9,10 = "4567"
    //   result = "****4567"
    const masked = await engineValue(page, 'assessment.maskedInsuranceId');
    expect(masked).toBe('****4567');
  });

  test('maskedInsuranceId field is visible on Summary page with correct value', async ({ page }) => {
    await goToPage(page, 'Summary');
    const input = page.locator('input[name="assessment.maskedInsuranceId"]');
    await expect(input).toHaveValue('****4567');
  });

  test('assessment.totalConditions is zero when no conditions are added', async ({ page }) => {
    const total = await engineValue(page, 'assessment.totalConditions');
    // With no repeat instances, count() returns null or 0
    expect(total == null || total === 0).toBe(true);
  });

  test('assessment.totalConditions increments when a condition repeat instance is added', async ({ page }) => {
    await addRepeatInstance(page, 'medicalHistory.conditions');
    await engineSetValue(page, 'medicalHistory.conditions[0].conditionName', 'Hypertension');
    await page.waitForTimeout(100);

    const total = await engineValue(page, 'assessment.totalConditions');
    expect(total).toBe(1);
  });

  test('assessment.totalConditions reflects multiple conditions', async ({ page }) => {
    await addRepeatInstance(page, 'medicalHistory.conditions');
    await addRepeatInstance(page, 'medicalHistory.conditions');
    await engineSetValue(page, 'medicalHistory.conditions[0].conditionName', 'Hypertension');
    await engineSetValue(page, 'medicalHistory.conditions[1].conditionName', 'Diabetes');
    await page.waitForTimeout(100);

    const total = await engineValue(page, 'assessment.totalConditions');
    expect(total).toBe(2);
  });

  test('assessment.symptomDuration computes days since onset date', async ({ page }) => {
    // Set onset date to 5 days ago: 2026-03-04
    await engineSetValue(page, 'currentVisit.onsetDate', '2026-03-04');
    await page.waitForTimeout(100);

    const duration = await engineValue(page, 'assessment.symptomDuration');
    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThanOrEqual(5);
  });

  test('assessment.symptomDuration is null when no onset date is set', async ({ page }) => {
    const duration = await engineValue(page, 'assessment.symptomDuration');
    expect(duration).toBeNull();
  });

  test('assessment.severeConditionCount counts conditions with severe or critical severity', async ({ page }) => {
    await addRepeatInstance(page, 'medicalHistory.conditions');
    await addRepeatInstance(page, 'medicalHistory.conditions');
    await engineSetValue(page, 'medicalHistory.conditions[0].conditionName', 'Condition A');
    await engineSetValue(page, 'medicalHistory.conditions[0].severity', 'severe');
    await engineSetValue(page, 'medicalHistory.conditions[1].conditionName', 'Condition B');
    await engineSetValue(page, 'medicalHistory.conditions[1].severity', 'mild');
    await page.waitForTimeout(100);

    const severeCount = await engineValue(page, 'assessment.severeConditionCount');
    expect(severeCount).toBe(1);
  });

  test('assessment.totalMedications sums condMedCount across all conditions', async ({ page }) => {
    // Add two conditions with nested medications
    await addRepeatInstance(page, 'medicalHistory.conditions');
    await addRepeatInstance(page, 'medicalHistory.conditions');

    // Add 2 medications to condition[0]
    await addRepeatInstance(page, 'medicalHistory.conditions[0].medications');
    await addRepeatInstance(page, 'medicalHistory.conditions[0].medications');
    await engineSetValue(page, 'medicalHistory.conditions[0].medications[0].medDrugName', 'Lisinopril');
    await engineSetValue(page, 'medicalHistory.conditions[0].medications[1].medDrugName', 'Metformin');

    // Add 1 medication to condition[1]
    await addRepeatInstance(page, 'medicalHistory.conditions[1].medications');
    await engineSetValue(page, 'medicalHistory.conditions[1].medications[0].medDrugName', 'Atorvastatin');

    await page.waitForTimeout(150);

    // condMedCount is calculated as count of medication names per condition
    const cond0MedCount = await engineValue(page, 'medicalHistory.conditions[0].condMedCount');
    const cond1MedCount = await engineValue(page, 'medicalHistory.conditions[1].condMedCount');
    expect(cond0MedCount).toBe(2);
    expect(cond1MedCount).toBe(1);

    const totalMeds = await engineValue(page, 'assessment.totalMedications');
    expect(totalMeds).toBe(3);
  });
});

// ── Conditional Visibility ────────────────────────────────────────────────────

test.describe('Clinical Intake: Conditional Field Visibility', () => {
  test.beforeEach(async ({ page }) => {
    await mountClinicalIntake(page);
    await goToPage(page, 'Current Visit');
  });

  test('"other symptoms" text area is hidden when "other" is not selected in symptoms', async ({ page }) => {
    // With no symptoms selected, otherSymptoms should not be relevant/visible
    const field = page.locator('[data-name="currentVisit.otherSymptoms"]');
    // Either hidden via CSS or not rendered
    const visible = await field.isVisible().catch(() => false);
    expect(visible).toBe(false);
  });

  test('"other symptoms" text area appears when "other" symptom is selected', async ({ page }) => {
    await engineSetValue(page, 'currentVisit.symptoms', ['other']);
    await page.waitForTimeout(100);

    const field = page.locator('[data-name="currentVisit.otherSymptoms"]');
    await expect(field).toBeVisible();
  });

  test('"other symptoms" hides again when "other" is deselected', async ({ page }) => {
    await engineSetValue(page, 'currentVisit.symptoms', ['other']);
    await page.waitForTimeout(100);
    await expect(page.locator('[data-name="currentVisit.otherSymptoms"]')).toBeVisible();

    await engineSetValue(page, 'currentVisit.symptoms', ['fever']);
    await page.waitForTimeout(100);

    const field = page.locator('[data-name="currentVisit.otherSymptoms"]');
    const visible = await field.isVisible().catch(() => false);
    expect(visible).toBe(false);
  });
});

test.describe('Clinical Intake: Allergy Relevance', () => {
  test.beforeEach(async ({ page }) => {
    await mountClinicalIntake(page);
    await goToPage(page, 'Medical History');
  });

  test('allergies text field is hidden when hasAllergies is false', async ({ page }) => {
    await engineSetValue(page, 'medicalHistory.hasAllergies', false);
    await page.waitForTimeout(100);

    const field = page.locator('[data-name="medicalHistory.allergies"]');
    const visible = await field.isVisible().catch(() => false);
    expect(visible).toBe(false);
  });

  test('allergies text field appears when hasAllergies is true', async ({ page }) => {
    await engineSetValue(page, 'medicalHistory.hasAllergies', true);
    await page.waitForTimeout(100);

    const field = page.locator('[data-name="medicalHistory.allergies"]');
    await expect(field).toBeVisible();
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

test.describe('Clinical Intake: Validation', () => {
  test.beforeEach(async ({ page }) => {
    await mountClinicalIntake(page);
  });

  test('submit-mode validation reports required errors for empty required fields', async ({ page }) => {
    // The pre-populated firstName and lastName satisfy their required rules,
    // but currentVisit.symptoms and currentVisit.onsetDate are required and empty.
    const report = await getValidationReport(page, 'submit');

    const required = report.results.filter(
      (r: any) => r.code === 'REQUIRED' || r.kind === 'required'
    );
    expect(required.length).toBeGreaterThan(0);

    const symptomsError = report.results.find(
      (r: any) => r.path === 'currentVisit.symptoms' && (r.code === 'REQUIRED' || r.kind === 'required')
    );
    expect(symptomsError).toBeDefined();

    const onsetError = report.results.find(
      (r: any) => r.path === 'currentVisit.onsetDate' && (r.code === 'REQUIRED' || r.kind === 'required')
    );
    expect(onsetError).toBeDefined();
  });

  test('no required error for firstName when pre-populated', async ({ page }) => {
    const report = await getValidationReport(page, 'submit');
    const firstNameErrors = report.results.filter(
      (r: any) => r.path === 'patient.firstName' && (r.code === 'REQUIRED' || r.kind === 'required')
    );
    expect(firstNameErrors).toHaveLength(0);
  });

  test('no required error for lastName when pre-populated', async ({ page }) => {
    const report = await getValidationReport(page, 'submit');
    const lastNameErrors = report.results.filter(
      (r: any) => r.path === 'patient.lastName' && (r.code === 'REQUIRED' || r.kind === 'required')
    );
    expect(lastNameErrors).toHaveLength(0);
  });

  test('pre-populated phone value passes phone constraint', async ({ page }) => {
    // Phone: "(202) 555-0199" should match ^[(][2-9][0-9]{2}[)] [2-9][0-9]{2}-[0-9]{4}$
    const report = await getValidationReport(page, 'continuous');
    const phoneConstraintErrors = report.results.filter(
      (r: any) => r.path === 'patient.phone' && (r.code === 'CONSTRAINT_FAILED' || r.kind === 'constraint')
    );
    expect(phoneConstraintErrors).toHaveLength(0);
  });

  test('pre-populated email value passes email constraint', async ({ page }) => {
    // Email: "jamie.rivera@example.test" should match the email constraint regex
    const report = await getValidationReport(page, 'continuous');
    const emailConstraintErrors = report.results.filter(
      (r: any) => r.path === 'patient.email' && (r.code === 'CONSTRAINT_FAILED' || r.kind === 'constraint')
    );
    expect(emailConstraintErrors).toHaveLength(0);
  });

  test('invalid email value triggers constraint error', async ({ page }) => {
    await engineSetValue(page, 'patient.email', 'notanemail');
    await page.waitForTimeout(100);

    const report = await getValidationReport(page);
    const emailErrors = report.results.filter(
      (r: any) => r.path === 'patient.email' && (r.code === 'CONSTRAINT_FAILED' || r.kind === 'constraint' || r.code === 'PATTERN_MISMATCH')
    );
    expect(emailErrors.length).toBeGreaterThan(0);
  });

  test('invalid phone value triggers constraint error', async ({ page }) => {
    await engineSetValue(page, 'patient.phone', '555-1234');
    await page.waitForTimeout(100);

    const report = await getValidationReport(page);
    const phoneErrors = report.results.filter(
      (r: any) => r.path === 'patient.phone' && (r.code === 'CONSTRAINT_FAILED' || r.kind === 'constraint' || r.code === 'PATTERN_MISMATCH')
    );
    expect(phoneErrors.length).toBeGreaterThan(0);
  });

  test('onset date in the future triggers constraint error', async ({ page }) => {
    await engineSetValue(page, 'currentVisit.onsetDate', '2099-01-01');
    await page.waitForTimeout(100);

    const report = await getValidationReport(page, 'continuous');
    const futureErrors = report.results.filter(
      (r: any) => r.path === 'currentVisit.onsetDate' && (r.code === 'CONSTRAINT_FAILED' || r.kind === 'constraint')
    );
    expect(futureErrors.length).toBeGreaterThan(0);
  });

  test('allergy detail shape rule fires on submit when hasAllergies is true but allergies is empty', async ({ page }) => {
    await engineSetValue(page, 'medicalHistory.hasAllergies', true);
    // Leave medicalHistory.allergies empty
    await page.waitForTimeout(100);

    const report = await getValidationReport(page, 'submit');
    const allergyShapeError = report.results.find(
      (r: any) => r.code === 'ALLERGY_DETAIL_REQUIRED' || r.id === 'allergyDetailRequired'
    );
    expect(allergyShapeError).toBeDefined();
  });

  test('allergyDetailRequired shape rule does not fire when hasAllergies is false', async ({ page }) => {
    await engineSetValue(page, 'medicalHistory.hasAllergies', false);
    await page.waitForTimeout(100);

    const report = await getValidationReport(page, 'submit');
    const allergyShapeError = report.results.find(
      (r: any) => r.code === 'ALLERGY_DETAIL_REQUIRED' || r.id === 'allergyDetailRequired'
    );
    expect(allergyShapeError).toBeUndefined();
  });

  test('ValidationSummary becomes populated after Submit is clicked with errors', async ({ page }) => {
    // Navigate to Summary without filling required fields
    await goToPage(page, 'Summary');
    await page.waitForTimeout(200);

    // The ValidationSummary with source:'live' starts hidden until a submit attempt.
    // Click Submit to trigger the latestSubmitDetailSignal, which populates the summary.
    // NOTE: clicking Submit also navigates the wizard to the page with the first error,
    // so we check the summary's visible class via JS rather than Playwright's visibility.
    await page.locator('button.formspec-submit').first().click();
    await page.waitForTimeout(300);

    // Verify the ValidationSummary element received the visible class and contains error text
    const summaryInfo = await page.evaluate(() => {
      const el = document.querySelector('.formspec-validation-summary');
      return {
        hasVisibleClass: el?.classList.contains('formspec-validation-summary--visible'),
        textContent: el?.textContent?.trim() || '',
        childCount: el?.childElementCount ?? 0,
      };
    });

    expect(summaryInfo.hasVisibleClass).toBe(true);
    expect(summaryInfo.childCount).toBeGreaterThan(0);
    expect(summaryInfo.textContent.length).toBeGreaterThan(0);
  });
});

// ── Response Structure ────────────────────────────────────────────────────────

test.describe('Clinical Intake: Response Contract', () => {
  test.beforeEach(async ({ page }) => {
    await mountClinicalIntake(page);
  });

  test('response includes patient group with pre-populated values', async ({ page }) => {
    const response = await getResponse(page, 'continuous');
    expect(response).toHaveProperty('data');
    expect(response.data).toHaveProperty('patient');
    expect(response.data.patient.firstName).toBe('Jamie');
    expect(response.data.patient.lastName).toBe('Rivera');
    expect(response.data.patient.sex).toBe('female');
  });

  test('response includes currentVisit and medicalHistory groups', async ({ page }) => {
    const response = await getResponse(page, 'continuous');
    expect(response.data).toHaveProperty('currentVisit');
    expect(response.data).toHaveProperty('medicalHistory');
    expect(response.data).toHaveProperty('assessment');
  });

  test('response includes assessment.maskedInsuranceId with correct masked value', async ({ page }) => {
    // "ABC1234567" masked via let...in: '****' & substring(id, 7, 4) = '****4567'
    const response = await getResponse(page, 'continuous');
    expect(response.data.assessment.maskedInsuranceId).toBe('****4567');
  });

  test('response reflects added repeat conditions', async ({ page }) => {
    await addRepeatInstance(page, 'medicalHistory.conditions');
    await engineSetValue(page, 'medicalHistory.conditions[0].conditionName', 'Hypertension');
    await engineSetValue(page, 'medicalHistory.conditions[0].severity', 'mild');
    await page.waitForTimeout(100);

    const response = await getResponse(page, 'continuous');
    expect(Array.isArray(response.data.medicalHistory.conditions)).toBe(true);
    expect(response.data.medicalHistory.conditions).toHaveLength(1);
    expect(response.data.medicalHistory.conditions[0].conditionName).toBe('Hypertension');
  });
});

// ── Nested Repeats ────────────────────────────────────────────────────────────

test.describe('Clinical Intake: Nested Repeats (Conditions > Medications)', () => {
  test.beforeEach(async ({ page }) => {
    await mountClinicalIntake(page);
  });

  test('can add a condition and then add a nested medication to it', async ({ page }) => {
    await addRepeatInstance(page, 'medicalHistory.conditions');
    await engineSetValue(page, 'medicalHistory.conditions[0].conditionName', 'Hypertension');
    await page.waitForTimeout(50);

    await addRepeatInstance(page, 'medicalHistory.conditions[0].medications');
    await engineSetValue(page, 'medicalHistory.conditions[0].medications[0].medDrugName', 'Lisinopril');
    await engineSetValue(page, 'medicalHistory.conditions[0].medications[0].medDosage', '10mg');
    await page.waitForTimeout(100);

    const drugName = await engineValue(page, 'medicalHistory.conditions[0].medications[0].medDrugName');
    expect(drugName).toBe('Lisinopril');

    const dosage = await engineValue(page, 'medicalHistory.conditions[0].medications[0].medDosage');
    expect(dosage).toBe('10mg');
  });

  test('condMedCount is calculated as count of nested medication drug names', async ({ page }) => {
    await addRepeatInstance(page, 'medicalHistory.conditions');
    await addRepeatInstance(page, 'medicalHistory.conditions[0].medications');
    await addRepeatInstance(page, 'medicalHistory.conditions[0].medications');
    await engineSetValue(page, 'medicalHistory.conditions[0].medications[0].medDrugName', 'Lisinopril');
    await engineSetValue(page, 'medicalHistory.conditions[0].medications[1].medDrugName', 'Metformin');
    await page.waitForTimeout(100);

    const medCount = await engineValue(page, 'medicalHistory.conditions[0].condMedCount');
    expect(medCount).toBe(2);
  });

  test('nested medications appear in the response under conditions', async ({ page }) => {
    await addRepeatInstance(page, 'medicalHistory.conditions');
    await engineSetValue(page, 'medicalHistory.conditions[0].conditionName', 'Diabetes');
    await addRepeatInstance(page, 'medicalHistory.conditions[0].medications');
    await engineSetValue(page, 'medicalHistory.conditions[0].medications[0].medDrugName', 'Metformin');
    await page.waitForTimeout(100);

    const response = await getResponse(page, 'continuous');
    const condition = response.data.medicalHistory.conditions[0];
    expect(condition.conditionName).toBe('Diabetes');
    expect(Array.isArray(condition.medications)).toBe(true);
    expect(condition.medications[0].medDrugName).toBe('Metformin');
  });
});
