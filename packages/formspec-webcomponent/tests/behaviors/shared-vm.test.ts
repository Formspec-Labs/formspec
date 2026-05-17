/** @filedesc Tests for FieldViewModel-aware bindSharedFieldEffects. */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { signal, computed } from '@preact/signals-core';

let bindSharedFieldEffects: any;
let resolveFieldPath: any;

beforeAll(async () => {
    const mod = await import('../../src/behaviors/shared');
    bindSharedFieldEffects = mod.bindSharedFieldEffects;
    resolveFieldPath = mod.resolveFieldPath;
});

/** Create a minimal mock FieldViewModel with controllable signals. */
function mockFieldVM(overrides: Partial<{
    label: string;
    hint: string | null;
    description: string | null;
    required: boolean;
    visible: boolean;
    readonly: boolean;
    firstError: string | null;
    value: any;
}> = {}) {
    const labelSig = signal(overrides.label ?? 'Test Label');
    const hintSig = signal(overrides.hint ?? null);
    const descSig = signal(overrides.description ?? null);
    const requiredSig = signal(overrides.required ?? false);
    const visibleSig = signal(overrides.visible ?? true);
    const readonlySig = signal(overrides.readonly ?? false);
    const firstErrorSig = signal(overrides.firstError ?? null);
    const valueSig = signal(overrides.value ?? '');
    const errorsSig = signal([] as any[]);
    const optionsSig = signal([] as any[]);
    const optionsStateSig = signal({ loading: false, error: null });

    return {
        vm: {
            templatePath: 'test',
            instancePath: 'test',
            id: 'field-test',
            itemKey: 'test',
            dataType: 'string',
            label: computed(() => labelSig.value),
            hint: computed(() => hintSig.value),
            description: computed(() => descSig.value),
            required: computed(() => requiredSig.value),
            visible: computed(() => visibleSig.value),
            readonly: computed(() => readonlySig.value),
            firstError: computed(() => firstErrorSig.value),
            value: computed(() => valueSig.value),
            errors: computed(() => errorsSig.value),
            options: computed(() => optionsSig.value),
            optionsState: computed(() => optionsStateSig.value),
            disabledDisplay: 'hidden' as const,
            setValue: vi.fn(),
        },
        // Expose setters for test control
        setLabel: (v: string) => { labelSig.value = v; },
        setRequired: (v: boolean) => { requiredSig.value = v; },
        setVisible: (v: boolean) => { visibleSig.value = v; },
        setReadonly: (v: boolean) => { readonlySig.value = v; },
        setFirstError: (v: string | null) => { firstErrorSig.value = v; },
    };
}

function makeMinimalBehaviorContext(fieldPath = 'test') {
    return {
        engine: {
            signals: {} as any,
            requiredSignals: {} as any,
            errorSignals: {} as any,
            readonlySignals: {} as any,
            relevantSignals: {} as any,
            getFieldVM: () => undefined,
        } as any,
        prefix: '',
        cleanupFns: [] as Array<() => void>,
        touchedFields: new Set<string>(),
        touchedVersion: signal(0),
        latestSubmitDetailSignal: signal(null),
        resolveToken: (v: any) => v,
        resolveItemPresentation: () => ({}),
        resolveWidgetClassSlots: () => ({}),
        findItemByKey: () => null,
        renderComponent: () => {},
        submit: () => null,
        registryEntries: new Map(),
        rerender: () => {},
        definition: {},
    };
}

function makeFieldRefs() {
    const root = document.createElement('div');
    const label = document.createElement('label');
    const control = document.createElement('input');
    const error = document.createElement('div');
    return { root, label, control, error };
}

