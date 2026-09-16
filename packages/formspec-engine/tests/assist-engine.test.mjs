/** @filedesc Tests for engine helpers used by formspec-assist. */
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

function makeDefinition() {
  return {
    $formspec: '1.0',
    url: 'https://example.org/forms/grant',
    version: '1.0.0',
    title: 'Grant Application',
    items: [
      {
        key: 'organization',
        type: 'group',
        label: 'Organization',
        children: [
          { key: 'name', type: 'field', dataType: 'string', label: 'Name', required: true },
          { key: 'ein', type: 'field', dataType: 'string', label: 'EIN', required: true },
        ],
      },
      { key: 'contactEmail', type: 'field', dataType: 'string', label: 'Email', required: true },
      { key: 'optionalNote', type: 'field', dataType: 'string', label: 'Note' },
      { key: 'displayOnly', type: 'display', label: 'Display only', widget: 'Heading', content: 'Hello' },
      { key: 'derivedScore', type: 'field', dataType: 'integer', label: 'Derived', readonly: true, calculate: "1" },
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

test('getProgress reports required, filled, valid, and completion counts', () => {
  const engine = new FormEngine(makeDefinition());
  engine.setValue('organization.name', 'Acme');
  engine.setValue('contactEmail', 'owner@example.org');

  assert.deepEqual(engine.getProgress(), {
    total: 5,
    filled: 3,
    valid: 4,
    required: 3,
    requiredFilled: 2,
    complete: false,
  });

  engine.setValue('organization.ein', '12-3456789');
  assert.deepEqual(engine.getProgress(), {
    total: 5,
    filled: 4,
    valid: 5,
    required: 3,
    requiredFilled: 3,
    complete: true,
  });
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
