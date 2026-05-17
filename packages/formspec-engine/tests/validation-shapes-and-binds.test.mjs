/**
 * Validation: Shapes and Bind Constraints — Grant Application Coverage
 *
 * Migrated from tests/e2e/playwright/integration/grant-app-validation.spec.ts
 *
 * Tests bind constraints (constraint, whitespace normalization),
 * ValidationReport shape contract, and shape rules
 * (activeWhen, timing, or/not composition).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGrantEngine,
  engineValue,
  getValidationReport,
} from './helpers/grant-app.mjs';

// ── Bind Constraints ─────────────────────────────────────────────────

test('should reject EIN not matching XX-XXXXXXX pattern', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.ein', 'BADINPUT');

  const report = getValidationReport(engine, 'continuous');
  const einErr = report.results.find(r => r.path === 'applicantInfo.ein' && r.constraintKind === 'constraint');
  assert.ok(einErr, 'Expected EIN constraint error');
  assert.ok(einErr.message.includes('EIN must be in the format'), `Expected message about EIN format, got: ${einErr.message}`);
});

test('should accept a valid EIN and clear the constraint error', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.ein', '12-3456789');

  const report = getValidationReport(engine, 'continuous');
  const einErr = report.results.find(r => r.path === 'applicantInfo.ein' && r.constraintKind === 'constraint');
  assert.equal(einErr, undefined);
});

test('should normalize whitespace from EIN input (whitespace: normalize)', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.ein', '  12  3456789  ');
  assert.equal(engineValue(engine, 'applicantInfo.ein'), '12 3456789');
});

test('should trim whitespace from contactEmail input (whitespace: trim)', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.contactEmail', '  jane@example.org  ');
  assert.equal(engineValue(engine, 'applicantInfo.contactEmail'), 'jane@example.org');
});

test('should apply second bind constraint on contactEmail (bind inheritance AND semantics)', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.contactEmail', 'notanemail');

  const report = getValidationReport(engine, 'continuous');
  const emailErr = report.results.find(r =>
    r.path === 'applicantInfo.contactEmail' && r.constraintKind === 'constraint'
  );
  assert.ok(emailErr, 'Expected email constraint error');
  assert.equal(emailErr.message, 'Contact email must contain @.');
});

test('should clear contactEmail constraint when email contains @', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.contactEmail', 'jane@example.org');

  const report = getValidationReport(engine, 'continuous');
  const emailErr = report.results.find(r =>
    r.path === 'applicantInfo.contactEmail' && r.constraintKind === 'constraint'
  );
  assert.equal(emailErr, undefined);
});

// ── ValidationReport Contract ────────────────────────────────────────

test('should return ValidationReport with valid boolean, counts, results, and timestamp', () => {
  const engine = createGrantEngine();
  const report = getValidationReport(engine, 'continuous');

  assert.equal(typeof report.valid, 'boolean');
  assert.equal(typeof report.counts.error, 'number');
  assert.equal(typeof report.counts.warning, 'number');
  assert.equal(typeof report.counts.info, 'number');
  assert.ok(Array.isArray(report.results));
  assert.match(report.timestamp, /^\d{4}-\d{2}-\d{2}T/); // ISO 8601
});

test('should pin definition url and version on ValidationReport', () => {
  const engine = createGrantEngine();
  const report = getValidationReport(engine, 'continuous');

  assert.equal(report.definitionUrl, 'https://example.gov/forms/grant-application');
  assert.equal(report.definitionVersion, '1.0.0');
});

// ── Shape: budgetMatch (context block) ───────────────────────────────

test('should surface BUDGET_MISMATCH shape with full ValidationResult contract', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.lineItems[0].quantity', 1);
  engine.setValue('budget.lineItems[0].unitCost', 1000);
  // Set requestedAmount to a non-matching value — triggers mismatch
  engine.setValue('budget.requestedAmount', { amount: 0, currency: 'USD' });

  const report = getValidationReport(engine, 'continuous');
  const mismatch = report.results.find(r => r.code === 'BUDGET_MISMATCH');
  assert.ok(mismatch, 'Expected BUDGET_MISMATCH error');

  // Full ValidationResult contract
  assert.equal(mismatch.severity, 'error');
  assert.equal(mismatch.constraintKind, 'shape');
  assert.equal(mismatch.source, 'shape');
  assert.equal(mismatch.shapeId, 'budgetMatch');
  assert.equal(typeof mismatch.constraint, 'string');

  // Context block
  assert.ok(mismatch.context, 'Expected context on BUDGET_MISMATCH');
  assert.equal(typeof mismatch.context.grandTotal, 'string');
  assert.equal(typeof mismatch.context.requested, 'string');
  assert.equal(typeof mismatch.context.difference, 'string');
  assert.ok(parseFloat(mismatch.context.grandTotal) > 0);
});

test('should clear BUDGET_MISMATCH when requestedAmount matches @grandTotal', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.lineItems[0].quantity', 1);
  engine.setValue('budget.lineItems[0].unitCost', 1000);
  engine.setValue('budget.requestedAmount', { amount: 1000, currency: 'USD' });

  const report = getValidationReport(engine, 'continuous');
  const mismatch = report.results.find(r => r.code === 'BUDGET_MISMATCH');
  assert.equal(mismatch, undefined);
});

// ── Shape: subcontractorCap (activeWhen) ─────────────────────────────

test('should activate subcontractorCap shape only when usesSubcontractors is true (activeWhen)', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.lineItems[0].quantity', 1);
  engine.setValue('budget.lineItems[0].unitCost', 1000);

  // Without usesSubcontractors — shape should NOT fire
  let report = getValidationReport(engine, 'continuous');
  let cap = report.results.find(r => r.code === 'SUBCONTRACTOR_CAP_EXCEEDED');
  assert.equal(cap, undefined);

  // Enable subcontractors and add an amount exceeding 49%
  engine.setValue('budget.usesSubcontractors', true);
  engine.setValue('subcontractors[0].subAmount', 600); // 60% > 49%

  report = getValidationReport(engine, 'continuous');
  cap = report.results.find(r => r.code === 'SUBCONTRACTOR_CAP_EXCEEDED');
  assert.ok(cap, 'Expected SUBCONTRACTOR_CAP_EXCEEDED error');

  // Disable subcontractors — shape should deactivate
  engine.setValue('budget.usesSubcontractors', false);

  report = getValidationReport(engine, 'continuous');
  cap = report.results.find(r => r.code === 'SUBCONTRACTOR_CAP_EXCEEDED');
  assert.equal(cap, undefined);
});

// ── Shape: narrativeDocRequired (timing: submit) ─────────────────────

test('should not fire narrativeDocRequired in continuous mode (timing: submit)', () => {
  const engine = createGrantEngine();
  const report = getValidationReport(engine, 'continuous');
  const docErr = report.results.find(r => r.code === 'NARRATIVE_DOC_REQUIRED');
  assert.equal(docErr, undefined);
});

test('should fire narrativeDocRequired in submit mode when no attachment present', () => {
  const engine = createGrantEngine();
  const report = getValidationReport(engine, 'submit');
  const docErr = report.results.find(r => r.code === 'NARRATIVE_DOC_REQUIRED');
  assert.ok(docErr, 'Expected NARRATIVE_DOC_REQUIRED error');
  assert.equal(docErr.severity, 'error');
  assert.equal(docErr.shapeId, 'narrativeDocRequired');
});

test('should clear narrativeDocRequired when narrativeDoc is provided', () => {
  const engine = createGrantEngine();
  engine.setValue('attachments.narrativeDoc', 'document.pdf');

  const report = getValidationReport(engine, 'submit');
  const docErr = report.results.find(r => r.code === 'NARRATIVE_DOC_REQUIRED');
  assert.equal(docErr, undefined);
});

// ── Shape: contactProvided (or composition) ──────────────────────────

test('should fire contactProvided warning when both email and phone are empty (or composition)', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.contactPhone', '');
  engine.setValue('applicantInfo.contactEmail', '');

  const report = getValidationReport(engine, 'continuous');
  const contact = report.results.find(r => r.code === 'CONTACT_METHOD_MISSING');
  assert.ok(contact, 'Expected CONTACT_METHOD_MISSING warning');
  assert.equal(contact.severity, 'warning');
});

test('should clear contactProvided warning when only email is provided (or composition)', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.contactPhone', '');
  engine.setValue('applicantInfo.contactEmail', 'jane@example.org');

  const report = getValidationReport(engine, 'continuous');
  const contact = report.results.find(r => r.code === 'CONTACT_METHOD_MISSING');
  assert.equal(contact, undefined);
});

test('should clear contactProvided warning when only phone is provided (or composition)', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.contactPhone', '202-555-0100');
  engine.setValue('applicantInfo.contactEmail', '');

  const report = getValidationReport(engine, 'continuous');
  const contact = report.results.find(r => r.code === 'CONTACT_METHOD_MISSING');
  assert.equal(contact, undefined);
});

// ── Shape: abstractNotPlaceholder (not composition) ──────────────────

test('should fire abstractNotPlaceholder warning when abstract contains TBD (not composition)', () => {
  const engine = createGrantEngine();
  engine.setValue('projectNarrative.abstract', 'Project scope TBD');

  const report = getValidationReport(engine, 'continuous');
  const placeholder = report.results.find(r => r.code === 'ABSTRACT_PLACEHOLDER');
  assert.ok(placeholder, 'Expected ABSTRACT_PLACEHOLDER warning');
  assert.equal(placeholder.severity, 'warning');
});

test('should clear abstractNotPlaceholder warning when abstract does not contain TBD', () => {
  const engine = createGrantEngine();
  engine.setValue('projectNarrative.abstract', 'A detailed project scope.');

  const report = getValidationReport(engine, 'continuous');
  const placeholder = report.results.find(r => r.code === 'ABSTRACT_PLACEHOLDER');
  assert.equal(placeholder, undefined);
});

// ── Additional validations migrated from grant-app-ux-fixes ─────────

test('website field should accept a valid URL with path', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.projectWebsite', 'https://example.com/my-project');

  const value = engineValue(engine, 'applicantInfo.projectWebsite');
  assert.equal(value, 'https://example.com/my-project');

  const report = getValidationReport(engine, 'demand');
  const websiteErr = report.results.find(
    r => r.path === 'applicantInfo.projectWebsite' && r.severity === 'error'
  );
  assert.equal(websiteErr, undefined, 'https://example.com/my-project should pass the URL constraint');
});

test('website field should reject a non-URL value', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.projectWebsite', 'not-a-url');

  const report = getValidationReport(engine, 'demand');
  const websiteErr = report.results.find(
    r => r.path === 'applicantInfo.projectWebsite' && r.severity === 'error'
  );
  assert.ok(websiteErr, 'non-URL should fail the URL constraint');
});

test('negative quantity should produce a validation error', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.lineItems[0].quantity', -5);

  const report = getValidationReport(engine, 'continuous');
  const qtyErr = report.results.find(
    r => r.path === 'budget.lineItems[1].quantity' && r.constraintKind === 'constraint'
  );
  assert.ok(qtyErr, 'Expected quantity constraint error');
  assert.equal(qtyErr.message, 'Quantity must not be negative.');
});

test('negative unitCost should produce a validation error', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.lineItems[0].unitCost', -100);

  const report = getValidationReport(engine, 'continuous');
  const costErr = report.results.find(
    r => r.path === 'budget.lineItems[1].unitCost' && r.constraintKind === 'constraint'
  );
  assert.ok(costErr, 'Expected unitCost constraint error');
  assert.equal(costErr.message, 'Unit cost must not be negative.');
});

test('zero values should be allowed', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.lineItems[0].quantity', 0);
  engine.setValue('budget.lineItems[0].unitCost', 0);

  const report = getValidationReport(engine, 'continuous');
  const constraintErrs = report.results.filter(
    r =>
      (r.path === 'budget.lineItems[1].quantity' || r.path === 'budget.lineItems[1].unitCost') &&
      r.constraintKind === 'constraint'
  );
  assert.equal(constraintErrs.length, 0);
});

test('negative hourlyRate should produce a validation error', () => {
  const engine = createGrantEngine();
  engine.setValue('projectPhases[0].phaseTasks[0].hourlyRate', { amount: -100, currency: 'USD' });

  const report = getValidationReport(engine, 'continuous');
  const rateErr = report.results.find(
    r => r.path === 'projectPhases[1].phaseTasks[1].hourlyRate' && r.constraintKind === 'constraint'
  );
  assert.ok(rateErr, 'Expected hourlyRate constraint error');
  assert.equal(rateErr.message, 'Hourly rate must not be negative.');
});
