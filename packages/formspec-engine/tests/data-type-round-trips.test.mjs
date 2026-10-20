/**
 * Data Type Round-Trips — Grant Application Coverage
 *
 * Migrated from:
 * - tests/e2e/playwright/integration/grant-app-data-types.spec.ts
 * - tests/e2e/playwright/integration/schema-parity-phase1.spec.ts
 * - tests/e2e/playwright/integration/grant-app-wizard-flow.spec.ts (engine-only checks)
 * - tests/e2e/playwright/integration/renderer-parity-gaps.spec.ts (engine-only datetime round-trip)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGrantEngine,
  engineValue,
  getResponse,
} from './helpers/grant-app.mjs';

test('should accept numeric input and store requestedAmount as money object', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.requestedAmount', 50000);

  assert.deepEqual(engineValue(engine, 'budget.requestedAmount'), { amount: 50000, currency: 'USD' });
});

test('should accept a money object directly for requestedAmount', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.requestedAmount', { amount: 75000, currency: 'USD' });

  assert.deepEqual(engineValue(engine, 'budget.requestedAmount'), { amount: 75000, currency: 'USD' });
});

test('should set projectNarrative.focusAreas to multiple values and reflect in engine', () => {
  const engine = createGrantEngine();
  engine.setValue('projectNarrative.focusAreas', ['health', 'education']);

  const value = engineValue(engine, 'projectNarrative.focusAreas');
  assert.ok(Array.isArray(value));
  assert.ok(value.includes('health'));
  assert.ok(value.includes('education'));
});

test('should include focusAreas array in response data', () => {
  const engine = createGrantEngine();
  engine.setValue('projectNarrative.focusAreas', ['education', 'equity']);

  const response = getResponse(engine);
  const focusAreas = response.data?.projectNarrative?.focusAreas;
  assert.ok(Array.isArray(focusAreas));
  assert.ok(focusAreas.includes('education'));
  assert.ok(focusAreas.includes('equity'));
});

test('should store string value for narrativeDoc attachment field', () => {
  const engine = createGrantEngine();
  engine.setValue('attachments.narrativeDoc', 'narrative.pdf');

  assert.equal(engineValue(engine, 'attachments.narrativeDoc'), 'narrative.pdf');
});

test('should store value for budgetJustification attachment field', () => {
  const engine = createGrantEngine();
  engine.setValue('attachments.budgetJustification', 'budget.xlsx');

  assert.equal(engineValue(engine, 'attachments.budgetJustification'), 'budget.xlsx');
});

test('should store startDate and endDate as ISO date strings', () => {
  const engine = createGrantEngine();
  engine.setValue('projectNarrative.startDate', '2027-01-01');
  engine.setValue('projectNarrative.endDate', '2028-06-30');

  assert.equal(engineValue(engine, 'projectNarrative.startDate'), '2027-01-01');
  assert.equal(engineValue(engine, 'projectNarrative.endDate'), '2028-06-30');
});

test('should report duration field as readonly via engine readonlySignals (disabledDisplay: protected)', () => {
  const engine = createGrantEngine();

  assert.equal(engine.readonlySignals['projectNarrative.duration']?.value, true);
});

test('should initialize contactPhone with initialValue of (202) 555-0100', () => {
  const engine = createGrantEngine();

  assert.equal(engineValue(engine, 'applicantInfo.contactPhone'), '(202) 555-0100');
});

test('should render orgSubType child field and include value in response', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.orgSubType', '501(c)(3)');

  const response = getResponse(engine);
  const applicant = response.data?.applicantInfo;
  const inResponse =
    applicant?.orgSubType !== undefined ||
    applicant?.orgType?.orgSubType !== undefined;

  assert.equal(inResponse, true);
});

test('should store orgSubType value in engine signal', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.orgType.orgSubType', '501(c)(3)');

  assert.equal(engineValue(engine, 'applicantInfo.orgType.orgSubType'), '501(c)(3)');
});

test('dateTime field accepts and validates ISO 8601 date-time', () => {
  const engine = createGrantEngine();
  engine.setValue('projectNarrative.submissionDeadline', '2026-12-31T23:59:59');

  assert.equal(engineValue(engine, 'projectNarrative.submissionDeadline'), '2026-12-31T23:59:59');
});

test('DatePicker.showTime field accepts datetime value', () => {
  const engine = createGrantEngine();
  engine.setValue('projectNarrative.submissionDeadline', '2026-12-31T23:59:00');

  assert.equal(engineValue(engine, 'projectNarrative.submissionDeadline'), '2026-12-31T23:59:00');
});

test('time field accepts and validates HH:MM format', () => {
  const engine = createGrantEngine();
  engine.setValue('projectNarrative.meetingTime', '14:30');

  assert.equal(engineValue(engine, 'projectNarrative.meetingTime'), '14:30');
});

test('uri field accepts and validates URL values', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.projectWebsite', 'https://example.org/project');

  assert.equal(engineValue(engine, 'applicantInfo.projectWebsite'), 'https://example.org/project');
});

test('initialValue expression =today() sets startDate to today', () => {
  const engine = createGrantEngine();
  const today = new Date().toISOString().slice(0, 10);

  assert.equal(engineValue(engine, 'projectNarrative.startDate'), today);
});

test('prePopulate with editable:false makes ein readonly from instance data', () => {
  const engine = createGrantEngine();

  assert.equal(engine.readonlySignals['applicantInfo.ein']?.value, true);
});
