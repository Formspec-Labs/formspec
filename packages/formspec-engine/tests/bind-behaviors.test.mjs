/** @filedesc Bind behaviors: whitespace normalization, readonly, and other field-level bind semantics */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

test('should normalize whitespace according to bind configuration when values are set', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Whitespace Test',
    items: [
      { key: 'trimField', type: 'field', dataType: 'string', label: 'Trim' },
      { key: 'normalizeField', type: 'field', dataType: 'string', label: 'Normalize' },
      { key: 'removeField', type: 'field', dataType: 'string', label: 'Remove' }
    ],
    binds: [
      { path: 'trimField', whitespace: 'trim' },
      { path: 'normalizeField', whitespace: 'normalize' },
      { path: 'removeField', whitespace: 'remove' }
    ]
  });

  engine.setValue('trimField', '  hello  ');
  engine.setValue('normalizeField', '  hello   world  ');
  engine.setValue('removeField', ' h e l l o ');

  assert.equal(engine.signals.trimField.value, 'hello');
  assert.equal(engine.signals.normalizeField.value, 'hello world');
  assert.equal(engine.signals.removeField.value, 'hello');
});

test('should round numeric values to configured precision when setting decimal fields', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Precision Test',
    items: [{ key: 'amount', type: 'field', dataType: 'decimal', label: 'Amount' }],
    binds: [{ path: 'amount', precision: 2 }]
  });

  engine.setValue('amount', 12.3456);
  assert.equal(engine.signals.amount.value, 12.35);
});

test('should apply remove empty and keep modes when generating responses for non-relevant fields', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'NRB Test',
    items: [
      { key: 'show', type: 'field', dataType: 'boolean', label: 'Show' },
      { key: 'removedField', type: 'field', dataType: 'string', label: 'Removed', initialValue: 'val1' },
      { key: 'emptiedField', type: 'field', dataType: 'string', label: 'Emptied', initialValue: 'val2' },
      { key: 'keptField', type: 'field', dataType: 'string', label: 'Kept', initialValue: 'val3' }
    ],
    binds: [
      { path: 'removedField', relevant: 'show == true', nonRelevantBehavior: 'remove' },
      { path: 'emptiedField', relevant: 'show == true', nonRelevantBehavior: 'empty' },
      { path: 'keptField', relevant: 'show == true', nonRelevantBehavior: 'keep' }
    ]
  });

  const response = engine.getResponse();
  assert.equal(response.data.removedField, undefined);
  assert.equal(response.data.emptiedField, null);
  assert.equal(response.data.keptField, 'val3');
});

test('should resolve item options from optionSets when optionSet is referenced', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'OptionSet Test',
    items: [
      { key: 'country', type: 'field', dataType: 'choice', label: 'Country', optionSet: 'countries' }
    ],
    optionSets: {
      countries: [
        { value: 'us', label: 'United States' },
        { value: 'uk', label: 'United Kingdom' },
        { value: 'ca', label: 'Canada' }
      ]
    }
  });

  const [country] = engine.getDefinition().items;
  assert.equal(country.options.length, 3);
  assert.equal(country.options[0].label, 'United States');
  assert.equal(country.options[0].value, 'us');
});

test('should return the configured disabledDisplay mode when querying field display behavior', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'DisabledDisplay Test',
    items: [
      { key: 'fieldA', type: 'field', dataType: 'string', label: 'A' },
      { key: 'fieldB', type: 'field', dataType: 'string', label: 'B' }
    ],
    binds: [
      { path: 'fieldA', disabledDisplay: 'protected' },
      { path: 'fieldB' }
    ]
  });

  assert.equal(engine.getDisabledDisplay('fieldA'), 'protected');
  assert.equal(engine.getDisabledDisplay('fieldB'), 'hidden');
});

test('a calculate Bind makes its field readonly unless readonly is explicit (Core §4.3.1)', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/calculate-readonly',
    version: '1.0.0',
    title: 'Calculate Readonly',
    items: [
      { key: 'qty', type: 'field', dataType: 'integer', label: 'Qty' },
      { key: 'total', type: 'field', dataType: 'integer', label: 'Total' },
      { key: 'override', type: 'field', dataType: 'integer', label: 'Override' },
      {
        key: 'rows', type: 'group', label: 'Rows', repeatable: true, minRepeat: 1,
        children: [{ key: 'double', type: 'field', dataType: 'integer', label: 'Double' }]
      }
    ],
    binds: [
      { path: 'total', calculate: '$qty * 2' },
      { path: 'override', calculate: '$qty * 3', readonly: 'false' },
      { path: 'rows[*].double', calculate: '$qty * 2' }
    ]
  });

  assert.equal(engine.readonlySignals.qty.value, false);
  assert.equal(engine.readonlySignals.total.value, true);
  assert.equal(engine.readonlySignals.override.value, false);
  assert.equal(engine.readonlySignals['rows[0].double'].value, true);
  assert.equal(engine.getFieldVM('total').readonly.value, true, 'renderers read readonly from the field view model');

  assert.equal(engine.addRepeatInstance('rows'), 1);
  assert.equal(engine.readonlySignals['rows[1].double'].value, true, 'new repeat rows inherit calculated readonly');
});
