/**
 * Visibility and Response Pruning — Grant Application Coverage
 *
 * Migrated from:
 * - tests/e2e/playwright/integration/grant-app-visibility-and-pruning.spec.ts
 * - tests/e2e/playwright/components/grant-app-component-props.spec.ts (engine-only toggle)
 * - tests/e2e/playwright/components/component-tree-engine-alignment.spec.ts (signal checks)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGrantEngine,
  engineValue,
  getResponse,
} from './helpers/grant-app.mjs';

test('should show nonprofitPhoneHint when orgType is nonprofit', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.orgType', 'nonprofit');

  assert.equal(engine.relevantSignals['applicantInfo.nonprofitPhoneHint']?.value, true);
});

test('should hide nonprofitPhoneHint when orgType changes to university', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.orgType', 'nonprofit');
  engine.setValue('applicantInfo.orgType', 'university');

  assert.equal(engine.relevantSignals['applicantInfo.nonprofitPhoneHint']?.value, false);
});

test('should show subcontractors group when usesSubcontractors is true', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.usesSubcontractors', true);

  assert.equal(engine.relevantSignals.subcontractors?.value, true);
});

test('should hide subcontractors group when usesSubcontractors is false', () => {
  const engine = createGrantEngine();
  engine.setValue('budget.usesSubcontractors', false);

  assert.equal(engine.relevantSignals.subcontractors?.value, false);
});

test('should remove non-relevant fields from submit response (form-level nonRelevantBehavior: remove)', () => {
  const engine = createGrantEngine();
  engine.setValue('applicantInfo.orgType', 'government');
  engine.setValue('projectNarrative.indirectRate', 15);

  const response = getResponse(engine);
  assert.equal(response.data?.projectNarrative?.indirectRate, undefined);
});

test('should retain subcontractor data in response when usesSubcontractors is toggled off (per-bind keep)', () => {
  const engine = createGrantEngine();

  engine.setValue('budget.usesSubcontractors', true);
  engine.setValue('subcontractors[0].subName', 'ACME Corp');
  engine.setValue('subcontractors[0].subOrg', 'ACME');
  engine.setValue('subcontractors[0].subAmount', 5000);
  engine.setValue('budget.usesSubcontractors', false);

  const response = getResponse(engine);
  assert.ok(Array.isArray(response.data?.subcontractors));
  assert.equal(response.data?.subcontractors?.[0]?.subName, 'ACME Corp');
});

test('should toggle budget.usesSubcontractors on and off via engine', () => {
  const engine = createGrantEngine();

  engine.setValue('budget.usesSubcontractors', true);
  assert.equal(engineValue(engine, 'budget.usesSubcontractors'), true);

  engine.setValue('budget.usesSubcontractors', false);
  assert.equal(engineValue(engine, 'budget.usesSubcontractors'), false);
});

test('should report applicantInfo.orgName as required via engine requiredSignals', () => {
  const engine = createGrantEngine();
  assert.equal(engine.requiredSignals['applicantInfo.orgName']?.value, true);
});

test('should report applicantInfo.orgName as relevant via engine relevantSignals', () => {
  const engine = createGrantEngine();
  assert.equal(engine.relevantSignals['applicantInfo.orgName']?.value, true);
});
