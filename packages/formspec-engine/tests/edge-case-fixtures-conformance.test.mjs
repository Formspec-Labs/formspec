/** @filedesc Edge-case fixture conformance: shared fixtures exercise bind failures vs shape errors in realistic forms */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FormEngine } from '../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function loadSharedFixture(relativePath) {
  const definition = JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
  if (definition.instances) {
    for (const instance of Object.values(definition.instances)) {
      if (instance && typeof instance === 'object') {
        delete instance.source;
      }
    }
  }
  return definition;
}

test('shared microgrant fixture separates field-local bind failures from cross-field shapes', () => {
  const engine = new FormEngine(loadSharedFixture('tests/fixtures/fixture-microgrant-screener.json'));

  engine.setValue('applicant.orgEin', 'BAD EIN');
  engine.setValue('project.requestAmount', { amount: 1000, currency: 'USD' });
  engine.setValue('project.hasSubawards', true);
  engine.addRepeatInstance('project.subawardRows');
  engine.setValue('project.subawardRows[0].subawardName', 'Community Partner');
  engine.setValue('project.subawardRows[0].subawardAmount', { amount: 800, currency: 'USD' });
  engine.setValue('contact.contactEmail', '');
  engine.setValue('contact.contactPhone', '');

  const report = engine.getValidationReport({ profile: 'on-submit' });

  const bindError = report.results.find((result) => result.source === 'bind' && result.path === 'applicant.orgEin');
  const shapeIds = new Set(report.results.filter((result) => result.source === 'shape').map((result) => result.shapeId));

  assert.ok(bindError);
  assert.equal(bindError.constraintKind, 'constraint');
  assert.ok(shapeIds.has('microgrant-contact-channel'));
  assert.ok(shapeIds.has('microgrant-subaward-cap'));
});

test('shared clinical fixture keeps field-local requiredness in binds and chronology in shapes', () => {
  const engine = new FormEngine(loadSharedFixture('tests/fixtures/fixture-clinical-adverse-event.json'));

  engine.setValue('event.eventTerm', 'Syncope');
  engine.setValue('event.eventSeverity', 'moderate');
  engine.setValue('event.onsetDate', '2026-03-01');
  engine.setValue('event.ongoing', false);
  engine.setValue('event.resolutionDate', '2026-02-28');
  engine.setValue('event.eventNarrative', '');

  const report = engine.getValidationReport({ profile: 'on-submit' });

  const requiredError = report.results.find((result) => result.source === 'bind' && result.path === 'event.eventNarrative');
  const chronology = report.results.find((result) => result.source === 'shape' && result.shapeId === 'ae-chronology');

  assert.ok(requiredError);
  assert.equal(requiredError.constraintKind, 'required');
  assert.ok(chronology);
  assert.equal(chronology.path, '#');
});

test('shared tax fixture keeps row-local numeric constraints in binds and totals in shapes', () => {
  const engine = new FormEngine(loadSharedFixture('tests/fixtures/fixture-multi-state-tax-filing.json'));

  engine.setValue('filer.filingStatus', 'single');
  engine.setValue('filer.primaryState', 'MD');
  engine.setValue('filer.secondaryStates', ['VA', 'DC']);
  engine.setValue('income.residentWages', { amount: 100, currency: 'USD' });
  engine.setValue('income.nonResidentWages', { amount: 100, currency: 'USD' });
  engine.addRepeatInstance('allocations.stateAllocations');
  engine.addRepeatInstance('allocations.stateAllocations');
  engine.setValue('allocations.stateAllocations[0].allocationState', 'VA');
  engine.setValue('allocations.stateAllocations[0].allocationPercent', 120);
  engine.setValue('allocations.stateAllocations[0].allocationIncome', { amount: 100, currency: 'USD' });
  engine.setValue('allocations.stateAllocations[1].allocationState', 'DC');
  engine.setValue('allocations.stateAllocations[1].allocationPercent', 30);
  engine.setValue('allocations.stateAllocations[1].allocationIncome', { amount: 50, currency: 'USD' });

  const report = engine.getValidationReport({ profile: 'on-submit' });

  const bindError = report.results.find((result) => result.source === 'bind' && result.path === 'allocations.stateAllocations[1].allocationPercent');
  const percentShape = report.results.find((result) => result.source === 'shape' && result.shapeId === 'tax-allocation-percent-total');
  const incomeShape = report.results.find((result) => result.source === 'shape' && result.shapeId === 'tax-allocation-income-total');

  assert.ok(bindError);
  assert.equal(bindError.constraintKind, 'constraint');
  assert.ok(percentShape);
  assert.ok(incomeShape);
});
