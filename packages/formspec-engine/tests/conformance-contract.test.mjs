/**
 * Conformance Contract — Grant Application Coverage
 *
 * Migrated from tests/e2e/playwright/integration/grant-app-conformance.spec.ts
 *
 * Tests engine identity, initial value hydration, mixed field types,
 * and response contract details.
 *
 * Deduplicates: endDate constraint, ValidationReport shape, and Response
 * contract tests are already covered in validation-shapes-and-binds.test.mjs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGrantEngine,
  engineValue,
  getResponse,
  addRepeatInstance,
} from './helpers/grant-app.mjs';

// ── Engine identity ──────────────────────────────────────────────────

test('should expose pinned definition url and version from loaded definition', () => {
  const engine = createGrantEngine();
  const def = engine.definition;
  assert.equal(def.url, 'https://example.gov/forms/grant-application');
  assert.equal(def.version, '1.0.0');
  assert.equal(def.versionAlgorithm, 'semver');
});

// ── Initial value hydration ──────────────────────────────────────────

test('should hydrate initialValue fields before any user interaction', () => {
  const engine = createGrantEngine();
  assert.equal(engineValue(engine, 'applicantInfo.contactPhone'), '(202) 555-0100');
});

// ── Mixed field type data entry ──────────────────────────────────────

test('should accept mixed field types and reflect them in engine signals', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.orgName', 'Health Foundation');
  engine.setValue('applicantInfo.orgType', 'nonprofit');
  engine.setValue('projectNarrative.startDate', '2027-01-01');
  engine.setValue('projectNarrative.endDate', '2028-01-01');
  engine.setValue('projectNarrative.focusAreas', ['health', 'education']);
  engine.setValue('budget.requestedAmount', { amount: 50000, currency: 'USD' });

  assert.equal(engineValue(engine, 'applicantInfo.orgName'), 'Health Foundation');
  assert.equal(engineValue(engine, 'applicantInfo.orgType'), 'nonprofit');
  assert.equal(engineValue(engine, 'projectNarrative.startDate'), '2027-01-01');
  const focusAreas = engineValue(engine, 'projectNarrative.focusAreas');
  assert.ok(focusAreas.includes('health'));
  const amount = engineValue(engine, 'budget.requestedAmount');
  assert.deepEqual(amount, { amount: 50000, currency: 'USD' });
});

// ── Relevant fields in response ──────────────────────────────────────

test('should include relevant fields in response', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.orgName', 'Tech Nonprofit');
  engine.setValue('applicantInfo.orgType', 'nonprofit');
  engine.setValue('projectNarrative.indirectRate', 12);

  const response = getResponse(engine);
  assert.equal(response.data?.applicantInfo?.orgName, 'Tech Nonprofit');
  assert.equal(response.data?.projectNarrative?.indirectRate, 12);
});

// ── Response contract ────────────────────────────────────────────────

test('should return response with required top-level fields', () => {
  const engine = createGrantEngine();
  const response = getResponse(engine);
  assert.equal(response.definitionUrl, 'https://example.gov/forms/grant-application');
  assert.equal(response.definitionVersion, '1.0.0');
  assert.equal(typeof response.status, 'string');
  assert.ok(response.data);
  assert.ok(Array.isArray(response.validationResults));
});

test('should include repeat group arrays in response data', () => {
  const engine = createGrantEngine();
  addRepeatInstance(engine, 'budget.lineItems');
  engine.setValue('budget.lineItems[0].category', 'Personnel');

  const response = getResponse(engine);
  assert.ok(Array.isArray(response.data?.budget?.lineItems));
  assert.equal(response.data.budget.lineItems[0].category, 'Personnel');
});
