import { test, expect } from '@playwright/test';
import { waitForWasm } from '../helpers/harness';
import {
  waitForEngineValue,
  waitForFormEngine,
  waitForRepeatCount,
  waitForValidationMatch,
} from '../helpers/engine-harness';
import {
  loadInvoiceArtifacts,
  mountInvoice,
  engineValue,
  engineSetValue,
  addRepeatInstance,
  getRepeatCount,
  getValidationReport,
  getResponse,
} from '../helpers/invoice';

test.describe('Smoke: Invoice Form', () => {
  test('should load form and render all key sections', async ({ page }) => {
    await mountInvoice(page);

    // The invoice is a single-page form — no wizard panels
    await expect(page.locator('.formspec-wizard')).toHaveCount(0);

    // Cards for the four main sections should all be visible
    const cards = page.locator('.formspec-card');
    await expect(cards).toHaveCount(5); // Invoice Details, Line Items, Totals, Notes, Review & Submit

    // Invoice Details card
    await expect(page.locator('.formspec-card-title', { hasText: 'Invoice Details' })).toBeVisible();
    await expect(page.locator('[data-name="header.customerName"]')).toBeVisible();
    await expect(page.locator('[data-name="header.invoiceNumber"]')).toBeVisible();
    await expect(page.locator('[data-name="header.invoiceDate"]')).toBeVisible();

    // Line Items card with DataTable
    await expect(page.locator('.formspec-card-title', { hasText: 'Line Items' })).toBeVisible();
    await expect(page.locator('.formspec-data-table')).toBeVisible();

    // Totals card
    await expect(page.locator('.formspec-card-title', { hasText: 'Totals' })).toBeVisible();
    await expect(page.locator('[data-name="totals.grandTotal"]')).toBeVisible();

    // Notes card
    await expect(page.locator('.formspec-card-title', { hasText: 'Notes' })).toBeVisible();

    // Review & Submit card
    await expect(page.locator('.formspec-card-title', { hasText: 'Review & Submit' })).toBeVisible();
  });

  test('should start with one line item row due to minRepeat: 1', async ({ page }) => {
    await mountInvoice(page);

    const count = await getRepeatCount(page, 'lineItems');
    expect(count).toBe(1);

    // One tbody row should be visible
    const rows = page.locator('.formspec-data-table tbody tr');
    await expect(rows).toHaveCount(1);

    // Row number cell shows "1"
    await expect(rows.first().locator('.formspec-row-number')).toHaveText('1');
  });
});

