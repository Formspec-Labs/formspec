/** @filedesc WASM definition-eval payload, EvalResult merge, and validation merge. */

import type { EvalResult, EvalValidation } from '../diff.js';
import type { DraftExplanation } from './warning-explanations.js';
import type { ResolvedOptionListsInput, ResponseSubjectKeys } from '../interfaces.js';

// --- wasmEvaluateDefinition payload -------------------------------------------------------------

/** Options object consumed by the WASM definition evaluator (JSON-serialized internally). */
export function wasmEvaluateDefinitionPayload(options: {
    nowIso: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousResult: Pick<EvalResult, 'nonRelevant'> | null;
    instances: Record<string, unknown>;
    registryDocuments: unknown[];
    resolvedOptions?: ResolvedOptionListsInput;
    subjectType?: string | null;
    subjectKeys?: ResponseSubjectKeys;
    explanations?: DraftExplanation[];
}): {
    nowIso: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousNonRelevant: string[] | undefined;
    instances: Record<string, unknown>;
    registryDocuments: unknown[];
    resolvedOptions?: ResolvedOptionListsInput;
    subjectType?: string | null;
    subjectKeys?: ResponseSubjectKeys;
    explanations?: DraftExplanation[];
} {
    const hasResolvedOptions = options.resolvedOptions !== undefined && (
        Object.keys(options.resolvedOptions.optionSets ?? {}).length > 0
        || Object.keys(options.resolvedOptions.uris ?? {}).length > 0
    );
    return {
        nowIso: options.nowIso,
        ...(options.trigger !== undefined ? { trigger: options.trigger } : {}),
        previousNonRelevant: options.previousResult?.nonRelevant,
        instances: options.instances,
        registryDocuments: options.registryDocuments,
        ...(hasResolvedOptions ? { resolvedOptions: options.resolvedOptions } : {}),
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
