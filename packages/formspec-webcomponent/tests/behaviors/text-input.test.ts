import { describe, it, expect, beforeAll } from 'vitest';
import { signal } from '@preact/signals-core';

let useTextInput: any;

beforeAll(async () => {
    const behaviorMod = await import('../../src/behaviors/text-input');
    useTextInput = behaviorMod.useTextInput;
});

function makeBehaviorContext(items: any[], prefix = '') {
    // Minimal BehaviorContext for testing behavior contract (not DOM binding)
    return {
        engine: {
            signals: {} as any,
            requiredSignals: {} as any,
            errorSignals: {} as any,
            readonlySignals: {} as any,
            relevantSignals: {} as any,
            setValue: () => {},
            getOptionsSignal: () => undefined,
            getOptionsStateSignal: () => undefined,
            getOptions: () => undefined,
            getOptionsState: () => undefined,
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
}

describe('useTextInput', () => {
    it('returns a TextInputBehavior with correct fieldPath and label', () => {
        const items = [{ key: 'name', type: 'field', label: 'Full Name', dataType: 'string' }];
        const ctx = makeBehaviorContext(items);
        const comp = { component: 'TextInput', bind: 'name' };
        const behavior = useTextInput(ctx, comp);
        expect(behavior.fieldPath).toBe('name');
        expect(behavior.label).toBe('Full Name');
        expect(behavior.id).toBe('field-name');
        expect(behavior.options()).toEqual([]);
    });

    // Component spec removed labelOverride (ADR 0013): labels come from the Definition, Locale, or theme only.
    it.each([
        'useTextInput', 'useNumberInput', 'useRadioGroup', 'useCheckboxGroup', 'useSelect', 'useToggle',
        'useDatePicker', 'useMoneyInput', 'useSlider', 'useRating', 'useFileUpload', 'useSignature',
    ])('%s ignores the removed labelOverride prop', async (hook) => {
        const behaviors: any = await import('../../src/behaviors');
        const items = [{ key: 'name', type: 'field', label: 'Full Name', dataType: 'string' }];
        const comp = { component: 'TextInput', bind: 'name', labelOverride: 'Your Name' };
        expect(behaviors[hook](makeBehaviorContext(items), comp).label).toBe('Full Name');
    });

    it('reads hint and description from the field view model (Locale + {{}} interpolation)', () => {
        const items = [{ key: 'name', type: 'field', label: 'Name', dataType: 'string', hint: 'raw {{$x}}', description: 'raw desc' }];
        const ctx = {
            ...makeBehaviorContext(items),
            getFieldVM: () => ({
                label: signal('Nom'),
                hint: signal('Indice 5'),
                description: signal('Description FR'),
            }),
        };
        const comp = { component: 'TextInput', bind: 'name', hintOverride: 'comp hint' };
        const behavior = useTextInput(ctx, comp);
        expect(behavior.hint).toBe('Indice 5');
        expect(behavior.description).toBe('Description FR');
    });

    it('falls back to item hint when no view model exists', () => {
        const items = [{ key: 'name', type: 'field', label: 'Name', dataType: 'string', hint: 'item hint' }];
        const ctx = makeBehaviorContext(items);
        const comp = { component: 'TextInput', bind: 'name' };
        const behavior = useTextInput(ctx, comp);
        expect(behavior.hint).toBe('item hint');
    });

    it('extracts TextInput-specific props', () => {
        const items = [{ key: 'name', type: 'field', label: 'Name', dataType: 'string' }];
        const ctx = makeBehaviorContext(items);
        const comp = { component: 'TextInput', bind: 'name', placeholder: 'Type here', maxLines: 3, prefix: '$', suffix: '.00', width: 'sm' };
        const behavior = useTextInput(ctx, comp);
        expect(behavior.placeholder).toBe('Type here');
        expect(behavior.maxLines).toBe(3);
        expect(behavior.prefix).toBe('$');
        expect(behavior.suffix).toBe('.00');
        expect(behavior.width).toBe('sm');
    });

    it('resolves extension attributes from registry entries', () => {
        const items = [{
            key: 'email',
            type: 'field',
            label: 'Email',
            dataType: 'string',
            extensions: { 'x-formspec-email': true }
        }];
        const ctx = makeBehaviorContext(items);
        ctx.registryEntries.set('x-formspec-email', {
            metadata: { inputMode: 'email' },
            constraints: { maxLength: 254 },
        });
        const comp = { component: 'TextInput', bind: 'email' };
        const behavior = useTextInput(ctx, comp);
        expect(behavior.resolvedInputType).toBe('email');
        expect(behavior.extensionAttrs.inputMode).toBe('email');
        expect(behavior.extensionAttrs.maxLength).toBe('254');
    });

    it('handles prefix path correctly', () => {
        const items = [{ key: 'field', type: 'field', label: 'Field', dataType: 'string' }];
        const ctx = makeBehaviorContext(items, 'group[0]');
        const comp = { component: 'TextInput', bind: 'field' };
        const behavior = useTextInput(ctx, comp);
        expect(behavior.fieldPath).toBe('group[0].field');
    });

    it('extracts compOverrides from comp', () => {
        const items = [{ key: 'name', type: 'field', label: 'Name', dataType: 'string' }];
        const ctx = makeBehaviorContext(items);
        const comp = { component: 'TextInput', bind: 'name', cssClass: 'custom', style: { color: 'red' }, accessibility: { role: 'textbox' } };
        const behavior = useTextInput(ctx, comp);
        expect(behavior.compOverrides.cssClass).toBe('custom');
        expect(behavior.compOverrides.style).toEqual({ color: 'red' });
        expect(behavior.compOverrides.accessibility).toEqual({ role: 'textbox' });
    });

    it('bind() returns a dispose function', () => {
        const items = [{ key: 'name', type: 'field', label: 'Name', dataType: 'string' }];
        const ctx = makeBehaviorContext(items);
        const comp = { component: 'TextInput', bind: 'name' };
        const behavior = useTextInput(ctx, comp);

        const refs = {
            root: document.createElement('div'),
            label: document.createElement('label'),
            control: document.createElement('input'),
            error: document.createElement('div'),
        };

        const dispose = behavior.bind(refs);
        expect(typeof dispose).toBe('function');
        dispose();
    });
});
