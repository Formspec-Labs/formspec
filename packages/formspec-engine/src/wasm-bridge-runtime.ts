/** @filedesc Runtime WASM — init, accessors, and wrappers that use only the runtime `formspec_wasm_runtime` module. */

/** Parsed JSON from `fel_analysis_to_json_value` (Rust) — pass through to {@link normalizeFelAnalysisError}. */
export type WasmFelAnalysisResultJson = {
    valid: boolean;
    errors: Array<
        | string
        | {
              message: string;
              span?: { start: number; end: number } | null;
          }
    >;
    warnings: string[];
    references: string[];
    variables: string[];
    functions: string[];
};

import {
    nodeFsModuleName,
    resolveWasmAssetPathForNode,
} from './wasm-bridge-shared.js';

let _wasmReady = false;
let _initPromise: Promise<void> | null = null;

export type WasmModule = typeof import('../wasm-pkg-runtime/formspec_wasm_runtime.js');

let _wasm: WasmModule | null = null;

/** Whether the WASM module has been initialized and is ready for use. */
export function isWasmReady(): boolean {
    return _wasmReady;
}

/**
 * Initialize the WASM module. Safe to call multiple times — subsequent calls
 * return the same promise. Resolves when WASM is ready; rejects on failure.
 *
 * In Node.js, uses `initSync()` with bytes read from disk.
 * In browsers, the generated wasm-bindgen loader fetches the sibling `.wasm` asset via URL.
 */
export async function initWasm(): Promise<void> {
    if (_wasmReady) return;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        try {
            const runtime = await import('../wasm-pkg-runtime/formspec_wasm_runtime.js');
            const runningInNode = typeof globalThis.process !== 'undefined'
                && globalThis.process.versions?.node;
            let wasmBytes: Uint8Array | null = null;

            if (runningInNode && typeof runtime.initSync === 'function') {
                const { readFileSync } = await import(/* @vite-ignore */ nodeFsModuleName);
                const wasmPath = await resolveWasmAssetPathForNode(
                    '../wasm-pkg-runtime/formspec_wasm_runtime_bg.wasm',
                );
                wasmBytes = readFileSync(wasmPath);
            }

            if (typeof runtime.initSync === 'function' && wasmBytes) {
                runtime.initSync({ module: wasmBytes });
            } else if (typeof runtime.default === 'function') {
                await runtime.default({
                    module_or_path: new URL('../wasm-pkg-runtime/formspec_wasm_runtime_bg.wasm', import.meta.url),
                });
            }

            _wasm = runtime;
            _wasmReady = true;
        } catch (e) {
            _initPromise = null;
            throw e;
        }
    })();

    return _initPromise;
}

function wasm(): WasmModule {
    if (!_wasm || !_wasmReady) {
        throw new Error(
            'Formspec runtime WASM is not initialized. Call await initFormspecEngine() (or await initWasm()) before using the engine.',
        );
    }
    return _wasm;
}

/**
 * Initialized runtime module — for `wasm-bridge-tools` only (ABI check).
 * Not re-exported from the public `wasm-bridge` barrel.
 */
export function getWasmModule(): WasmModule {
    return wasm();
}

// ---------------------------------------------------------------------------
// Typed wrappers — runtime `formspec_wasm_runtime` only
// ---------------------------------------------------------------------------

/** In-band result from `evalFEL` / `evalFELWithContext` (Locale §3.3.1 rule 2). */
export interface FelEvalResult {
    value: unknown;
    hasErrorDiagnostics: boolean;
}

function parseFelEvalEnvelope(resultJson: string): FelEvalResult {
    const parsed = JSON.parse(resultJson) as FelEvalResult;
    if (
        parsed &&
        typeof parsed === 'object' &&
        'value' in parsed &&
        typeof parsed.hasErrorDiagnostics === 'boolean'
    ) {
        return parsed;
    }
    throw new Error(
        'evalFEL returned unexpected JSON (expected { value, hasErrorDiagnostics })',
    );
}

/** Evaluate a FEL expression with optional field values. Returns the evaluated value. */
export function wasmEvalFEL(expression: string, fields: Record<string, any> = {}): any {
    return parseFelEvalEnvelope(wasm().evalFEL(expression, JSON.stringify(fields))).value;
}

