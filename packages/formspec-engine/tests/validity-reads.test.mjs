/** @filedesc valid() reads one settled set in Binds, Shapes and host FEL (Core §3.5.9, fs-4jfg). */
import test from 'node:test';
import assert from 'node:assert/strict';

import { FormEngine } from '../dist/index.js';

function einEngine() {
  return new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/valid-reads',
    version: '1.0.0',
    title: 'Valid reads',
    items: [
      { key: 'ein', type: 'field', dataType: 'string', label: 'EIN' },
      { key: 'status', type: 'field', dataType: 'string', label: 'Status' },
    ],
    binds: [{ path: 'status', calculate: "if(valid($ein), 'ok', 'fix')" }],
  });
}

test('an injected external result blocks filing but does not change what valid() reads', () => {
  const engine = einEngine();
  engine.setValue('ein', '12');
  engine.injectExternalValidation([
    { path: 'ein', severity: 'error', code: 'EIN_NOT_FOUND', message: 'EIN not found' },
  ]);
  const report = engine.getValidationReport();
  // Core §5.7.2: the external error still blocks submission.
  assert.equal(report.valid, false);
  assert.ok(report.results.some((result) => result.code === 'EIN_NOT_FOUND'));
  // Core §3.5.9: valid() reads the Definition's Bind and Shape results, so host FEL agrees
  // with the Bind and with a server recheck that never sees the external result.
  assert.equal(engine.compileExpression('valid($ein)')(), true);
  assert.equal(engine.getResponse().data.status, 'ok');
});
