/** @filedesc Repeat chrome rule shared by renderers: relevance, Add at maxRepeat, Remove at minRepeat. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { effect } from '@preact/signals-core';
import { FormEngine, readRepeatAffordances } from '../dist/engine-render-entry.js';

function engineWith(group) {
    return new FormEngine({
        $formspec: '1.0',
        url: 'http://example.org/repeat-affordances',
        version: '1.0.0',
        title: 'Repeat affordances',
        items: [
            { key: 'show', type: 'field', dataType: 'boolean', label: 'Show' },
            {
                key: 'rows',
                type: 'group',
                label: 'Rows',
                repeatable: true,
                children: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
                ...group,
            },
        ],
        binds: [{ path: 'rows', relevant: '$show' }],
    });
}

test('Add stops at maxRepeat and Remove stops at minRepeat', () => {
    const item = { minRepeat: 1, maxRepeat: 2 };
    const engine = engineWith(item);
    engine.setValue('show', true);

    assert.deepEqual(readRepeatAffordances(engine, 'rows', item), {
        count: 1, relevant: true, canAdd: true, canRemove: false,
    });
    engine.addRepeatInstance('rows');
    assert.deepEqual(readRepeatAffordances(engine, 'rows', item), {
        count: 2, relevant: true, canAdd: false, canRemove: true,
    });
});

test('no bounds: Add is unbounded and minRepeat defaults to 0', () => {
    const engine = engineWith({});
    engine.addRepeatInstance('rows');
    const state = readRepeatAffordances(engine, 'rows', {});
    assert.equal(state.canAdd, true);
    assert.ok(state.count > 0);
    assert.equal(state.canRemove, true);
});

test('an unknown repeat path reads as zero rows, relevant, nothing to remove', () => {
    const engine = engineWith({});
    assert.deepEqual(readRepeatAffordances(engine, 'missing', null), {
        count: 0, relevant: true, canAdd: true, canRemove: false,
    });
});

test('a reactive caller tracks count and relevance', () => {
    const item = { maxRepeat: 3 };
    const engine = engineWith(item);
    const seen = [];
    const dispose = effect(() => { seen.push(readRepeatAffordances(engine, 'rows', item)); });

    engine.setValue('show', true);
    engine.addRepeatInstance('rows');
    dispose();

    const last = seen.at(-1);
    assert.equal(last.relevant, true);
    assert.equal(last.count, engine.repeats.rows.value);
    assert.ok(seen.length >= 3, `expected re-reads on relevance and count, saw ${seen.length}`);
    assert.equal(seen[0].relevant, false);
});
