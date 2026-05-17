/** @filedesc WASM definition-eval payload, EvalResult shaping, FEL normalization, and WasmFelContext assembly. */

import type { FormVariable } from '@formspec-org/types';
import type { ValidationResult } from '@formspec-org/types';
import type { EvalResult, EvalValidation } from '../diff.js';
import type { WasmFelContext } from '../wasm-bridge-runtime.js';
import type { FormFieldValue } from '../interfaces.js';
import type { EngineSignal } from '../reactivity/types.js';
import type { EngineBindConfig } from './helpers.js';
import {
    buildGroupSnapshotForPath,
    buildRepeatCollection,
    cloneValue,
    getRepeatAncestors,
    getScopeAncestors,
    parentPathOf,
    setExpressionContextValue,
    snapshotSignals,
    tagMoneyByPath,
    toBasePath,
    toFelIndexedPath,
    toWasmContextValue,
} from './helpers.js';
import { wasmPrepareFelExpression } from '../wasm-bridge-runtime.js';

// --- wasmEvaluateDefinition payload -------------------------------------------------------------

/** Subset of validation objects passed back into WASM as previous state. */
export type WasmPreviousValidation = Array<{
    path: string;
    severity: string;
    constraintKind: string;
    code: string;
    message: string;
    source: string;
    shapeId?: string;
    context?: Record<string, unknown>;
}>;

/** Options object consumed by the WASM definition evaluator (JSON-serialized internally). */
export function wasmEvaluateDefinitionPayload(options: {
    nowIso: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousResult: EvalResult | null;
    instances: Record<string, unknown>;
    registryDocuments: unknown[];
    /** Authoritative repeat row counts by group base path (matches engine repeat signals). */
    repeatCounts: Record<string, number>;
}): {
    nowIso: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousValidations: WasmPreviousValidation | undefined;
    previousNonRelevant: string[] | undefined;
    instances: Record<string, unknown>;
    registryDocuments: unknown[];
    repeatCounts: Record<string, number>;
} {
    return {
        nowIso: options.nowIso,
        ...(options.trigger !== undefined ? { trigger: options.trigger } : {}),
        previousValidations: options.previousResult?.validations as unknown as WasmPreviousValidation | undefined,
        previousNonRelevant: options.previousResult?.nonRelevant,
        instances: options.instances,
        registryDocuments: options.registryDocuments,
        repeatCounts: options.repeatCounts,
    };
}

// --- EvalResult merge (external validations; repeat cardinality handled in Rust) ---------------

export type EvalShapeTiming = 'continuous' | 'submit' | 'demand';

/** Append engine-owned validations (e.g. extension hooks) after WASM batch evaluation. */
export function mergeWasmEvalWithExternalValidations(
    result: EvalResult,
    options: { externalValidations: EvalValidation[] },
): EvalResult {
    return {
        ...result,
        validations: [...result.validations, ...options.externalValidations],
    };
}

// --- FEL source normalization (before WASM) ---------------------------------------------------

export function normalizeExpressionForWasmEvaluation(options: {
    expression: string;
    currentItemPath: string;
    replaceSelfRef: boolean;
    repeats: Record<string, EngineSignal<number>>;
    fieldSignals: Record<string, EngineSignal<any>>;
}): string {
    const repeatCounts: Record<string, number> = {};
    for (const [path, sig] of Object.entries(options.repeats)) {
        repeatCounts[path] = sig.value;
    }
    return wasmPrepareFelExpression(
        JSON.stringify({
            expression: options.expression,
            currentItemPath: options.currentItemPath,
            replaceSelfRef: options.replaceSelfRef,
            repeatCounts,
            valuesByPath: snapshotSignals(options.fieldSignals),
        }),
    );
}

// --- WasmFelContext from engine signals -------------------------------------------------------

export function resolveFelFieldValueForWasm(
    path: string,
    value: unknown,
    bindConfigs: Record<string, EngineBindConfig>,
    fieldIsIrrelevant: (path: string) => boolean,
): FormFieldValue {
    const bind = bindConfigs[toBasePath(path)];
    if (bind?.excludedValue === 'null' && fieldIsIrrelevant(path)) {
        return null;
    }
    return value as FormFieldValue;
}

export function visibleScopedVariableValues(
    scopePath: string,
    variableDefs: FormVariable[],
    variableSignals: Record<string, EngineSignal<any>>,
    overrides?: Record<string, any>,
): Record<string, any> {
    const visible: Record<string, any> = {};
    const candidates = ['#', ...getScopeAncestors(scopePath)];
    for (const scope of candidates) {
        for (const variableDef of variableDefs) {
            if ((variableDef.scope ?? '#') !== scope) {
                continue;
            }
            const key = `${variableDef.scope ?? '#'}:${variableDef.name}`;
            visible[variableDef.name] = overrides && Object.prototype.hasOwnProperty.call(overrides, key)
                ? overrides[key]
                : (variableSignals[key]?.value ?? null);
        }
    }
    return visible;
}

