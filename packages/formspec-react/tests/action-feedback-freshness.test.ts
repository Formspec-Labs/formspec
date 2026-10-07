/** @filedesc Bounded freshness refuses unsupported content and detects observable transitions. */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { signal, batch } from '@preact/signals-core';
import { createFormEngine, initFormspecEngine, type IFormEngine } from '@formspec-org/engine';
import { actionContentFingerprint } from '../src/action-feedback-freshness.js';
import { createActionFeedbackStore } from '../src/action-feedback.js';

beforeAll(() => initFormspecEngine());
const definition = { $formspec: '1.0', url: 'urn:feedback-freshness', version: '1.0.0',
    items: [{ key: 'name', type: 'field', dataType: 'string' },
        { key: 'emptyRows', type: 'group', repeatable: true, minRepeat: 0, children: [] }],
    instances: { scratch: { readonly: false, data: { ready: false } } } };
function mockEngine(value?: unknown) {
    const values = value === undefined ? {} : { answer: signal(value) };
    return { signals: values, relevantSignals: {}, repeats: {}, structureVersion: signal(0),
        getFieldPaths: () => Object.keys(values), isPathRelevant: () => true } as unknown as IFormEngine;
}
function owned(engine = createFormEngine(definition)) {
    const store = createActionFeedbackStore(engine);
    const unregister = store.register('origin'); const stop = store.connect();
    const start = () => store.start('origin', 'save-draft', ['need:save@1']);
    return { engine, store, start, close: () => { unregister(); stop(); engine.dispose(); } };
}

