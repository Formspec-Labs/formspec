/** @filedesc Verify the completed Response carries its instance evidence before signing. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { FormEngine } from '../dist/index.js';

const fixture = JSON.parse(readFileSync(
    new URL('../../../tests/fixtures/assemble-candidate.json', import.meta.url), 'utf8',
));
const meta = { id: 'candidate', profile: 'on-submit' };

test('the pre-sign candidate includes evidence for the values used in evaluation', () => {
    const engine = new FormEngine(fixture.definition, { responseInstanceResolutions: fixture.resolution });
    assert.equal(engine.signals.total.value, 13);

    const candidate = engine.getResponse(meta);
    assert.equal(candidate.status, 'completed');
    assert.equal(candidate.data.total, 13);
    assert.deepEqual(candidate.resolvedInstances, fixture.resolvedInstances);
});

test('an unavailable read blocks signing but permits a draft snapshot', () => {
    const engine = new FormEngine(fixture.definition);
    assert.equal(engine.getResponse({ profile: 'off' }).resolvedInstances, undefined);
    assert.throws(() => engine.getResponse(meta), /a_completed.*unavailable/i);
});

for (const { instance, delivery, message } of fixture.refusals) {
    test(`candidate assembly refuses an instance that ${message}`, () => {
        const resolution = {
            ...fixture.resolution,
            [instance]: { ...fixture.resolution[instance], ...delivery },
        };
        const engine = new FormEngine(fixture.definition, { responseInstanceResolutions: resolution });
        assert.throws(() => engine.getResponse(meta), {
            message: `Response instance '${instance}' ${message}`,
        });
    });
}

test('a changed instance value cannot be signed with a stale receipt', () => {
    const engine = new FormEngine(fixture.definition, { responseInstanceResolutions: fixture.resolution });
    engine.instanceData.z_current.amount = 6;
    assert.throws(() => engine.getResponse(meta), /z_current.*changed/i);
});

test('submit validation remains available when a delivery is stale', () => {
    const definition = {
        ...fixture.definition,
        items: [...fixture.definition.items, { key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
        binds: [...fixture.definition.binds, { path: 'name', required: 'true' }],
    };
    const engine = new FormEngine(definition, { responseInstanceResolutions: fixture.resolution });
    engine.instanceData.z_current.amount = 6;

    const { response, validationReport } = engine.getResponseSnapshot(meta);
    assert.equal(response.status, 'in-progress');
    assert.equal(response.resolvedInstances, undefined);
    assert.equal(validationReport.valid, false);
    assert.ok(validationReport.results.some(result => result.path === 'name' && result.severity === 'error'));
});

test('a host clock cannot change the instance value between receipt checking and evaluation', () => {
    let engine;
    const now = () => {
        if (engine) engine.instanceData.z_current.amount = 6;
        return '2026-01-02T00:00:00Z';
    };
    engine = new FormEngine(fixture.definition, {
        responseInstanceResolutions: fixture.resolution,
        runtimeContext: { now },
    });
    assert.throws(() => engine.getResponse(meta), /z_current.*changed/i);
});
