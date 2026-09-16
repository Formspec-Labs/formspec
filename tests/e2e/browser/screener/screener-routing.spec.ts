import { test, expect } from '@playwright/test';
import { loadGrantArtifacts } from '../helpers/grant-app';
import { waitForWasm } from '../helpers/harness';

/**
 * Mount the grant application WITHOUT skipping the screener.
 * This gives us the raw screener UI to interact with.
 */
async function mountWithScreener(page: any) {
  const { definition, screener, component, theme, registry } = loadGrantArtifacts();
  await page.goto('/');
  await page.waitForSelector('formspec-render', { state: 'attached' });
  await waitForWasm(page);
  await page.evaluate(({ def, scr, comp, thm, reg }: any) => {
    try {
      const el: any = document.querySelector('formspec-render');
      el.registryDocuments = reg;
      el.screenerDocument = scr;
      el.definition = def;
      el.componentDocument = comp;
      el.themeDocument = thm;
    } catch (e: any) {
      console.error('Error in mountWithScreener evaluate:', e.message, e.stack);
      throw e;
    }
  }, { def: definition, scr: screener, comp: component, thm: theme, reg: registry });
  await page.waitForTimeout(200);
}

test.describe('Screener: Rendering and Route Selection', () => {

  test('should render screener panel when screenerDocument is set', async ({ page }) => {
    await mountWithScreener(page);

    // Screener panel should be visible
    const screener = page.locator('.formspec-screener');
    await expect(screener).toBeVisible();

    // Main form wizard should NOT be visible
    const wizard = page.locator('.formspec-wizard');
    await expect(wizard).toHaveCount(0);
  });

  test('should render all 3 screener items as form fields', async ({ page }) => {
    await mountWithScreener(page);

    const fields = page.locator('.formspec-screener-field');
    await expect(fields).toHaveCount(3);

    // Check specific field labels
    await expect(page.locator('[data-name="applicantType"] label')).toContainText('What type of organization');
    await expect(page.locator('[data-name="isReturning"] label')).toContainText('Have you received this grant');
    await expect(page.locator('[data-name="requestedAmount"] label')).toContainText('Estimated award amount');
  });

  test('should render choice field as a select dropdown', async ({ page }) => {
    await mountWithScreener(page);

    const select = page.locator('[data-name="applicantType"] select');
    await expect(select).toBeVisible();

    // Should have 4 options + empty placeholder
    const options = select.locator('option');
    await expect(options).toHaveCount(5);
  });

  test('should render boolean field as checkbox', async ({ page }) => {
    await mountWithScreener(page);

    const checkbox = page.locator('[data-name="isReturning"] input[type="checkbox"]');
    await expect(checkbox).toBeVisible();
  });

  test('should render money field as number input', async ({ page }) => {
    await mountWithScreener(page);

    const input = page.locator('[data-name="requestedAmount"] input[type="number"]');
    await expect(input).toBeVisible();
  });

  test('should render field hints', async ({ page }) => {
    await mountWithScreener(page);

    const hint = page.locator('[data-name="applicantType"] .formspec-hint');
    await expect(hint).toContainText('Select the category');
  });

  test('should render Continue button', async ({ page }) => {
    await mountWithScreener(page);

    const btn = page.locator('.formspec-screener-continue');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Continue');
  });

  // ── Route Selection ────────────────────────────────────────────────

  test('for-profit route: selecting forprofit routes to for-profit application', async ({ page }) => {
    await mountWithScreener(page);

    // Listen for screener-route event
    const routePromise = page.evaluate(() => {
      return new Promise<any>((resolve) => {
        document.querySelector('formspec-render')!.addEventListener(
          'formspec-screener-route',
          (e: any) => resolve(e.detail),
          { once: true }
        );
      });
    });

    // Select for-profit + fill required amount
    await page.locator('[data-name="applicantType"] select').selectOption('forprofit');
    await page.locator('[data-name="requestedAmount"] input[type="number"]').fill('50000');
    await page.locator('.formspec-screener-continue').click();

    const detail = await routePromise;
    expect(detail.route).not.toBeNull();
    expect(detail.route.target).toBe('https://example.gov/forms/grant-application-forprofit/1.0.0');
    expect(detail.route.label).toBe('For-Profit Application');
    expect(detail.route.extensions).toEqual({ 'x-route-category': 'restricted' });
  });

  test('renewal route: returning applicant with small amount routes to simplified renewal', async ({ page }) => {
    await mountWithScreener(page);

    const routePromise = page.evaluate(() => {
      return new Promise<any>((resolve) => {
        document.querySelector('formspec-render')!.addEventListener(
          'formspec-screener-route',
          (e: any) => resolve(e.detail),
          { once: true }
        );
      });
    });

    // Select nonprofit + returning + under 250K
    await page.locator('[data-name="applicantType"] select').selectOption('nonprofit');
    await page.locator('[data-name="isReturning"] input[type="checkbox"]').check();
    await page.locator('[data-name="requestedAmount"] input[type="number"]').fill('100000');
    await page.locator('.formspec-screener-continue').click();

    const detail = await routePromise;
    expect(detail.route.target).toBe('https://example.gov/forms/grant-application-renewal-short/1.0.0');
    expect(detail.route.label).toBe('Simplified Renewal (Under $250K)');
  });

  test('standard renewal: returning applicant with large amount routes to standard renewal', async ({ page }) => {
    await mountWithScreener(page);

    const routePromise = page.evaluate(() => {
      return new Promise<any>((resolve) => {
        document.querySelector('formspec-render')!.addEventListener(
          'formspec-screener-route',
          (e: any) => resolve(e.detail),
          { once: true }
        );
      });
    });

    // Returning applicant with amount >= 250K
    await page.locator('[data-name="applicantType"] select').selectOption('nonprofit');
    await page.locator('[data-name="isReturning"] input[type="checkbox"]').check();
    await page.locator('[data-name="requestedAmount"] input[type="number"]').fill('500000');
    await page.locator('.formspec-screener-continue').click();

    const detail = await routePromise;
    expect(detail.route.target).toBe('https://example.gov/forms/grant-application-renewal/1.0.0');
    expect(detail.route.label).toBe('Standard Renewal Application');
  });

  test('default route: new applicant (catch-all) routes to new application and shows main form', async ({ page }) => {
    await mountWithScreener(page);

    const routePromise = page.evaluate(() => {
      return new Promise<any>((resolve) => {
        document.querySelector('formspec-render')!.addEventListener(
          'formspec-screener-route',
          (e: any) => resolve(e.detail),
          { once: true }
        );
      });
    });

    // Nonprofit, not returning, with required amount → falls through to catch-all (condition: "true")
    await page.locator('[data-name="applicantType"] select').selectOption('nonprofit');
    await page.locator('[data-name="requestedAmount"] input[type="number"]').fill('100000');
    await page.locator('.formspec-screener-continue').click();

    const detail = await routePromise;
    expect(detail.route.target).toBe('https://example.gov/forms/grant-application/1.0.0');
    expect(detail.route.label).toBe('New Application');

    // Since route target matches definition URL, main form should now render
    await page.waitForTimeout(200);
    const wizard = page.locator('.formspec-wizard');
    await expect(wizard).toBeVisible();

    // Screener should no longer be visible
    const screener = page.locator('.formspec-screener');
    await expect(screener).toHaveCount(0);
  });

  test('getScreenerRoute returns the selected route after screener completion', async ({ page }) => {
    await mountWithScreener(page);

    // Before screener completion, route should be null
    const routeBefore = await page.evaluate(() => {
      const el: any = document.querySelector('formspec-render');
      return el.getScreenerRoute();
    });
    expect(routeBefore).toBeNull();

    // Complete screener (fill required fields)
    await page.locator('[data-name="applicantType"] select').selectOption('nonprofit');
    await page.locator('[data-name="requestedAmount"] input[type="number"]').fill('100000');
    await page.locator('.formspec-screener-continue').click();
    await page.waitForTimeout(100);

    const routeAfter = await page.evaluate(() => {
      const el: any = document.querySelector('formspec-render');
      return el.getScreenerRoute();
    });
    expect(routeAfter).not.toBeNull();
    expect(routeAfter.target).toBe('https://example.gov/forms/grant-application/1.0.0');
  });

  test('skipScreener bypasses screener and goes straight to main form', async ({ page }) => {
    const { definition, screener: screenerDoc, component, theme, registry } = loadGrantArtifacts();
    await page.goto('/');
    await page.waitForSelector('formspec-render', { state: 'attached' });
    await waitForWasm(page);
    await page.evaluate(({ def, scr, comp, thm, reg }: any) => {
      const el: any = document.querySelector('formspec-render');
      el.registryDocuments = reg;
      el.screenerDocument = scr;
      el.definition = def;
      el.skipScreener();
      el.componentDocument = comp;
      el.themeDocument = thm;
    }, { def: definition, scr: screenerDoc, comp: component, thm: theme, reg: registry });
    await page.waitForTimeout(200);

    // Main form should be visible, no screener
    const wizard = page.locator('.formspec-wizard');
    await expect(wizard).toBeVisible();
    const screenerPanel = page.locator('.formspec-screener');
    await expect(screenerPanel).toHaveCount(0);
  });

  // ── Validation & Boolean Semantics ─────────────────────────────────

  test('nonprofit without amount: blocked because requestedAmount is required', async ({ page }) => {
    await mountWithScreener(page);

    await page.locator('[data-name="applicantType"] select').selectOption('nonprofit');
    // Leave requestedAmount empty, don't touch isReturning checkbox
    await page.locator('.formspec-screener-continue').click();
    await page.waitForTimeout(200);

    // Should stay on screener
    const screenerFields = page.locator('.formspec-screener-fields');
    await expect(screenerFields).toBeVisible();

    // requestedAmount should show a required error
    const amountError = page.locator('[data-name="requestedAmount"] .formspec-error');
    await expect(amountError).toBeVisible();

    // isReturning (checkbox) should NOT show an error — unchecked = false = valid
    const returningError = page.locator('[data-name="isReturning"] .formspec-error');
    await expect(returningError).toHaveCount(0);
  });

  test('filling a required field clears its validation error immediately', async ({ page }) => {
    await mountWithScreener(page);

    // Trigger validation with only applicantType filled
    await page.locator('[data-name="applicantType"] select').selectOption('nonprofit');
    await page.locator('.formspec-screener-continue').click();
    await page.waitForTimeout(200);

    // requestedAmount should show a required error
    const amountError = page.locator('[data-name="requestedAmount"] .formspec-error');
    await expect(amountError).toBeVisible();

    // Now fill the field — error should clear without clicking Continue again
    await page.locator('[data-name="requestedAmount"] input[type="number"]').fill('50000');
    await expect(amountError).toHaveCount(0);
  });

  test('untouched boolean checkbox is treated as false, not undefined', async ({ page }) => {
    await mountWithScreener(page);

    const routePromise = page.evaluate(() => {
      return new Promise<any>((resolve) => {
        document.querySelector('formspec-render')!.addEventListener(
          'formspec-screener-route',
          (e: any) => resolve(e.detail),
          { once: true }
        );
      });
    });

    // Fill all required fields, but don't touch the checkbox
    await page.locator('[data-name="applicantType"] select').selectOption('nonprofit');
    await page.locator('[data-name="requestedAmount"] input[type="number"]').fill('100000');
    await page.locator('.formspec-screener-continue').click();

    const detail = await routePromise;
    // isReturning should be false (not undefined/null)
    expect(detail.answers.isReturning).toBe(false);
    // With isReturning=false, should fall through to catch-all "New Application"
    expect(detail.route.label).toBe('New Application');
  });

  test('nonprofit new applicant flow: wizard renders with content on first page', async ({ page }) => {
    await mountWithScreener(page);

    // Select nonprofit, fill amount, don't check returning
    await page.locator('[data-name="applicantType"] select').selectOption('nonprofit');
    await page.locator('[data-name="requestedAmount"] input[type="number"]').fill('100000');
    await page.locator('.formspec-screener-continue').click();
    await page.waitForTimeout(500);

    // Wizard should be visible
    const wizard = page.locator('.formspec-wizard');
    await expect(wizard).toBeVisible();

    // First page heading should be visible
    const heading = page.locator('.formspec-wizard-panel:not(.formspec-hidden) .formspec-section-title').first();
    await expect(heading).toContainText('Applicant');

    // Page should have visible inputs (not empty)
    const inputs = page.locator('.formspec-wizard-panel:not(.formspec-hidden) input, .formspec-wizard-panel:not(.formspec-hidden) select, .formspec-wizard-panel:not(.formspec-hidden) textarea');
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThan(0);
  });

  test('screener answers are included in the route event detail', async ({ page }) => {
    await mountWithScreener(page);

    const routePromise = page.evaluate(() => {
      return new Promise<any>((resolve) => {
        document.querySelector('formspec-render')!.addEventListener(
          'formspec-screener-route',
          (e: any) => resolve(e.detail),
          { once: true }
        );
      });
    });

    await page.locator('[data-name="applicantType"] select').selectOption('government');
    await page.locator('[data-name="isReturning"] input[type="checkbox"]').check();
    await page.locator('[data-name="requestedAmount"] input[type="number"]').fill('75000');
    await page.locator('.formspec-screener-continue').click();

    const detail = await routePromise;
    expect(detail.answers.applicantType).toBe('government');
    expect(detail.answers.isReturning).toBe(true);
    expect(detail.answers.requestedAmount).toEqual({ amount: 75000, currency: 'USD' });
  });
});
