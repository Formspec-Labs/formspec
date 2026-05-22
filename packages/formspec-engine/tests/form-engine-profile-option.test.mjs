/** @filedesc FormEngine accepts ValidationProfile vocabulary at the validation API boundary. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

function buildDefinition() {
  return {
    $formspec: '1.0',
    url: 'http://example.org/profile-test',
    version: '1.0.0',
    title: 'Validation Profile Test',
    items: [
      { key: 'liveOk', type: 'field', dataType: 'boolean', label: 'Live', initialValue: false },
      { key: 'submitOk', type: 'field', dataType: 'boolean', label: 'Submit', initialValue: false },
      { key: 'demandOk', type: 'field', dataType: 'boolean', label: 'Demand', initialValue: false },
    ],
    shapes: [
      {
        id: 'liveCheck',
        target: '#',
        timing: 'continuous',
        constraint: 'liveOk == true',
        message: 'Live check failed',
      },
      {
        id: 'submitCheck',
        target: '#',
        timing: 'submit',
        constraint: 'submitOk == true',
        message: 'Submit check failed',
      },
      {
        id: 'demandCheck',
        target: '#',
        timing: 'demand',
        constraint: 'demandOk == true',
        message: 'Demand check failed',
      },
    ],
  };
}

function shapeIds(report) {
  return report.results.map((result) => result.shapeId).filter(Boolean).sort();
}

test('profile=live produces the continuous report', () => {
  const engine = new FormEngine(buildDefinition());
  const report = engine.getValidationReport({ profile: 'live' });

  assert.deepEqual(shapeIds(report), ['liveCheck']);
});

test('profile=on-submit includes continuous and submit-timing shapes', () => {
  const engine = new FormEngine(buildDefinition());
  const report = engine.getValidationReport({ profile: 'on-submit' });

  assert.deepEqual(shapeIds(report), ['liveCheck', 'submitCheck']);
});

test('profile=on-demand produces only demand-timing shape findings', () => {
  const engine = new FormEngine(buildDefinition());
  const report = engine.getValidationReport({ profile: 'on-demand' });

  assert.deepEqual(shapeIds(report), ['demandCheck']);
});

test('profile=off produces no ValidationReport', () => {
  const engine = new FormEngine(buildDefinition());

  assert.equal(engine.getValidationReport({ profile: 'off' }), null);
  assert.equal(engine.getDiagnosticsSnapshot({ profile: 'off' }).validation, null);
});

test('getResponse omits validationResults when profile=off', () => {
  const engine = new FormEngine(buildDefinition());
  const response = engine.getResponse({ profile: 'off' });

  assert.equal(response.status, 'in-progress');
  assert.equal(Object.prototype.hasOwnProperty.call(response, 'validationResults'), false);
});

test('only profile=on-submit can complete a response snapshot', () => {
  const engine = new FormEngine(buildDefinition());
  engine.setValue('liveOk', true);
  engine.setValue('submitOk', true);
  engine.setValue('demandOk', true);

  assert.equal(engine.getValidationReport({ profile: 'live' }).valid, true);
  assert.equal(engine.getValidationReport({ profile: 'on-demand' }).valid, true);
  assert.equal(engine.getValidationReport({ profile: 'on-submit' }).valid, true);
  assert.equal(engine.getResponse({ profile: 'live' }).status, 'in-progress');
  assert.equal(engine.getResponse({ profile: 'on-demand' }).status, 'in-progress');
  assert.equal(engine.getResponse({ profile: 'on-submit' }).status, 'completed');
});

test('removed mode option is rejected at runtime', () => {
  const engine = new FormEngine(buildDefinition());

  assert.throws(
    () => engine.getValidationReport({ mode: 'continuous' }),
    /mode.*removed.*profile/i,
  );
  assert.throws(
    () => engine.getResponse({ mode: 'submit' }),
    /mode.*removed.*profile/i,
  );
});

test('unknown validation report options are rejected at runtime', () => {
  const engine = new FormEngine(buildDefinition());

  assert.throws(
    () => engine.getValidationReport({ timing: 'continuous' }),
    /unknown validation option.*timing/i,
  );
  assert.throws(
    () => engine.getDiagnosticsSnapshot({ timing: 'continuous' }),
    /unknown validation option.*timing/i,
  );
});
