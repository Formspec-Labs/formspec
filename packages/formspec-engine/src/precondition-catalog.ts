/**
 * @filedesc Response Actions FEL host-binding catalog (§4.1 precondition + §6.4 effect-time).
 *
 * Spec §4.1 publishes a CLOSED catalog of six bindings for FEL precondition
 * expressions; §6.4 extends that set for effect-time expressions
 * (`payloadRef`, `detailRef`). FEL evaluators MUST reject unregistered
 * `@name` bindings. fel-core ships the `ContextBindingCatalog` Rust trait
 * + `EmptyCatalog` + the "unbound context reference" diagnostic
 * (fel-core/src/evaluator/core.rs); the WASM bridge does not yet surface a
 * way for the host to install a catalog into the evaluator.
 *
 * Until that bridge ships, this module publishes the catalog object as the
 * formspec-layer contract surface: a runtime structure host evaluators MUST
 * honor and a static validator that hosts (and the engine's default
 * precondition path) can run against any candidate FEL expression to detect
 * unregistered `@names` before evaluation. Host-supplied `ports.evaluatePrecondition`
 * remains the fallback when full FEL evaluation is needed; the catalog is the
 * contract these evaluators MUST conform to.
 */

/** Six fields every FEL §6.3.1 catalog entry must publish. */
export interface PreconditionCatalogEntry {
    /** Binding name (the part after `@`). */
    name: string;
    /** Binding kind per FEL §6.3.1 (`value`, `object`, `function`). */
    kind: 'value' | 'object' | 'function';
    /** Human-readable type description. */
    type: string;
    /** Purity per FEL §6.3.1 — `pure` or `impure`. */
    purity: 'pure' | 'impure';
    /** Evaluation timing — `eager` or `lazy`. */
    evaluationTiming: 'eager' | 'lazy';
    /** Scope — typically `expression`. */
    scope: 'expression' | 'statement';
}

/**
 * Closed §4.1 catalog for FEL precondition expressions. Names + shapes mirror
 * specs/response-actions/response-actions-spec.md §4.1. Authors MUST NOT
 * extend this set; processors MUST reject unregistered `@name` bindings.
 */
export const RESPONSE_ACTIONS_PRECONDITION_BINDINGS: readonly PreconditionCatalogEntry[] = [
    {
        name: 'response',
        kind: 'object',
        type: 'Immutable Response snapshot taken at invocation start.',
        purity: 'pure',
        evaluationTiming: 'eager',
        scope: 'expression',
    },
    {
        name: 'definition',
        kind: 'object',
        type: 'Pinned Definition referenced by targetDefinition.',
        purity: 'pure',
        evaluationTiming: 'eager',
        scope: 'expression',
    },
    {
        name: 'action',
        kind: 'object',
        type: 'Current Action { id, intent, actor }.',
        purity: 'pure',
        evaluationTiming: 'eager',
        scope: 'expression',
    },
    {
        name: 'now',
        kind: 'function',
        type: '() -> datetime current processor time.',
        purity: 'impure',
        evaluationTiming: 'lazy',
        scope: 'expression',
    },
    {
        name: 'validation',
        kind: 'object',
        type: '{ lastReport: ValidationReport | null } — most recent ValidationReport for same responseId, or null.',
        purity: 'pure',
        evaluationTiming: 'eager',
        scope: 'expression',
    },
    {
        name: 'invocation',
        kind: 'object',
        type: '{ id: string }; stable across replays. @invocation.attempt is intentionally absent from §4.1.',
        purity: 'pure',
        evaluationTiming: 'eager',
        scope: 'expression',
    },
] as const;

/**
 * §6.4 effect-time catalog. Extends §4.1 with `@effects` and republishes
 * `@invocation` with `attempt` available. Authors MUST NOT extend; evaluators
 * MUST reject unregistered `@name` bindings in `payloadRef` / `detailRef`.
 */
export const RESPONSE_ACTIONS_EFFECT_TIME_BINDINGS: readonly PreconditionCatalogEntry[] = [
    ...RESPONSE_ACTIONS_PRECONDITION_BINDINGS.filter(b => b.name !== 'invocation'),
    {
        name: 'invocation',
        kind: 'object',
        type: '{ id: string, attempt: integer }; effect-time variant — adds attempt.',
        purity: 'pure',
        evaluationTiming: 'eager',
        scope: 'expression',
    },
    {
        name: 'effects',
        kind: 'object',
        type: 'Array of prior effect outcomes { type, status, outcomeRef }. FEL @effects[i] is 1-based.',
        purity: 'pure',
        evaluationTiming: 'lazy',
        scope: 'expression',
    },
];

/** Regex matching FEL `@name` bindings (the `name` after `@`, before `.` or `(`). */
const AT_BINDING_RE = /@([A-Za-z_][A-Za-z0-9_]*)/g;

/** Outcome of a catalog-validation check. */
export interface CatalogValidationResult {
    /** True when every `@name` referenced in the expression is in the catalog. */
    ok: boolean;
    /** Sorted unique list of unregistered `@name` references. */
    unbound: string[];
}

/**
 * Catalog-aware FEL precondition validator. Host evaluators MUST honor this
 * catalog when evaluating preconditions; the engine's default precondition
 * path SHOULD consult this validator before delegating to FEL evaluation.
 *
 * The catalog object is the contract surface. Until the fel-wasm bridge
 * exposes ContextBindingCatalog wiring, host-supplied
 * `ports.evaluatePrecondition` is the fallback for actual FEL evaluation,
 * but unregistered `@name` references MUST be rejected even before then.
 */
export class ResponseActionsPreconditionCatalog {
    private readonly published: Set<string>;
    /** Catalog entries, exposed for tooling/introspection. */
    readonly entries: readonly PreconditionCatalogEntry[];

    constructor(entries: readonly PreconditionCatalogEntry[] = RESPONSE_ACTIONS_PRECONDITION_BINDINGS) {
        this.entries = entries;
        this.published = new Set(entries.map(e => e.name));
    }

    /** Returns true when `name` (without `@`) is in the catalog. */
    isBindingPublished(name: string): boolean {
        return this.published.has(name);
    }

    /**
     * Extracts every `@name` reference in `expression` and asserts each is
     * published. Returns `{ ok: false, unbound: […] }` when one or more
     * names are not registered. The check is lexical, not semantic — a
     * fully FEL-aware evaluator built on fel-core's `ContextBindingCatalog`
     * remains the eventual authoritative implementation.
     */
    validateExpression(expression: string): CatalogValidationResult {
        const unboundSet = new Set<string>();
        for (const match of expression.matchAll(AT_BINDING_RE)) {
            const name = match[1];
            if (!this.published.has(name)) {
                unboundSet.add(name);
            }
        }
        const unbound = [...unboundSet].sort();
        return { ok: unbound.length === 0, unbound };
    }
}
