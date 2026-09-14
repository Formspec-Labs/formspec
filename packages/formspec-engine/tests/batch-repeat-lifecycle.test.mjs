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
  assert.equal(engine.repeats['orders[0].lines'].value, 1, 'rows kept from before load keep their nested state');
});
