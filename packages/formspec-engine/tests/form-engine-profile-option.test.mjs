/** @filedesc FormEngine accepts ValidationProfile vocabulary at the validation API boundary. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine, evaluateDefinition, preactReactiveRuntime } from '../dist/index.js';

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

function openFormWithHiddenCalculationInput() {
  const definition = {
    ...buildDefinition(),
    items: [
      { key: 'show', type: 'field', dataType: 'boolean' },
      { key: 'x', type: 'field', dataType: 'integer' },
      { key: 'c', type: 'field', dataType: 'integer' },
      { key: 'y', type: 'field', dataType: 'integer' },
    ],
    binds: [
      { path: 'x', relevant: '$show' },
      { path: 'c', calculate: '$x + 1' },
      { path: 'y', constraint: '$ = $c', constraintMessage: 'y must equal c' },
    ],
    shapes: [],
  };
  return new FormEngine(definition, {
    savedResponseData: { show: false, x: 5, y: 6 },
    runtimeContext: { now: '2026-11-18T12:00:00Z' },
  });
}

test('profile=on-submit recomputes constraints after hidden inputs are removed', () => {
  const engine = openFormWithHiddenCalculationInput();

  assert.equal(engine.getValidationReport().valid, true);
  const report = engine.getValidationReport({ profile: 'on-submit' });
  assert.equal(report.valid, false);
  assert.deepEqual(report.results.map(({ path, code }) => [path, code]), [['y', 'CONSTRAINT_FAILED']]);
  assert.equal(engine.getValidationReport().valid, true);
  assert.deepEqual(engine.getDraftSnapshot().data, { show: false, x: 5, y: 6 });

  const valid = preactReactiveRuntime.computed(() => engine.getValidationReport({ profile: 'on-submit' }).valid);
  assert.equal(valid.value, false);
  engine.setValue('show', true);
  assert.equal(valid.value, true);
});

test('the submit snapshot and getResponse agree with a fresh recheck of the filed data', () => {
  const engine = openFormWithHiddenCalculationInput();
  const snapshot = engine.getResponseSnapshot({ profile: 'on-submit' });
  const response = engine.getResponse({ profile: 'on-submit' });
  const recheck = evaluateDefinition(engine.definition, response.data, { trigger: 'submit' });

  assert.deepEqual(response.data, { show: false, c: null, y: 6 });
  assert.deepEqual(response.data, recheck.data);
  assert.deepEqual(response, snapshot.response);
  assert.deepEqual(snapshot.validationReport, engine.getValidationReport({ profile: 'on-submit' }));
  assert.equal(response.status, 'in-progress');
  assert.equal(snapshot.validationReport.valid, false);
  assert.deepEqual(response.validationResults.map(({ path, code }) => [path, code]),
    recheck.validations.map(({ path, code }) => [path, code]));
});

test('a draft Response keeps its own data even when its report settles cascading relevance', () => {
  const engine = new FormEngine({
    ...buildDefinition(),
    items: ['x', 'y', 'z'].map(key => ({ key, type: 'field', dataType: 'integer' })),
    binds: [
      { path: 'x', relevant: 'false' },
      { path: 'y', relevant: '$x = 5' },
      { path: 'z', relevant: '$y = 6', constraint: 'false' },
    ],
    shapes: [],
  }, { savedResponseData: { x: 5, y: 6, z: 7 } });

  assert.equal(engine.getValidationReport().valid, false);
  const { response, validationReport } = engine.getResponseSnapshot({ profile: 'off' }, 'on-submit');
  // The action validates for submit but persists a draft using the Response profile.
  assert.deepEqual(response.data, { y: 6, z: 7 });
  assert.deepEqual(engine.getResponse({ profile: 'on-submit' }).data, {});
  assert.equal(validationReport.valid, true);
  assert.equal(response.status, 'in-progress');
  assert.equal(Object.hasOwn(response, 'validationResults'), false);
  assert.deepEqual(engine.getDraftSnapshot().data, { x: 5, y: 6, z: 7 });
});

test('submit keeps an answer that becomes relevant at the new filing time', () => {
  let days = 18;
  let reads = 0;
  const engine = new FormEngine({
    ...buildDefinition(),
    items: [{ key: 'x', type: 'field', dataType: 'integer' }],
    binds: [{ path: 'x', relevant: 'day(today()) = 19' }],
    shapes: [],
  }, {
    savedResponseData: { x: 5 },
    runtimeContext: { now: () => { reads += 1; return `2026-11-${days}T12:00:00Z`; } },
  });

  assert.deepEqual(engine.getResponse({ profile: 'live' }).data, {});
  days = 19;
  const before = reads;
  const snapshot = engine.getResponseSnapshot({ profile: 'on-submit' });
  assert.deepEqual(snapshot.response.data, { x: 5 });
  assert.equal(reads - before, 1);
});

test('submit can settle a relevance chain longer than 100 fields', () => {
  const keys = Array.from({ length: 102 }, (_, index) => `field${index}`);
  const engine = new FormEngine({
    ...buildDefinition(),
    items: keys.map(key => ({ key, type: 'field', dataType: 'integer' })),
    binds: keys.map((path, index) => ({ path, relevant: index === 0 ? 'false' : `$${keys[index - 1]} = 1` })),
    shapes: [],
  }, { savedResponseData: Object.fromEntries(keys.map(key => [key, 1])) });

  assert.deepEqual(engine.getResponse({ profile: 'on-submit' }).data, {});
});

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
