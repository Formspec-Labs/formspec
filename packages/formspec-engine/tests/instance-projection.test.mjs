/** @filedesc Tools exports preserve Core response-projection codes and nullable upstream versions. */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as engine from '../dist/index.js';
import * as tools from '../dist/fel/fel-api-tools.js';

test('the tools export and injected linter return the same native projection diagnostics', () => {
    const instance = { response: { definition: { url: 'urn:example:upstream' } }, schema: { amount: 'integer' } };
    assert.equal(engine.checkInstanceProjection, tools.checkInstanceProjection);
    const findings = tools.checkInstanceProjection(instance, null, []);
    assert.deepEqual(findings.map(({ code, jsonPointer, upstreamVersion }) => ({ code, jsonPointer, upstreamVersion })), [{
        code: 'INSTANCE-PROJECTION-NO-ELIGIBLE-VERSION',
        jsonPointer: '/response/definition',
        upstreamVersion: null,
    }]);
    assert.throws(() => tools.lintDocument(instance, { upstreamDefinitions: [] }), /receiving form/);
    const report = tools.lintDocument(instance, { upstreamDefinitions: [], projectionConsumer: null });
    assert.equal(report.valid, false);
    assert.deepEqual(report.instanceProjectionDiagnostics, findings);
});
