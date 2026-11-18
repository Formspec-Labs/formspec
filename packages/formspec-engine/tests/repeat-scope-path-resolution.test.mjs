/**
 * Core §3.2.2 resolves an unqualified sibling key within its enclosing repeat row.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Single-level repeat group with a calculated field using sibling fields */
function singleRepeatDefinition() {
  return {
    $formspec: '1.0',
    url: 'http://example.org/repeat-scope',
    version: '1.0.0',
    title: 'Repeat Scope',
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

/** Nested repeat groups with sibling references */
function nestedRepeatDefinition() {
  return {
    $formspec: '1.0',
    url: 'http://example.org/nested-scope',
    version: '1.0.0',
    title: 'Nested Scope',
    items: [
      {
        key: 'orders',
        type: 'group',
        label: 'Orders',
        repeatable: true,
        minRepeat: 1,
        children: [
          { key: 'discount', type: 'field', dataType: 'decimal', label: 'Discount %' },
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
        // Read the fields declared in the innermost row.
        path: 'orders[*].items[*].line_total',
        calculate: '$qty * $unit_price',
        readonly: 'true',
      },
    ],
  };
}

/** Nested repeat: inner field references outer group's field through the enclosing scope */
function crossLevelDefinition() {
  return {
    $formspec: '1.0',
    url: 'http://example.org/cross-level',
    version: '1.0.0',
    title: 'Cross Level',
    items: [
      {
        key: 'orders',
        type: 'group',
        label: 'Orders',
        repeatable: true,
        minRepeat: 1,
        children: [
          { key: 'discount_pct', type: 'field', dataType: 'decimal', label: 'Discount %' },
          {
            key: 'items',
            type: 'group',
            label: 'Items',
            repeatable: true,
            minRepeat: 1,
            children: [
              { key: 'qty', type: 'field', dataType: 'integer', label: 'Qty' },
              { key: 'unit_price', type: 'field', dataType: 'decimal', label: 'Unit Price' },
              { key: 'discounted_total', type: 'field', dataType: 'decimal', label: 'Discounted Total' },
            ],
          },
        ],
      },
    ],
    binds: [
      {
        // Read the discount field declared in the outer row.
        path: 'orders[*].items[*].discounted_total',
        calculate: '$qty * $unit_price * (1 - $discount_pct / 100)',
        readonly: 'true',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: Single-level repeat with sibling field references
// ---------------------------------------------------------------------------

test('sibling field resolves to same instance in single repeat', () => {
  const engine = new FormEngine(singleRepeatDefinition());

  engine.setValue('line_items[0].qty', 3);
  engine.setValue('line_items[0].price', 10);

  assert.equal(
    engine.signals['line_items[0].total'].value,
    30,
    '$qty should resolve to line_items[0].qty within instance 0'
  );
});

test('sibling field resolves independently per instance', () => {
  const engine = new FormEngine(singleRepeatDefinition());

  engine.setValue('line_items[0].qty', 3);
  engine.setValue('line_items[0].price', 10);

  engine.addRepeatInstance('line_items');
  engine.setValue('line_items[1].qty', 5);
  engine.setValue('line_items[1].price', 20);

  assert.equal(engine.signals['line_items[0].total'].value, 30);
  assert.equal(engine.signals['line_items[1].total'].value, 100);
});

// ---------------------------------------------------------------------------
// Scenario 2: Nested repeats with inner sibling refs
// ---------------------------------------------------------------------------

test('inner sibling field resolves within nested repeat', () => {
  const engine = new FormEngine(nestedRepeatDefinition());

  engine.setValue('orders[0].items[0].qty', 4);
  engine.setValue('orders[0].items[0].unit_price', 25);

  assert.equal(
    engine.signals['orders[0].items[0].line_total'].value,
    100,
    '$qty should resolve to orders[0].items[0].qty'
  );
});

test('inner sibling refs resolve independently across outer instances', () => {
  const engine = new FormEngine(nestedRepeatDefinition());

  engine.setValue('orders[0].items[0].qty', 2);
  engine.setValue('orders[0].items[0].unit_price', 10);

  engine.addRepeatInstance('orders');
  engine.setValue('orders[1].items[0].qty', 3);
  engine.setValue('orders[1].items[0].unit_price', 20);

  assert.equal(engine.signals['orders[0].items[0].line_total'].value, 20);
  assert.equal(engine.signals['orders[1].items[0].line_total'].value, 60);
});

// ---------------------------------------------------------------------------
// Scenario 3: Cross-level references (inner -> outer group field)
// ---------------------------------------------------------------------------

test('cross-level $outer_group.field resolves to enclosing instance', () => {
  const engine = new FormEngine(crossLevelDefinition());

  engine.setValue('orders[0].discount_pct', 10);
  engine.setValue('orders[0].items[0].qty', 2);
  engine.setValue('orders[0].items[0].unit_price', 100);

  assert.equal(
    engine.signals['orders[0].items[0].discounted_total'].value,
    180,
    '2 * 100 * (1 - 10/100) = 180'
  );
});

test('cross-level refs resolve to correct outer instance when multiple exist', () => {
  const engine = new FormEngine(crossLevelDefinition());

  engine.setValue('orders[0].discount_pct', 10);
  engine.setValue('orders[0].items[0].qty', 2);
  engine.setValue('orders[0].items[0].unit_price', 100);

  engine.addRepeatInstance('orders');
  engine.setValue('orders[1].discount_pct', 50);
  engine.setValue('orders[1].items[0].qty', 2);
  engine.setValue('orders[1].items[0].unit_price', 100);

  assert.equal(
    engine.signals['orders[0].items[0].discounted_total'].value,
    180,
    'order 0: 2 * 100 * 0.9 = 180'
  );
  assert.equal(
    engine.signals['orders[1].items[0].discounted_total'].value,
    100,
    'order 1: 2 * 100 * 0.5 = 100'
  );
});

// ---------------------------------------------------------------------------
// Scenario 4: Bare sibling refs still work (regression guard)
// ---------------------------------------------------------------------------

test('bare $field refs still resolve as siblings in repeat group', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/bare-ref',
    version: '1.0.0',
    title: 'Bare Ref',
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
          { key: 'c', type: 'field', dataType: 'decimal', label: 'C' },
        ],
      },
    ],
    binds: [{ path: 'rows[*].c', calculate: '$a + $b', readonly: 'true' }],
  });

  engine.setValue('rows[0].a', 3);
  engine.setValue('rows[0].b', 7);

  assert.equal(engine.signals['rows[0].c'].value, 10);
});

// ---------------------------------------------------------------------------
// Scenario 5: Relevance with sibling field
// ---------------------------------------------------------------------------

test('relevance condition using a sibling field works in repeat', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/relevant-scope',
    version: '1.0.0',
    title: 'Relevant Scope',
    items: [
      {
        key: 'rows',
        type: 'group',
        label: 'Rows',
        repeatable: true,
        minRepeat: 1,
        children: [
          { key: 'show_detail', type: 'field', dataType: 'boolean', label: 'Show' },
          { key: 'detail', type: 'field', dataType: 'string', label: 'Detail' },
        ],
      },
    ],
    binds: [
      { path: 'rows[*].detail', relevant: '$show_detail = true' },
    ],
  });

  // Instance 0: show_detail = true
  engine.setValue('rows[0].show_detail', true);
  // Instance 1: show_detail = false
  engine.addRepeatInstance('rows');
  engine.setValue('rows[1].show_detail', false);

  assert.equal(
    engine.relevantSignals['rows[0].detail'].value,
    true,
    'detail visible when show_detail is true in same instance'
  );
  assert.equal(
    engine.relevantSignals['rows[1].detail'].value,
    false,
    'detail hidden when show_detail is false in same instance'
  );
});
