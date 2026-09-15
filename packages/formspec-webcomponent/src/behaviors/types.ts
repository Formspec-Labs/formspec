/** @filedesc Core behavior contract types for the headless component architecture. */
import type { ReadonlySignal, Signal } from '@preact/signals-core';
import type { IFormEngine } from '@formspec-org/engine/render';
import type { FieldViewModel } from '@formspec-org/engine';
import type { FieldHelpReference, PresentationBlock, ItemDescriptor, LayoutNode } from '@formspec-org/layout';
import type {
    FormDefinition,
    FormItem,
    RegistryEntry,
    ValidationOverride,
    ValidationProfile,
    WidthStop,
} from '@formspec-org/types';
import type {
    ComponentDescriptor,
    ComponentPresentationOverrides,
    SubmitDetail,
    TokenResolvable,
} from '../hub-types.js';

/**
 * Pre-resolved PresentationBlock — all $token. references already
 * substituted with concrete values. Adapters never need token resolution.
 */
export type { SubmitDetail };

export interface ResolvedPresentationBlock {
    widget?: string;
    widgetConfig?: Record<string, unknown>;
    labelPosition?: 'top' | 'start' | 'hidden';
    style?: Record<string, string>;
    accessibility?: { role?: string; description?: string; liveRegion?: string };
    cssClass?: string | string[];
    fallback?: string[];
    /** Theme `requiredIndicator` (§5.2): `'none'` hides the visible required marker; `aria-required` is unaffected. */
    requiredIndicator?: 'marker' | 'none';
}

export interface FieldRefs {
    root: HTMLElement;
    label: HTMLElement;
    control: HTMLElement;
    hint?: HTMLElement;
    error?: HTMLElement;
    optionControls?: Map<string, HTMLInputElement>;
    rebuildOptions?: (
        container: HTMLElement,
        options: ReadonlyArray<{ value: string; label: string }>
    ) => Map<string, HTMLInputElement>;
    /** Called by bind() when validation state changes. Adapters use this to toggle error classes. */
    onValidationChange?: (hasError: boolean, message: string) => void;
    /** When true, {@link bindSharedFieldEffects} does not set `readOnly` on the control (combobox manages it). */
    skipSharedReadonlyControl?: boolean;
    /** When true, {@link bindSharedFieldEffects} sets `aria-describedby` on `refs.control` (group container) instead of the inner input. */
    skipAriaDescribedBy?: boolean;
    /**
     * Adapter-owned value carrier when the visible control is not the value element (USWDS date picker:
     * hidden ISO input + `setCalendarValue`). Defaults to `control` when absent.
     */
    valueIO?: { element: HTMLInputElement; write: (value: string) => void };
}

export interface FieldBehavior {
    fieldPath: string;
    id: string;
    label: string;
    hint: string | null;
    description: string | null;
    /** FieldViewModel for reactive locale-resolved state. When present, bind() uses VM signals. */
    vm?: FieldViewModel;
    presentation: ResolvedPresentationBlock;
    /**
     * Widget class slots from theme widgetConfig x-classes.
     * Used by the default adapter for slot-level class injection.
     * Custom adapters can ignore this.
     */
    widgetClassSlots: { root?: unknown; label?: unknown; control?: unknown; hint?: unknown; error?: unknown };
    /**
     * Component-level style/class/accessibility overrides from the component descriptor.
     * Used by the default adapter to apply comp-level overrides.
     * Custom adapters can ignore this — they own their own styling.
     */
    compOverrides: ComponentPresentationOverrides;
    remoteOptionsState: { loading: boolean; error: string | null };
    options(): ReadonlyArray<{ value: string; label: string; keywords?: string[] }>;
    setValue(val: unknown): void;
    touch(): void;
    bind(refs: FieldRefs): () => void;
}

export interface RadioGroupBehavior extends FieldBehavior {
    groupRole: 'radiogroup';
    inputName: string;
    orientation?: string;
}

export interface CheckboxGroupBehavior extends FieldBehavior {
    groupRole: 'group';
    selectAll: boolean;
    columns?: number;
    setValue(val: string[]): void;
}

