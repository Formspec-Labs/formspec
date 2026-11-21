/** @filedesc Schema and per-evaluation snapshot for the WASM-resident FEL context (ad-hoc reads). */

import type { EvalResult } from '../diff.js';
import type { JsonRecord, ResponseSubjectKeys } from '../interfaces.js';
import type { EngineSignal } from '../reactivity/types.js';
import type { EngineBindConfig } from './helpers.js';

/**
 * Per-Definition input to the WASM FEL context: what `dataTypes` a leaf carries (Core §2.1.3) and which
 * binds render a non-relevant read as `null`. Changes only when the Definition does.
 */
export interface FelContextSchema {
    itemPaths: string[];
    dataTypes: Record<string, string>;
    excludedValueNull: string[];
}

/** Form-scope state of one evaluation — what the WASM context holds between ad-hoc reads. */
export interface FelContextSnapshot {
    /** Field values by instance path; repeat group arrays are ignored in favour of their flat rows. */
    values: Record<string, unknown>;
    /** Instance paths whose MIP state departs from the default (valid, relevant, optional, writable). */
    mips: { invalid: string[]; nonRelevant: string[]; readonly: string[]; required: string[] };
    /** Row counts by repeat group instance path. */
    repeatCounts: Record<string, number>;
    /** Variable values by scope (`#` is form scope) and name. */
    variables: Record<string, Record<string, unknown>>;
    instances: Record<string, unknown>;
    locale?: string;
    /** The active Locale document's `formats.date` patterns by `formatDate` style (Locale §2.4). */
    dateFormats?: Record<string, string>;
    meta?: Record<string, string | number | boolean>;
    subjectKeys?: ResponseSubjectKeys;
}

export function felContextSchema(
    fieldDataTypes: Record<string, string | undefined>,
    bindConfigs: Record<string, EngineBindConfig>,
    itemPaths: string[],
): FelContextSchema {
    const dataTypes: Record<string, string> = {};
    for (const [path, dataType] of Object.entries(fieldDataTypes)) {
        if (dataType !== undefined) {
            dataTypes[path] = dataType;
        }
    }
    return {
        dataTypes,
        itemPaths,
        excludedValueNull: Object.entries(bindConfigs)
            .filter(([, bind]) => bind.excludedValue === 'null')
            .map(([path]) => path),
    };
}

export interface FelContextSnapshotInput {
    data: JsonRecord;
    fullResult: EvalResult | null;
    repeats: Record<string, EngineSignal<number>>;
    instanceData: Record<string, unknown>;
    locale?: string;
    /** The active Locale document's `formats.date` patterns by `formatDate` style (Locale §2.4). */
    dateFormats?: Record<string, string>;
    meta?: Record<string, string | number | boolean>;
    subjectKeys?: FelContextSnapshot['subjectKeys'];
}

/**
 * The whole form's FEL state in one payload, built O(fields + rows) per evaluation. Values stay untagged —
 * the Rust context types leaves from `FelContextSchema.dataTypes` and infers money from `{amount, currency}`.
 */
export function felContextSnapshot(options: FelContextSnapshotInput): FelContextSnapshot {
    const result = options.fullResult;
    const values: Record<string, unknown> = result
        ? { ...result.values, ...result.preservedValues }
        : options.data;
    for (const path of result?.filingOnlyPaths ?? []) delete values[path];

    const truePaths = (states: Record<string, boolean> | undefined) =>
        Object.keys(states ?? {}).filter(path => states?.[path] === true);
    const mips: FelContextSnapshot['mips'] = {
        // The evaluator's settled `valid()` set (Core §3.5.9); host-injected results are not in it.
        invalid: result?.invalidPaths ?? [],
        nonRelevant: result?.nonRelevant ?? [],
        readonly: truePaths(result?.readonly),
        required: truePaths(result?.required),
    };

    const repeatCounts: Record<string, number> = {};
    for (const [path, repeatSignal] of Object.entries(options.repeats)) {
        repeatCounts[path] = repeatSignal.value;
    }

    return {
        values,
        mips,
        repeatCounts: options.fullResult?.repeatCounts ?? repeatCounts,
        variables: options.fullResult?.scopedVariables ?? {},
        instances: options.instanceData,
        locale: options.locale,
        dateFormats: options.dateFormats,
        meta: options.meta,
        subjectKeys: options.subjectKeys,
    };
}
