/** @filedesc FEL completeness and variables: valid() reactive updates and variable reference resolution */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

test('should update valid() dependent calculations when required field validity changes', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Valid Test',
    items: [
      { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
      { key: 'status', type: 'field', dataType: 'string', label: 'Status' }
    ],
    binds: [
      { path: 'email', required: true },
      { path: 'status', calculate: "if valid($email) then 'ok' else 'missing'" }
    ]
  });

  const statusWhenEmpty = engine.signals.status.value;
  engine.setValue('email', 'test@example.com');
  const statusWhenFilled = engine.signals.status.value;

  assert.equal(statusWhenEmpty, 'missing');
  assert.equal(statusWhenFilled, 'ok');
});

test('should expose repeat instance count via @count when repeat groups change size', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Count Test',
    items: [
      {
        key: 'items',
        type: 'group',
        label: 'Items',
        repeatable: true,
        minRepeat: 2,
        children: [
          { key: 'label', type: 'field', dataType: 'string', label: 'Label' },
          { key: 'position', type: 'field', dataType: 'string', label: 'Position' }
        ]
      },
      { key: 'total', type: 'field', dataType: 'string', label: 'Total' }
    ],
    binds: [
      { path: 'items[*].position', calculate: "string(@index) & ' of ' & string(@count)" },
      // Count rows explicitly, including rows with no label (Core §3.2.2).
      { path: 'total', calculate: 'string(count($items[*]))' }
    ]
  });

  assert.equal(engine.signals['items[0].position'].value, '1 of 2');
  assert.equal(engine.signals['items[1].position'].value, '2 of 2');

  engine.addRepeatInstance('items');

  assert.equal(engine.signals['items[2].position'].value, '3 of 3');
  assert.equal(engine.signals.total.value, '3');
});

test('should count matching elements when countWhere predicate expressions are evaluated', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'CountWhere Test',
    items: [
      {
        key: 'rows',
        type: 'group',
        label: 'Rows',
        repeatable: true,
        minRepeat: 3,
        children: [{ key: 'score', type: 'field', dataType: 'integer', label: 'Score' }]
      },
      { key: 'passing', type: 'field', dataType: 'integer', label: 'Passing' }
    ],
    // Core §3.2.2 requires a wildcard to read scores across rows.
    binds: [{ path: 'passing', calculate: 'countWhere($rows[*].score, $ >= 50)' }]
  });

  engine.setValue('rows[0].score', 80);
  engine.setValue('rows[1].score', 30);
  engine.setValue('rows[2].score', 50);

  assert.equal(engine.signals.passing.value, 2);
});

test('should compute and reference variables via @name when dependent fields change', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Variables Test',
    items: [
      { key: 'price', type: 'field', dataType: 'decimal', label: 'Price', initialValue: 100 },
      { key: 'qty', type: 'field', dataType: 'integer', label: 'Qty', initialValue: 3 },
      { key: 'display', type: 'field', dataType: 'decimal', label: 'Display' }
    ],
    variables: [
      { name: 'taxRate', expression: '0.15' },
      { name: 'subtotal', expression: 'price * qty' },
      { name: 'total', expression: '@subtotal * (1 + @taxRate)' }
    ],
    binds: [{ path: 'display', calculate: '@total' }]
  });

  assert.equal(engine.signals.display.value, 345);

  engine.setValue('qty', 5);
  assert.equal(engine.signals.display.value, 575);
});

test('should resolve scoped variables from nearest lexical scope when evaluating group fields', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Scoped Variables Test',
    items: [
      { key: 'rate', type: 'field', dataType: 'decimal', label: 'Rate', initialValue: 0.1 },
      {
        key: 'order',
        type: 'group',
        label: 'Order',
        children: [
          { key: 'amount', type: 'field', dataType: 'decimal', label: 'Amount', initialValue: 200 },
          { key: 'tax', type: 'field', dataType: 'decimal', label: 'Tax' }
        ]
      }
    ],
    variables: [
      { name: 'globalRate', expression: 'rate' },
      { name: 'localTax', expression: 'amount * @globalRate', scope: 'order' }
    ],
    binds: [{ path: 'order.tax', calculate: '@localTax' }]
  });

  assert.equal(engine.signals['order.tax'].value, 20);
});

test('should not expose a scoped variable outside its scope', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Scoped Visibility Test',
    items: [
      {
        key: 'order',
        type: 'group',
        label: 'Order',
        children: [
          { key: 'amount', type: 'field', dataType: 'decimal', label: 'Amount', initialValue: 200 },
          { key: 'tax', type: 'field', dataType: 'decimal', label: 'Tax' }
        ]
      },
      { key: 'summaryTax', type: 'field', dataType: 'decimal', label: 'Summary Tax' }
    ],
    variables: [{ name: 'localTax', expression: 'amount * 0.1', scope: 'order' }],
    binds: [
      { path: 'order.tax', calculate: '@localTax' },
      { path: 'summaryTax', calculate: '@localTax' }
    ]
  });

  assert.equal(engine.signals['order.tax'].value, 20);
  assert.equal(engine.signals.summaryTax.value, null);
});

test('should resolve scoped variables for repeat descendants using lexical scope ancestry', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Scoped Repeat Lookup Test',
    items: [
      {
        key: 'items',
        type: 'group',
        label: 'Items',
        repeatable: true,
        minRepeat: 2,
        children: [
          { key: 'amount', type: 'field', dataType: 'decimal', label: 'Amount' },
          { key: 'fee', type: 'field', dataType: 'decimal', label: 'Fee' }
        ]
      }
    ],
    variables: [{ name: 'rowRate', expression: '0.2', scope: 'items' }],
    binds: [{ path: 'items[*].fee', calculate: 'amount * @rowRate' }]
  });

  engine.setValue('items[0].amount', 100);
  engine.setValue('items[1].amount', 50);

  assert.equal(engine.signals['items[0].fee'].value, 20);
  assert.equal(engine.signals['items[1].fee'].value, 10);
});

test('should throw an error when variable definitions contain circular dependencies', () => {
  assert.throws(
    () =>
      new FormEngine({
        $formspec: '1.0',
        url: 'http://example.org/test',
        version: '1.0.0',
        title: 'Circular Var Test',
        items: [{ key: 'x', type: 'field', dataType: 'integer', label: 'X' }],
        variables: [
          { name: 'a', expression: '@b + 1' },
          { name: 'b', expression: '@a + 1' }
        ]
      }),
    /Circular variable dependency/
  );
});

test('should block cyclical calculate dependencies when definition fields reference each other', () => {
  assert.throws(
    () =>
      new FormEngine({
        $formspec: '1.0',
        url: 'http://example.org/test',
        version: '1.0.0',
        title: 'Cyclic Calculate Test',
        binds: [{ path: 'a', calculate: 'b * 2' }, { path: 'b', calculate: 'a * 2' }],
        items: [
          { type: 'field', dataType: 'number', key: 'a', label: 'A' },
          { type: 'field', dataType: 'number', key: 'b', label: 'B' }
        ]
      }),
    /Cyclic dependency detected/
  );
});
