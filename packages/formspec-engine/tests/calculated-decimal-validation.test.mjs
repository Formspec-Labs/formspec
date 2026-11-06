/** @filedesc Calculated decimals retain their numeric type through native validation. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { FormEngine, evaluateDefinition } from '../dist/index.js';

const third = '0.3333333333333333333333333333';

function definition(calculate = '$actual / $served') {
  return {
    $formspec: '1.0',
    url: 'urn:formspec:test:calculated-decimal',
    version: '1.0.0',
    items: [
      { key: 'served', type: 'field', dataType: 'integer', label: 'Served' },
      { key: 'actual', type: 'field', dataType: 'integer', label: 'Actual' },
      { key: 'ratio', type: 'field', dataType: 'decimal', label: 'Ratio' },
    ],
    binds: [{ path: 'ratio', calculate }],
  };
}

for (const [name, served, actual, expected] of [
  ['recurring', 3, 1, third],
  ['terminating', 5, 2, 0.4],
  ['negative recurring', 3, -1, `-${third}`],
  ['zero', 3, 0, 0],
]) {
  test(`${name} decimal validates through batch and reactive APIs without rounding`, () => {
    const def = definition();
    const batch = evaluateDefinition(def, { served, actual });
    assert.equal(JSON.stringify(batch.values.ratio), String(expected));
    assert.deepEqual(batch.validations, []);
    assert.deepEqual(batch.diagnostics, []);

    const engine = new FormEngine(def);
    engine.setValue('served', served);
    engine.setValue('actual', actual);
    assert.equal(JSON.stringify(engine.signals.ratio.value), String(expected));
    assert.equal(engine.getValidationReport().valid, true);
    assert.deepEqual(engine.getDiagnosticsSnapshot().evaluationDiagnostics, []);
    const response = engine.getResponse({ profile: 'on-submit' });
    assert.equal(JSON.stringify(response.data.ratio), String(expected));
    assert.equal(response.status, 'completed');
    assert.deepEqual(response.validationResults, []);
  });
}

test('recurring decimals remain numbers in bind constraints and shapes', () => {
  const def = definition();
  def.binds[0].constraint = '$ > 0 and $ < 1';
  def.shapes = [{
    id: 'ratio-is-numeric', target: 'ratio',
    constraint: '$ratio * 3 == 0.9999999999999999999999999999',
    message: 'Ratio must retain decimal precision',
  }];
  const result = evaluateDefinition(def, { served: 3, actual: 1 });
  assert.equal(JSON.stringify(result.values.ratio), third);
  assert.deepEqual(result.validations, []);
  assert.deepEqual(result.diagnostics, []);
});

test('a formula returning a numeric-looking string still fails decimal validation', () => {
  for (const text of ['3.14', third, 'not a number']) {
    const result = evaluateDefinition(definition(`'${text}'`), { served: 3, actual: 1 });
    assert.equal(result.values.ratio, text);
    assert.ok(result.validations.some(r => r.path === 'ratio' && r.code === 'TYPE_MISMATCH'));
  }
});

test('repeat calculations and aggregates retain numeric precision', () => {
  const def = definition();
  def.items = [{ key: 'rows', type: 'group', repeatable: true, children: def.items },
    { key: 'total', type: 'field', dataType: 'decimal', label: 'Total' }];
  def.binds = [
    { path: 'rows[*].ratio', calculate: '$actual / $served', constraint: '$ > 0' },
    { path: 'total', calculate: 'sum($rows[*].ratio)' },
  ];
  const result = evaluateDefinition(def, {
    rows: [{ served: 3, actual: 1 }, { served: 3, actual: 1 }],
  });
  assert.equal(JSON.stringify(result.values['rows[0].ratio']), third);
  assert.equal(JSON.stringify(result.values['rows[1].ratio']), third);
  assert.equal(JSON.stringify(result.values.total), '0.6666666666666666666666666666');
  assert.deepEqual(result.validations, []);
  assert.deepEqual(result.diagnostics, []);
});
