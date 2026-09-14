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
    readonly labelNeedAnchors: ReadonlyEngineSignal<string[]>;
    readonly hint: ReadonlyEngineSignal<string | null>;
    readonly hintNeedAnchors: ReadonlyEngineSignal<string[]>;
    readonly description: ReadonlyEngineSignal<string | null>;
    readonly descriptionNeedAnchors: ReadonlyEngineSignal<string[]>;

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
    /** Canonical Need anchors copied from the exact authored option label. */
    needAnchors?: string[];
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

interface ResolvedPresentationString<T extends string | null> {
    value: T;
    needAnchors: string[];
}

/** Inputs to the Item label cascade; read inside a computed so every getter is a dependency. */
export interface ItemLabelSource {
    localeStore: LocaleStore;
    itemKey: string;
    inlineLabel: string | undefined;
    labels: Record<string, string> | undefined;
    context: string | null;
    evalFEL: (expr: string) => import('./wasm-bridge-runtime.js').FelEvalResult | unknown;
}

/**
 * Locale steps of an Item string cascade (Locale §3.1.2): `<key>.<property>@context` → `<key>.<property>`,
 * `{{}}` interpolated through `evalFEL`; `null` when the Locale has neither. Each lookup walks the locale
 * fallback cascade (fr-CA → fr). Reads `localeStore.version`, so a computed caller tracks locale changes.
 */
function resolveLocaleItemString(
    localeStore: LocaleStore,
    itemKey: string,
    property: 'label' | 'hint' | 'description',
    context: string | null,
    evalFEL: ItemLabelSource['evalFEL'],
): ResolvedPresentationString<string> | null {
    localeStore.version.value;
    const keys = context ? [`${itemKey}.${property}@${context}`, `${itemKey}.${property}`] : [`${itemKey}.${property}`];
    for (const key of keys) {
        const fromLocale = localeStore.lookupKeyWithMeta(key);
        if (fromLocale.value !== null) {
            return {
                value: interpolateMessage(fromLocale.value, evalFEL).text,
                needAnchors: [...(fromLocale.needAnchors ?? [])],
            };
        }
    }
    return null;
}

/**
 * Label a respondent sees for any Item (Locale §3.1–3.3): Locale `<key>.label@context` → Locale
 * `<key>.label` → Definition `labels[context]` → inline `label`, `{{}}` interpolated through `evalFEL`.
 */
export function resolveItemLabel(source: ItemLabelSource): ResolvedPresentationString<string> {
    const { localeStore, itemKey, labels, context, evalFEL } = source;
    const fromLocale = resolveLocaleItemString(localeStore, itemKey, 'label', context, evalFEL);
    if (fromLocale) {
        return fromLocale;
    }
    const definitionLabel = (context ? labels?.[context] : undefined) || source.inlineLabel || '';
    return { value: interpolateMessage(definitionLabel, evalFEL).text, needAnchors: [] };
}

// ── Factory ─────────────────────────────────────────────────────────

