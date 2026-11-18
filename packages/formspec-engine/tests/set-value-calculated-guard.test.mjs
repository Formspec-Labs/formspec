/** @filedesc setValue calculated guard: calling setValue on a calculated field is silently ignored without errors */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

test('setValue on a calculated field should not crash', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Calculated Guard Test',
    items: [
      { key: 'price', type: 'field', dataType: 'decimal', label: 'Price' },
      { key: 'qty', type: 'field', dataType: 'integer', label: 'Qty' },
      { key: 'total', type: 'field', dataType: 'decimal', label: 'Total' },
    ],
    binds: [
      { path: 'total', calculate: '$price * $qty' },
    ],
  });

  engine.setValue('price', 10);
  engine.setValue('qty', 3);

  // total should be computed, not overwritten
  assert.equal(engine.signals.total.value, 30);

  // This is the bug: setValue on a calculated field crashes
  assert.doesNotThrow(() => engine.setValue('total', 999));

  // Calculated value should remain unchanged — the write was rejected
  assert.equal(engine.signals.total.value, 30);
});

test('setValue on a calculated field inside a repeat group should not crash', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Repeat Calculated Guard Test',
    items: [
      {
        key: 'items',
        type: 'group',
        label: 'Line Items',
        repeatable: true,
        minRepeat: 1,
        children: [
          { key: 'price', type: 'field', dataType: 'decimal', label: 'Price' },
          { key: 'qty', type: 'field', dataType: 'integer', label: 'Qty' },
          { key: 'subtotal', type: 'field', dataType: 'decimal', label: 'Subtotal' },
        ],
      },
    ],
    binds: [
      { path: 'items[*].subtotal', calculate: '$price * $qty' },
    ],
  });

  engine.setValue('items[0].price', 5);
  engine.setValue('items[0].qty', 4);
  assert.equal(engine.signals['items[0].subtotal'].value, 20);

  // Attempt to overwrite calculated field in repeat — should not crash
  assert.doesNotThrow(() => engine.setValue('items[0].subtotal', 999));
  assert.equal(engine.signals['items[0].subtotal'].value, 20);
});

test('setValue on calculated then non-calculated fields in sequence should work normally', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Mixed setValue Test',
    items: [
      { key: 'a', type: 'field', dataType: 'integer', label: 'A' },
      { key: 'b', type: 'field', dataType: 'integer', label: 'B' },
      { key: 'sum', type: 'field', dataType: 'integer', label: 'Sum' },
    ],
    binds: [
      { path: 'sum', calculate: '$a + $b' },
    ],
  });

  // Write to calculated — should silently skip
  assert.doesNotThrow(() => engine.setValue('sum', 100));

  // Write to normal fields — should work
  engine.setValue('a', 7);
  engine.setValue('b', 3);
  assert.equal(engine.signals.sum.value, 10);
  assert.equal(engine.signals.a.value, 7);
  assert.equal(engine.signals.b.value, 3);
});

test('setValue on a field with inline calculate property should not crash', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Inline Calculate Test',
    binds: [{ path: 'doubled', calculate: '$x * 2' }],
    items: [
      { key: 'x', type: 'field', dataType: 'integer', label: 'X' },
      { key: 'doubled', type: 'field', dataType: 'integer', label: 'Doubled' },
    ],
  });

  engine.setValue('x', 5);
  assert.equal(engine.signals.doubled.value, 10);

  // Inline calculate produces the same computed signal — should not crash
  assert.doesNotThrow(() => engine.setValue('doubled', 42));
  assert.equal(engine.signals.doubled.value, 10);
});

test('setValue with calculated field and precision should not crash', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Calculated Precision Test',
    items: [
      { key: 'rate', type: 'field', dataType: 'decimal', label: 'Rate' },
      { key: 'hours', type: 'field', dataType: 'decimal', label: 'Hours' },
      { key: 'total', type: 'field', dataType: 'decimal', label: 'Total' },
    ],
    binds: [
      { path: 'total', calculate: '$rate * $hours', precision: 2 },
    ],
  });

  engine.setValue('rate', 15.5);
  engine.setValue('hours', 3.333);
  // 15.5 * 3.333 = 51.6615, rounded to 51.66
  assert.equal(engine.signals.total.value, 51.66);

  // Should not crash when trying to set a calculated+precision field
  assert.doesNotThrow(() => engine.setValue('total', 100));
  assert.equal(engine.signals.total.value, 51.66);
});

test('setValue on a readonly (non-calculated) field should succeed', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Readonly Guard Test',
    items: [
      { key: 'status', type: 'field', dataType: 'string', label: 'Status' },
      { key: 'notes', type: 'field', dataType: 'string', label: 'Notes' },
    ],
    binds: [
      { path: 'status', readonly: 'true' },
    ],
  });

  // A readonly bind does NOT make a signal computed — it's still writable.
  // The isWritableSignal guard only blocks calculated (computed) signals.
  engine.setValue('status', 'approved');
  assert.equal(engine.signals.status.value, 'approved');

  engine.setValue('status', 'rejected');
  assert.equal(engine.signals.status.value, 'rejected');
});