test.describe('Repeat Groups: Line Items DataTable', () => {
  test('should add a line item row when Add Row is clicked', async ({ page }) => {
    await mountInvoice(page);

    const addBtn = page.locator('button.formspec-datatable-add');
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    await waitForRepeatCount(page, 'lineItems', 2);

    const rows = page.locator('.formspec-data-table tbody tr');
    await expect(rows).toHaveCount(2);

    const count = await getRepeatCount(page, 'lineItems');
    expect(count).toBe(2);
  });

  test('should maintain correct row numbering after adding multiple rows', async ({ page }) => {
    await mountInvoice(page);

    const addBtn = page.locator('button.formspec-datatable-add');
    await addBtn.click();
    await waitForRepeatCount(page, 'lineItems', 2);
    await addBtn.click();
    await waitForRepeatCount(page, 'lineItems', 3);

    const rows = page.locator('.formspec-data-table tbody tr');
    await expect(rows).toHaveCount(3);

    // Row numbers should be 1, 2, 3
    await expect(rows.nth(0).locator('.formspec-row-number')).toHaveText('1');
    await expect(rows.nth(1).locator('.formspec-row-number')).toHaveText('2');
    await expect(rows.nth(2).locator('.formspec-row-number')).toHaveText('3');
  });

  test('should remove a row and update row count when Remove is clicked', async ({ page }) => {
    await mountInvoice(page);

    // Start: 1 row. Add a second.
    const addBtn = page.locator('button.formspec-datatable-add');
    await addBtn.click();
    await waitForRepeatCount(page, 'lineItems', 2);

    let rows = page.locator('.formspec-data-table tbody tr');
    await expect(rows).toHaveCount(2);

    // Fill the first row's description so we can tell which row remains
    const descInput0 = page.locator('input.formspec-datatable-input[name="lineItems[0].itemDescription"]');
    const descInput1 = page.locator('input.formspec-datatable-input[name="lineItems[1].itemDescription"]');
    await descInput0.fill('Keep this row');
    await descInput1.fill('Remove this row');

    // Remove the second row
    const removeButtons = page.locator('button.formspec-datatable-remove');
    await removeButtons.nth(1).click();
    await waitForRepeatCount(page, 'lineItems', 1);

    rows = page.locator('.formspec-data-table tbody tr');
    await expect(rows).toHaveCount(1);

    const count = await getRepeatCount(page, 'lineItems');
    expect(count).toBe(1);

    // The surviving row should have the first description
    const remainingDesc = await engineValue(page, 'lineItems[0].itemDescription');
    expect(remainingDesc).toBe('Keep this row');
  });

  test('should update row numbering after a middle row is removed', async ({ page }) => {
    await mountInvoice(page);

    // Add two more rows to get 3 total
    const addBtn = page.locator('button.formspec-datatable-add');
    await addBtn.click();
    await waitForRepeatCount(page, 'lineItems', 2);
    await addBtn.click();
    await waitForRepeatCount(page, 'lineItems', 3);

    // Remove the middle row (index 1)
    const removeButtons = page.locator('button.formspec-datatable-remove');
    await removeButtons.nth(1).click();
    await waitForRepeatCount(page, 'lineItems', 2);

    const rows = page.locator('.formspec-data-table tbody tr');
    await expect(rows).toHaveCount(2);

    // Row numbers should be re-numbered as 1 and 2
    await expect(rows.nth(0).locator('.formspec-row-number')).toHaveText('1');
    await expect(rows.nth(1).locator('.formspec-row-number')).toHaveText('2');
  });
});