export interface SelectBehavior extends FieldBehavior {
    placeholder?: string;
    clearable?: boolean;
    dataType: string;
    /** Combobox with optional filter (native &lt;select&gt; when false and not multiple). */
    searchable?: boolean;
    /** Multi-value combobox; use with multiChoice fields. */
    multiple?: boolean;
    /** Theme `widgetConfig.width` (theme §4.2 Width Stops): planner-carried, an adapter maps it to its own class. */
    width?: WidthStop;
}

export interface ToggleBehavior extends FieldBehavior {
    onLabel?: string;
    offLabel?: string;
}

export interface TextInputBehavior extends FieldBehavior {
    placeholder?: string;
    inputMode?: string;
    maxLines?: number;
    /** Theme `widgetConfig.maxLength` (theme §4.2): character limit, rendered with a remaining-count display. */
    maxLength?: number;
    /** Display-only text before/after the input: component prop, else definition item `prefix`/`suffix`. */
    prefix?: string;
    suffix?: string;
    resolvedInputType?: string;
    extensionAttrs: Record<string, string>;
    /** Theme `widgetConfig.width` (theme §4.2 Width Stops): planner-carried, an adapter maps it to its own class. */
    width?: WidthStop;
}

export interface NumberInputBehavior extends FieldBehavior {
    min?: number;
    max?: number;
    step?: number;
    showStepper: boolean;
    dataType: string;
    placeholder?: string;
    /** Display-only text before/after the input (definition item `prefix`/`suffix`, core §4.2.3). */
    prefix?: string;
    suffix?: string;
    /** Theme `widgetConfig.width` (theme §4.2 Width Stops): planner-carried, an adapter maps it to its own class. */
    width?: WidthStop;
}

export interface DatePickerBehavior extends FieldBehavior {
    inputType: string;
    minDate?: string;
    maxDate?: string;
    placeholder?: string;
    /** Theme `widgetConfig.width` (theme §4.2 Width Stops): planner-carried, an adapter maps it to its own class. */
    width?: WidthStop;
}

export interface MoneyInputBehavior extends FieldBehavior {
    min?: number;
    max?: number;
    step?: number;
    placeholder?: string;
    resolvedCurrency: string | null;
    /** Theme `widgetConfig.width` (theme §4.2 Width Stops): planner-carried, an adapter maps it to its own class. */
    width?: WidthStop;
}

export interface SliderBehavior extends FieldBehavior {
    min?: number;
    max?: number;
    step?: number;
    showTicks: boolean;
    showValue: boolean;
}

export interface RatingBehavior extends FieldBehavior {
    maxRating: number;
    icon: string;
    unselectedIcon: string;
    allowHalf: boolean;
    isInteger: boolean;
    setValue(value: number): void;
}

export interface FileUploadBehavior extends FieldBehavior {
    accept?: string;
    multiple: boolean;
    dragDrop: boolean;
    maxSize?: number;
    /** Reactive snapshot of currently selected files. */
    files(): ReadonlyArray<{ name: string; size: number; type: string }>;
    /** Remove a file by index (multi-file mode accumulates). */
    removeFile(index: number): void;
    /** Clear all selected files. */
    clearFiles(): void;
}

export interface SignatureBehavior extends FieldBehavior {
    height: number;
    strokeColor: string;
}

export interface DataTableRefs {
    root: HTMLElement;
    table: HTMLTableElement;
    tbody: HTMLElement;
}

export interface DataTableBehavior {
    comp: ComponentDescriptor;
    host: import('../adapters/display-host').DisplayHostSlice;
    id?: string;
    compOverrides: ComponentPresentationOverrides;
    bindKey: string;
    fullName: string;
    columns: ReadonlyArray<{ header: string; bind: string; min?: number; max?: number; step?: number }>;
    /** One localized header per column: follows the active locale; read it in effects, never while building rows. */
    headers: ReadonlyArray<import('../adapters/layout-behaviors').LocalizedText>;
    showRowNumbers: boolean;
    allowAdd: boolean;
    allowRemove: boolean;
    groupLabel: string;
    repeatCount: ReadonlySignal<number>;
    /** False while the bound group is not relevant: hide the whole table. */
    relevant: ReadonlySignal<boolean>;
    /** False at `maxRepeat` or when `allowAdd` is false: hide Add; `addInstance` is a no-op. */
    canAdd: ReadonlySignal<boolean>;
    /** False at or below `minRepeat` or when `allowRemove` is false: omit Remove; `removeInstance` is a no-op. */
    canRemove: ReadonlySignal<boolean>;
    addInstance(): void;
    removeInstance(index: number): void;
    bind(refs: DataTableRefs): () => void;
}

