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

// ── Factory ─────────────────────────────────────────────────────────

export function createFieldViewModel(deps: FieldViewModelDeps): FieldViewModel {
    const { rx, localeStore, templatePath, evalFEL } = deps;

    function resolveLocaleString(
        key: string,
        fallback: string | null | undefined,
    ): ResolvedPresentationString<string | null> {
        // Read locale version to trigger re-computation on locale changes
        localeStore.version.value;
        const localized = localeStore.lookupKeyWithMeta(key);
        const raw = localized.value ?? fallback ?? null;
        if (raw === null) return { value: null, needAnchors: [] };
        const { text } = interpolateMessage(raw, evalFEL);
        return {
            value: text,
            needAnchors: localized.value !== null
                ? [...(localized.needAnchors ?? [])]
                : [],
        };
    }

    // ── Label: 6-step cascade with context ──

    const labelResolution = rx.computed((): ResolvedPresentationString<string> => {
        localeStore.version.value;
        const context = deps.getLabelContext();
        const labels = deps.getItemLabels();
        const inlineLabel = deps.getItemLabel();

        if (context) {
            // Steps 1-2: Locale lookup for key.label@context (cascade walks fr-CA → fr)
            const contextKey = `${templatePath}.label@${context}`;
            const fromLocale = localeStore.lookupKeyWithMeta(contextKey);
            if (fromLocale.value !== null) {
                return {
                    value: interpolateMessage(fromLocale.value, evalFEL).text,
                    needAnchors: [...(fromLocale.needAnchors ?? [])],
                };
            }

            // Steps 3-4: Locale lookup for key.label (no context)
            const plainKey = `${templatePath}.label`;
            const plainFromLocale = localeStore.lookupKeyWithMeta(plainKey);
            if (plainFromLocale.value !== null) {
                return {
                    value: interpolateMessage(plainFromLocale.value, evalFEL).text,
                    needAnchors: [...(plainFromLocale.needAnchors ?? [])],
                };
            }

            // Step 5: Definition labels[context]
            if (labels?.[context]) {
                return {
                    value: interpolateMessage(labels[context], evalFEL).text,
                    needAnchors: [],
                };
            }

            // Step 6: Definition label
            return {
                value: interpolateMessage(inlineLabel, evalFEL).text,
                needAnchors: [],
            };
        }

        // No context: 2-step (locale → inline)
        const plainKey = `${templatePath}.label`;
        const fromLocale = localeStore.lookupKeyWithMeta(plainKey);
        if (fromLocale.value !== null) {
            return {
                value: interpolateMessage(fromLocale.value, evalFEL).text,
                needAnchors: [...(fromLocale.needAnchors ?? [])],
            };
        }
        return {
            value: interpolateMessage(inlineLabel, evalFEL).text,
            needAnchors: [],
        };
    });
    const label = rx.computed(() => labelResolution.value.value);
    const labelNeedAnchors = rx.computed(() => labelResolution.value.needAnchors);

    // ── Hint: 2-step cascade ──

    const hintResolution = rx.computed(() =>
        resolveLocaleString(`${templatePath}.hint`, deps.getItemHint()));
    const hint = rx.computed(() => hintResolution.value.value);
    const hintNeedAnchors = rx.computed(() => hintResolution.value.needAnchors);

    // ── Description: 2-step cascade ──

    const descriptionResolution = rx.computed(() =>
        resolveLocaleString(`${templatePath}.description`, deps.getItemDescription()));
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

    function resolveOptionLabel(
        opt: { value: string; label: string },
        optionSetName?: string,
    ): { label: string; needAnchors?: string[] } {
        const escapedValue = escapeOptionValue(opt.value);

        // Step 1: Field-level locale key
        const fieldKey = `${templatePath}.options.${escapedValue}.label`;
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