test.describe('Calculations: Line Total, Subtotal, Grand Total', () => {
  test('should compute line total when Qty and Unit Price are filled', async ({ page }) => {
    await mountInvoice(page);

    // Fill quantity and unit price for row 0 via DataTable inputs
    const qtyInput = page.locator('input.formspec-datatable-input[name="lineItems[0].quantity"]');
    const priceInput = page.locator('input.formspec-datatable-input[name="lineItems[0].unitPrice"]');
    await qtyInput.fill('3');
    await priceInput.fill('100');
    await waitForEngineValue(page, 'lineItems[0].lineTotal', { amount: 300, currency: 'USD' });

    // lineTotal[0] = 3 * 100 = 300
    const lineTotal = await engineValue(page, 'lineItems[0].lineTotal');
    expect(lineTotal).toEqual({ amount: 300, currency: 'USD' });
  });

  test('should update Subtotal reactively when line items change', async ({ page }) => {
    await mountInvoice(page);

    // Fill row 0: qty=2, price=50
    const qtyInput0 = page.locator('input.formspec-datatable-input[name="lineItems[0].quantity"]');
    const priceInput0 = page.locator('input.formspec-datatable-input[name="lineItems[0].unitPrice"]');
    await qtyInput0.fill('2');
    await priceInput0.fill('50');
    await waitForEngineValue(page, 'totals.subtotal', { amount: 100, currency: 'USD' });

    const subtotalAfterRow0 = await engineValue(page, 'totals.subtotal');
    expect(subtotalAfterRow0).toEqual({ amount: 100, currency: 'USD' });

    // Add a second row: qty=1, price=75
    const addBtn = page.locator('button.formspec-datatable-add');
    await addBtn.click();
    await waitForRepeatCount(page, 'lineItems', 2);

    const qtyInput1 = page.locator('input.formspec-datatable-input[name="lineItems[1].quantity"]');
    const priceInput1 = page.locator('input.formspec-datatable-input[name="lineItems[1].unitPrice"]');
    await qtyInput1.fill('1');
    await priceInput1.fill('75');
    await waitForEngineValue(page, 'totals.subtotal', { amount: 175, currency: 'USD' });

    // Subtotal = 100 + 75 = 175
    const subtotalAfterRow1 = await engineValue(page, 'totals.subtotal');
    expect(subtotalAfterRow1).toEqual({ amount: 175, currency: 'USD' });
  });

  test('should compute Grand Total as subtotal with zero tax and zero discount', async ({ page }) => {
    await mountInvoice(page);

    // Fill one line item
    const qtyInput = page.locator('input.formspec-datatable-input[name="lineItems[0].quantity"]');
    const priceInput = page.locator('input.formspec-datatable-input[name="lineItems[0].unitPrice"]');
    await qtyInput.fill('4');
    await priceInput.fill('25');
    await waitForEngineValue(page, 'totals.grandTotal', { amount: 100, currency: 'USD' });

    // With taxRate=0 and discountPercent=0 (both initialValues), grand total = subtotal = 100
    const grandTotal = await engineValue(page, 'totals.grandTotal');
    expect(grandTotal).toEqual({ amount: 100, currency: 'USD' });
  });

  test('should compute Grand Total correctly with multiple line items, tax, and discount', async ({ page }) => {
    await mountInvoice(page);

    // Row 0: qty=5, price=200 → 1000
    const qtyInput0 = page.locator('input.formspec-datatable-input[name="lineItems[0].quantity"]');
    const priceInput0 = page.locator('input.formspec-datatable-input[name="lineItems[0].unitPrice"]');
    await qtyInput0.fill('5');
    await priceInput0.fill('200');
    await waitForEngineValue(page, 'totals.subtotal', { amount: 1000, currency: 'USD' });

    // subtotal = 1000, taxRate=10%, discountPercent=5%
    // taxAmount = 1000 * 10/100 = 100
    // discountAmount = 1000 * 5/100 = 50
    // grandTotal = 1000 + 100 - 50 = 1050
    await engineSetValue(page, 'totals.taxRate', 10);
    await engineSetValue(page, 'totals.discountPercent', 5);
    await waitForEngineValue(page, 'totals.grandTotal', { amount: 1050, currency: 'USD' });

    const subtotal = await engineValue(page, 'totals.subtotal');
    expect(subtotal).toEqual({ amount: 1000, currency: 'USD' });

    const taxAmount = await engineValue(page, 'totals.taxAmount');
    expect(taxAmount).toEqual({ amount: 100, currency: 'USD' });

    const discountAmount = await engineValue(page, 'totals.discountAmount');
    expect(discountAmount).toEqual({ amount: 50, currency: 'USD' });

    const grandTotal = await engineValue(page, 'totals.grandTotal');
    expect(grandTotal).toEqual({ amount: 1050, currency: 'USD' });
  });

  test('should recalculate line total to null when unit price is cleared', async ({ page }) => {
    await mountInvoice(page);

    const qtyInput = page.locator('input.formspec-datatable-input[name="lineItems[0].quantity"]');
    const priceInput = page.locator('input.formspec-datatable-input[name="lineItems[0].unitPrice"]');

    await qtyInput.fill('3');
    await priceInput.fill('100');
    await waitForEngineValue(page, 'lineItems[0].lineTotal', { amount: 300, currency: 'USD' });

    // Verify line total is set
    const beforeClear = await engineValue(page, 'lineItems[0].lineTotal');
    expect(beforeClear).toEqual({ amount: 300, currency: 'USD' });

    // Clear unit price — line total should revert to null
    await priceInput.fill('');
    // Trigger input event to register the empty value
    await priceInput.dispatchEvent('input');
    await waitForEngineValue(page, 'lineItems[0].lineTotal', null);

    const afterClear = await engineValue(page, 'lineItems[0].lineTotal');
    expect(afterClear).toBeNull();
  });
});

