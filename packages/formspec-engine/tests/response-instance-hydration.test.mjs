/** @filedesc Tests for response-instance hydration, at-open pins reaching createResponse, and single-capture assembly (fs-6zl7). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFormEngine, initFormspecEngine } from '../dist/index.js';

await initFormspecEngine();

const SHA_A = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SHA_C = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

function makeDefinition(pin = 'at-open') {
    return {
        $formspec: '1.0',
        url: 'https://example.org/forms/yearly-summary',
        version: '1.0.0',
        title: 'Yearly Summary',
        subject: {
            type: 'entity-period',
            keys: {
                entityId: { dataType: 'string' },
                period: { dataType: 'integer' },
            },
        },
        instances: {
            priorPeriod: {
                response: {
                    definition: { url: 'https://example.org/forms/yearly-summary', compatibleVersions: '>=1.0.0 <2.0.0' },
                    subject: [
                        { key: 'entityId', op: 'eq', from: { subject: 'entityId' } },
                        { key: 'period', op: 'eq', from: { subject: 'period' }, offset: -1 },
                    ],
                    status: 'completed',
                    whenNone: 'unavailable',
                    cardinality: 'latest',
                    pin,
                },
                schema: {
                    total: { dataType: 'integer' },
                    note: { dataType: 'string' },
                },
            },
        },
        items: [
            {
                key: 'carriedTotal',
                type: 'field',
                dataType: 'integer',
                label: 'Carried total',
                prePopulate: { instance: 'priorPeriod', path: 'total' },
            },
            {
                key: 'currentTotal',
                type: 'field',
                dataType: 'integer',
                label: 'Current total',
            },
        ],
        binds: [
            { path: 'currentTotal', default: "@instance('priorPeriod').total" },
        ],
    };
}

test('InstanceSourceRequest carries response selection & consumer subject, hydrates identically from stub server and preview resolver, reaches createResponse, and assembles resolvedInstances', async () => {
    const def = makeDefinition('at-open');
    const seenRequests = [];

    const stubDelivery = {
        value: { total: 420, note: 'Prior finalized' },
        records: [{ responseId: 'resp-prior-1', definitionVersion: '1.0.0', responseHash: SHA_A }],
        valueDigest: SHA_B,
        none: false,
        pinned: true,
        newer: { responseId: 'resp-prior-2', responseHash: SHA_C },
    };

    // 1. Hydrate via instanceSourceResolver (stub server result).
    const engineFromResolver = createFormEngine(def, {
        responseSubject: { type: 'entity-period', keys: { entityId: 'ent-1', period: 2026 } },
        instanceSourceResolver: async (request) => {
            seenRequests.push(request);
            return { status: 'loaded', ...stubDelivery };
        },
    });

    const outcomes = await engineFromResolver.waitForInstanceSources();
    assert.equal(seenRequests.length, 1);
    assert.equal(seenRequests[0].instanceName, 'priorPeriod');
    assert.deepEqual(seenRequests[0].response, def.instances.priorPeriod.response);
    assert.equal(seenRequests[0].subject?.type, 'entity-period');
    assert.deepEqual(seenRequests[0].subject?.keys, { entityId: 'ent-1', period: 2026 });

    assert.equal(outcomes.priorPeriod?.status, 'loaded');
    assert.deepEqual(outcomes.priorPeriod?.records, stubDelivery.records);
    assert.equal(outcomes.priorPeriod?.valueDigest, SHA_B);
    assert.equal(outcomes.priorPeriod?.none, false);
    assert.deepEqual(outcomes.priorPeriod?.newer, stubDelivery.newer);
    assert.deepEqual(engineFromResolver.getResponseInstanceNewer('priorPeriod'), stubDelivery.newer);

    // Pinned value reached createResponse (initialValue) after resolution.
    assert.equal(engineFromResolver.signals.carriedTotal.value, 420);

    // 2. Hydrate directly via pre-loaded responseInstanceResolutions (preview / server pin at open).
    const engineFromPins = createFormEngine(def, {
        responseSubject: { type: 'entity-period', keys: { entityId: 'ent-1', period: 2026 } },
        responseInstanceResolutions: {
            priorPeriod: {
                value: stubDelivery.value,
                records: stubDelivery.records,
                valueDigest: stubDelivery.valueDigest,
                none: stubDelivery.none,
                pinned: stubDelivery.pinned,
            },
        },
    });
    assert.equal(engineFromPins.signals.carriedTotal.value, 420);

    // Identical values and assembled resolvedInstances from both paths.
    engineFromResolver.setValue('currentTotal', 500);
    engineFromPins.setValue('currentTotal', 500);

    const resResolver = engineFromResolver.getResponse({ id: 'resp-2026-1', profile: 'on-submit' });
    const resPins = engineFromPins.getResponse({ id: 'resp-2026-1', profile: 'on-submit' });
    assert.equal(resResolver.status, 'completed');
    assert.equal(resPins.status, 'completed');
    assert.deepEqual(resResolver.data, resPins.data);
    assert.deepEqual(resResolver.resolvedInstances, resPins.resolvedInstances);
    assert.equal(resResolver.resolvedInstances?.length, 1);
    assert.equal(resResolver.resolvedInstances?.[0]?.instance, 'priorPeriod');
    assert.equal(resResolver.resolvedInstances?.[0]?.valueDigest, SHA_B);
    assert.equal(resResolver.resolvedInstances?.[0]?.pinned, true);

    // 3. updateResponseInstanceResolutions refreshes live deliveries or removes unavailable ones.
    const liveDef = makeDefinition('none');
    const liveEngine = createFormEngine(liveDef, {
        responseSubject: { type: 'entity-period', keys: { entityId: 'ent-1', period: 2026 } },
        responseInstanceResolutions: {
            priorPeriod: {
                value: { total: 100, note: 'Initial' },
                records: [{ responseId: 'resp-prior-1', definitionVersion: '1.0.0', responseHash: SHA_A }],
                valueDigest: SHA_B,
                none: false,
                pinned: false,
            },
        },
    });
    liveEngine.setValue('currentTotal', 200);
    liveEngine.updateResponseInstanceResolutions({
        priorPeriod: {
            value: { total: 250, note: 'Updated' },
            records: [{ responseId: 'resp-prior-2', definitionVersion: '1.0.0', responseHash: SHA_C }],
            valueDigest: SHA_C,
            none: false,
            pinned: false,
        },
    });
    assert.deepEqual(liveEngine.getInstanceData('priorPeriod'), { total: 250, note: 'Updated' });
    const refreshed = liveEngine.getResponse({ id: 'resp-2026-2', profile: 'on-submit' });
    assert.equal(refreshed.resolvedInstances?.[0]?.valueDigest, SHA_C);

    // Removing the resolution causes complete-response assembly to refuse (unavailable prerequisite).
    liveEngine.updateResponseInstanceResolutions({});
    assert.throws(
        () => liveEngine.getResponse({ id: 'resp-2026-2', profile: 'on-submit' }),
        /unavailable/i,
    );

    engineFromResolver.dispose();
    engineFromPins.dispose();
    liveEngine.dispose();
});
