/**
 * Budget Calculations — Grant Application Coverage
 *
 * Migrated from tests/e2e/playwright/integration/grant-app-budget-calculations.spec.ts
 *
 * Tests line item subtotals, precision, variable aggregates, repeat
 * add/remove, and cardinality validation (MIN_REPEAT / MAX_REPEAT).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGrantEngine,
  engineValue,
  engineVariable,
  addRepeatInstance,
  removeRepeatInstance,
  getValidationReport,
} from './helpers/grant-app.mjs';

test('should calculate line item subtotal reactively as quantity and unitCost change', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.lineItems[0].quantity', 3);
  engine.setValue('budget.lineItems[0].unitCost', 100);

  assert.equal(engineValue(engine, 'budget.lineItems[0].subtotal'), 300);
});

test('should apply precision: 2 to unitCost on input (round to 2 decimal places)', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.lineItems[0].unitCost', 33.337);

  const stored = engineValue(engine, 'budget.lineItems[0].unitCost');
  assert.ok(Math.abs(stored - 33.34) < 1e-5, `Expected ~33.34, got ${stored}`);
});

test('should aggregate subtotals into @totalDirect variable', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.lineItems[0].quantity', 2);
  engine.setValue('budget.lineItems[0].unitCost', 500);

  const totalDirect = engineVariable(engine, 'totalDirect');
  assert.deepEqual(totalDirect, { amount: 1000, currency: 'USD' });
});

test('should compute @indirectCosts from indirectRate percentage of @totalDirect', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.lineItems[0].quantity', 1);
  engine.setValue('budget.lineItems[0].unitCost', 10000);
  engine.setValue('applicantInfo.orgType', 'nonprofit');
  engine.setValue('projectNarrative.indirectRate', 10);

  const indirect = engineVariable(engine, 'indirectCosts');
  assert.deepEqual(indirect, { amount: 1000, currency: 'USD' });
});

test('should compute @grandTotal as moneyAdd(@totalDirect, @indirectCosts)', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.lineItems[0].quantity', 1);
  engine.setValue('budget.lineItems[0].unitCost', 10000);
  engine.setValue('applicantInfo.orgType', 'nonprofit');
  engine.setValue('projectNarrative.indirectRate', 10);

  const grand = engineVariable(engine, 'grandTotal');
  assert.deepEqual(grand, { amount: 11000, currency: 'USD' });
});

test('should set @indirectCosts to money(0, USD) when orgType switches to government', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.lineItems[0].quantity', 1);
  engine.setValue('budget.lineItems[0].unitCost', 10000);
  engine.setValue('applicantInfo.orgType', 'nonprofit');
  engine.setValue('projectNarrative.indirectRate', 10);

  // Switch to government — indirectCosts forced to 0
  engine.setValue('applicantInfo.orgType', 'government');

  const indirect = engineVariable(engine, 'indirectCosts');
  assert.deepEqual(indirect, { amount: 0, currency: 'USD' });

  const grand = engineVariable(engine, 'grandTotal');
  assert.deepEqual(grand, { amount: 10000, currency: 'USD' });
});

test('should increment structureVersion when a line item is added', () => {
  const engine = createGrantEngine();
  const before = engine.structureVersion.value;
  addRepeatInstance(engine, 'budget.lineItems');
  const after = engine.structureVersion.value;
  assert.ok(after > before, `Expected structureVersion to increase: ${before} -> ${after}`);
});

test('should preserve remaining row data after a line item is deleted (batch fix regression)', () => {
  const engine = createGrantEngine();
  addRepeatInstance(engine, 'budget.lineItems');

  engine.setValue('budget.lineItems[0].description', 'Personnel');
  engine.setValue('budget.lineItems[0].quantity', 1);
  engine.setValue('budget.lineItems[0].unitCost', 5000);
  engine.setValue('budget.lineItems[1].description', 'Travel');
  engine.setValue('budget.lineItems[1].quantity', 3);
  engine.setValue('budget.lineItems[1].unitCost', 800);

  // Remove row 0
  removeRepeatInstance(engine, 'budget.lineItems', 0);

  // Row 1 data should now be at index 0
  assert.equal(engineValue(engine, 'budget.lineItems[0].description'), 'Travel');
  assert.equal(engineValue(engine, 'budget.lineItems[0].quantity'), 3);
  assert.equal(engineValue(engine, 'budget.lineItems[0].unitCost'), 800);
});

test('should produce MAX_REPEAT validation error when lineItems exceeds maxRepeat of 20', () => {
  const engine = createGrantEngine();
  // Add instances until we hit 20 (already have 1)
  for (let i = 1; i < 20; i++) {
    addRepeatInstance(engine, 'budget.lineItems');
  }

  const count = engine.repeats['budget.lineItems']?.value;
  assert.equal(count, 20);

  // Adding one more beyond maxRepeat triggers a validation error
  addRepeatInstance(engine, 'budget.lineItems');

  const report = getValidationReport(engine, 'continuous');
  const maxErr = report.results.find(r => r.code === 'MAX_REPEAT');
  assert.ok(maxErr, 'Expected MAX_REPEAT error');
  assert.equal(maxErr.severity, 'error');
});

test('should produce MIN_REPEAT validation error when lineItems goes below minRepeat of 1', () => {
  const engine = createGrantEngine();
  const count = engine.repeats['budget.lineItems']?.value;
  assert.equal(count, 1);

  // Remove the only instance — goes below minRepeat
  try { removeRepeatInstance(engine, 'budget.lineItems', 0); } catch {}

  const report = getValidationReport(engine, 'continuous');
  const minErr = report.results.find(r => r.code === 'MIN_REPEAT');
  assert.ok(minErr, 'Expected MIN_REPEAT error');
  assert.equal(minErr.severity, 'error');
});

test('should update @totalDirect when a second line item is added and filled', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.lineItems[0].quantity', 1);
  engine.setValue('budget.lineItems[0].unitCost', 1000);

  addRepeatInstance(engine, 'budget.lineItems');
  engine.setValue('budget.lineItems[1].quantity', 2);
  engine.setValue('budget.lineItems[1].unitCost', 500);

  const totalDirect = engineVariable(engine, 'totalDirect');
  assert.deepEqual(totalDirect, { amount: 2000, currency: 'USD' });
});

test('should compute subtotal=200 when quantity=2 and unitCost=100 on lineItems[0]', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.lineItems[0].quantity', 2);
  engine.setValue('budget.lineItems[0].unitCost', 100);

  assert.equal(engineValue(engine, 'budget.lineItems[0].subtotal'), 200);
});

test('repeatable group bindings resolve per-instance paths across add/remove', () => {
  const engine = createGrantEngine();

  engine.setValue('budget.lineItems[0].category', 'Personnel');
  addRepeatInstance(engine, 'budget.lineItems');
  engine.setValue('budget.lineItems[1].category', 'Travel');

  let response = engine.getResponse({ profile: 'live' });
  assert.equal(response.data.budget.lineItems[0].category, 'Personnel');
  assert.equal(response.data.budget.lineItems[1].category, 'Travel');

  removeRepeatInstance(engine, 'budget.lineItems', 0);

  response = engine.getResponse({ profile: 'live' });
  assert.equal(response.data.budget.lineItems.length, 1);
  assert.equal(response.data.budget.lineItems[0].category, 'Travel');
});
