/**
 * Nested Repeats and Cross-Group Calculations — Grant Application Coverage
 *
 * Migrated from tests/e2e/playwright/integration/nested-repeats-and-calculations.spec.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGrantEngine,
  engineValue,
  engineVariable,
  addRepeatInstance,
  removeRepeatInstance,
} from './helpers/grant-app.mjs';

test('should compute taskCost from hours × hourlyRate in a nested repeat', () => {
  const engine = createGrantEngine();

  addRepeatInstance(engine, 'projectPhases');
  engine.setValue('projectPhases[0].phaseName', 'Phase One');
  addRepeatInstance(engine, 'projectPhases[0].phaseTasks');
  engine.setValue('projectPhases[0].phaseTasks[0].hours', 10);
  engine.setValue('projectPhases[0].phaseTasks[0].hourlyRate', { amount: 50, currency: 'USD' });

  assert.deepEqual(engineValue(engine, 'projectPhases[0].phaseTasks[0].taskCost'), { amount: 500, currency: 'USD' });
});

test('should aggregate phaseTotal from all tasks in a phase', () => {
  const engine = createGrantEngine();

  addRepeatInstance(engine, 'projectPhases');
  addRepeatInstance(engine, 'projectPhases[0].phaseTasks');
  engine.setValue('projectPhases[0].phaseTasks[0].hours', 10);
  engine.setValue('projectPhases[0].phaseTasks[0].hourlyRate', { amount: 50, currency: 'USD' });

  addRepeatInstance(engine, 'projectPhases[0].phaseTasks');
  engine.setValue('projectPhases[0].phaseTasks[1].hours', 5);
  engine.setValue('projectPhases[0].phaseTasks[1].hourlyRate', { amount: 100, currency: 'USD' });

  assert.deepEqual(engineValue(engine, 'projectPhases[0].phaseTotal'), { amount: 1000, currency: 'USD' });
});

test('should aggregate @projectPhasesTotal across multiple phases', () => {
  const engine = createGrantEngine();

  addRepeatInstance(engine, 'projectPhases');
  addRepeatInstance(engine, 'projectPhases[0].phaseTasks');
  engine.setValue('projectPhases[0].phaseTasks[0].hours', 10);
  engine.setValue('projectPhases[0].phaseTasks[0].hourlyRate', { amount: 100, currency: 'USD' });

  addRepeatInstance(engine, 'projectPhases');
  addRepeatInstance(engine, 'projectPhases[1].phaseTasks');
  engine.setValue('projectPhases[1].phaseTasks[0].hours', 5);
  engine.setValue('projectPhases[1].phaseTasks[0].hourlyRate', { amount: 200, currency: 'USD' });

  assert.deepEqual(engineVariable(engine, 'projectPhasesTotal'), { amount: 2000, currency: 'USD' });
});

test('should update phaseTotal when a task is removed', () => {
  const engine = createGrantEngine();

  addRepeatInstance(engine, 'projectPhases');
  addRepeatInstance(engine, 'projectPhases[0].phaseTasks');
  engine.setValue('projectPhases[0].phaseTasks[0].hours', 10);
  engine.setValue('projectPhases[0].phaseTasks[0].hourlyRate', { amount: 100, currency: 'USD' });

  addRepeatInstance(engine, 'projectPhases[0].phaseTasks');
  engine.setValue('projectPhases[0].phaseTasks[1].hours', 5);
  engine.setValue('projectPhases[0].phaseTasks[1].hourlyRate', { amount: 100, currency: 'USD' });

  assert.deepEqual(engineValue(engine, 'projectPhases[0].phaseTotal'), { amount: 1500, currency: 'USD' });

  removeRepeatInstance(engine, 'projectPhases[0].phaseTasks', 0);

  assert.deepEqual(engineValue(engine, 'projectPhases[0].phaseTotal'), { amount: 500, currency: 'USD' });
});

test('should include nested phase data in continuous response', () => {
  const engine = createGrantEngine();

  addRepeatInstance(engine, 'projectPhases');
  engine.setValue('projectPhases[0].phaseName', 'Design');
  addRepeatInstance(engine, 'projectPhases[0].phaseTasks');
  engine.setValue('projectPhases[0].phaseTasks[0].taskName', 'Wireframes');
  engine.setValue('projectPhases[0].phaseTasks[0].hours', 8);
  engine.setValue('projectPhases[0].phaseTasks[0].hourlyRate', { amount: 75, currency: 'USD' });

  const response = engine.getResponse({ profile: 'live' });

  assert.equal(response.data?.projectPhases?.[0]?.phaseName, 'Design');
  assert.equal(response.data?.projectPhases?.[0]?.phaseTasks?.[0]?.taskName, 'Wireframes');
  assert.deepEqual(response.data?.projectPhases?.[0]?.phaseTasks?.[0]?.taskCost, { amount: 600, currency: 'USD' });
});
