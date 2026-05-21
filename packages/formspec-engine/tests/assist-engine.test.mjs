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