describe('bindSharedFieldEffects with FieldViewModel', () => {
    it('sets label text reactively from VM', () => {
        const ctx = makeMinimalBehaviorContext();
        const { vm, setLabel } = mockFieldVM({ label: 'Initial Label' });
        const refs = makeFieldRefs();

        const disposers = bindSharedFieldEffects(ctx, 'test', vm, 'fallback', refs);

        // Effect runs immediately — label should be set
        expect(refs.label.textContent).toBe('Initial Label');

        // Change label — should update reactively
        setLabel('Updated Label');
        expect(refs.label.textContent).toBe('Updated Label');

        // Cleanup
        disposers.forEach(d => d());
    });

    it('updates required indicator reactively from VM', () => {
        const ctx = makeMinimalBehaviorContext();
        const { vm, setRequired } = mockFieldVM({ required: false });
        const refs = makeFieldRefs();

        const disposers = bindSharedFieldEffects(ctx, 'test', vm, 'fallback', refs);

        // Not required — no indicator
        expect(refs.label.querySelector('.formspec-required')).toBeNull();

        // Become required — indicator should appear
        setRequired(true);
        expect(refs.label.querySelector('.formspec-required')).not.toBeNull();
        expect(refs.control.getAttribute('aria-required')).toBe('true');

        // Cleanup
        disposers.forEach(d => d());
    });

    it('toggles visibility reactively from VM', () => {
        const ctx = makeMinimalBehaviorContext();
        const { vm, setVisible } = mockFieldVM({ visible: true });
        const refs = makeFieldRefs();

        const disposers = bindSharedFieldEffects(ctx, 'test', vm, 'fallback', refs);

        expect(refs.root.classList.contains('formspec-hidden')).toBe(false);

        setVisible(false);
        expect(refs.root.classList.contains('formspec-hidden')).toBe(true);
        expect(refs.root.getAttribute('aria-hidden')).toBe('true');

        setVisible(true);
        expect(refs.root.classList.contains('formspec-hidden')).toBe(false);
        expect(refs.root.hasAttribute('aria-hidden')).toBe(false);

        disposers.forEach(d => d());
    });

    it('toggles readonly reactively from VM', () => {
        const ctx = makeMinimalBehaviorContext();
        const { vm, setReadonly } = mockFieldVM({ readonly: false });
        const refs = makeFieldRefs();

        const disposers = bindSharedFieldEffects(ctx, 'test', vm, 'fallback', refs);

        expect(refs.control.getAttribute('aria-readonly')).toBe('false');

        setReadonly(true);
        expect(refs.control.getAttribute('aria-readonly')).toBe('true');
        expect(refs.root.classList.contains('formspec-field--readonly')).toBe(true);

        disposers.forEach(d => d());
    });

    it('shows validation error from VM firstError when touched', () => {
        const ctx = makeMinimalBehaviorContext();
        const { vm, setFirstError } = mockFieldVM();
        const refs = makeFieldRefs();

        const disposers = bindSharedFieldEffects(ctx, 'test', vm, 'fallback', refs);

        // Set error — not yet touched, so should not display
        setFirstError('Required field');
        expect(refs.error.textContent).toBe('');

        // Touch the field
        ctx.touchedFields.add('test');
        ctx.touchedVersion.value += 1;
        expect(refs.error.textContent).toBe('Required field');

        disposers.forEach(d => d());
    });

    it('shows validation error from VM firstError after submit even when untouched', () => {
        const ctx = makeMinimalBehaviorContext();
        const { vm, setFirstError } = mockFieldVM();
        const refs = makeFieldRefs();

        const disposers = bindSharedFieldEffects(ctx, 'test', vm, 'fallback', refs);

        setFirstError('Required field');
        expect(refs.error.textContent).toBe('');

        ctx.latestSubmitDetailSignal.value = {
            validationReport: {
                results: [{ severity: 'error', path: 'test', message: 'Required field' }],
            },
        };
        expect(refs.error.textContent).toBe('Required field');
        expect(refs.control.getAttribute('aria-invalid')).toBe('true');

        disposers.forEach(d => d());
    });

    it('syncs aria-describedby on group container when skipAriaDescribedBy is true', () => {
        const ctx = makeMinimalBehaviorContext();
        const { vm } = mockFieldVM({ label: 'Choice', hint: 'Pick one' });
        const control = document.createElement('div');
        control.setAttribute('role', 'radiogroup');
        const hint = document.createElement('span');
        hint.id = 'field-choice-hint';
        hint.className = 'formspec-hint';
        hint.textContent = 'Pick one';
        const refs = {
            root: document.createElement('div'),
            label: document.createElement('legend'),
            control,
            error: document.createElement('div'),
            hint,
            skipAriaDescribedBy: true,
        };
        refs.root.appendChild(refs.label);
        refs.root.appendChild(control);
        refs.root.appendChild(hint);
        refs.root.appendChild(refs.error);

        const disposers = bindSharedFieldEffects(ctx, 'choice', vm, 'fallback', refs);
        expect(control.getAttribute('aria-describedby')).toBe('field-choice-hint');

        disposers.forEach(d => d());
    });

    it('syncs aria-describedby from hint id without static initialDescribedBy', () => {
        const ctx = makeMinimalBehaviorContext();
        const { vm, setLabel } = mockFieldVM({ label: 'Name', hint: 'Helper text' });
        const refs = makeFieldRefs();
        const hint = document.createElement('span');
        hint.id = 'field-test-hint';
        hint.className = 'formspec-hint';
        hint.textContent = 'Helper text';
        refs.hint = hint;
        refs.root.appendChild(hint);

        const disposers = bindSharedFieldEffects(ctx, 'test', vm, 'fallback', refs);
        expect(refs.control.getAttribute('aria-describedby')).toBe('field-test-hint');

        disposers.forEach(d => d());
    });

    it('returns dispose functions that clean up effects', () => {
        const ctx = makeMinimalBehaviorContext();
        const { vm, setLabel } = mockFieldVM({ label: 'A' });
        const refs = makeFieldRefs();

        const disposers = bindSharedFieldEffects(ctx, 'test', vm, 'fallback', refs);
        expect(refs.label.textContent).toBe('A');

        // Dispose
        disposers.forEach(d => d());

        // Change after dispose — should NOT update
        setLabel('B');
        expect(refs.label.textContent).toBe('A');
    });
});
