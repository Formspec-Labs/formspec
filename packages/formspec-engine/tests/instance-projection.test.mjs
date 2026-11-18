/** @filedesc Tools exports preserve Core response-projection codes and nullable upstream versions. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const priorRowsDefinition = () => JSON.parse(readFileSync(
    new URL('../../../tests/conformance/suite/fixtures/parity-prior-rows.definition.json', import.meta.url),
    'utf8',
));

test('a Definition can project rows from its own completed filings', () => {
    const definition = priorRowsDefinition();
    const instance = definition.instances.prior;
    const consumer = { kind: 'instance', name: 'prior', definition };
    assert.deepEqual(tools.checkInstanceProjection(instance, consumer, [definition]), []);

    const wrongType = { ...instance, schema: { 'rows[*].tags': 'integer' } };
    const findings = tools.checkInstanceProjection(wrongType, consumer, [definition]);
    assert.deepEqual(findings.map(({ code }) => code), ['INSTANCE-PROJECTION-FIELD-TYPE-MISMATCH']);
});

test('the engine evaluates the projected rows from its own latest completed filing', () => {
    const definition = priorRowsDefinition();
    const { prior } = definition.instances;
    const scope = 'test-scope';
    const subject = (cycle) => {
        const keys = { cycle };
        return { type: definition.subject.type, keys, id: engine.responseSubjectId(definition.subject.type, keys) };
    };
    const record = (id, authored, cycle, kind, status, rows) => ({
        scope,
        kind,
        response: {
            $formspecResponse: '1.0',
            id,
            definitionUrl: definition.url,
            definitionVersion: definition.version,
            authored,
            status,
            subject: subject(cycle),
            data: { rows, tag: 'ready' },
        },
    });
    const currentSubject = subject(2);
    const mixedRows = [prior.data.rows[0], { tags: ['other'] }];
    const delivery = engine.selectResponses([
        record('old', '2025-07-01T00:00:00Z', 1, 'filing', 'completed', prior.data.rows),
        record('latest', '2025-07-02T00:00:00Z', 1, 'filing', 'completed', mixedRows),
        record('draft', '2025-07-03T00:00:00Z', 1, 'open-draft', 'in-progress', prior.data.rows),
        record('current-cycle', '2025-07-04T00:00:00Z', 2, 'filing', 'completed', prior.data.rows),
    ], prior.response, {
        scope,
        authorized: true,
        source: 'definition',
        upstreamSubject: definition.subject,
        consumerSubject: currentSubject.keys,
        projection: Object.keys(prior.schema),
    });
    assert.deepEqual(delivery.records.map(({ responseId }) => responseId), ['latest']);
    assert.deepEqual(delivery.value, { rows: mixedRows });

    const session = new engine.FormEngine(definition, {
        responseSubject: currentSubject,
        savedResponseData: { rows: [], tag: 'ready' },
        responseInstanceResolutions: { prior: delivery },
        loadExternalSources: false,
    });
    try {
        assert.equal(session.getResponse().data.priorCount, 2);
        assert.equal(session.getResponse().data.everyRowHasTag, false);
        assert.deepEqual(session.getValidationReport().results.map(({ shapeId }) => shapeId), ['prior-tag']);
    } finally {
        session.dispose();
    }
});
