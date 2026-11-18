/** @filedesc Baseline repeat lifecycle tests for the batch engine rewrite. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { FormEngine } from '../dist/index.js';

function createRepeatEngine() {
  return new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/batch-repeat',
    version: '1.0.0',
    title: 'Batch Repeat',
    items: [
      {
        key: 'rows',
        type: 'group',
        label: 'Rows',
        repeatable: true,
        minRepeat: 1,
        children: [
          { key: 'qty', type: 'field', dataType: 'integer', label: 'Qty' },
          { key: 'price', type: 'field', dataType: 'decimal', label: 'Price' },
          { key: 'total', type: 'field', dataType: 'decimal', label: 'Total' },
        ],
      },
    ],
    binds: [
      { path: 'rows.total', calculate: '$qty * $price' },
    ],
  });
}

test('addRepeatInstance creates row signals and calculates per-instance totals', () => {
  const engine = createRepeatEngine();

  const newIndex = engine.addRepeatInstance('rows');
  assert.equal(newIndex, 1);
  assert.equal(engine.repeats.rows.value, 2);

  engine.setValue('rows[0].qty', 2);
  engine.setValue('rows[0].price', 5);
  engine.setValue('rows[1].qty', 3);
  engine.setValue('rows[1].price', 7);

  assert.equal(engine.signals['rows[0].total'].value, 10);
  assert.equal(engine.signals['rows[1].total'].value, 21);
});

test('removeRepeatInstance compacts rows and preserves shifted calculated state', () => {
  const engine = createRepeatEngine();

  engine.addRepeatInstance('rows');
  engine.addRepeatInstance('rows');

  engine.setValue('rows[0].qty', 1);
  engine.setValue('rows[0].price', 10);
  engine.setValue('rows[1].qty', 2);
  engine.setValue('rows[1].price', 20);
  engine.setValue('rows[2].qty', 3);
  engine.setValue('rows[2].price', 30);

  const versionBefore = engine.structureVersion.value;
  engine.removeRepeatInstance('rows', 1);

  assert.equal(engine.repeats.rows.value, 2);
  assert.equal(engine.structureVersion.value, versionBefore + 1);
  assert.equal(engine.signals['rows[0].qty'].value, 1);
  assert.equal(engine.signals['rows[0].total'].value, 10);
  assert.equal(engine.signals['rows[1].qty'].value, 3);
  assert.equal(engine.signals['rows[1].price'].value, 30);
  assert.equal(engine.signals['rows[1].total'].value, 90);
  assert.equal(engine.signals['rows[2].qty'], undefined);
  assert.equal(engine.signals['rows[2].total'], undefined);
});

function conditionalRepeatEngine() {
  return new FormEngine({
    $formspec: '1.0',
    url: 'https://example.org/conditional-repeat',
    version: '1.0.0',
    title: 'Conditional Repeat',
    items: [
      { key: 'confirmation', type: 'field', dataType: 'string' },
      { key: 'rows', type: 'group', repeatable: true, children: [
        { key: 'show', type: 'field', dataType: 'boolean', initialValue: false },
        { key: 'detail', type: 'field', dataType: 'string' },
        { key: 'answer', type: 'field', dataType: 'string' },
        { key: 'reference', type: 'field', dataType: 'string' },
      ] },
    ],
    binds: [
      { path: 'rows.detail', relevant: '$show = true' },
      { path: 'rows.answer', required: 'true' },
      { path: 'rows.reference', readonly: '$show = false' },
      { path: 'confirmation', required: 'count($rows[*].show) = 3' },
    ],
    shapes: [{ id: 'threeRows', target: '#', severity: 'error', constraint: 'count($rows[*].show) < 3', message: 'Too many rows' }],
  }, { responseData: { rows: [
    { show: false, detail: 'First detail', answer: 'First answer' },
    { show: true, detail: 'Middle detail', answer: '' },
    { show: false, detail: 'Last detail', answer: 'Last answer' },
  ] } });
}

function assertConditionalRowSignals(engine, visibleRows) {
  const { nonRelevant, required, readonly } = engine._fullResult;
  assert.equal(engine.repeats.rows.value, visibleRows.length);
  for (const [index, visible] of visibleRows.entries()) {
    const detail = `rows[${index}].detail`;
    const answer = `rows[${index}].answer`;
    const reference = `rows[${index}].reference`;
    const evaluated = [!nonRelevant.includes(detail), required[answer], readonly[reference]];
    assert.deepEqual(evaluated, [visible, true, !visible], `evaluator for row ${index}`);
    assert.deepEqual([
      engine.isPathRelevant(detail), engine.requiredSignals[answer].value, engine.readonlySignals[reference].value,
    ], evaluated, `signals for row ${index}`);
  }
}

for (const [index, position, remaining, findings] of [
  [0, 'first', [true, false], [['rows[0].answer', 'REQUIRED']]],
  [1, 'middle', [false, false], []],
  [2, 'last', [false, true], [['rows[1].answer', 'REQUIRED']]],
]) {
  test(`removing the ${position} row keeps surviving bind signals in sync with the evaluator`, (t) => {
    const engine = conditionalRepeatEngine();
    t.after(() => engine.dispose());
    assertConditionalRowSignals(engine, [false, true, false]);
    assert.equal(engine.validationResults.confirmation.value[0]?.code, 'REQUIRED');
    assert.equal(engine.shapeResults.threeRows.value.length, 1);

    const liveEvaluation = t.mock.method(engine, '_evaluate');
    engine.removeRepeatInstance('rows', index);

    assert.equal(liveEvaluation.mock.callCount(), 1);
    assertConditionalRowSignals(engine, remaining);
    assert.equal(engine.relevantSignals['rows[2].detail'], undefined);
    assert.deepEqual(engine.validationResults.confirmation.value, []);
    assert.deepEqual(engine.shapeResults.threeRows.value, []);
    assert.deepEqual(engine.getValidationReport().results.map(({ path, code }) => [path, code]), findings);
  });
}

test('removing a row below minRepeat keeps findings and signals limited to real rows', (t) => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'https://example.org/repeat-min-removal',
    version: '1.0.0',
    title: 'Repeat Minimum',
    items: [{ key: 'rows', type: 'group', repeatable: true, minRepeat: 2, children: [
      { key: 'answer', type: 'field', dataType: 'string' },
      { key: 'detail', type: 'field', dataType: 'string' },
      { key: 'reference', type: 'field', dataType: 'string' },
    ] }],
    binds: [
      { path: 'rows.answer', required: 'true' },
      { path: 'rows.detail', relevant: 'false' },
      { path: 'rows.reference', readonly: 'true' },
    ],
  });
  t.after(() => engine.dispose());

  engine.removeRepeatInstance('rows', 1);

  assert.equal(engine.repeats.rows.value, 1);
  assert.deepEqual(engine.getValidationReport().results.map(({ path, code }) => `${code}@${path}`).sort(), [
    'MIN_REPEAT@rows',
    'REQUIRED@rows[0].answer',
  ]);
  for (const name of ['signals', 'relevantSignals', 'requiredSignals', 'readonlySignals', 'validationResults', 'errorSignals']) {
    assert.deepEqual(Object.keys(engine[name]).filter(path => path.startsWith('rows[1].')), [], name);
  }
});

test('appending a repeat row projects bind results and ordinary edits evaluate once', (t) => {
  const engine = conditionalRepeatEngine();
  t.after(() => engine.dispose());
  const liveEvaluation = t.mock.method(engine, '_evaluate');
  const timedEvaluation = t.mock.method(engine, 'evaluateResultForTrigger');

  assert.equal(engine.addRepeatInstance('rows'), 3);
  assert.equal(liveEvaluation.mock.callCount(), 1);
  assertConditionalRowSignals(engine, [false, true, false, false]);

  engine.setValue('rows[3].show', true);
  engine.getEvaluatedFormState();
  const editEvaluations = liveEvaluation.mock.callCount() - 1;
  t.diagnostic(`Ordinary edit and progress read: ${editEvaluations} live evaluations, ${timedEvaluation.mock.callCount()} timed evaluations`);
  assert.equal(editEvaluations, 1);
  assert.equal(timedEvaluation.mock.callCount(), 0);
  assertConditionalRowSignals(engine, [false, true, false, true]);
});

function cardinalityEngine(group) {
  return new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/repeat-cardinality',
    version: '1.0.0',
    title: 'Repeat Cardinality',
    items: [
      {
        key: 'orders',
        type: 'group',
        label: 'Orders',
        repeatable: true,
        ...group,
        children: [
          { key: 'ref', type: 'field', dataType: 'string', label: 'Ref' },
          {
            key: 'lines',
            type: 'group',
            label: 'Lines',
            repeatable: true,
            minRepeat: 1,
            maxRepeat: 1,
            children: [{ key: 'sku', type: 'field', dataType: 'string', label: 'SKU' }],
          },
        ],
      },
    ],
  });
}

test('repeat pre-populates minRepeat instances', () => {
  assert.equal(cardinalityEngine({ minRepeat: 2 }).repeats.orders.value, 2);
});

test('repeat starts with zero instances when minRepeat is absent (Core §4.2.2 default 0)', () => {
  const engine = cardinalityEngine({});

  assert.equal(engine.repeats.orders.value, 0);
  assert.equal(engine.signals['orders[0].ref'], undefined);
  assert.deepEqual(engine.getValidationReport().results.filter((r) => r.constraintKind === 'cardinality'), []);

  assert.equal(engine.addRepeatInstance('orders'), 0);
  assert.equal(engine.repeats['orders[0].lines'].value, 1, 'nested minRepeat still pre-populates');
});

test('addRepeatInstance refuses to add beyond maxRepeat and returns undefined', () => {
  const engine = cardinalityEngine({ minRepeat: 0, maxRepeat: 2 });

  assert.equal(engine.addRepeatInstance('orders'), 0);
  assert.equal(engine.addRepeatInstance('orders'), 1);
  const structureVersion = engine.structureVersion.value;

  assert.equal(engine.addRepeatInstance('orders'), undefined);
  assert.equal(engine.repeats.orders.value, 2);
  assert.equal(engine.signals['orders[2].ref'], undefined);
  assert.equal(engine.structureVersion.value, structureVersion);
  assert.equal(engine.getValidationReport().results.some((r) => r.code === 'MAX_REPEAT'), false);

  assert.equal(engine.addRepeatInstance('orders[1].lines'), undefined, 'nested maxRepeat enforced per instance');
  assert.equal(engine.repeats['orders[1].lines'].value, 1);

  const replayed = engine.applyReplayEvent({ type: 'addRepeatInstance', path: 'orders' });
  assert.equal(replayed.ok, true);
  assert.equal(replayed.output, undefined);
});

test('loadResponseData keeps every loaded row so over- and under-limit data reports cardinality', () => {
  const engine = cardinalityEngine({ minRepeat: 2, maxRepeat: 2 });
  engine.setValue('orders[0].ref', 'stale');

  engine.loadResponseData({
    orders: [
      { ref: 'A', lines: [{ sku: 'a1' }] },
      { ref: 'B', lines: [] },
      { ref: 'C', lines: [{ sku: 'c1' }, { sku: 'c2' }] },
    ],
    unknownKey: 'ignored',
  });

  assert.equal(engine.repeats.orders.value, 3);
  assert.deepEqual(
    ['orders[0].ref', 'orders[1].ref', 'orders[2].ref', 'orders[0].lines[0].sku', 'orders[2].lines[1].sku']
      .map((path) => engine.signals[path].value),
    ['A', 'B', 'C', 'a1', 'c2'],
  );
  assert.equal(engine.repeats['orders[1].lines'].value, 0);
  assert.equal(engine.repeats['orders[2].lines'].value, 2);

  const cardinality = engine.getValidationReport().results
    .filter((r) => r.constraintKind === 'cardinality')
    .map((r) => `${r.code}@${r.path}`)
    .sort();
  assert.deepEqual(cardinality, ['MAX_REPEAT@orders', 'MAX_REPEAT@orders[2].lines', 'MIN_REPEAT@orders[1].lines']);

  engine.loadResponseData({ orders: [{ ref: 'only' }] });
  assert.equal(engine.repeats.orders.value, 1);
  assert.equal(engine.signals['orders[0].ref'].value, 'only');
  assert.equal(engine.signals['orders[1].ref'], undefined);
  // A resumed row uses its saved children, even if the old session had more.
  assert.equal(engine.repeats['orders[0].lines'].value, 0);
});

test('row removal preserves prior relevance and validation for surviving rows', () => {
  const engine = new FormEngine({
    $formspec: '1.0', url: 'urn:test:row-history', version: '1.0.0',
    items: [{ key: 'rows', type: 'group', repeatable: true, children: [
      { key: 'show', type: 'field', dataType: 'boolean' },
      { key: 'detail', type: 'field', dataType: 'string' },
      { key: 'answer', type: 'field', dataType: 'string' },
      { key: 'ok', type: 'field', dataType: 'boolean' },
    ] }],
    binds: [
      { path: 'rows.detail', relevant: '$show', default: 'DEFAULTED' },
      { path: 'rows.answer', required: 'true' },
      { path: 'rows.ok', calculate: 'valid($answer)' },
    ],
  }, { responseData: { rows: [
    { show: false, answer: 'first' }, { show: true, detail: '', answer: '' },
  ] } });
  try {
    engine.removeRepeatInstance('rows', 0);
    assert.equal(engine.signals['rows[0].detail'].value, '');
    assert.equal(engine.signals['rows[0].ok'].value, false);
  } finally { engine.dispose(); }
});

test('row removal reindexes the previous findings used by valid() in a Shape', () => {
  const engine = new FormEngine({
    $formspec: '1.0', url: 'urn:test:row-validation-history', version: '1.0.0',
    items: [{ key: 'rows', type: 'group', repeatable: true, children: [
      { key: 'answer', type: 'field', dataType: 'string' },
    ] }],
    binds: [{ path: 'rows.answer', required: 'true' }],
    shapes: [{ id: 'previousError', target: 'rows[*].answer', severity: 'warning',
      activeWhen: 'valid($answer) = false', constraint: 'false', message: 'Previous error' }],
  }, { responseData: { rows: [{ answer: 'first' }, { answer: '' }] } });
  try {
    engine.removeRepeatInstance('rows', 0);
    assert.deepEqual(engine.shapeResults.previousError.value.map(result => result.path), ['rows[0].answer']);
  } finally { engine.dispose(); }
});

test('row removal publishes shifted calculations and external findings with the new structure', () => {
  const engine = createRepeatEngine();
  engine.addRepeatInstance('rows');
  engine.setValue('rows[1].qty', 3);
  engine.setValue('rows[1].price', 7);
  engine.injectExternalValidation(['rows[0]', 'rows[1]'].map(path => ({
    path, severity: 'error', code: 'EXT', message: 'Review this row',
  })));
  const snapshots = [];
  const unsubscribe = engine.structureVersion.subscribe(() => {
    snapshots.push({
      count: engine.repeats.rows.value,
      total: engine.signals['rows[0].total'].value,
      findings: (engine.validationResults['rows[0]']?.value ?? []).map(result => result.code),
    });
  });
  try {
    engine.removeRepeatInstance('rows', 0);
    assert.deepEqual(snapshots.slice(1), [{ count: 1, total: 21, findings: ['EXT'] }]);
    assert.deepEqual(engine.validationResults['rows[0]'].value.map(result => result.code), ['EXT']);
    assert.equal(engine.validationResults['rows[1]'], undefined);
  } finally { unsubscribe(); engine.dispose(); }
});