test.describe('Tax and Discount Calculations', () => {
  test('should compute Tax Amount when tax rate is set', async ({ page }) => {
    await mountInvoice(page);

    // Set up a subtotal first: qty=10, price=100 → subtotal=1000
    const qtyInput = page.locator('input.formspec-datatable-input[name="lineItems[0].quantity"]');
    const priceInput = page.locator('input.formspec-datatable-input[name="lineItems[0].unitPrice"]');
    await qtyInput.fill('10');
    await priceInput.fill('100');
    await waitForEngineValue(page, 'totals.subtotal', { amount: 1000, currency: 'USD' });

    // Set tax rate to 8%
    await engineSetValue(page, 'totals.taxRate', 8);
    await waitForEngineValue(page, 'totals.taxAmount', { amount: 80, currency: 'USD' });

    // taxAmount = 1000 * 8/100 = 80
    const taxAmount = await engineValue(page, 'totals.taxAmount');
    expect(taxAmount).toEqual({ amount: 80, currency: 'USD' });
  });

  test('should compute Discount Amount when discount percent is set', async ({ page }) => {
    await mountInvoice(page);

    // Set up a subtotal: qty=2, price=500 → subtotal=1000
    const qtyInput = page.locator('input.formspec-datatable-input[name="lineItems[0].quantity"]');
    const priceInput = page.locator('input.formspec-datatable-input[name="lineItems[0].unitPrice"]');
    await qtyInput.fill('2');
    await priceInput.fill('500');
    await waitForEngineValue(page, 'totals.subtotal', { amount: 1000, currency: 'USD' });

    // Set discount to 20%
    await engineSetValue(page, 'totals.discountPercent', 20);
    await waitForEngineValue(page, 'totals.discountAmount', { amount: 200, currency: 'USD' });
    await waitForEngineValue(page, 'totals.grandTotal', { amount: 800, currency: 'USD' });

    // discountAmount = 1000 * 20/100 = 200
    const discountAmount = await engineValue(page, 'totals.discountAmount');
    expect(discountAmount).toEqual({ amount: 200, currency: 'USD' });

    // grandTotal = 1000 + 0 (no tax) - 200 = 800
    const grandTotal = await engineValue(page, 'totals.grandTotal');
    expect(grandTotal).toEqual({ amount: 800, currency: 'USD' });
  });

  test('should warn when grand total goes negative', async ({ page }) => {
    const artifacts = loadInvoiceArtifacts();
    // Remove the x-formspec-percentage extension so it doesn't clamp to 100
    const discountItem = artifacts.definition.items.find((i: any) => i.key === 'totals').children.find((i: any) => i.key === 'discountPercent');
    if (discountItem) delete discountItem.extensions;

    await page.goto('/');
    await page.waitForSelector('formspec-render', { state: 'attached' });
    await waitForWasm(page);
    await page.evaluate(({ def, comp, thm, reg }: any) => {
      const el: any = document.querySelector('formspec-render');
      el.registryDocuments = reg;
      el.definition = def;
      el.componentDocument = comp;
      el.themeDocument = thm;
    }, { def: artifacts.definition, comp: artifacts.component, thm: artifacts.theme, reg: artifacts.registry });
    await waitForFormEngine(page);

    // Set up a small subtotal: qty=1, price=10 → subtotal=10
    const qtyInput = page.locator('input.formspec-datatable-input[name="lineItems[0].quantity"]');
    const priceInput = page.locator('input.formspec-datatable-input[name="lineItems[0].unitPrice"]');
    await qtyInput.fill('1');
    await priceInput.fill('10');
    await waitForEngineValue(page, 'totals.subtotal', { amount: 10, currency: 'USD' });

    // Apply a huge discount: 200% of subtotal
    // discountAmount = 10 * 200/100 = 20
    // grandTotal = 10 + 0 - 20 = -10 → should trigger grandTotalNonNegative warning
    await engineSetValue(page, 'totals.discountPercent', 200);
    await waitForValidationMatch(page, { code: 'NEGATIVE_GRAND_TOTAL', severity: 'warning' }, 'continuous');

    const report = await getValidationReport(page, 'continuous');
    const hasNegativeWarning = report.results.some(
      (r: any) => r.code === 'NEGATIVE_GRAND_TOTAL' && r.severity === 'warning'
    );
    expect(hasNegativeWarning).toBe(true);
  });
});

