/** @filedesc Core semantics conformance: wildcard shape targets emit concrete indexed paths for repeat groups */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

test('shape-repeat-targets: wildcard shape targets emit concrete indexed paths', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/repeat-shape-targets',
    version: '1.0.0',
    title: 'Repeat Shape Targets',
    items: [
      {
        key: 'rows',
        type: 'group',
        label: 'Rows',
        repeatable: true,
        children: [
          { key: 'amount', type: 'field', dataType: 'integer', label: 'Amount' }
        ]
      }
    ],
    shapes: [
      {
        id: 'nonNegativeRowAmount',
        target: 'rows[*].amount',
        constraint: '$ >= 0',
        message: 'Amount must be non-negative',
        code: 'ROW_AMOUNT'
      }
    ]
  });

  engine.addRepeatInstance('rows');
  engine.addRepeatInstance('rows');
  engine.setValue('rows[0].amount', 10);
  engine.setValue('rows[1].amount', -5);

  const report = engine.getValidationReport();
  const rowError = report.results.find((result) => result.code === 'ROW_AMOUNT');

  assert.ok(rowError);
  assert.equal(rowError.path, 'rows[1].amount');
});

test('shape-row-scope: wildcard shapes evaluate sibling refs in the current row scope', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/shape-row-scope',
    version: '1.0.0',
    title: 'Shape Row Scope',
    items: [
      {
        key: 'rows',
        type: 'group',
        label: 'Rows',
        repeatable: true,
        children: [
          { key: 'role', type: 'field', dataType: 'choice', label: 'Role', options: [{ value: 'adult', label: 'Adult' }, { value: 'child', label: 'Child' }] },
          { key: 'age', type: 'field', dataType: 'integer', label: 'Age' },
          { key: 'isStudent', type: 'field', dataType: 'boolean', label: 'Student' }
        ]
      }
    ],
    shapes: [
      {
        id: 'childAgeRule',
        target: 'rows[*].age',
        activeWhen: "role == 'child'",
        constraint: '$ < 19 or ($ < 22 and isStudent == true)',
        message: 'Child age invalid',
        code: 'CHILD_AGE'
      }
    ]
  });

  engine.addRepeatInstance('rows');
  engine.addRepeatInstance('rows');
  engine.setValue('rows[0].role', 'adult');
  engine.setValue('rows[0].age', 40);
  engine.setValue('rows[0].isStudent', false);
  engine.setValue('rows[1].role', 'child');
  engine.setValue('rows[1].age', 21);
  engine.setValue('rows[1].isStudent', false);

  const report = engine.getValidationReport();
  const rowError = report.results.find((result) => result.code === 'CHILD_AGE');

  assert.ok(rowError);
  assert.equal(rowError.path, 'rows[1].age');
});

test('resolved-instance-paths: every ValidationResult path uses the 0-based index of its signal (Core §4.3.3)', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/zero-based-result-paths',
    version: '1.0.0',
    title: 'Zero-based Result Paths',
    items: [
      {
        key: 'rows',
        type: 'group',
        label: 'Rows',
        repeatable: true,
        minRepeat: 3,
        children: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }]
      }
    ],
    binds: [{ path: 'rows[*].name', required: 'true' }]
  });

  engine.setValue('rows[0].name', 'a');
  engine.setValue('rows[2].name', 'c');

  const required = engine.getValidationReport().results.filter((result) => result.constraintKind === 'required');
  assert.deepEqual(required.map((result) => result.path), ['rows[1].name']);
  assert.deepEqual(engine.validationResults['rows[1].name'].value.map((result) => result.path), ['rows[1].name']);
  assert.deepEqual(engine.validationResults['rows[2].name'].value, []);

  engine.injectExternalValidation([{ path: 'rows[0].name', severity: 'error', code: 'EXT', message: 'External' }]);
  const external = engine.getValidationReport().results.find((result) => result.code === 'EXT');
  assert.equal(external?.path, 'rows[0].name');
});

test('nonrelevant-suppression: shapes do not emit results for non-relevant targets', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/nonrelevant-shape-suppression',
    version: '1.0.0',
    title: 'Nonrelevant Shape Suppression',
    items: [
      { key: 'showSecret', type: 'field', dataType: 'boolean', label: 'Show secret', initialValue: false },
      { key: 'secret', type: 'field', dataType: 'string', label: 'Secret', initialValue: '' }
    ],
    binds: [
      { path: 'secret', relevant: 'showSecret == true', required: 'showSecret == true' }
    ],
    shapes: [
      {
        id: 'secretRequiredShape',
        target: 'secret',
        constraint: 'present($)',
        message: 'Secret is required by shape',
        code: 'SECRET_SHAPE'
      }
    ]
  });

  let report = engine.getValidationReport();
  assert.equal(report.results.find((result) => result.code === 'SECRET_SHAPE'), undefined);

  engine.setValue('showSecret', true);
  report = engine.getValidationReport();
  assert.ok(report.results.find((result) => result.code === 'SECRET_SHAPE'));

  engine.setValue('showSecret', false);
  report = engine.getValidationReport();
  assert.equal(report.results.find((result) => result.code === 'SECRET_SHAPE'), undefined);
});

test('nrb-vs-excluded-value: hidden values can read as null in FEL while still being pruned from response', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/nrb-vs-excluded-value',
    version: '1.0.0',
    title: 'NRB vs Excluded Value',
    nonRelevantBehavior: 'remove',
    items: [
      { key: 'showSecret', type: 'field', dataType: 'boolean', label: 'Show secret', initialValue: false },
      { key: 'secret', type: 'field', dataType: 'string', label: 'Secret', initialValue: 'hidden' },
      { key: 'mirror', type: 'field', dataType: 'string', label: 'Mirror' }
    ],
    binds: [
      { path: 'secret', relevant: 'showSecret == true', excludedValue: 'null' },
      { path: 'mirror', calculate: "if isNull(secret) then 'NULL' else secret" }
    ]
  });

  assert.equal(engine.signals.mirror.value, 'NULL');

  engine.setValue('showSecret', true);
  assert.equal(engine.signals.mirror.value, 'hidden');

  engine.setValue('showSecret', false);
  const response = engine.getResponse();

  assert.equal(engine.signals.mirror.value, 'NULL');
  assert.equal(response.data?.secret, undefined);
  assert.equal(response.data?.mirror, 'NULL');
});