export function createFieldViewModel(deps: FieldViewModelDeps): FieldViewModel {
    // Locale §3.1: item strings are keyed `<itemKey>.<property>` by the Item's
    // definition-unique `key` — never by group path or repeat instance path.
    const { rx, localeStore, itemKey, evalFEL } = deps;

    /** Hint / description cascade (Locale §3.1.2): Locale `@context` → Locale → inline; no Definition context step. */
    function resolveLocaleString(
        property: 'hint' | 'description',
        fallback: string | null | undefined,
    ): ResolvedPresentationString<string | null> {
        const fromLocale = resolveLocaleItemString(localeStore, itemKey, property, deps.getLabelContext(), evalFEL);
        if (fromLocale) return fromLocale;
        if (fallback === null || fallback === undefined) return { value: null, needAnchors: [] };
        return { value: interpolateMessage(fallback, evalFEL).text, needAnchors: [] };
    }

    // ── Label: shared Item label cascade ──

    const labelResolution = rx.computed(() => resolveItemLabel({
        localeStore,
        itemKey,
        inlineLabel: deps.getItemLabel(),
        labels: deps.getItemLabels(),
        context: deps.getLabelContext(),
        evalFEL,
    }));
    const label = rx.computed(() => labelResolution.value.value);
    const labelNeedAnchors = rx.computed(() => labelResolution.value.needAnchors);

    // ── Hint / description: Locale @context → Locale → inline ──

    const hintResolution = rx.computed(() => resolveLocaleString('hint', deps.getItemHint()));
    const hint = rx.computed(() => hintResolution.value.value);
    const hintNeedAnchors = rx.computed(() => hintResolution.value.needAnchors);

    const descriptionResolution = rx.computed(() => resolveLocaleString('description', deps.getItemDescription()));
    const description = rx.computed(() => descriptionResolution.value.value);
    const descriptionNeedAnchors = rx.computed(() => descriptionResolution.value.needAnchors);

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
            const labelResolution = resolveOptionLabel(opt, optionSetName);
            const resolved: ResolvedOption = {
                value: opt.value,
                label: labelResolution.label,
            };
            const generation = (opt as unknown as Record<string, unknown>)['x-generation'];
            const anchors = generation && typeof generation === 'object' && !Array.isArray(generation)
                ? (generation as Record<string, unknown>).anchors
                : undefined;
            const canonical = [
                ...(Array.isArray(anchors) ? anchors : []),
                ...(labelResolution.needAnchors ?? []),
            ].filter(
                    (anchor): anchor is string =>
                        typeof anchor === 'string'
                        && /^need:[a-zA-Z][a-zA-Z0-9_-]*@[1-9][0-9]*$/.test(anchor),
                );
            if (canonical.length > 0) resolved.needAnchors = [...new Set(canonical)];
            if (opt.keywords && opt.keywords.length > 0) {
                resolved.keywords = [...opt.keywords];
            }
            return resolved;
        });
    });

    const optionsState = rx.computed(() => deps.getOptionsState().value);

    // ── Helpers ──

    function resolveValidationMessage(err: any, code: string): string {
        // Step 1: Per-code key — itemKey.errors.CODE
        const codeKey = `${itemKey}.errors.${code}`;
        const fromCode = localeStore.lookupKey(codeKey);
        if (fromCode !== null) {
            return interpolateMessage(fromCode, evalFEL).text;
        }

        // Step 2: Per-bind key — itemKey.requiredMessage or itemKey.constraintMessage
        if (err.constraintKind === 'required') {
            const reqKey = `${itemKey}.requiredMessage`;
            const fromReq = localeStore.lookupKey(reqKey);
            if (fromReq !== null) return interpolateMessage(fromReq, evalFEL).text;
        } else if (code === 'CONSTRAINT_FAILED') {
            // Core Phase 3 step 1a: `constraintMessage` labels a `false` result only; a
            // CONSTRAINT_PARSE_ERROR (definition error) keeps its processor-generated message.
            const constKey = `${itemKey}.constraintMessage`;
            const fromConst = localeStore.lookupKey(constKey);
            if (fromConst !== null) return interpolateMessage(fromConst, evalFEL).text;

            // Step 3: Inline bind constraintMessage
            if (err.constraintMessage) return interpolateMessage(err.constraintMessage, evalFEL).text;
        }

        // Step 4: Processor default
        return err.message ?? 'Validation error';
    }

    function resolveOptionLabel(
        opt: { value: string; label: string },
        optionSetName?: string,
    ): { label: string; needAnchors?: string[] } {
        const escapedValue = escapeOptionValue(opt.value);

        // Step 1: Field-level locale key
        const fieldKey = `${itemKey}.options.${escapedValue}.label`;
        const fromField = localeStore.lookupKeyWithMeta(fieldKey);
        if (fromField.value !== null) {
            return {
                label: interpolateMessage(fromField.value, evalFEL).text,
                ...(fromField.needAnchors ? { needAnchors: fromField.needAnchors } : {}),
            };
        }

        // Step 2: OptionSet-level locale key
        if (optionSetName) {
            const setKey = `$optionSet.${optionSetName}.${escapedValue}.label`;
            const fromSet = localeStore.lookupKeyWithMeta(setKey);
            if (fromSet.value !== null) {
                return {
                    label: interpolateMessage(fromSet.value, evalFEL).text,
                    ...(fromSet.needAnchors ? { needAnchors: fromSet.needAnchors } : {}),
                };
            }
        }

        // Step 3: Inline option label
        return { label: opt.label };
    }

    return {
        templatePath: deps.templatePath,
        instancePath: deps.instancePath,
        id: deps.id,
        itemKey: deps.itemKey,
        dataType: deps.dataType,
        disabledDisplay: deps.getDisabledDisplay(),
        label,
        labelNeedAnchors,
        hint,
        hintNeedAnchors,
        description,
        descriptionNeedAnchors,
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
