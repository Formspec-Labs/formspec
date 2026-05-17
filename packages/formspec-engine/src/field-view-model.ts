/** @filedesc FieldViewModel — per-field reactive state with locale resolution and FEL interpolation. */

import type { OptionEntry } from '@formspec-org/types';
import type { EngineReactiveRuntime, EngineSignal, ReadonlyEngineSignal } from './reactivity/types.js';
import type { LocaleStore } from './locale.js';
import { interpolateMessage } from './interpolate-message.js';

// ── Public interface ────────────────────────────────────────────────

export interface FieldViewModel {
    // ── Identity ──
    readonly templatePath: string;
    readonly instancePath: string;
    readonly id: string;
    readonly itemKey: string;
    readonly dataType: string;

    // ── Presentation (locale-resolved, FEL-interpolated, reactive) ──
    readonly label: ReadonlyEngineSignal<string>;
    readonly hint: ReadonlyEngineSignal<string | null>;
    readonly description: ReadonlyEngineSignal<string | null>;

    // ── State ──
    readonly value: ReadonlyEngineSignal<any>;
    readonly required: ReadonlyEngineSignal<boolean>;
    readonly visible: ReadonlyEngineSignal<boolean>;
    readonly readonly: ReadonlyEngineSignal<boolean>;
    readonly disabledDisplay: 'hidden' | 'protected';

    // ── Validation ──
    readonly errors: ReadonlyEngineSignal<ResolvedValidationResult[]>;
    readonly firstError: ReadonlyEngineSignal<string | null>;

    // ── Options (choice fields) ──
    readonly options: ReadonlyEngineSignal<ResolvedOption[]>;
    readonly optionsState: ReadonlyEngineSignal<{ loading: boolean; error: string | null }>;

    // ── Write ──
    setValue(value: any): void;
}

export interface ResolvedValidationResult {
    path: string;
    severity: string;
    constraintKind: string;
    code: string;
    message: string;
}

export interface ResolvedOption {
    value: string;
    label: string;
    /** Abbreviations / alternate names for combobox type-ahead (from definition option.keywords). */
    keywords?: string[];
}

// ── Factory dependencies ────────────────────────────────────────────

export interface FieldViewModelDeps {
    rx: EngineReactiveRuntime;
    localeStore: LocaleStore;
    templatePath: string;
    instancePath: string;
    id: string;
    itemKey: string;
    dataType: string;
    getItemLabel: () => string;
    getItemHint: () => string | null;
    getItemDescription: () => string | null;
    getItemLabels: () => Record<string, string> | undefined;
    getLabelContext: () => string | null;
    getFieldValue: () => EngineSignal<any>;
    getRequired: () => EngineSignal<boolean>;
    getVisible: () => EngineSignal<boolean>;
    getReadonly: () => EngineSignal<boolean>;
    getDisabledDisplay: () => 'hidden' | 'protected';
    getErrors: () => EngineSignal<any[]>;
    getOptions: () => EngineSignal<OptionEntry[]>;
    getOptionsState: () => EngineSignal<{ loading: boolean; error: string | null }>;
    getOptionSetName: () => string | undefined;
    setFieldValue: (value: any) => void;
    evalFEL: (expr: string) => import('./wasm-bridge-runtime.js').FelEvalResult | unknown;
}

// ── Code synthesis table (§3.1.4) ───────────────────────────────────

const CODE_SYNTHESIS: Record<string, string> = {
    required: 'REQUIRED',
    type: 'TYPE_MISMATCH',
    constraint: 'CONSTRAINT_FAILED',
    shape: 'SHAPE_FAILED',
    external: 'EXTERNAL_FAILED',
};

// ── Factory ─────────────────────────────────────────────────────────

