/** @filedesc Tests for engine helpers used by formspec-assist. */
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine, preactReactiveRuntime } from '../dist/index.js';

function makeDefinition() {
  return {
    $formspec: '1.0',
    url: 'https://example.org/forms/grant',
    version: '1.0.0',
    title: 'Grant Application',
    binds: [{ path: 'organization.name', required: true }, { path: 'organization.ein', required: true }, { path: 'contactEmail', required: true }, { path: 'derivedScore', readonly: true, calculate: "1" }],
    items: [
      {
        key: 'organization',
        type: 'group',
        label: 'Organization',
        children: [
          { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
          { key: 'ein', type: 'field', dataType: 'string', label: 'EIN' },
        ],
      },
      { key: 'contactEmail', type: 'field', dataType: 'string', label: 'Email' },
      { key: 'optionalNote', type: 'field', dataType: 'string', label: 'Note' },
      { key: 'displayOnly', type: 'display', label: 'Display only', widget: 'Heading', content: 'Hello' },
      { key: 'derivedScore', type: 'field', dataType: 'integer', label: 'Derived' },
    ],
  };
}

test('getFieldPaths enumerates live field paths only', () => {
  const engine = new FormEngine(makeDefinition());
  assert.deepEqual(engine.getFieldPaths(), [
    'contactEmail',
    'derivedScore',
    'optionalNote',
    'organization.ein',
    'organization.name',
  ]);
});

test('evaluated form state gives callers the live report and plain flags rather than engine-owned counts', () => {
  // Layout now owns progress counts. The engine exposes only its evaluated inputs.
  const engine = new FormEngine(makeDefinition());
  engine.setValue('organization.name', 'Acme');
  engine.setValue('contactEmail', 'owner@example.org');

  const state = engine.getEvaluatedFormState();
  assert.deepEqual(state.fields.find(field => field.path === 'derivedScore'), {
    path: 'derivedScore', relevant: true, readonly: true, required: false, empty: false,
  });
  assert.equal(state.fields.find(field => field.path === 'organization.ein').empty, true);
  assert.equal(state.report.valid, false);
  assert.equal('getProgress' in engine, false);

  engine.setValue('organization.ein', '12-3456789');
  assert.equal(engine.getEvaluatedFormState().report.valid, true);
  assert.equal(state.report.valid, false);
});

test('a reactive evaluated snapshot notices the first blank repeat row', () => {
  const engine = new FormEngine({ ...makeDefinition(), items: [{
    key: 'rows', type: 'group', repeatable: true, minRepeat: 0,
    children: [{ key: 'note', type: 'field', dataType: 'string' }],
  }] });
  const paths = preactReactiveRuntime.computed(() => engine.getEvaluatedFormState().fields.map(field => field.path));
  assert.deepEqual(paths.value, []);
  engine.addRepeatInstance('rows');
  assert.deepEqual(paths.value, ['rows[0].note']);
  engine.removeRepeatInstance('rows', 0);
  assert.deepEqual(paths.value, []);
});

test('evaluated state adds no edit evaluation and includes submit-only findings in the on-submit profile', (t) => {
  const definition = makeDefinition();
  definition.items.push(
    { key: 'zero', type: 'field', dataType: 'integer' },
    { key: 'false', type: 'field', dataType: 'boolean' },
    { key: 'hidden', type: 'field', dataType: 'string', initialValue: 'retained' },
  );
  definition.binds.push({ path: 'hidden', relevant: 'false' });
  definition.shapes = ['continuous', 'submit', 'demand'].map(timing => ({
    id: timing, target: '#', severity: 'warning', constraint: 'false', message: `${timing} finding`, timing,
  }));
  const engine = new FormEngine(definition);
  const liveEvaluation = t.mock.method(engine, '_evaluate');
  const timedEvaluation = t.mock.method(engine, 'evaluateResultForTrigger');
  engine.setValue('zero', 0);
  engine.setValue('false', false);
  const state = engine.getEvaluatedFormState();
  assert.equal(liveEvaluation.mock.callCount(), 2);
  assert.equal(timedEvaluation.mock.callCount(), 0);
  assert.deepEqual(state.fields.filter(field => ['zero', 'false'].includes(field.path)).map(field => field.empty), [false, false]);
  assert.equal(state.fields.find(field => field.path === 'hidden').relevant, false);
  assert.deepEqual(state.report.results.filter(result => result.shapeId).map(result => result.shapeId), ['continuous']);

  const saved = engine.getEvaluatedFormState({ profile: 'on-submit' });
  // Rust handles projection and the final recheck in a single engine call.
  assert.deepEqual(timedEvaluation.mock.calls.map(call => call.arguments[0]), ['submit']);
  assert.equal(Object.hasOwn(timedEvaluation.mock.calls[0].result.data, 'hidden'), false);
  assert.deepEqual(saved.report.results.filter(result => result.shapeId).map(result => result.shapeId), ['continuous', 'submit']);
  assert.deepEqual(saved.fields, state.fields);

  const noSubmit = new FormEngine({ ...definition, shapes: definition.shapes.filter(shape => shape.timing !== 'submit') });
  const noSubmitCalls = t.mock.method(noSubmit, 'evaluateResultForTrigger');
  assert.deepEqual(noSubmit.getEvaluatedFormState({ profile: 'on-submit' }).report.results.filter(result => result.shapeId).map(result => result.shapeId), ['continuous']);
  assert.deepEqual(noSubmit.getValidationReport({ profile: 'on-submit' }).results, noSubmit.getValidationReport().results);
  // A form without submit-timed Shapes can still have different draft and filed verdicts.
  assert.deepEqual(noSubmitCalls.mock.calls.map(call => call.arguments[0]), ['submit', 'submit']);
});

for (const [source, definitionOptions, shapeOptions] of [
  ['Definition', { warningExplanation: 'acknowledge' }, {}],
  ['Shape', { warningExplanation: 'none' }, { explanation: 'acknowledge' }],
]) {
  test(`on-submit progress includes an acknowledgement error declared by the ${source} without a submit-timed Shape`, (t) => {
    const engine = new FormEngine({
      ...makeDefinition(), ...definitionOptions,
      items: [{ key: 'answer', type: 'field', dataType: 'string', initialValue: 'draft' }],
      shapes: [{ id: 'check', target: '#', code: 'CHECK', timing: 'continuous', severity: 'warning',
        constraint: 'false', message: 'Check this answer', ...shapeOptions }],
    });
    // fs-g8fr now supplies the real Core §5.3.1 acknowledgement error from the settled Rust evaluator.
    const calls = t.mock.method(engine, 'evaluateResultForTrigger');

    assert.equal(engine.getEvaluatedFormState().report.valid, true);
    assert.equal(calls.mock.callCount(), 0);
    const saved = engine.getEvaluatedFormState({ profile: 'on-submit' }).report;
    // The acknowledgement error must survive the fresh pass over the filed answers.
    assert.deepEqual(calls.mock.calls.map(call => call.arguments[0]), ['submit']);
    assert.equal(saved.valid, false);
    assert.deepEqual(saved.results.map(result => result.code), ['CHECK', 'EXPLANATION_REQUIRED']);
    assert.deepEqual(saved.results, engine.getValidationReport({ profile: 'on-submit' }).results);
    const submitted = engine.getResponseSnapshot({ profile: 'on-submit' });
    assert.equal(submitted.response.status, 'in-progress');
    assert.equal(submitted.validationReport.valid, false);
  });
}

test('on-submit report checks filed data when both explanation modes are none', (t) => {
  const engine = new FormEngine({
    ...makeDefinition(), warningExplanation: 'none',
    shapes: [{ id: 'check', target: '#', explanation: 'none', severity: 'warning',
      constraint: 'false', message: 'Check this answer' }],
  });
  const calls = t.mock.method(engine, 'evaluateResultForTrigger');
  assert.deepEqual(engine.getValidationReport({ profile: 'on-submit' }).results, engine.getValidationReport().results);
  // A disabled explanation mode does not skip the filed-data check.
  assert.deepEqual(calls.mock.calls.map(call => call.arguments[0]), ['submit']);
});

test('a write records who made it, so assist can guard a respondent\'s own typing', () => {
  const engine = new FormEngine(makeDefinition());
  const vm = engine.getFieldVM('contactEmail');
  assert.equal(vm.writeSource.value, null);

  vm.setValue('me@example.org');
  assert.equal(vm.writeSource.value, 'user');
  assert.equal(engine.writeSources['contactEmail'].value, 'user');

  vm.setValue('agent@example.org', { source: 'assist' });
  assert.equal(vm.writeSource.value, 'assist');

  engine.setValue('contactEmail', 'me-again@example.org');
  assert.equal(vm.writeSource.value, 'user');

  // Calculated fields never record a source: the write is refused before it lands.
  engine.setValue('derivedScore', 9, { source: 'assist' });
  assert.equal(engine.writeSources['derivedScore'].value, null);
});

test('write sources travel with their row when a repeat instance is removed', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'https://example.org/forms/rows',
    version: '1.0.0',
    title: 'Rows',
    items: [
      {
        key: 'items', type: 'group', label: 'Items', repeatable: true,
        children: [{ key: 'amount', type: 'field', dataType: 'string', label: 'Amount' }],
      },
    ],
  });
  engine.addRepeatInstance('items');
  engine.addRepeatInstance('items');
  engine.addRepeatInstance('items');
  engine.setValue('items[0].amount', '10', { source: 'assist' });
  engine.setValue('items[1].amount', '20', { source: 'assist' });
  engine.setValue('items[2].amount', '30');

  engine.removeRepeatInstance('items', 0);

  assert.equal(engine.getFieldVM('items[0].amount').value.value, '20');
  assert.equal(engine.writeSources['items[0].amount'].value, 'assist');
  assert.equal(engine.getFieldVM('items[1].amount').value.value, '30');
  assert.equal(engine.writeSources['items[1].amount'].value, 'user');
  assert.equal(engine.writeSources['items[2].amount'], undefined);
});
