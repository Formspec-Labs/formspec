/**
 * Repeat Group Reactive Dependency Tracking
 *
 * Verifies that computed fields inside repeat groups reactively update
 * when their sibling field dependencies change. This targets the
 * parentPath construction in compileFEL which resolves relative
 * field references for signal subscription.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { effect } from '@preact/signals-core';
import { FormEngine } from '../dist/index.js';

/**
 * Minimal repeat group definition with a calculated field that depends
 * on a sibling field via relative reference.
 */
function makeDefinition() {
  return {
    $formspec: '1.0',
    url: 'http://example.org/repeat-reactive',
    version: '1.0.0',
    title: 'Repeat Reactive',
    items: [
      {
        key: 'line_items',
        type: 'group',
        label: 'Line Items',
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
      {
        path: 'line_items[*].total',
        calculate: '$qty * $price',
        readonly: 'true',
      },
    ],
  };
}

test('computed field in repeat group reactively updates when sibling dependency changes', () => {
  const engine = new FormEngine(makeDefinition());

  engine.setValue('line_items[0].qty', 2);
  engine.setValue('line_items[0].price', 10);

  const total1 = engine.signals['line_items[0].total'].value;
  assert.equal(total1, 20, 'initial total should be 2 * 10 = 20');

  engine.setValue('line_items[0].qty', 5);

  const total2 = engine.signals['line_items[0].total'].value;
  assert.equal(total2, 50, 'total should reactively update to 5 * 10 = 50');
});

test('computed field reactively updates across multiple repeat instances', () => {
  const engine = new FormEngine(makeDefinition());

  engine.setValue('line_items[0].qty', 3);
  engine.setValue('line_items[0].price', 7);

  engine.addRepeatInstance('line_items');
  engine.setValue('line_items[1].qty', 4);
  engine.setValue('line_items[1].price', 8);

  assert.equal(engine.signals['line_items[0].total'].value, 21);
  assert.equal(engine.signals['line_items[1].total'].value, 32);

  engine.setValue('line_items[1].price', 10);

  assert.equal(engine.signals['line_items[0].total'].value, 21, 'instance 0 total unchanged');
  assert.equal(engine.signals['line_items[1].total'].value, 40, 'instance 1 total reactively updated');
});

test('nested repeat group computed field reactively tracks sibling dependency', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/nested-reactive',
    version: '1.0.0',
    title: 'Nested Reactive',
    items: [
      {
        key: 'orders',
        type: 'group',
        label: 'Orders',
        repeatable: true,
        minRepeat: 1,
        children: [
          {
            key: 'items',
            type: 'group',
            label: 'Items',
            repeatable: true,
            minRepeat: 1,
            children: [
              { key: 'qty', type: 'field', dataType: 'integer', label: 'Qty' },
              { key: 'unit_price', type: 'field', dataType: 'decimal', label: 'Unit Price' },
              { key: 'line_total', type: 'field', dataType: 'decimal', label: 'Line Total' },
            ],
          },
        ],
      },
    ],
    binds: [
      {
        path: 'orders[*].items[*].line_total',
        calculate: '$qty * $unit_price',
        readonly: 'true',
      },
    ],
  });

  engine.setValue('orders[0].items[0].qty', 2);
  engine.setValue('orders[0].items[0].unit_price', 15);

  const lt1 = engine.signals['orders[0].items[0].line_total'].value;
  assert.equal(lt1, 30, 'initial nested line_total = 2 * 15 = 30');

  engine.setValue('orders[0].items[0].qty', 6);

  const lt2 = engine.signals['orders[0].items[0].line_total'].value;
  assert.equal(lt2, 90, 'nested line_total should reactively update to 6 * 15 = 90');
});

/**
 * Tests that effect-based observation (like a UI render loop) picks up
 * reactive changes to computed fields inside repeat groups.
 *
 * This is stronger than polling .value — it proves the signal graph
 * actually fires notifications to subscribers.
 */