/** FEL evaluation context for the richer WASM evaluator. */
export interface WasmFelContext {
    fields: Record<string, any>;
    variables?: Record<string, any>;
    mipStates?: Record<string, { valid?: boolean; relevant?: boolean; readonly?: boolean; required?: boolean }>;
    repeatContext?: {
        current: any;
        index: number;
        count: number;
        collection?: any[];
        parent?: WasmFelContext['repeatContext'];
    };
    instances?: Record<string, any>;
    nowIso?: string;
    /** Active locale code (BCP 47) — backs `locale()` and default for `pluralCategory()`. */
    locale?: string;
    /** Runtime metadata bag — backs `runtimeMeta(key)`. */
    meta?: Record<string, string | number | boolean>;
}

/** Evaluate a FEL expression with full FormspecEnvironment context (value + diagnostics flag). */
export function wasmEvalFELWithContextEnvelope(
    expression: string,
    context: WasmFelContext,
): FelEvalResult {
    const resultJson = wasm().evalFELWithContext(expression, JSON.stringify(context));
    return parseFelEvalEnvelope(resultJson);
}

/** Evaluate a FEL expression with full FormspecEnvironment context. Returns the value only. */
export function wasmEvalFELWithContext(expression: string, context: WasmFelContext): any {
    return wasmEvalFELWithContextEnvelope(expression, context).value;
}

/**
 * A single recorded event during FEL evaluation.
 *
 * Mirrors `fel_core::TraceStep` verbatim — the `kind` discriminant is the
 * PascalCase Rust variant name. Extend this union only when the Rust enum
 * grows a new variant; every variant here must exist in Rust.
 */
export type FelTraceStep =
    | {
        /** A `$field` reference was resolved against the environment. */
        kind: 'FieldResolved';
        /** Dotted path as written in source (e.g. `foo`, `items[2].amount`). */
        path: string;
        /** Value returned by the environment, projected to JSON. */
        value: unknown;
    }
    | {
        /** A function call completed and returned a value. */
        kind: 'FunctionCalled';
        /** Function name as written in source. */
        name: string;
        /** Argument values, in order. */
        args: unknown[];
        /** Return value. */
        result: unknown;
    }
    | {
        /** A binary operator produced a result from two operand values. */
        kind: 'BinaryOp';
        /** Operator symbol (`+`, `==`, `and`, ...). */
        op: string;
        /** Left-hand value. */
        lhs: unknown;
        /** Right-hand value. */
        rhs: unknown;
        /** Result value. */
        result: unknown;
    }
    | {
        /** A conditional selected a branch. */
        kind: 'IfBranch';
        /** The evaluated condition value. */
        condition_value: unknown;
        /** Which branch was taken: `"then"` or `"else"`. */
        branch_taken: 'then' | 'else';
    }
    | {
        /** A logical operator short-circuited; the right-hand side was not evaluated. */
        kind: 'ShortCircuit';
        /** Operator symbol (`and` or `or`). */
        op: string;
        /** Human-readable reason. */
        reason: string;
    };

/** Result of a traced FEL evaluation. */
export interface FelTraceResult {
    /** Evaluated value (JSON-projected — no FEL type tags). */
    value: unknown;
    /** True when error-severity diagnostics were recorded (Locale §3.3.1 rule 2). */
    hasErrorDiagnostics: boolean;
    /** Diagnostics emitted during evaluation. */
    diagnostics: Array<Record<string, unknown>>;
    /** Ordered trace steps, appended in evaluation order. */
    trace: FelTraceStep[];
}

/**
 * Evaluate a FEL expression with a structured trace of evaluation steps.
 *
 * Opt-in tracing path — use when surfacing evaluation to humans or LLMs
 * (MCP tools, error explainers). Values in the trace are projected to JSON,
 * losing FEL type fidelity (money/date) but gaining universal readability.
 */
export function wasmEvalFELWithTrace(
    expression: string,
    fields: Record<string, unknown> = {},
): FelTraceResult {
    const resultJson = wasm().evalFELWithTrace(expression, JSON.stringify(fields));
    return JSON.parse(resultJson);
}

/** Locale §3.3.1 — true if the expression AST is only literals and unary `not` / `!` / `-`. */
export function wasmFelExprIsInterpolationStaticLiteral(expression: string): boolean {
    return wasm().felExprIsInterpolationStaticLiteral(expression);
}

/** Normalize FEL source before evaluation (bare `$`, repeat qualifiers, repeat aliases). */
export function wasmPrepareFelExpression(optionsJson: string): string {
    return wasm().prepareFelExpression(optionsJson);
}

/** Inline `optionSet` references from `optionSets` on a definition JSON document. */
export function wasmResolveOptionSetsOnDefinition(definitionJson: string): string {
    return wasm().resolveOptionSetsOnDefinition(definitionJson);
}

