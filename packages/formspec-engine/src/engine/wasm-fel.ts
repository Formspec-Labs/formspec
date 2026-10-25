/** @filedesc WASM definition-eval payload, EvalResult merge, FEL normalization, and scoped variable visibility. */

import type { FormVariable } from '@formspec-org/types';
import type { EvalResult, EvalValidation } from '../diff.js';
import type { EngineSignal } from '../reactivity/types.js';
import { getScopeAncestors, snapshotSignals } from './helpers.js';
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

// --- Scoped variable visibility ---------------------------------------------------------------

export function visibleScopedVariableValues(
    scopePath: string,
    variableDefs: FormVariable[],
    variableSignals: Record<string, EngineSignal<any>>,
): Record<string, any> {
    const visible: Record<string, any> = {};
    const candidates = ['#', ...getScopeAncestors(scopePath)];
    for (const scope of candidates) {
        for (const variableDef of variableDefs) {
            if ((variableDef.scope ?? '#') !== scope) {
                continue;
            }
            visible[variableDef.name] = variableSignals[`${scope}:${variableDef.name}`]?.value ?? null;
        }
    }
    return visible;
}