test.describe('Validation: Required Fields and Constraints', () => {
  test('should report errors for required fields when response is requested in submit mode', async ({ page }) => {
    await mountInvoice(page);

    // Do not fill Customer Name (required) or line item description (required)
    const report = await getValidationReport(page, 'submit');

    const errorPaths = report.results
      .filter((r: any) => r.severity === 'error')
      .map((r: any) => r.path);

    // header.customerName is required
    expect(errorPaths).toContain('header.customerName');
    // The engine uses 1-based external paths for repeat instances:
    // internal lineItems[0] is reported externally as lineItems[1]
    expect(errorPaths).toContain('lineItems[1].itemDescription');
  });

  test('should clear Customer Name error once the field is filled', async ({ page }) => {
    await mountInvoice(page);

    // Confirm error exists initially in submit mode
    const beforeReport = await getValidationReport(page, 'submit');
    const hasErrorBefore = beforeReport.results.some(
      (r: any) => r.path === 'header.customerName' && r.severity === 'error'
    );
    expect(hasErrorBefore).toBe(true);

    // Fill the customer name
    await engineSetValue(page, 'header.customerName', 'Acme Corp');
    await page.waitForFunction(() => {
      const el: any = document.querySelector('formspec-render');
      const results = el?.getEngine()?.getValidationReport({ mode: 'submit' })?.results ?? [];
      return !results.some((r: any) => r.path === 'header.customerName' && r.severity === 'error');
    });

    const afterReport = await getValidationReport(page, 'submit');
    const hasErrorAfter = afterReport.results.some(
      (r: any) => r.path === 'header.customerName' && r.severity === 'error'
    );
    expect(hasErrorAfter).toBe(false);
  });

  test('should report validation error for invalid email format', async ({ page }) => {
    await mountInvoice(page);

    // Set a malformed email
    await engineSetValue(page, 'header.customerEmail', 'not-an-email');
    await page.waitForFunction(() => {
      const el: any = document.querySelector('formspec-render');
      const results = el?.getEngine()?.getValidationReport({ mode: 'continuous' })?.results ?? [];
      return results.some(
        (r: any) =>
          r.path === 'header.customerEmail' &&
          (r.severity === 'error' || r.code === 'CONSTRAINT_FAILED' || r.code === 'PATTERN_MISMATCH')
      );
    });

    const report = await getValidationReport(page, 'continuous');
    const emailErrors = report.results.filter(
      (r: any) => r.path === 'header.customerEmail' && (r.severity === 'error' || r.code === 'CONSTRAINT_FAILED' || r.code === 'PATTERN_MISMATCH')
    );
    expect(emailErrors.length).toBeGreaterThan(0);
  });

  test('should not report email constraint error when the email field is empty', async ({ page }) => {
    await mountInvoice(page);

    // The email field is optional. When left empty, the constraint
    // "empty($) or matches(...)" short-circuits on empty($) = true, so no error fires.
    // Note: the regex pattern in the definition has a double-backslash escaping bug that
    // causes the constraint to reject all standard email addresses (see ADR-0034 Track C).
    // This test verifies the optional/empty branch, which is the safe observable behavior.
    const emailValue = await engineValue(page, 'header.customerEmail');
    const isBlank = emailValue === null || emailValue === undefined || emailValue === '';
    expect(isBlank).toBe(true);

    const report = await getValidationReport(page, 'continuous');
    const emailErrors = report.results.filter(
      (r: any) => r.path === 'header.customerEmail' && r.severity === 'error'
    );
    expect(emailErrors.length).toBe(0);
  });

  test('should report discount-exceeds-subtotal error when discount amount exceeds subtotal', async ({ page }) => {
    const artifacts = loadInvoiceArtifacts();
    // Remove the x-formspec-percentage extension so it doesn't clamp to 100
    const discountItem = artifacts.definition.items.find((i: any) => i.key === 'totals').children.find((i: any) => i.key === 'discountPercent');
    if (discountItem) delete discountItem.extensions;

    await page.goto('/');
    await page.waitForSelector('formspec-render', { state: 'attached' });
    await waitForWasm(page);
    await page.evaluate(({ def, comp, thm, reg }: any) => {
      const el: any = document.querySelector('formspec-render');
      el.registryDocuments = reg;
      el.definition = def;
      el.componentDocument = comp;
      el.themeDocument = thm;
    }, { def: artifacts.definition, comp: artifacts.component, thm: artifacts.theme, reg: artifacts.registry });
    await waitForFormEngine(page);

    // Subtotal = 0 (no line items filled), discount = 50% of 0 = 0
    // But set subtotal to something non-zero first, then give a 200% discount
    const qtyInput = page.locator('input.formspec-datatable-input[name="lineItems[0].quantity"]');
    const priceInput = page.locator('input.formspec-datatable-input[name="lineItems[0].unitPrice"]');
    await qtyInput.fill('1');
    await priceInput.fill('100');
    await waitForEngineValue(page, 'totals.subtotal', { amount: 100, currency: 'USD' });

    // 200% discount → discountAmount = 200, subtotal = 100 → discountAmount > subtotal
    await engineSetValue(page, 'totals.discountPercent', 200);
    await waitForValidationMatch(
      page,
      { code: 'DISCOUNT_EXCEEDS_SUBTOTAL', severity: 'error' },
      'continuous'
    );

    const report = await getValidationReport(page, 'continuous');
    const discountError = report.results.find(
      (r: any) => r.code === 'DISCOUNT_EXCEEDS_SUBTOTAL' && r.severity === 'error'
    );
    expect(discountError).toBeTruthy();
  });
});

