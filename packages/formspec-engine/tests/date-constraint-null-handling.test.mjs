/**
 * Date Constraint Null Handling — Grant Application Coverage
 *
 * Migrated from tests/e2e/playwright/integration/grant-app-discovered-issues.spec.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGrantEngine,
  engineValue,
  addRepeatInstance,
  getValidationReport,
} from './helpers/grant-app.mjs';

function endDateConstraintError(report) {
  return report.results.find(
    r => r.path === 'projectNarrative.endDate' && r.constraintKind === 'constraint'
  );
}

test('should not fire endDate constraint when only startDate is set (endDate still empty)', () => {
  const engine = createGrantEngine();

  engine.setValue('projectNarrative.startDate', '2027-01-01');

  const report = getValidationReport(engine, 'continuous');
  assert.equal(endDateConstraintError(report), undefined);
});

test('should not fire endDate constraint when only endDate is set (startDate still empty)', () => {
  const engine = createGrantEngine();

  engine.setValue('projectNarrative.endDate', '2028-06-01');

  const report = getValidationReport(engine, 'continuous');
  assert.equal(endDateConstraintError(report), undefined);
});

test('should not fire endDate constraint when neither date is set', () => {
  const engine = createGrantEngine();

  const report = getValidationReport(engine, 'continuous');
  assert.equal(endDateConstraintError(report), undefined);
});

test('should fire constraint error when both dates set and endDate is before startDate', () => {
  const engine = createGrantEngine();

  engine.setValue('projectNarrative.startDate', '2027-06-01');
  engine.setValue('projectNarrative.endDate', '2027-01-01');

  const report = getValidationReport(engine, 'continuous');
  const constraintErr = endDateConstraintError(report);

  assert.ok(constraintErr);
  assert.equal(constraintErr.message, 'End date must be after start date.');
});

test('should return null duration when endDate is before startDate (no negative months)', () => {
  const engine = createGrantEngine();

  engine.setValue('projectNarrative.startDate', '2027-06-01');
  engine.setValue('projectNarrative.endDate', '2027-01-01');

  assert.equal(engineValue(engine, 'projectNarrative.duration'), null);
});

test('should compute positive duration when endDate is after startDate', () => {
  const engine = createGrantEngine();

  engine.setValue('projectNarrative.startDate', '2027-01-01');
  engine.setValue('projectNarrative.endDate', '2028-06-01');

  assert.equal(engineValue(engine, 'projectNarrative.duration'), 17);
});

test('should clear constraint error when both dates set and endDate is after startDate', () => {
  const engine = createGrantEngine();

  engine.setValue('projectNarrative.startDate', '2027-01-01');
  engine.setValue('projectNarrative.endDate', '2028-06-01');

  const report = getValidationReport(engine, 'continuous');
  assert.equal(endDateConstraintError(report), undefined);
});

test('should store phaseTasks data via engine', () => {
  const engine = createGrantEngine();

  addRepeatInstance(engine, 'projectPhases[0].phaseTasks');
  engine.setValue('projectPhases[0].phaseTasks[0].taskName', 'Research');
  engine.setValue('projectPhases[0].phaseTasks[0].hours', 5);

  assert.equal(engineValue(engine, 'projectPhases[0].phaseTasks[0].taskName'), 'Research');
  assert.equal(engineValue(engine, 'projectPhases[0].phaseTasks[0].hours'), 5);
});

test('should compute taskCost from hours and hourlyRate', () => {
  const engine = createGrantEngine();

  addRepeatInstance(engine, 'projectPhases[0].phaseTasks');
  engine.setValue('projectPhases[0].phaseTasks[0].hours', 10);
  engine.setValue('projectPhases[0].phaseTasks[0].hourlyRate', { amount: 50, currency: 'USD' });

  assert.deepEqual(engineValue(engine, 'projectPhases[0].phaseTasks[0].hourlyRate'), { amount: '50', currency: 'USD' });
  assert.deepEqual(engineValue(engine, 'projectPhases[0].phaseTasks[0].taskCost'), { amount: '500', currency: 'USD' });
});