/** Sidenav item refs for reactive class/text updates without DOM rebuilds. */
export interface WizardSidenavItemRefs {
    item: HTMLElement;
    button: HTMLButtonElement;
    circle: HTMLElement;
}

/** Progress indicator refs for reactive class updates without DOM rebuilds. */
export interface WizardProgressItemRefs {
    indicator: HTMLElement;
    label?: HTMLElement;
}

export interface WizardRefs {
    root: HTMLElement;
    panels: HTMLElement[];
    /** Visible “Step N of M” line (matches React Wizard). */
    stepIndicator?: HTMLElement;
    /** Polite live region for step changes. */
    announcer?: HTMLElement;
    stepIndicators?: HTMLElement[];
    stepContent: HTMLElement;
    prevButton?: HTMLButtonElement;
    nextButton?: HTMLButtonElement;
    skipButton?: HTMLButtonElement;
    /** Sidenav items built once by the adapter; bind() toggles classes/text. */
    sidenavItems?: WizardSidenavItemRefs[];
    /** Progress indicators built once by the adapter; bind() toggles classes. */
    progressItems?: WizardProgressItemRefs[];
    /** Callback invoked whenever the active step changes. */
    onStepChange?: (stepIndex: number, totalSteps: number) => void;
}

export interface WizardBehavior {
    id?: string;
    compOverrides: ComponentPresentationOverrides;
    steps: ReadonlyArray<{ id: string; title: string }>;
    showSideNav: boolean;
    showProgress: boolean;
    allowSkip: boolean;
    activeStep(): number;
    totalSteps(): number;
    canGoNext(): boolean;
    canGoPrev(): boolean;
    goNext(): void;
    goPrev(): void;
    goToStep(index: number): void;
    renderStep(index: number, parent: HTMLElement): void;
    bind(refs: WizardRefs): () => void;
}

export interface TabsRefs {
    root: HTMLElement;
    tabBar: HTMLElement;
    panels: HTMLElement[];
    buttons: HTMLButtonElement[];
    /** Callback invoked whenever the active tab changes. */
    onTabChange?: (tabIndex: number) => void;
}

export interface TabsBehavior {
    id?: string;
    compOverrides: ComponentPresentationOverrides;
    /** One label per tab: follows the active locale; write it with `watchText`. */
    tabLabels: ReadonlyArray<import('../adapters/layout-behaviors').LocalizedText>;
    tabCount: number;
    placement: 'top' | 'bottom' | 'left' | 'right';
    defaultTab: number;
    activeTab(): number;
    setActiveTab(index: number): void;
    renderTab(index: number, parent: HTMLElement): void;
    bind(refs: TabsRefs): () => void;
}

/**
 * Context passed to behavior hooks. Subset of RenderContext
 * focused on what behaviors actually need.
 */
export interface BehaviorContext {
    engine: IFormEngine;
    definition: FormDefinition | null;
    prefix: string;
    cleanupFns: Array<() => void>;
    touchedFields: Set<string>;
    touchedVersion: Signal<number>;
    latestSubmitDetailSignal: Signal<SubmitDetail | null>;
    resolveToken: (val: TokenResolvable) => TokenResolvable;
    resolveItemPresentation: (item: ItemDescriptor) => PresentationBlock;
    resolveWidgetClassSlots: (presentation: PresentationBlock) => {
        root?: unknown; label?: unknown; control?: unknown; hint?: unknown; error?: unknown;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- planner snapshots vs schema FormItem
    findItemByKey: (key: string) => any;
    /** Human-facing References bound to `fieldPath`, in presentation order (References spec §7). */
    fieldHelp?: (fieldPath: string) => readonly FieldHelpReference[];
    renderComponent: (comp: LayoutNode | ComponentDescriptor, parent: HTMLElement, prefix?: string) => void;
    submit: (options?: {
        profile?: ValidationProfile;
        validationTuple?: ValidationOverride;
        emitEvent?: boolean;
    }) => SubmitDetail | null;
    registryEntries: Map<string, RegistryEntry>;
    rerender: () => void;
    /** Resolve the FieldViewModel for a component's bound field. Returns undefined if no VM exists. */
    getFieldVM: (fieldPath: string) => FieldViewModel | undefined;
}
