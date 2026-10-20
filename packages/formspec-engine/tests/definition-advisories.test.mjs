/** @filedesc Actual WASM lint parity and normal required validation beneath native advisories. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine, lintDocument } from '../dist/index.js';

const definition = (bind = { required: 'true', readonly: 'true' }) => ({
  $formspec: '1.0', url: 'urn:test:advisory', version: '1.0.0', status: 'draft', title: 'Advisory',
  items: [{ key: 'value', type: 'field', label: 'Value', dataType: 'string' }],
  binds: [{ path: 'value', ...bind }],
});

for (const mode of ['runtime', 'authoring', 'strict']) {
  test(`native advisories remain warnings and valid in ${mode}`, () => {
    const result = lintDocument(definition(), { mode });
    assert.equal(result.valid, true);
    assert.deepEqual(result.diagnostics.map(({ code, severity, path, pass }) => ({ code, severity, path, pass })),
      [{ code: 'W900', severity: 'warning', path: 'value', pass: 10 }]);
  });
}

test('calculated null yields native information while runtime required still fails', () => {
  const document = definition({ required: 'true', calculate: 'null' });
  const result = lintDocument(document, { mode: 'strict' });
  assert.equal(result.valid, true);
  assert.deepEqual(result.diagnostics.map(({ code, severity }) => ({ code, severity })),
    [{ code: 'W902', severity: 'info' }]);
  const engine = new FormEngine(document);
  const report = engine.getValidationReport({ profile: 'on-submit' });
  assert.equal(report.valid, false);
  assert.ok(report.results.some(result => result.code === 'REQUIRED' && result.path === 'value'), JSON.stringify(report));
});

test('prepopulation plus calculation is a warning even when editable', () => {
  const document = definition({ calculate: 'null', readonly: 'false' });
  document.items[0].prePopulate = { instance: 'source', path: 'value', editable: true };
  document.instances = { source: { data: { value: 'seed' } } };
  const result = lintDocument(document);
  assert.equal(result.valid, true);
  assert.deepEqual(result.diagnostics.map(({ code, severity }) => ({ code, severity })),
    [{ code: 'W901', severity: 'warning' }]);
});
