/** @filedesc Shared hub types for FormspecRender, RenderHost, and behavior contracts. */
import type { Signal } from '@preact/signals-core';
import type { IFormEngine } from '@formspec-org/engine/render';
import type {
    ComponentDocument,
    FormDefinition,
    FormItem,
    FormResponse,
    RegistryEntry,
    ValidationReport,
    ValidationResult,
} from '@formspec-org/types';
import type {
    ItemDescriptor,
    LayoutNode,
    PresentationBlock,
    ThemeDocument,
} from '@formspec-org/layout';

export type { PresentationBlock };

/** Accessibility block on a component or layout node. */
export interface ComponentAccessibility {
    role?: string;
    description?: string;
    liveRegion?: string;
    ariaDescription?: string;
}

/** Presentation fields read by styling helpers (component doc or synthesized planner comp). */
export interface ComponentPresentationSource {
    cssClass?: string | string[];
    style?: Record<string, string | number>;
    accessibility?: ComponentAccessibility;
}

/** Component document tree node — planner output or component-doc shape. */
export type ComponentDescriptor = ComponentPresentationSource & {
    component: string;
    children?: unknown[];
    id?: string;
    title?: string;
    props?: Record<string, unknown>;
    when?: string;
    whenPrefix?: string;
    labelPosition?: 'top' | 'start' | 'hidden';
    presentation?: PresentationBlock;
    fieldItem?: LayoutNode['fieldItem'];
    bindPath?: string;
};

/** Response `data` / screener answer maps (JSON-compatible values). */
export type FormDataRecord = Record<string, unknown>;

/** Values accepted by theme/component token resolution. */
export type TokenResolvable = unknown;

export interface SubmitDetail {
    response: FormResponse;
    validationReport: ValidationReport;
}

/** Component-level style/class/accessibility overrides on behavior objects. */
export interface ComponentPresentationOverrides {
    cssClass?: string | string[];
    style?: Record<string, string | number>;
    accessibility?: LayoutNode['accessibility'];
}

/** Metadata describing where a validation result points and whether it is jumpable. */
export interface ValidationTargetMetadata {
    path: string;
    label: string;
    formLevel: boolean;
    jumpable: boolean;
    fieldElement?: HTMLElement | null;
}

/**
 * Interface for what emitNode/renderActualComponent need from {@link FormspecRender}.
 */
export interface RenderHost {
    engine: IFormEngine;
    _definition: FormDefinition | null;
    _componentDocument: ComponentDocument | null;
    _themeDocument: ThemeDocument | null;
    cleanupFns: Array<() => void>;
    touchedFields: Set<string>;
    touchedVersion: Signal<number>;
    _submitPendingSignal: Signal<boolean>;
    _latestSubmitDetailSignal: Signal<SubmitDetail | null>;
    resolveToken(val: TokenResolvable): TokenResolvable;
    resolveItemPresentation(itemDesc: ItemDescriptor): PresentationBlock;
    applyStyle(el: HTMLElement, style: Record<string, string | number> | undefined): void;
    applyCssClass(el: HTMLElement, comp: ComponentPresentationSource): void;
    applyClassValue(el: HTMLElement, classValue: unknown): void;
    resolveWidgetClassSlots(presentation: PresentationBlock): {
        root?: unknown;
        label?: unknown;
        control?: unknown;
        hint?: unknown;
        error?: unknown;
    };
    applyAccessibility(el: HTMLElement, comp: ComponentPresentationSource): void;
    findItemByKey(key: string, items?: FormItem[]): FormItem | null;
    _registryEntries: Map<string, RegistryEntry>;
    submit(options?: { mode?: 'continuous' | 'submit'; emitEvent?: boolean }): SubmitDetail | null;
    resolveValidationTarget(resultOrPath: string | ValidationResult): ValidationTargetMetadata;
    focusField(path: string): boolean;
    setSubmitPending(pending: boolean): void;
    isSubmitPending(): boolean;
    render(): void;
    activeBreakpoint: string | null;
}
