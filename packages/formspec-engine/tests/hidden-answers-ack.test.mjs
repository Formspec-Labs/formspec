/** @filedesc Engine tests for hidden-answer grouped acknowledgement at Submit (`fs-2cbq`, ADR 0173). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFormEngine, initFormspecEngine } from '../dist/index.js';

await initFormspecEngine();

function makeDefinition() {
    return {
        $formspec: '1.0',
        url: 'https://example.org/forms/hidden-answers-engine',
        version: '1.0.0',
        title: 'Hidden Answers Engine Test',
        nonRelevantBehavior: 'remove',
        items: [
            { key: 'showDetails', type: 'field', dataType: 'boolean', label: 'Show details' },
            { key: 'detailNote', type: 'field', dataType: 'string', label: 'Detail note' },
            { key: 'detailCount', type: 'field', dataType: 'integer', label: 'Detail count' },
            { key: 'detailCalc', type: 'field', dataType: 'integer', label: 'Derived count' },
        ],
        binds: [
            { path: 'detailNote', relevant: '$showDetails = true' },
            { path: 'detailCount', relevant: '$showDetails = true' },
            { path: 'detailCalc', relevant: '$showDetails = true', calculate: '2 + 3' },
        ],
    };
}

test('exposes held non-relevant paths, refuses Submit before ack, accepts one grouped ack, invalidates on set/value change, and preserves values through save/reload/unhide', () => {
    const def = makeDefinition();
    const engine = createFormEngine(def);

    engine.setValue('showDetails', true);
    engine.setValue('detailNote', 'retained answer');
    engine.setValue('detailCount', 0);
    assert.deepEqual(engine.getHeldNonRelevantPaths(), []);

    // Hide the fields: values remain in editable snapshot, surfaced as held non-relevant values.
    engine.setValue('showDetails', false);
    assert.deepEqual(engine.getHeldNonRelevantPaths(), ['detailCount', 'detailNote']);
    assert.deepEqual(engine.getHeldNonRelevantValues(), {
        detailCount: 0,
        detailNote: 'retained answer',
    });

    // Save/reload/unhide via draftSnapshot preserves held values losslessly.
    const snapshot = engine.getDraftSnapshot();
    assert.equal(snapshot.data.detailNote, 'retained answer');
    assert.equal(snapshot.data.detailCount, 0);

    const resumed = createFormEngine(def, { draftSnapshot: snapshot });
    assert.deepEqual(resumed.getHeldNonRelevantPaths(), ['detailCount', 'detailNote']);

    // Even without warning Shapes, explanation state lists HIDDEN_ANSWERS_OMITTED group.
    const beforeAck = resumed.getExplanationState();
    assert.equal(beforeAck.groups.length, 1);
    assert.equal(beforeAck.groups[0].code, 'HIDDEN_ANSWERS_OMITTED');
    assert.deepEqual(beforeAck.groups[0].paths, ['detailCount', 'detailNote']);
    assert.equal(beforeAck.groups[0].current, false);

    // Submit refuses before acknowledgement and omits held values from Response.data.
    const unackedSubmit = resumed.getResponseSnapshot({ profile: 'on-submit' });
    assert.equal(unackedSubmit.validationReport?.valid, false);
    assert.equal(unackedSubmit.response.status, 'in-progress');
    assert.equal(unackedSubmit.response.data.detailNote, undefined);
    assert.equal(unackedSubmit.response.data.detailCount, undefined);
    assert.ok(unackedSubmit.validationReport?.results.some(
        (r) => r.constraintKind === 'explanation'
            && r.code === 'EXPLANATION_REQUIRED'
            && r.context?.code === 'HIDDEN_ANSWERS_OMITTED',
    ));

    // One grouped acknowledgement covers the full listed set.
    const basis = beforeAck.groups[0].basis;
    assert.equal(resumed.acknowledge('HIDDEN_ANSWERS_OMITTED', { expectedBasis: basis }), true);
    const pendingEntries = resumed.getExplanationEntries();
    assert.equal(pendingEntries.length, 1);

    // Apply server stamp (as draft save does).
    resumed.acceptSavedExplanations([{
        ...pendingEntries[0],
        author: { id: 'filer-1', name: 'Alex Filer' },
        recorded: '2026-11-27T12:00:00Z',
    }]);

    const afterAck = resumed.getExplanationState();
    assert.equal(afterAck.groups[0].current, true);

    // Submit succeeds and omits all held values while carrying the grouped acknowledgement.
    const ackedSubmit = resumed.getResponseSnapshot({ profile: 'on-submit' });
    assert.equal(ackedSubmit.validationReport?.valid, true);
    assert.equal(ackedSubmit.response.status, 'completed');
    assert.equal(ackedSubmit.response.data.detailNote, undefined);
    assert.equal(ackedSubmit.response.data.detailCount, undefined);
    assert.equal(ackedSubmit.response.explanations?.length, 1);
    assert.equal(ackedSubmit.response.explanations?.[0]?.code, 'HIDDEN_ANSWERS_OMITTED');
    assert.deepEqual(ackedSubmit.response.explanations?.[0]?.paths, ['detailCount', 'detailNote']);

    // Unhide restores retained answers; changing a value and hiding again invalidates prior ack.
    resumed.setValue('showDetails', true);
    assert.equal(resumed.signals.detailNote.value, 'retained answer');
    assert.equal(resumed.signals.detailCount.value, 0);
    assert.deepEqual(resumed.getHeldNonRelevantPaths(), []);

    resumed.setValue('detailNote', 'changed answer');
    resumed.setValue('showDetails', false);
    const staleState = resumed.getExplanationState();
    assert.equal(staleState.groups[0].current, false);
    const staleSubmit = resumed.getResponseSnapshot({ profile: 'on-submit' });
    assert.equal(staleSubmit.validationReport?.valid, false);
    assert.ok(staleSubmit.validationReport?.results.some(
        (r) => r.constraintKind === 'explanation'
            && r.code === 'EXPLANATION_STALE'
            && r.context?.code === 'HIDDEN_ANSWERS_OMITTED',
    ));

    engine.dispose();
    resumed.dispose();
});
