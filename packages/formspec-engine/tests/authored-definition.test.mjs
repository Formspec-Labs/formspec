/** @filedesc Authored Definitions drive native validation and readonly state without host rewrites. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';
import { wasmEvaluateDefinition } from '../dist/wasm-bridge-runtime.js';

test('named sets validate authored choices while option signals resolve display labels', () => {
  const definition = {
    $formspec: '1.0', url: 'urn:test:authored-options', version: '1.0.0', title: 'Options',
    items: [{ key: 'group', type: 'group', children: [
      { key: 'state', type: 'field', dataType: 'choice', optionSet: 'states',
        options: [{ value: 'ZZ', label: 'Wrong inline' }] },
      { key: 'picks', type: 'field', dataType: 'multiChoice', optionSet: 'colors' },
    ] }],
    optionSets: {
      states: { options: [{ value: 'NJ', label: 'New Jersey' }] },
      colors: [{ value: 'red', label: 'Red' }],
    },
  };
  const authored = structuredClone(definition);
  const engine = new FormEngine(definition);
  assert.deepEqual(engine.definition, authored);
  assert.deepEqual(definition, authored);
  assert.deepEqual(engine.optionSignals['group.state'].value, [{ value: 'NJ', label: 'New Jersey' }]);
  assert.deepEqual(engine.optionSignals['group.picks'].value, [{ value: 'red', label: 'Red' }]);

  const data = { group: { state: 'ZZ', picks: ['red', 'teal'] } };
  const native = wasmEvaluateDefinition(definition, data);
  assert.deepEqual(native.validations.map(v => [v.path, v.code]).sort(), [
    ['group.picks', 'TYPE_MISMATCH'], ['group.state', 'TYPE_MISMATCH'],
  ]);
  engine.loadResponseData(data);
  assert.equal(engine.getValidationReport().counts.error, 2);
  engine.setValue('group.state', 'NJ');
  engine.setValue('group.picks', ['red']);
  assert.equal(engine.getValidationReport().counts.error, 0);
  assert.deepEqual(engine.definition, authored);
});

test('pre-fill lock reaches native state, calculated readonly() and browser expressions', () => {
  const definition = {
    $formspec: '1.0', url: 'urn:test:authored-lock', version: '1.0.0', title: 'Lock',
    items: [
      { key: 'name', type: 'field', dataType: 'string',
        prePopulate: { instance: 'org', path: 'name', editable: false } },
      { key: 'editable', type: 'field', dataType: 'string',
        prePopulate: { instance: 'org', path: 'name', editable: true } },
      { key: 'locked', type: 'field', dataType: 'boolean' },
    ],
    binds: [
      { path: 'name', readonly: 'false' },
      { path: 'locked', calculate: 'readonly($name)' },
    ],
  };
  // A missing source must not unlock a field declared readonly.
  const native = wasmEvaluateDefinition(definition, {});
  assert.equal(native.readonly.name, true);
  assert.equal(native.readonly.editable, false);
  assert.equal(native.values.locked, true);
  const engine = new FormEngine(definition);
  assert.equal(engine.readonlySignals.name.value, true);
  assert.equal(engine.readonlySignals.editable.value, false);
  assert.equal(engine.signals.locked.value, true);
  assert.equal(engine.compileExpression('readonly($name)')(), true);
});