export function buildFelRepeatWasmContext(options: {
    currentItemPath: string;
    repeats: Record<string, EngineSignal<number>>;
    fieldSignals: Record<string, EngineSignal<any>>;
}): WasmFelContext['repeatContext'] | undefined {
    const repeatAncestors = getRepeatAncestors(options.currentItemPath, options.repeats);
    if (repeatAncestors.length === 0) {
        return undefined;
    }

    let parent: WasmFelContext['repeatContext'] | undefined;
    for (const entry of repeatAncestors) {
        const collection = buildRepeatCollection(entry.groupPath, entry.count, options.fieldSignals);
        parent = {
            current: collection[entry.index] ?? null,
            index: entry.index + 1,
            count: entry.count,
            collection,
            parent,
        };
    }

    const outerParentPath = parentPathOf(repeatAncestors[repeatAncestors.length - 1].groupPath);
    if (parent && outerParentPath) {
        parent.parent = {
            current: buildGroupSnapshotForPath(outerParentPath, options.fieldSignals),
            index: 1,
            count: 1,
            collection: [buildGroupSnapshotForPath(outerParentPath, options.fieldSignals)],
            parent: parent.parent,
        };
    }

    return parent;
}

export interface WasmFelContextBuildInput {
    currentItemPath: string;
    data: Record<string, any>;
    fullResult: EvalResult | null;
    resultOverride?: EvalResult | null;
    dataOverride?: Record<string, any>;
    scopedVariableOverrides?: Record<string, any>;
    fieldSignals: Record<string, EngineSignal<any>>;
    validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    relevantSignals: Record<string, EngineSignal<boolean>>;
    readonlySignals: Record<string, EngineSignal<boolean>>;
    requiredSignals: Record<string, EngineSignal<boolean>>;
    repeats: Record<string, EngineSignal<number>>;
    bindConfigs: Record<string, EngineBindConfig>;
    fieldDataTypes: Record<string, string | undefined>;
    variableDefs: FormVariable[];
    variableSignals: Record<string, EngineSignal<any>>;
    instanceData: Record<string, unknown>;
    nowIso: string;
    locale?: string;
    meta?: Record<string, string | number | boolean>;
}

function tagMoneyVariableValue(value: any): any {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    if (value.$type === 'money') return value;
    if ('amount' in value && 'currency' in value) {
        return { $type: 'money', amount: value.amount, currency: value.currency };
    }
    return value;
}

export function buildWasmFelExpressionContext(options: WasmFelContextBuildInput): WasmFelContext {
    const result = options.resultOverride ?? options.fullResult;
    const rawFields = {
        ...(options.dataOverride ?? options.data),
        ...(result?.values ?? {}),
        ...snapshotSignals(options.fieldSignals),
    };
    const irrelevant = (path: string) => options.relevantSignals[path]?.value === false;

    const fields: Record<string, any> = {};
    for (const [path, value] of Object.entries(rawFields)) {
        setExpressionContextValue(
            fields,
            path,
            toWasmContextValue(tagMoneyByPath(
                path,
                resolveFelFieldValueForWasm(path, value, options.bindConfigs, irrelevant),
                options.bindConfigs,
                options.fieldDataTypes,
            )),
        );
    }

    const scopePath = parentPathOf(options.currentItemPath);
    if (scopePath) {
        const prefixA = `${scopePath}.`;
        const prefixB = `${scopePath}[`;
        for (const [path, value] of Object.entries(rawFields)) {
            if (path.startsWith(prefixA)) {
                setExpressionContextValue(
                    fields,
                    path.slice(prefixA.length),
                    toWasmContextValue(tagMoneyByPath(path, value, options.bindConfigs, options.fieldDataTypes)),
                );
            } else if (path.startsWith(prefixB)) {
                setExpressionContextValue(
                    fields,
                    path.slice(scopePath.length + 1),
                    toWasmContextValue(tagMoneyByPath(path, value, options.bindConfigs, options.fieldDataTypes)),
                );
            }
        }
    }

    const mipStates: WasmFelContext['mipStates'] = {};
    for (const path of Object.keys(options.fieldSignals)) {
        const state = {
            valid: (options.validationResults[path]?.value ?? []).every((r) => r.severity !== 'error'),
            relevant: options.relevantSignals[path]?.value ?? true,
            readonly: options.readonlySignals[path]?.value ?? false,
            required: options.requiredSignals[path]?.value ?? false,
        };
        if (path.includes('[')) {
            mipStates[toFelIndexedPath(path)] = { ...state };
        } else {
            mipStates[path] = state;
        }
        if (scopePath) {
            const prefixA = `${scopePath}.`;
            const prefixB = `${scopePath}[`;
            if (path.startsWith(prefixA)) {
                mipStates[path.slice(prefixA.length)] = { ...state };
            } else if (path.startsWith(prefixB)) {
                mipStates[path.slice(scopePath.length + 1)] = { ...state };
            }
        }
    }

    return {
        fields,
        variables: Object.fromEntries(
            Object.entries(
                visibleScopedVariableValues(
                    options.currentItemPath,
                    options.variableDefs,
                    options.variableSignals,
                    options.scopedVariableOverrides,
                ),
            ).map(([key, value]) => [key, toWasmContextValue(tagMoneyVariableValue(value))]),
        ),
        mipStates,
        repeatContext: buildFelRepeatWasmContext({
            currentItemPath: options.currentItemPath,
            repeats: options.repeats,
            fieldSignals: options.fieldSignals,
        }),
        instances: cloneValue(options.instanceData),
        nowIso: options.nowIso,
        locale: options.locale,
        meta: options.meta,
    };
}
