/** @filedesc widgetConfig.width reaching each width-stop behavior builder (theme §4.2 Width Stops), real chain. */
import { describe, it, expect, beforeAll } from 'vitest';
import { signal } from '@preact/signals-core';

let useSelect: any;
let useNumberInput: any;
let useDatePicker: any;
let useMoneyInput: any;

beforeAll(async () => {
    useSelect = (await import('../../src/behaviors/select')).useSelect;
    useNumberInput = (await import('../../src/behaviors/number-input')).useNumberInput;
    useDatePicker = (await import('../../src/behaviors/date-picker')).useDatePicker;
    useMoneyInput = (await import('../../src/behaviors/money-input')).useMoneyInput;
});

function makeBehaviorContext(items: any[]) {
    // Minimal BehaviorContext for testing behavior contract (not DOM binding).
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
        prefix: '',
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

// The planner writes widgetConfig.width onto the component's `width` prop (planner-width-stops.ts);
// each of these builders must carry that prop onto its typed behavior — the same real chain the USWDS
// and default adapters' width-stop tests assume, but exercised here with no adapter mock in the way.
describe('widgetConfig.width reaches the behavior', () => {
    it('useSelect', () => {
        const items = [{ key: 'state', type: 'field', label: 'State', dataType: 'choice', options: [] }];
        const ctx = makeBehaviorContext(items);
        const behavior = useSelect(ctx, { component: 'Select', bind: 'state', width: 'xl' });
        expect(behavior.width).toBe('xl');
    });

    it('useNumberInput', () => {
        const items = [{ key: 'qty', type: 'field', label: 'Qty', dataType: 'integer' }];
        const ctx = makeBehaviorContext(items);
        const behavior = useNumberInput(ctx, { component: 'NumberInput', bind: 'qty', width: 'xs' });
        expect(behavior.width).toBe('xs');
    });

    it('useDatePicker', () => {
        const items = [{ key: 'dob', type: 'field', label: 'DOB', dataType: 'date' }];
        const ctx = makeBehaviorContext(items);
        const behavior = useDatePicker(ctx, { component: 'DatePicker', bind: 'dob', width: 'lg' });
        expect(behavior.width).toBe('lg');
    });

    it('useMoneyInput', () => {
        const items = [{ key: 'fee', type: 'field', label: 'Fee', dataType: 'money' }];
        const ctx = makeBehaviorContext(items);
        const behavior = useMoneyInput(ctx, { component: 'MoneyInput', bind: 'fee', width: 'md' });
        expect(behavior.width).toBe('md');
    });
});