test.describe('Response Contract', () => {
  test('should produce a valid response structure with line items data', async ({ page }) => {
    await mountInvoice(page);

    // Fill required fields and a line item
    await engineSetValue(page, 'header.customerName', 'Test Customer');

    const qtyInput = page.locator('input.formspec-datatable-input[name="lineItems[0].quantity"]');
    const priceInput = page.locator('input.formspec-datatable-input[name="lineItems[0].unitPrice"]');
    const descInput = page.locator('input.formspec-datatable-input[name="lineItems[0].itemDescription"]');
    await descInput.fill('Widget');
    await qtyInput.fill('2');
    await priceInput.fill('150');
    await waitForEngineValue(page, 'totals.subtotal', { amount: 300, currency: 'USD' });

    const response = await getResponse(page, 'continuous');

    expect(response).toHaveProperty('data');
    expect(response.data).toHaveProperty('header');
    expect(response.data.header.customerName).toBe('Test Customer');
    expect(response.data).toHaveProperty('lineItems');
    expect(Array.isArray(response.data.lineItems)).toBe(true);
    expect(response.data.lineItems.length).toBe(1);
    expect(response.data.lineItems[0].itemDescription).toBe('Widget');
    expect(response.data.lineItems[0].quantity).toBe(2);
    expect(response.data).toHaveProperty('totals');
    expect(response.data.totals.subtotal).toEqual({ amount: 300, currency: 'USD' });
  });
});