/** Apply `migrations` on a definition to flat response data (FEL transforms in Rust). */
export function wasmApplyMigrationsToResponseData(
    definitionJson: string,
    responseDataJson: string,
    fromVersion: string,
    nowIso: string,
): string {
    return wasm().applyMigrationsToResponseData(definitionJson, responseDataJson, fromVersion, nowIso);
}

/** Coerce an inbound field value (whitespace, numeric strings, money, precision). */
export function wasmCoerceFieldValue(
    itemJson: string,
    bindJson: string,
    definitionJson: string,
    valueJson: string,
): string {
    return wasm().coerceFieldValue(itemJson, bindJson, definitionJson, valueJson);
}

/** Extract field path dependencies from a FEL expression. Returns an array of path strings. */
export function wasmGetFELDependencies(expression: string): string[] {
    const resultJson = wasm().getFELDependencies(expression);
    return JSON.parse(resultJson);
}

/** Normalize a dotted path by stripping repeat indices. */
export function wasmNormalizeIndexedPath(path: string): string {
    return wasm().normalizeIndexedPath(path);
}

/** Resolve an item in a nested item tree by dotted path. */
export function wasmItemAtPath<T = any>(items: unknown[], path: string): T | undefined {
    const resultJson = wasm().itemAtPath(JSON.stringify(items), path);
    const result = JSON.parse(resultJson);
    return result === null ? undefined : result;
}

/** Resolve an item's parent path, index, and value in a nested item tree. */
export function wasmItemLocationAtPath<T = any>(
    items: unknown[],
    path: string,
): { parentPath: string; index: number; item: T } | undefined {
    const resultJson = wasm().itemLocationAtPath(JSON.stringify(items), path);
    const result = JSON.parse(resultJson);
    return result === null ? undefined : result;
}

/** Evaluate a Formspec definition against provided data. */
export function wasmEvaluateDefinition(
    definition: unknown,
    data: Record<string, unknown>,
    context?: {
        nowIso?: string;
        trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
        previousValidations?: Array<{
            path: string;
            severity: string;
            constraintKind: string;
            code: string;
            message: string;
            source: string;
            shapeId?: string;
            context?: Record<string, unknown>;
        }>;
        previousNonRelevant?: string[];
        instances?: Record<string, unknown>;
        registryDocuments?: unknown[];
        /** Repeat row counts by group base path (authoritative for min/max repeat cardinality). */
        repeatCounts?: Record<string, number>;
    },
): {
    values: any;
    validations: any[];
    nonRelevant: string[];
    variables: any;
    required: Record<string, boolean>;
    readonly: Record<string, boolean>;
} {
    const resultJson = wasm().evaluateDefinition(
        JSON.stringify(definition),
        JSON.stringify(data),
        context ? JSON.stringify(context) : undefined,
    );
    return JSON.parse(resultJson);
}

/** Evaluate a standalone Screener Document against respondent inputs.
 *  Returns a Determination Record (always non-null). */
export function wasmEvaluateScreenerDocument(
    screener: unknown,
    answers: Record<string, unknown>,
    context?: Record<string, unknown>,
): import('@formspec-org/types').DeterminationRecord {
    const resultJson = wasm().evaluateScreenerDocument(
        JSON.stringify(screener),
        JSON.stringify(answers),
        context ? JSON.stringify(context) : undefined,
    );
    return JSON.parse(resultJson);
}

/** Analyze a FEL expression and return structural info. */
export function wasmAnalyzeFEL(expression: string): WasmFelAnalysisResultJson {
    const resultJson = wasm().analyzeFEL(expression);
    return JSON.parse(resultJson) as WasmFelAnalysisResultJson;
}

/** Analyze a FEL expression with field data type context for type-mismatch warnings. */
export function wasmAnalyzeFELWithFieldTypes(
    expression: string,
    fieldTypes: Record<string, string>,
): WasmFelAnalysisResultJson {
    const resultJson = wasm().analyzeFELWithFieldTypes(
        expression,
        JSON.stringify(fieldTypes),
    );
    return JSON.parse(resultJson) as WasmFelAnalysisResultJson;
}

/** Check if a string is a valid FEL identifier. */
export function wasmIsValidFelIdentifier(s: string): boolean {
    return wasm().isValidFelIdentifier(s);
}

/** Sanitize a string into a valid FEL identifier. */
export function wasmSanitizeFelIdentifier(s: string): string {
    return wasm().sanitizeFelIdentifier(s);
}

/** Compute dependency groups from recorded changeset entries (JSON round-trip to Rust). */
export function wasmComputeDependencyGroups(entriesJson: string): Array<{ entries: number[]; reason: string }> {
    const resultJson = wasm().computeDependencyGroups(entriesJson);
    return JSON.parse(resultJson);
}
