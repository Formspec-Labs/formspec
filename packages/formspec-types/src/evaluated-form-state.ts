/** @filedesc Plain evaluated field flags and findings shared by the engine and layout. */
import type { ValidationReport } from './generated/validation-report.js';
import type { ValidationResult } from './generated/validation-result.js';

export interface EvaluatedFieldState {
    path: string;
    relevant: boolean;
    readonly: boolean;
    required: boolean;
    empty: boolean;
}

export interface EvaluatedFormState {
    fields: readonly EvaluatedFieldState[];
    /** Null when the host has no evaluated report for these fields. */
    report: ValidationReport | null;
}

/** Finding identity excludes presentation text and other evaluation-dependent details. */
export function validationResultIdentity(result: ValidationResult): string {
    const path = result.path === '#' ? '' : result.path;
    const identity = [path, result.severity, result.constraintKind, result.code,
        result.source, result.shapeId ?? result.sourceId];
    if (!path && !result.shapeId && (result.code === 'EXPLANATION_REQUIRED'
        || result.code === 'EXPLANATION_STALE' || result.code === 'EXPLANATION_UNUSED')) {
        const groupCode = (result.context as { code?: unknown } | undefined)?.code;
        if (typeof groupCode === 'string') identity.push(groupCode);
    }
    return JSON.stringify(identity);
}
