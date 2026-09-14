/** @filedesc Diffs batch evaluation snapshots into per-signal patch payloads. */

export interface EvalValidation {
    path: string;
    shapeId?: string;
    [key: string]: unknown;
}

/**
 * Author-facing FEL error from a bind constraint or shape expression (Rust `EvalDiagnostic`).
 * The expression evaluated to null, so it passed (Core §3.8.1); never a respondent-visible result.
 */
export interface EvalDiagnostic {
    /** Resolved instance path of the bind or shape target (`#` for form-level shapes). */
    path: string;
    expression: string;
    shapeId?: string;
    message: string;
}

export interface EvalResult {
    values: Record<string, unknown>;
    validations: EvalValidation[];
    diagnostics: EvalDiagnostic[];
    nonRelevant: string[];
    variables: Record<string, unknown>;
    required: Record<string, boolean>;
    readonly: Record<string, boolean>;
}

export interface EvalDelta {
    values: Record<string, unknown>;
    removedValues: string[];
    relevant: Record<string, boolean>;
    required: Record<string, boolean>;
    readonly: Record<string, boolean>;
    validations: Record<string, EvalValidation[]>;
    removedValidationPaths: string[];
    shapeResults: Record<string, EvalValidation[]>;
    removedShapeIds: string[];
    variables: Record<string, unknown>;
    removedVariables: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) {
        return true;
    }

    if (Array.isArray(left) && Array.isArray(right)) {
        if (left.length !== right.length) {
            return false;
        }
        for (let index = 0; index < left.length; index += 1) {
            if (!deepEqual(left[index], right[index])) {
                return false;
            }
        }
        return true;
    }

    if (isPlainObject(left) && isPlainObject(right)) {
        const leftKeys = Object.keys(left).sort();
        const rightKeys = Object.keys(right).sort();
        if (!deepEqual(leftKeys, rightKeys)) {
            return false;
        }
        for (const key of leftKeys) {
            if (!deepEqual(left[key], right[key])) {
                return false;
            }
        }
        return true;
    }

    return false;
}

function diffRecord<T>(
    previous: Record<string, T>,
    next: Record<string, T>,
): { changed: Record<string, T>; removed: string[] } {
    const changed: Record<string, T> = {};
    const removed: string[] = [];
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);

    for (const key of keys) {
        const hasPrevious = Object.prototype.hasOwnProperty.call(previous, key);
        const hasNext = Object.prototype.hasOwnProperty.call(next, key);

        if (!hasNext) {
            removed.push(key);
            continue;
        }

        if (!hasPrevious || !deepEqual(previous[key], next[key])) {
            changed[key] = next[key];
        }
    }

    removed.sort();
    return { changed, removed };
}

function groupValidations(validations: EvalValidation[]): Record<string, EvalValidation[]> {
    const grouped: Record<string, EvalValidation[]> = {};
    for (const validation of validations) {
        if (validation.shapeId) {
            continue;
        }
        const key = validation.path;
        (grouped[key] ??= []).push(validation);
    }
    return grouped;
}

function groupShapeResults(validations: EvalValidation[]): Record<string, EvalValidation[]> {
    const grouped: Record<string, EvalValidation[]> = {};
    for (const validation of validations) {
        if (!validation.shapeId) {
            continue;
        }
        (grouped[validation.shapeId] ??= []).push(validation);
    }
    return grouped;
}

export function diffEvalResults(previous: EvalResult | null, next: EvalResult): EvalDelta {
    const previousValues = previous?.values ?? {};
    const previousVariables = previous?.variables ?? {};
    const previousRequired = previous?.required ?? {};
    const previousReadonly = previous?.readonly ?? {};
    const previousNonRelevant = new Set(previous?.nonRelevant ?? []);
    const nextNonRelevant = new Set(next.nonRelevant);

    const relevant: Record<string, boolean> = {};
    const relevanceKeys = new Set([...previousNonRelevant, ...nextNonRelevant]);
    for (const key of relevanceKeys) {
        const previousRelevant = !previousNonRelevant.has(key);
        const nextRelevant = !nextNonRelevant.has(key);
        if (previous === null || previousRelevant !== nextRelevant) {
            relevant[key] = nextRelevant;
        }
    }

    const validationGroups = groupValidations(next.validations);
    const previousValidationGroups = groupValidations(previous?.validations ?? []);
    const validationDiff = diffRecord(previousValidationGroups, validationGroups);

    const shapeGroups = groupShapeResults(next.validations);
    const previousShapeGroups = groupShapeResults(previous?.validations ?? []);
    const shapeDiff = diffRecord(previousShapeGroups, shapeGroups);

    const valueDiff = diffRecord(previousValues, next.values);
    const variableDiff = diffRecord(previousVariables, next.variables);
    const requiredDiff = diffRecord(previousRequired, next.required);
    const readonlyDiff = diffRecord(previousReadonly, next.readonly);

    const delta: EvalDelta = {
        values: valueDiff.changed,
        removedValues: valueDiff.removed,
        relevant,
        required: requiredDiff.changed,
        readonly: readonlyDiff.changed,
        validations: validationDiff.changed,
        removedValidationPaths: validationDiff.removed,
        shapeResults: shapeDiff.changed,
        removedShapeIds: shapeDiff.removed,
        variables: variableDiff.changed,
        removedVariables: variableDiff.removed,
    };

    Object.defineProperties(delta, {
        valueUpdates: { value: delta.values, enumerable: false },
        relevantUpdates: { value: delta.relevant, enumerable: false },
        requiredUpdates: { value: delta.required, enumerable: false },
        readonlyUpdates: { value: delta.readonly, enumerable: false },
        validationUpdates: { value: delta.validations, enumerable: false },
        shapeUpdates: { value: delta.shapeResults, enumerable: false },
        variableUpdates: { value: delta.variables, enumerable: false },
    });

    return delta;
}