test('effect observing repeat group computed field fires on sibling dependency change', () => {
  const engine = new FormEngine(makeDefinition());

  engine.setValue('line_items[0].qty', 2);
  engine.setValue('line_items[0].price', 10);

  const observed = [];
  const dispose = effect(() => {
    observed.push(engine.signals['line_items[0].total'].value);
  });

  // After effect setup, should have captured the initial value
  assert.equal(observed.length, 1);
  assert.equal(observed[0], 20);

  // Change dependency
  engine.setValue('line_items[0].qty', 7);

  // Effect should have fired with new value
  assert.equal(observed.length, 2);
  assert.equal(observed[1], 70, 'effect fires with updated total = 7 * 10');

  // Another change
  engine.setValue('line_items[0].price', 3);
  assert.equal(observed.length, 3);
  assert.equal(observed[2], 21, 'effect fires with updated total = 7 * 3');

  dispose();
});

test('cycle detection works through repeat group dependencies', () => {
  // A -> B -> A cycle within a repeat group should be detected
  assert.throws(
    () => new FormEngine({
      $formspec: '1.0',
      url: 'http://example.org/cycle',
      version: '1.0.0',
      title: 'Cycle',
      items: [
        {
          key: 'rows',
          type: 'group',
          label: 'Rows',
          repeatable: true,
          minRepeat: 1,
          children: [
            { key: 'a', type: 'field', dataType: 'decimal', label: 'A' },
            { key: 'b', type: 'field', dataType: 'decimal', label: 'B' },
          ],
        },
      ],
      binds: [
        { path: 'rows[*].a', calculate: '$b + 1' },
        { path: 'rows[*].b', calculate: '$a + 1' },
      ],
    }),
    /[Cc]yclic dependency/,
    'should detect cycle between repeat group fields'
  );
});

function calculationDefinition(binds) {
  return {
    $formspec: '1.0', url: 'urn:test:calculation-dependencies', version: '1.0.0',
    title: 'Repeat calculation dependencies',
    items: [{
      key: 'rows', type: 'group', label: 'Rows', repeatable: true,
      children: ['a', 'b'].map(key => ({ key, type: 'field', label: key, dataType: 'integer' })),
    }],
    binds,
  };
}

test('calculation dependencies check actual rows on create, resume, and add', () => {
  const definition = calculationDefinition([
    { path: 'rows[*].a', calculate: '(prev().b ?? 0) + 1' },
    { path: 'rows[*].b', calculate: '(next().a ?? 0) + 1' },
  ]);
  for (const options of [{ responseData: { rows: [{}, {}] } }, { savedResponseData: { rows: [{}, {}] } }]) {
    assert.throws(() => new FormEngine(definition, options), /Cyclic dependency.*rows\[0\]\.b.*rows\[1\]\.a/);
  }
  const engine = new FormEngine(definition, { savedResponseData: { rows: [{}] } });
  assert.equal(engine.signals['rows[0].a'].value, 1);
  engine.addRepeatInstance('rows');
  assert.ok(engine.getValidationReport().results.some(result => result.code === 'CIRCULAR_DEPENDENCY'));
  engine.removeRepeatInstance('rows', 1);
  assert.ok(engine.getValidationReport().valid);
  engine.dispose();
});

test('calculation dependencies present the indexed writer only in its target row', () => {
  const definition = calculationDefinition([
    { path: 'rows[@index = 2].a', calculate: '$rows[1].a + 1' },
  ]);
  const engine = new FormEngine(definition, { savedResponseData: { rows: [{ a: 7 }, { a: 99 }] } });
  assert.equal(engine.signals['rows[0].a'].value, 7);
  assert.equal(engine.signals['rows[1].a'].value, 8);
  engine.setValue('rows[0].a', 12);
  assert.equal(engine.signals['rows[1].a'].value, 13);
  assert.deepEqual(engine.getDraftSnapshot().data.rows, [{ a: 12 }, {}]);
  engine.removeRepeatInstance('rows', 0);
  assert.equal(engine.signals['rows[0].a'].value, null);
  engine.dispose();
});

test('a row-specific default is stored only in the targeted draft row', () => {
  const definition = calculationDefinition([
    { path: 'rows[@index = 2].a', relevant: '$b > 0', default: 5 },
  ]);
  const engine = new FormEngine(definition, { savedResponseData: { rows: [{ b: 0 }, { b: 0 }] } });
  engine.setValue('rows[0].b', 1);
  engine.setValue('rows[1].b', 1);
  assert.equal(engine.signals['rows[0].a'].value, null);
  assert.equal(engine.signals['rows[1].a'].value, 5);
  assert.deepEqual(engine.getDraftSnapshot().data.rows, [{ b: 1 }, { a: 5, b: 1 }]);
  engine.dispose();
});
