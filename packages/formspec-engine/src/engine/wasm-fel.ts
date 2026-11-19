/** @filedesc WASM definition-eval payload, EvalResult merge, and validation merge. */

import type { EvalResult, EvalValidation } from '../diff.js';
import type { DraftExplanation } from './warning-explanations.js';
import type { ResponseSubjectKeys } from '../interfaces.js';

// --- wasmEvaluateDefinition payload -------------------------------------------------------------

/** Subset of validation objects passed back into WASM as previous state. */
export type WasmPreviousValidation = Array<{
    path: string;
    severity: string;
    constraintKind: string;
    code: string;
    message: string;
    source?: string;
    shapeId?: string;
    context?: Record<string, unknown>;
}>;

/** Options object consumed by the WASM definition evaluator (JSON-serialized internally). */
export function wasmEvaluateDefinitionPayload(options: {
    nowIso: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousResult: Pick<EvalResult, 'nonRelevant' | 'validations'> | null;
    instances: Record<string, unknown>;
    registryDocuments: unknown[];
    subjectType?: string | null;
    subjectKeys?: ResponseSubjectKeys;
    explanations?: DraftExplanation[];
}): {
    nowIso: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousValidations: WasmPreviousValidation | undefined;
    previousNonRelevant: string[] | undefined;
    instances: Record<string, unknown>;
    registryDocuments: unknown[];
    subjectType?: string | null;
    subjectKeys?: ResponseSubjectKeys;
    explanations?: DraftExplanation[];
} {
    return {
        nowIso: options.nowIso,
        ...(options.trigger !== undefined ? { trigger: options.trigger } : {}),
        previousValidations: options.previousResult?.validations as unknown as WasmPreviousValidation | undefined,
        previousNonRelevant: options.previousResult?.nonRelevant,
        instances: options.instances,
        registryDocuments: options.registryDocuments,
        subjectType: options.subjectType,
        subjectKeys: options.subjectKeys,
        explanations: options.explanations,
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
