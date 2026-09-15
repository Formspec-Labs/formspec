/** @filedesc bind() value-sync contract for DatePicker — default single-input path and the USWDS valueIO seam. */
import { describe, it, expect, beforeAll } from 'vitest';
import { signal } from '@preact/signals-core';

let useDatePicker: any;

beforeAll(async () => {
    const behaviorMod = await import('../../src/behaviors/date-picker');
    useDatePicker = behaviorMod.useDatePicker;
});

function makeBehaviorContext(items: any[], prefix = '') {
    const setValueCalls: Array<[string, unknown]> = [];
    const signals: Record<string, any> = {};
    const ctx = {
        engine: {
            signals,
            requiredSignals: {} as any,
            errorSignals: {} as any,
            readonlySignals: {} as any,
            relevantSignals: {} as any,
            // Mirrors a real engine: setValue writes back into the same signal bind() reads.
            setValue: (path: string, val: unknown) => {
                setValueCalls.push([path, val]);
                if (signals[path]) signals[path].value = val;
            },
        } as any,
        prefix,
        cleanupFns: [] as Array<() => void>,
        touchedFields: new Set<string>(),
        touchedVersion: signal(0),
        latestSubmitDetailSignal: signal(null),
        resolveToken: (v: any) => v,
        resolveItemPresentation: () => ({}),
        resolveWidgetClassSlots: () => ({}),
        findItemByKey: (key: string) => items.find((i: any) => i.key === key) || null,
        renderComponent: () => {},
        submit: () => null,
        registryEntries: new Map(),
        rerender: () => {},
        getFieldVM: () => undefined,
    };
    return { ctx, setValueCalls };
}

function makeRefs(overrides: Record<string, unknown> = {}) {
    return {
        root: document.createElement('div'),
        label: document.createElement('label'),
        control: document.createElement('input'),
        hint: document.createElement('div'),
        error: document.createElement('div'),
        ...overrides,
    };
}

describe('useDatePicker bind() — default path (no valueIO)', () => {
    it('reads the engine value onto control.value and writes DOM input events back to the engine', () => {
        const items = [{ key: 'dob', type: 'field', label: 'DOB', dataType: 'date' }];
        const { ctx, setValueCalls } = makeBehaviorContext(items);
        ctx.engine.signals.dob = signal('2026-01-01');
        const behavior = useDatePicker(ctx as any, { component: 'DatePicker', bind: 'dob' });

        const control = document.createElement('input');
        control.type = 'date';
        const refs = makeRefs({ control });

        const dispose = behavior.bind(refs);
        expect(control.value).toBe('2026-01-01');

        control.value = '2026-02-02';
        control.dispatchEvent(new Event('input', { bubbles: true }));
        expect(setValueCalls.at(-1)).toEqual(['dob', '2026-02-02']);

        dispose();
    });
});

describe('useDatePicker bind() — refs.valueIO (USWDS date picker)', () => {
    it('writes engine → DOM through valueIO.write, never onto control.value', () => {
        const items = [{ key: 'dob', type: 'field', label: 'DOB', dataType: 'date' }];
        const { ctx } = makeBehaviorContext(items);
        ctx.engine.signals.dob = signal('2026-01-01');
        const behavior = useDatePicker(ctx as any, { component: 'DatePicker', bind: 'dob' });

        const control = document.createElement('input'); // USWDS's visible external input
        const internal = document.createElement('input'); // USWDS's hidden internal ISO input
        const writes: string[] = [];
        const refs = makeRefs({
            control,
            valueIO: { element: internal, write: (v: string) => { writes.push(v); internal.value = v; } },
        });

        const dispose = behavior.bind(refs);
        expect(writes).toEqual(['2026-01-01']);
        expect(control.value).toBe('');

        dispose();
    });

    it('a change on valueIO.element reaches engine.setValue', () => {
        const items = [{ key: 'dob', type: 'field', label: 'DOB', dataType: 'date' }];
        const { ctx, setValueCalls } = makeBehaviorContext(items);
        ctx.engine.signals.dob = signal('2026-01-01');
        const behavior = useDatePicker(ctx as any, { component: 'DatePicker', bind: 'dob' });

        const control = document.createElement('input');
        const internal = document.createElement('input');
        const refs = makeRefs({
            control,
            valueIO: { element: internal, write: (v: string) => { internal.value = v; } },
        });

        const dispose = behavior.bind(refs);
        setValueCalls.length = 0; // drop the initial engine → DOM write's echo, if any

        // USWDS's changeElementValue() sets .value then dispatches `change` (never `input`).
        internal.value = '2026-03-03';
        internal.dispatchEvent(new Event('change', { bubbles: true }));
        expect(setValueCalls.at(-1)).toEqual(['dob', '2026-03-03']);

        dispose();
    });

    it('does not write while the visible control (refs.control) is focused', () => {
        const items = [{ key: 'dob', type: 'field', label: 'DOB', dataType: 'date' }];
        const { ctx } = makeBehaviorContext(items);
        const sig = signal('2026-01-01');
        ctx.engine.signals.dob = sig;
        const behavior = useDatePicker(ctx as any, { component: 'DatePicker', bind: 'dob' });

        const control = document.createElement('input');
        document.body.appendChild(control);
        control.focus();
        const internal = document.createElement('input');
        const writes: string[] = [];
        const refs = makeRefs({
            control,
            valueIO: { element: internal, write: (v: string) => writes.push(v) },
        });

        const dispose = behavior.bind(refs);
        expect(writes).toEqual([]);

        sig.value = '2026-04-04';
        expect(writes).toEqual([]);

        dispose();
        control.remove();
    });

    it('short-circuits the write when valueIO.element already matches (prevents a setCalendarValue echo loop)', () => {
        const items = [{ key: 'dob', type: 'field', label: 'DOB', dataType: 'date' }];
        const { ctx } = makeBehaviorContext(items);
        ctx.engine.signals.dob = signal('2026-01-01');
        const behavior = useDatePicker(ctx as any, { component: 'DatePicker', bind: 'dob' });

        const control = document.createElement('input');
        const internal = document.createElement('input');
        internal.value = '2026-01-01'; // DOM already reflects the engine value
        let writeCount = 0;
        const refs = makeRefs({
            control,
            valueIO: { element: internal, write: () => { writeCount++; } },
        });

        const dispose = behavior.bind(refs);
        expect(writeCount).toBe(0);

        dispose();
    });
});