describe('private action content freshness', () => {
    it('matches independently calculated SHA-256 of canonical empty cohort bytes', () => {
        expect(actionContentFingerprint(mockEngine())).toBe('b80b9bb8917bdacfa609473738064a578262fd0c433084b9ffca6fb666653881');
    });
    it.each([
        NaN, Infinity, new Date(), new Uint8Array(), [undefined], new Array(1), { member: undefined },
        { member: '\uD800' }, { [Symbol('unknown')]: true }, Object.create({ hidden: true }),
        Object.assign([], { extra: true }), { toJSON: () => ({}) },
    ])('refuses unsupported JSON without a durable digest: %j', value => {
        expect(actionContentFingerprint(mockEngine(value))).toBeUndefined();
    });
    it('refuses cycles, accessors and inherited JSON hooks without calling them', () => {
        const getter = vi.fn(() => 'unsafe'); const accessor = Object.defineProperty({}, 'answer', { enumerable: true, get: getter });
        expect(actionContentFingerprint(mockEngine(accessor))).toBeUndefined(); expect(getter).not.toHaveBeenCalled();
        const cyclic: any = {}; cyclic.self = cyclic;
        expect(actionContentFingerprint(mockEngine(cyclic))).toBeUndefined();
        const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
        Object.defineProperty(Object.prototype, 'toJSON', { configurable: true, get: getter });
        try { expect(actionContentFingerprint(mockEngine({ normal: true }))).toBeUndefined(); expect(getter).not.toHaveBeenCalled(); }
        finally { if (previous) Object.defineProperty(Object.prototype, 'toJSON', previous); else delete (Object.prototype as any).toJSON; }
    });
    it('bounds the complete cohort and text, and distinguishes undefined slots from null', () => {
        expect(actionContentFingerprint(mockEngine('a'.repeat(1_048_577)))).toBeUndefined();
        expect(actionContentFingerprint(mockEngine(Array(100_001).fill(0)))).toBeUndefined();
        let deep: unknown = null; for (let depth = 0; depth < 129; depth++) deep = { child: deep };
        expect(actionContentFingerprint(mockEngine(deep))).toBeUndefined();
        const engine = mockEngine(null); const nullHash = actionContentFingerprint(engine);
        engine.signals.answer.value = undefined;
        expect(actionContentFingerprint(engine)).not.toBe(nullHash);
    });
    it('preserves equivalent objects and descriptors; changed descriptors invalidate', () => {
        const a = { filename: 'file.png', contentType: 'image/png', size: 8, digest: 'a'.repeat(64) };
        const engine = mockEngine(a); const hash = actionContentFingerprint(engine);
        engine.signals.answer.value = { digest: a.digest, size: 8, contentType: a.contentType, filename: a.filename };
        expect(actionContentFingerprint(engine)).toBe(hash);
        engine.signals.answer.value = { ...a, size: 9 };
        expect(actionContentFingerprint(engine)).not.toBe(hash);
    });
    it('refuses a custom signal runtime rather than asserting unobserved freshness', () => {
        const engine = mockEngine('A');
        (engine.signals as any).answer = { value: 'A' };
        expect(actionContentFingerprint(engine)).toBeUndefined();
    });
    it('clears for actual direct edits, changed response load, and empty repeat changes', () => {
        const view = owned();
        try {
            for (const change of [() => view.engine.setValue('name', 'A'),
                () => view.engine.loadResponseData({ name: 'B' }),
                () => view.engine.addRepeatInstance('emptyRows'),
                () => view.engine.removeRepeatInstance('emptyRows', 0)]) {
                const ticket = view.start(); view.store.settle(ticket, 'completed');
                expect(view.store.state.value?.feedback.phase).toBe('settled');
                change(); expect(view.store.state.value).toBeUndefined();
                view.store.settle(ticket, 'completed'); expect(view.store.state.value).toBeUndefined();
            }
        } finally { view.close(); }
    });
    it('readiness scratch preserves feedback while observable A→B→A never revives it', () => {
        const view = owned();
        try {
            view.engine.setValue('name', 'A'); const ticket = view.start();
            view.engine.setInstanceValue('scratch', 'ready', true);
            view.store.settle(ticket, 'completed'); expect(view.store.state.value?.feedback.phase).toBe('settled');
            view.engine.setValue('name', 'B'); view.engine.setValue('name', 'A');
            view.store.settle(ticket, 'completed'); expect(view.store.state.value).toBeUndefined();
            const atomic = view.start(); batch(() => { view.engine.setValue('name', 'B'); view.engine.setValue('name', 'A'); });
            view.store.settle(atomic, 'completed'); expect(view.store.state.value?.feedback.phase).toBe('settled');
        } finally { view.close(); }
    });
    it('tracks effective ancestor relevance and retained nonrelevant values', () => {
        const engine = createFormEngine({ ...definition, items: [{ key: 'group', type: 'group', children: [{ key: 'name', type: 'field', dataType: 'string' }] }] });
        const view = owned(engine);
        try {
            const ticket = view.start(); engine.relevantSignals.group.value = false;
            view.store.settle(ticket, 'completed'); expect(view.store.state.value).toBeUndefined();
            const hidden = view.start(); engine.setValue('group.name', 'retained');
            view.store.settle(hidden, 'completed'); expect(view.store.state.value).toBeUndefined();
        } finally { view.close(); }
    });
    it('latest start wins, unrelated outlet retirement preserves origin, lifecycle retirement refuses late completion', () => {
        const view = owned();
        try {
            const retireOther = view.store.register('other');
            const old = view.start(); const latest = view.start();
            view.store.settle(old, 'failed'); expect(view.store.state.value?.feedback.phase).toBe('pending');
            retireOther(); view.store.settle(latest, 'completed'); expect(view.store.state.value?.feedback.phase).toBe('settled');
            view.close(); view.store.settle(latest, 'completed'); expect(view.store.state.value).toBeUndefined();
        } finally { /* close already retires all owned lifetimes */ }
    });
    it('refuses oversized provenance rather than silently truncating it', () => {
        const view = owned();
        try { expect(view.store.start('origin', 'save-draft', Array(129).fill('need:save@1'))).toBeUndefined(); }
        finally { view.close(); }
    });
});
