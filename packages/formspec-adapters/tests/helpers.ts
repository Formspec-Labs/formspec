/** @filedesc Shared mock factories for USWDS adapter tests. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import type {
    FieldBehavior, TextInputBehavior, NumberInputBehavior, RadioGroupBehavior,
    CheckboxGroupBehavior, SelectBehavior, DatePickerBehavior, ToggleBehavior,
    MoneyInputBehavior, SliderBehavior, RatingBehavior, FileUploadBehavior,
    SignatureBehavior, WizardBehavior, TabsBehavior, AdapterContext, FieldRefs,
} from '@formspec-org/webcomponent';

// ── Base defaults ──────────────────────────────────────────────────

const baseBehavior = {
    presentation: {} as any,
    widgetClassSlots: {},
    compOverrides: {},
    remoteOptionsState: { loading: false, error: null },
    options: () => [],
    hint: null,
    description: null,
};

// ── Per-type factories ─────────────────────────────────────────────

export function mockFieldBehavior(overrides?: Partial<FieldBehavior>): FieldBehavior {
    return {
        ...baseBehavior,
        fieldPath: 'agree', id: 'field-agree', label: 'I agree',
        bind: vi.fn(() => vi.fn()),
        ...overrides,
    } as FieldBehavior;
}

export function mockTextInput(overrides?: Partial<TextInputBehavior>): TextInputBehavior {
    return {
        ...baseBehavior,
        fieldPath: 'name', id: 'field-name', label: 'Full Name',
        placeholder: undefined, inputMode: undefined, maxLines: undefined,
        prefix: undefined, suffix: undefined, resolvedInputType: undefined,
        extensionAttrs: {},
        bind: vi.fn(() => vi.fn()),
        ...overrides,
    } as TextInputBehavior;
}

export function mockNumberInput(overrides?: Partial<NumberInputBehavior>): NumberInputBehavior {
    return {
        ...baseBehavior,
        fieldPath: 'age', id: 'field-age', label: 'Age',
        min: undefined, max: undefined, step: undefined, dataType: 'integer',
        bind: vi.fn(() => vi.fn()),
        ...overrides,
    } as NumberInputBehavior;
}

export function mockRadioGroup(overrides?: Partial<RadioGroupBehavior>): RadioGroupBehavior {
    return {
        ...baseBehavior,
        fieldPath: 'color', id: 'field-color', label: 'Color',
        groupRole: 'radiogroup', inputName: 'color',
        options: () => [{ value: 'r', label: 'Red' }, { value: 'b', label: 'Blue' }],
        bind: vi.fn(() => vi.fn()),
        ...overrides,
    } as RadioGroupBehavior;
}

export function mockCheckboxGroup(overrides?: Partial<CheckboxGroupBehavior>): CheckboxGroupBehavior {
    return {
        ...baseBehavior,
        fieldPath: 'colors', id: 'field-colors', label: 'Colors',
        groupRole: 'group', selectAll: false,
        options: () => [{ value: 'r', label: 'Red' }, { value: 'b', label: 'Blue' }],
        setValue: vi.fn(),
        bind: vi.fn(() => vi.fn()),
        ...overrides,
    } as CheckboxGroupBehavior;
}

export function mockSelect(overrides?: Partial<SelectBehavior>): SelectBehavior {
    return {
        ...baseBehavior,
        fieldPath: 'country', id: 'field-country', label: 'Country',
        placeholder: '- Select -', clearable: false, dataType: 'choice',
        options: () => [{ value: 'us', label: 'USA' }, { value: 'ca', label: 'Canada' }],
        bind: vi.fn(() => vi.fn()),
        ...overrides,
    } as SelectBehavior;
}

export function mockDatePicker(overrides?: Partial<DatePickerBehavior>): DatePickerBehavior {
    return {
        ...baseBehavior,
        fieldPath: 'dob', id: 'field-dob', label: 'Date of Birth',
        inputType: 'date', minDate: undefined, maxDate: undefined,
        bind: vi.fn(() => vi.fn()),
        ...overrides,
    } as DatePickerBehavior;
}

export function mockToggle(overrides?: Partial<ToggleBehavior>): ToggleBehavior {
    return {
        ...baseBehavior,
        fieldPath: 'notify', id: 'field-notify', label: 'Notifications',
        onLabel: 'On', offLabel: 'Off',
        bind: vi.fn(() => vi.fn()),
        ...overrides,
    } as ToggleBehavior;
}

export function mockMoneyInput(overrides?: Partial<MoneyInputBehavior>): MoneyInputBehavior {
    return {
        ...baseBehavior,
        fieldPath: 'amount', id: 'field-amount', label: 'Amount',
        min: undefined, max: undefined, step: undefined,
        placeholder: undefined, resolvedCurrency: '$',
        bind: vi.fn(() => vi.fn()),
        ...overrides,
    } as MoneyInputBehavior;
}

export function mockSlider(overrides?: Partial<SliderBehavior>): SliderBehavior {
    return {
        ...baseBehavior,
        fieldPath: 'volume', id: 'field-volume', label: 'Volume',
        min: 0, max: 100, step: 1, showTicks: false, showValue: false,
        bind: vi.fn(() => vi.fn()),
        ...overrides,
    } as SliderBehavior;
}

export function mockRating(overrides?: Partial<RatingBehavior>): RatingBehavior {
    return {
        ...baseBehavior,
        fieldPath: 'rating', id: 'field-rating', label: 'Rating',
        maxRating: 5, icon: '★', allowHalf: false, isInteger: true,
        setValue: vi.fn(),
        bind: vi.fn(() => vi.fn()),
        ...overrides,
    } as RatingBehavior;
}

export function mockFileUpload(overrides?: Partial<FileUploadBehavior>): FileUploadBehavior {
    return {
        ...baseBehavior,
        fieldPath: 'doc', id: 'field-doc', label: 'Document',
        accept: '.pdf', multiple: false, dragDrop: true,
        bind: vi.fn(() => vi.fn()),
        ...overrides,
    } as FileUploadBehavior;
}

export function mockSignature(overrides?: Partial<SignatureBehavior>): SignatureBehavior {
    return {
        ...baseBehavior,
        fieldPath: 'sig', id: 'field-sig', label: 'Signature',
        height: 200, strokeColor: '#000',
        bind: vi.fn(() => vi.fn()),
        ...overrides,
    } as SignatureBehavior;
}

export function mockWizard(overrides?: Partial<WizardBehavior>): WizardBehavior {
    return {
        id: 'wizard-1',
        compOverrides: {},
        steps: [{ id: 's1', title: 'Step 1' }, { id: 's2', title: 'Step 2' }],
        showSideNav: false, showProgress: true, allowSkip: false,
        activeStep: () => 0, totalSteps: () => 2,
        canGoNext: () => true, canGoPrev: () => false,
        goNext: vi.fn(), goPrev: vi.fn(), goToStep: vi.fn(),
        renderStep: vi.fn(),
        bind: vi.fn(() => vi.fn()),
        ...overrides,
    } as WizardBehavior;
}

export function mockTabs(overrides?: Partial<TabsBehavior>): TabsBehavior {
    return {
        id: 'tabs-1',
        compOverrides: {},
        tabLabels: ['Tab A', 'Tab B'],
        tabCount: 2, position: 'top', defaultTab: 0,
        activeTab: () => 0, setActiveTab: vi.fn(),
        renderTab: vi.fn(),
        bind: vi.fn(() => vi.fn()),
        ...overrides,
    } as TabsBehavior;
}

// ── AdapterContext factory ─────────────────────────────────────────

export function mockAdapterContext(): AdapterContext {
    return {
        onDispose: vi.fn(),
        applyCssClass: vi.fn(),
        applyStyle: vi.fn(),
        applyAccessibility: vi.fn(),
        applyClassValue: vi.fn(),
    };
}

// ── Helpers ────────────────────────────────────────────────────────

/** Extract the FieldRefs that an adapter passed to bind(). */
export function captureBindRefs(behavior: { bind: ReturnType<typeof vi.fn> }): FieldRefs {
    if (behavior.bind.mock.calls.length !== 1) {
        throw new Error(`Expected bind() to be called once, was called ${behavior.bind.mock.calls.length} times`);
    }
    return behavior.bind.mock.calls[0][0];
}

/**
 * Mock canvas 2D context for happy-dom (which doesn't support getContext).
 * Call this before any test that renders the Signature adapter.
 */
export function mockCanvasContext(): void {
    const proto = HTMLCanvasElement.prototype;
    if (!(proto as any).__mocked) {
        const original = proto.getContext;
        (proto as any).getContext = function (type: string) {
            if (type === '2d') {
                return {
                    beginPath: vi.fn(),
                    moveTo: vi.fn(),
                    lineTo: vi.fn(),
                    stroke: vi.fn(),
                    clearRect: vi.fn(),
                    setTransform: vi.fn(),
                    scale: vi.fn(),
                    strokeStyle: '',
                    lineWidth: 1,
                };
            }
            return original.call(this, type);
        };
        (proto as any).__mocked = true;
    }
}

const adaptersPkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Compiled USWDS integration stylesheet (fs-fp3e subpath export). */
export function readUswdsIntegrationCss(): string {
    return readFileSync(join(adaptersPkgRoot, 'dist/uswds-integration.css'), 'utf8');
}