export function createFieldViewModel(deps: FieldViewModelDeps): FieldViewModel {
    const { rx, localeStore, templatePath, evalFEL } = deps;

    function resolveLocaleString(key: string, fallback: string | null | undefined): string | null {
        // Read locale version to trigger re-computation on locale changes
        localeStore.version.value;
        const localized = localeStore.lookupKey(key);
        const raw = localized ?? fallback ?? null;
        if (raw === null) return null;
        const { text } = interpolateMessage(raw, evalFEL);
        return text;
    }

    // ── Label: 6-step cascade with context ──

    const label = rx.computed((): string => {
        localeStore.version.value;
        const context = deps.getLabelContext();
        const labels = deps.getItemLabels();
        const inlineLabel = deps.getItemLabel();

        if (context) {
            // Steps 1-2: Locale lookup for key.label@context (cascade walks fr-CA → fr)
            const contextKey = `${templatePath}.label@${context}`;
            const fromLocale = localeStore.lookupKey(contextKey);
            if (fromLocale !== null) {
                return interpolateMessage(fromLocale, evalFEL).text;
            }

            // Steps 3-4: Locale lookup for key.label (no context)
            const plainKey = `${templatePath}.label`;
            const plainFromLocale = localeStore.lookupKey(plainKey);
            if (plainFromLocale !== null) {
                return interpolateMessage(plainFromLocale, evalFEL).text;
            }

            // Step 5: Definition labels[context]
            if (labels?.[context]) {
                return interpolateMessage(labels[context], evalFEL).text;
            }

            // Step 6: Definition label
            return interpolateMessage(inlineLabel, evalFEL).text;
        }

        // No context: 2-step (locale → inline)
        const plainKey = `${templatePath}.label`;
        const fromLocale = localeStore.lookupKey(plainKey);
        if (fromLocale !== null) {
            return interpolateMessage(fromLocale, evalFEL).text;
        }
        return interpolateMessage(inlineLabel, evalFEL).text;
    });

    // ── Hint: 2-step cascade ──

    const hint = rx.computed((): string | null => {
        return resolveLocaleString(`${templatePath}.hint`, deps.getItemHint());
    });

    // ── Description: 2-step cascade ──

    const description = rx.computed((): string | null => {
        return resolveLocaleString(`${templatePath}.description`, deps.getItemDescription());
    });

    // ── State signals: wrap existing engine signals ──

    const value = rx.computed(() => deps.getFieldValue().value);
    const required = rx.computed(() => deps.getRequired().value);
    const visible = rx.computed(() => deps.getVisible().value);
    const readonly_ = rx.computed(() => deps.getReadonly().value);

    // ── Validation: locale-resolved messages with code synthesis ──

    const errors = rx.computed((): ResolvedValidationResult[] => {
        localeStore.version.value;
        const rawErrors = deps.getErrors().value;
        if (!rawErrors.length) return [];

        return rawErrors.map((err: any) => {
            const code = err.code ?? CODE_SYNTHESIS[err.constraintKind] ?? 'UNKNOWN';
            const resolvedMessage = resolveValidationMessage(err, code);
            return {
                path: err.path,
                severity: err.severity,
                constraintKind: err.constraintKind ?? 'unknown',
                code,
                message: resolvedMessage,
            };
        });
    });

    const firstError = rx.computed((): string | null => {
        const errs = errors.value;
        const firstErr = errs.find(e => e.severity === 'error');
        return firstErr?.message ?? null;
    });

    // ── Options: 3-step locale cascade ──

    const options = rx.computed((): ResolvedOption[] => {
        localeStore.version.value;
        const rawOptions = deps.getOptions().value;
        const optionSetName = deps.getOptionSetName();

        return rawOptions.map((opt) => {
            const resolved: ResolvedOption = {
                value: opt.value,
                label: resolveOptionLabel(opt, optionSetName),
            };
            if (opt.keywords && opt.keywords.length > 0) {
                resolved.keywords = [...opt.keywords];
            }
            return resolved;
        });
    });

    const optionsState = rx.computed(() => deps.getOptionsState().value);

    // ── Helpers ──

    function resolveValidationMessage(err: any, code: string): string {
        // Step 1: Per-code key — templatePath.errors.CODE
        const codeKey = `${templatePath}.errors.${code}`;
        const fromCode = localeStore.lookupKey(codeKey);
        if (fromCode !== null) {
            return interpolateMessage(fromCode, evalFEL).text;
        }

        // Step 2: Per-bind key — templatePath.requiredMessage or templatePath.constraintMessage
        if (err.constraintKind === 'required') {
            const reqKey = `${templatePath}.requiredMessage`;
            const fromReq = localeStore.lookupKey(reqKey);
            if (fromReq !== null) return interpolateMessage(fromReq, evalFEL).text;
        } else {
            const constKey = `${templatePath}.constraintMessage`;
            const fromConst = localeStore.lookupKey(constKey);
            if (fromConst !== null) return interpolateMessage(fromConst, evalFEL).text;
        }

        // Step 3: Inline bind constraintMessage
        if (err.constraintMessage) return interpolateMessage(err.constraintMessage, evalFEL).text;

        // Step 4: Processor default
        return err.message ?? 'Validation error';
    }

    function resolveOptionLabel(opt: { value: string; label: string }, optionSetName?: string): string {
        const escapedValue = escapeOptionValue(opt.value);

        // Step 1: Field-level locale key
        const fieldKey = `${templatePath}.options.${escapedValue}.label`;
        const fromField = localeStore.lookupKey(fieldKey);
        if (fromField !== null) return interpolateMessage(fromField, evalFEL).text;

        // Step 2: OptionSet-level locale key
        if (optionSetName) {
            const setKey = `$optionSet.${optionSetName}.${escapedValue}.label`;
            const fromSet = localeStore.lookupKey(setKey);
            if (fromSet !== null) return interpolateMessage(fromSet, evalFEL).text;
        }

        // Step 3: Inline option label
        return opt.label;
    }

    return {
        templatePath: deps.templatePath,
        instancePath: deps.instancePath,
        id: deps.id,
        itemKey: deps.itemKey,
        dataType: deps.dataType,
        disabledDisplay: deps.getDisabledDisplay(),
        label,
        hint,
        description,
        value,
        required,
        visible,
        readonly: readonly_,
        errors,
        firstError,
        options,
        optionsState,
        setValue: deps.setFieldValue,
    };
}

/** Escape dots and backslashes in option values per §3.1.3. */
function escapeOptionValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/\./g, '\\.');
}
