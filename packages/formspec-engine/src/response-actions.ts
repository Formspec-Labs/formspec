/** @filedesc Response Actions resolution helpers for renderers and hosts. */

import type {
    Action as ResponseAction,
    ActionInvocationStatus,
    BlockingPolicy,
    EffectRequest,
    EffectOutcomeStatus,
    PersistencePolicy,
    Precondition,
    ResponseActionsDocument,
    ValidationOverride,
    ValidationProfile,
} from '@formspec-org/types';
import { VALIDATION_MAPPING_MASTER_TABLE } from '@formspec-org/types';
import { ResponseActionsPreconditionCatalog } from './precondition-catalog.js';

/**
 * Singleton precondition catalog. Spec §4.1 publishes a closed catalog of
 * six bindings; the engine consults this catalog as the default validator
 * for every precondition expression — `ports.evaluatePrecondition` becomes
 * the fallback for actual FEL evaluation, not the gate that decides whether
 * unregistered `@name` references are permitted.
 */
const DEFAULT_PRECONDITION_CATALOG = new ResponseActionsPreconditionCatalog();

export type {
    ResponseAction,
    ResponseActionsDocument,
    ValidationOverride as ResponseActionValidationTuple,
};

export type StandardResponseActionIntent = 'save-draft' | 'autosave' | 'review' | 'submit' | 'request-evidence';

/**
 * The only validation tuple an app-scoped Action may declare.
 *
 * App actions have no Response to validate or persist. Keeping this predicate
 * next to the executor prevents build-time gates from restating a runtime
 * invariant with subtly different defaults.
 */
export const APP_ACTION_VALIDATION_TUPLE: Readonly<ValidationOverride> = Object.freeze({
    profile: 'off',
    blocking: 'non-blocking',
    persistence: 'none',
});

export function isAppActionValidationTuple(value: unknown): value is ValidationOverride {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const tuple = value as Partial<ValidationOverride>;
    return tuple.profile === APP_ACTION_VALIDATION_TUPLE.profile
        && tuple.blocking === APP_ACTION_VALIDATION_TUPLE.blocking
        && tuple.persistence === APP_ACTION_VALIDATION_TUPLE.persistence;
}

/**
 * The document accepted by the engine.
 *
 * The generated schema type is authoritative at this package boundary. Keep
 * smaller, read-only views in the caller that needs them rather than widening
 * this type and making schema-invalid documents appear supported.
 */
export type ResponseActionsDocumentInput = ResponseActionsDocument;

export interface ActionRefFinding {
    code: 'COMP-REFERENTIAL-INTEGRITY';
    severity: 'error';
    kind: 'actionRef';
    nodeId?: string;
    target: string;
    reason?:
        | 'missing-actionRef'
        | 'no-response-actions-document'
        | 'missing-submit-action'
        | 'ambiguous-actionRef';
}

export interface ActionResolution {
    resolved: boolean;
    action: ResponseAction | null;
    finding?: ActionRefFinding;
}

export interface ResponseActionSubmitOptions {
    profile: ValidationProfile;
    validationTuple: ValidationOverride;
    emitEvent?: boolean;
}

export type ResponseActionPreconditionResult = boolean | { passed: boolean; reason?: string };
/** Schema-owned closed vocabulary for one declared effect's outcome. */
export type ResponseActionEffectStatus = EffectOutcomeStatus;

export interface ResponseActionEffectOutcome {
    type: EffectRequest['type'];
    status: ResponseActionEffectStatus;
    idempotencyKey?: string;
    outcomeRef?: string;
    reason?: string;
    replayToken?: string;
}

/**
 * Host adapter result for one effect. Only allowlisted transition strings may
 * cross into a completed invocation result; adapter-private data is ignored.
 */
export interface ResponseActionEffectDispatchResult {
    outcome: ResponseActionEffectOutcome;
    transitionBindings?: Readonly<Record<string, string>>;
}

export type ResponseActionEffectDispatchValue =
    | ResponseActionEffectOutcome
    | ResponseActionEffectDispatchResult
    | void;

export interface ResponseActionIdempotencyKeyContext {
    effectIndex: number;
}

export interface ResponseActionEffectDispatchContext {
    effectIndex: number;
    attempt: number;
    idempotencyKey?: string;
}

export type ResponseActionEffectClass = 'transient' | 'browser-local' | 'durable';

export interface PlannedResponseActionEffect {
    /** Zero-based declaration order. */
    effectIndex: number;
    /** Exact authored effect. No copy or interpretation replaces owner data. */
    effect: EffectRequest;
    effectClass: ResponseActionEffectClass;
    durable: boolean;
}

/**
 * Pure owner classification used by executors and admission gates.
 *
 * Unknown effect types are treated as durable. That fail-closed default means
 * a schema-bypassing caller cannot obtain side effects merely by inventing a
 * new transient-looking type.
 */
export function classifyResponseActionEffect(
    effect: EffectRequest,
): ResponseActionEffectClass {
    const type = (effect as { type?: unknown }).type;
    if (type === 'hostEvent') return 'transient';
    if (type === 'browserResource') return 'browser-local';
    return 'durable';
}

export function isDurableResponseActionEffect(effect: EffectRequest): boolean {
    return classifyResponseActionEffect(effect) === 'durable';
}

/** Pure, ordered effect plan. It never evaluates, dispatches, or authorizes. */
export function planResponseActionEffects(
    action: ResponseAction,
): readonly PlannedResponseActionEffect[] {
    return (action.effects ?? []).map((effect, effectIndex) => ({
        effectIndex,
        effect,
        effectClass: classifyResponseActionEffect(effect),
        durable: isDurableResponseActionEffect(effect),
    }));
}

/**
 * §11.3 / Ledger §8.5 published lifecycle event kinds. Authors MUST NOT
 * declare these as ledgerAppend effects; processors emit them outside the
 * declared effect chain.
 */
export type ResponseActionLifecycleKind =
    | 'action.invoked'
    | 'action.failed'
    | 'action.deferred'
    | 'action.replayed';

/**
 * Payload bound to the four action.* lifecycle kinds. Schema-pinned shape:
 * respondent-ledger-event.schema.json#/$defs/ActionEventPayload owns the
 * authoritative byte form for Ledger storage; this TS shape mirrors the
 * fields the engine can deterministically supply from invocation state.
 * Hosts that persist to the Ledger MUST round-trip the payload through the
 * canonical schema before commit.
 */
export interface ResponseActionLifecyclePayload {
    /** Action.id from the Response Actions document. */
    actionId: string;
    /** Stable invocation identifier. */
    invocationId: string;
    /** 1 on first attempt; 2 on retry-once. */
    attempt: number;
    /** Present on action.failed and action.deferred. */
    terminal?: 'failed' | 'deferred' | 'replayed';
    /** Present on action.failed and action.deferred when an effect is the proximate cause. */
    effectIndex?: number;
    /** Present on action.deferred. */
    replayTokenRef?: string;
    /** Present on action.replayed. */
    priorInvocationRef?: string;
    /** Optional structured failure/deferral cause reference. */
    causeRef?: string;
}

/**
 * Optional invocation-scope context the host supplies once per
 * invokeResponseAction call. The engine uses `invocationId` and
 * `priorInvocationRef` (when present) to fill the lifecycle payload —
 * `priorInvocationRef` signals an action.replayed continuation.
 */
export interface ResponseActionInvocationContext {
    /** Stable invocation identifier; host-generated. Defaults to a synthesized id. */
    invocationId?: string;
    /** When set, marks the invocation as a replay of a prior invocation. */
    priorInvocationRef?: string;
    /**
     * Exact loaded Response Actions artifact identity. The engine adds the
     * resolved Action id; renderers and runners must not infer this identity
     * from projection metadata or visible copy.
     */
    actionArtifact?: {
        artifactRef: string;
        artifactDigest: string;
    };
}

export interface ResponseActionInvocationPorts<TDetail> {
    /**
     * Definition-scoped response submission. Required at runtime when the
     * document scope is `response` (or omitted); never called for `app`.
     */
    submit?: ((options: ResponseActionSubmitOptions) => TDetail | null) | undefined;
    /**
     * Application action input. Required at runtime for `scope: app`; this
     * replaces form submission and gives effect adapters validated structured
     * input without manufacturing a Response.
     */
    prepareAppAction?: ((action: ResponseAction) => TDetail | null) | undefined;
    dispatchHostEvent: (eventName: string, detail: TDetail, action: ResponseAction) => void;
    dispatchEffect?: (
        effect: EffectRequest,
        detail: TDetail,
        action: ResponseAction,
        context: ResponseActionEffectDispatchContext,
    ) => ResponseActionEffectDispatchValue;
    resolveIdempotencyKey?: (
        effect: EffectRequest,
        action: ResponseAction,
        context: ResponseActionIdempotencyKeyContext,
    ) => string;
    evaluatePrecondition?: (
        precondition: Precondition,
        action: ResponseAction,
    ) => ResponseActionPreconditionResult;
    validationReportValid?: (detail: TDetail) => boolean | null | undefined;
    /**
     * Optional recorder for the four §11.3 / Ledger §8.5 action.* lifecycle
     * kinds. Called at the invocation begin/terminal boundaries — never as a
     * declared effect. Reference runtime emits in this order:
     *   - action.invoked|action.replayed at invocation start (the latter when
     *     `priorInvocationRef` is supplied via the invocation context)
     *   - action.failed when terminal is `failed`
     *   - action.deferred when terminal is `deferred`
     *   - action.replayed (begin only — completion of a replayed happy path
     *     emits no further action.* kind; response.completed covers that)
     */
    recordActionLifecycle?: (
        kind: ResponseActionLifecycleKind,
        payload: ResponseActionLifecyclePayload,
    ) => void;
}

/** Async counterpart whose effect adapter may return a Promise. */
export type ResponseActionAsyncInvocationPorts<TDetail> = Omit<
    ResponseActionInvocationPorts<TDetail>,
    'dispatchEffect'
> & {
    dispatchEffect?: (
        effect: EffectRequest,
        detail: TDetail,
        action: ResponseAction,
        context: ResponseActionEffectDispatchContext,
    ) => ResponseActionEffectDispatchValue | PromiseLike<ResponseActionEffectDispatchValue>;
};

/** Schema-owned complete invocation-status vocabulary. */
export type ResponseActionInvocationStatus = ActionInvocationStatus;

export interface ResponseActionOwnerFacts {
    artifactRef: string;
    artifactDigest: string;
    subjectKind: 'response-action';
    subjectRef: string;
}

interface ResolvedResponseActionInvocationFacts {
    invocationId: string;
    actionOwner?: ResponseActionOwnerFacts;
}

export interface ResponseActionInvocationResult<TDetail> {
    status: ResponseActionInvocationStatus;
    /** Present once an Action resolves and invocation begins. */
    invocationId?: string;
    /** Caller-paired artifact identity plus the engine-resolved Action id. */
    actionOwner?: ResponseActionOwnerFacts;
    resolution: ActionResolution;
    validationTuple: ValidationOverride | null;
    detail: TDetail | null;
    effectTrace: ResponseActionEffectOutcome[];
    /** Present only on completed invocations with declared transition outputs. */
    transitionBindings?: Readonly<Record<string, string>>;
    finding?: ActionRefFinding;
    blockedCause?: 'validation' | 'precondition';
    blockedPreconditionId?: string;
    deferredPreconditionId?: string;
    failedPreconditionId?: string;
    failedEffectIndex?: number;
    deferredEffectIndex?: number;
    failureReason?: string;
    replayToken?: string;
}

/**
 * Validation tuple lookup keyed by StandardResponseActionIntent.
 * Built from the generated VM master-table const so the engine's intent
 * resolution is a projection of the closed-core VM fixture, not a parallel
 * literal. The JCS fixture is the single source of truth for these rows.
 */
const MASTER_TABLE: Record<StandardResponseActionIntent, ValidationOverride> =
    (() => {
        const map: Partial<Record<StandardResponseActionIntent, ValidationOverride>> = {};
        for (const row of VALIDATION_MAPPING_MASTER_TABLE) {
            map[row.intent as StandardResponseActionIntent] = {
                profile: row.profile,
                blocking: row.blocking,
                persistence: row.persistence,
            };
        }
        return map as Record<StandardResponseActionIntent, ValidationOverride>;
    })();

function isStandardActionIntent(intent: string): intent is StandardResponseActionIntent {
    return Object.prototype.hasOwnProperty.call(MASTER_TABLE, intent);
}

/** Host finding when `onSubmit` is wired but no submit-intent Action is published. */
export function missingSubmitActionFinding(): ActionRefFinding {
    return {
        code: 'COMP-REFERENTIAL-INTEGRITY',
        severity: 'error',
        kind: 'actionRef',
        target: 'submit',
        reason: 'missing-submit-action',
    };
}

function actionRefFinding(
    actionRef: string,
    nodeId: string | undefined,
    reason?: ActionRefFinding['reason'],
): ActionRefFinding {
    return {
        code: 'COMP-REFERENTIAL-INTEGRITY',
        severity: 'error',
        kind: 'actionRef',
        ...(nodeId ? { nodeId } : {}),
        target: actionRef,
        ...(reason ? { reason } : {}),
    };
}

export function resolveResponseAction(
    document: ResponseActionsDocumentInput | null | undefined,
    actionRef: string,
    nodeId?: string,
): ActionResolution {
    if (!actionRef) {
        return {
            resolved: false,
            action: null,
            finding: actionRefFinding(actionRef, nodeId, 'missing-actionRef'),
        };
    }

    if (!document || !Array.isArray(document.actions)) {
        return {
            resolved: false,
            action: null,
            finding: actionRefFinding(actionRef, nodeId, 'no-response-actions-document'),
        };
    }

    const actions = document.actions.filter(candidate => candidate?.id === actionRef);
    if (actions.length === 0) {
        return {
            resolved: false,
            action: null,
            finding: actionRefFinding(actionRef, nodeId),
        };
    }
    if (actions.length > 1) {
        return {
            resolved: false,
            action: null,
            finding: actionRefFinding(actionRef, nodeId, 'ambiguous-actionRef'),
        };
    }

    return { resolved: true, action: actions[0]! };
}

export interface ResponseActionInvocationPlan {
    resolution: ActionResolution;
    effects: readonly PlannedResponseActionEffect[];
}

/**
 * Resolve an Action and expose its complete effect plan without executing it.
 * Admission layers use this before activation so all possible durable effects
 * can be authorized as one fail-closed decision.
 */
export function planResponseActionInvocation(
    document: ResponseActionsDocumentInput | null | undefined,
    actionRef: string,
    nodeId?: string,
): ResponseActionInvocationPlan {
    const resolution = resolveResponseAction(document, actionRef, nodeId);
    return {
        resolution,
        effects: resolution.action ? planResponseActionEffects(resolution.action) : [],
    };
}

export function findResponseActionByIntent(
    document: ResponseActionsDocumentInput | null | undefined,
    intent: string,
): ResponseAction | null {
    if (!document || !Array.isArray(document.actions)) {
        return null;
    }
    return document.actions.find(action => action?.intent === intent) ?? null;
}

/**
 * Structured error thrown when an explicit `action.validation` override
 * fails the VM §6.3 closed-tuple predicate. The `code` mirrors the Rust
 * lint pass identifier (formspec-lint VMAP-INVALID-OVERRIDE) so runtime
 * findings line up with static-analysis output.
 */
export class InvalidValidationTupleError extends Error {
    readonly code = 'VMAP-INVALID-OVERRIDE';
    readonly actionId: string;
    readonly override: Record<string, unknown>;
    constructor(actionId: string, override: Record<string, unknown>, message: string) {
        super(message);
        this.name = 'InvalidValidationTupleError';
        this.actionId = actionId;
        this.override = override;
    }
}

const REQUIRED_TUPLE_KEYS = ['profile', 'blocking', 'persistence'] as const;
const VALIDATION_PROFILES = new Set<ValidationProfile>(['live', 'on-submit', 'on-demand', 'off']);
const BLOCKING_POLICIES = new Set<BlockingPolicy>(['non-blocking', 'block-on-error']);
const PERSISTENCE_POLICIES = new Set<PersistencePolicy>(['none', 'draft-checkpoint', 'complete-response']);

function overrideErrorPayload(candidate: unknown): Record<string, unknown> {
    return candidate && typeof candidate === 'object'
        ? candidate as Record<string, unknown>
        : { validation: candidate };
}

function assertClosedTupleValue<T extends string>(
    actionId: string,
    overrideRecord: Record<string, unknown>,
    key: (typeof REQUIRED_TUPLE_KEYS)[number],
    value: unknown,
    allowed: Set<T>,
): asserts value is T {
    if (typeof value !== 'string') {
        throw new InvalidValidationTupleError(
            actionId,
            overrideRecord,
            `Response Action '${actionId}' validation override missing required key '${key}' (VM §6.3 requires the full closed (profile, blocking, persistence) tuple).`,
        );
    }
    if (!allowed.has(value as T)) {
        throw new InvalidValidationTupleError(
            actionId,
            overrideRecord,
            `Response Action '${actionId}' validation override has invalid ${key} '${value}' (VM §6.3 requires values from the closed Validation Mapping vocabularies).`,
        );
    }
}

/**
 * Enforces VM §6.3 on a present validation override. The schema gate normally
 * catches this, but a host that supplies runtime objects directly (skipping
 * schema validation) MUST still be rejected here.
 */
function assertValidationTupleValid(actionId: string, candidate: unknown): ValidationOverride {
    const overrideRecord = overrideErrorPayload(candidate);
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new InvalidValidationTupleError(
            actionId,
            overrideRecord,
            `Response Action '${actionId}' validation override must be an object carrying the closed (profile, blocking, persistence) tuple.`,
        );
    }
    const { profile, blocking, persistence } = overrideRecord;
    assertClosedTupleValue(actionId, overrideRecord, 'profile', profile, VALIDATION_PROFILES);
    assertClosedTupleValue(actionId, overrideRecord, 'blocking', blocking, BLOCKING_POLICIES);
    assertClosedTupleValue(actionId, overrideRecord, 'persistence', persistence, PERSISTENCE_POLICIES);

    // VM §6.3: NOT (profile=off AND blocking=block-on-error)
    if (profile === 'off' && blocking === 'block-on-error') {
        throw new InvalidValidationTupleError(
            actionId,
            overrideRecord,
            `Response Action '${actionId}' violates VM §6.3 clause 3: profile=off cannot combine with blocking=block-on-error.`,
        );
    }
    // VM §6.3: persistence=complete-response => profile=on-submit AND blocking=block-on-error
    if (persistence === 'complete-response') {
        if (profile !== 'on-submit') {
            throw new InvalidValidationTupleError(
                actionId,
                overrideRecord,
                `Response Action '${actionId}' violates VM §6.3 clause 1: persistence=complete-response requires profile=on-submit (got '${profile}').`,
            );
        }
        if (blocking !== 'block-on-error') {
            throw new InvalidValidationTupleError(
                actionId,
                overrideRecord,
                `Response Action '${actionId}' violates VM §6.3 clause 1: persistence=complete-response requires blocking=block-on-error (got '${blocking}').`,
            );
        }
    }
    // VM §6.3: blocking=block-on-error => persistence=complete-response
    if (blocking === 'block-on-error' && persistence !== 'complete-response') {
        throw new InvalidValidationTupleError(
            actionId,
            overrideRecord,
            `Response Action '${actionId}' violates VM §6.3 clause 2: blocking=block-on-error requires persistence=complete-response (got '${persistence}').`,
        );
    }
    return { profile, blocking, persistence };
}

export function resolveResponseActionValidationTuple(action: ResponseAction): ValidationOverride {
    if (Object.prototype.hasOwnProperty.call(action, 'validation')) {
        const override = (action as unknown as { validation?: unknown }).validation;
        // VM §6.3 predicate enforcement: a schema-bypassing host (or a
        // malformed in-memory document) MUST be rejected with a structured
        // code so finding-aware UIs and the static lint pass align.
        return assertValidationTupleValid(action.id, override);
    }

    const intent = action.intent;
    if (isStandardActionIntent(intent)) {
        return MASTER_TABLE[intent];
    }

    throw new Error(`Response Action '${action.id}' with intent '${intent}' requires an explicit validation tuple`);
}

export function validationProfileForAction(action: ResponseAction): ValidationProfile {
    return resolveResponseActionValidationTuple(action).profile;
}

export function declaresHostEvent(action: ResponseAction, eventName: string): boolean {
    return (action.effects ?? []).some((effect: EffectRequest) =>
        effect.type === 'hostEvent' && effect.eventName === eventName,
    );
}

function inferValidationReportValid<TDetail>(
    detail: TDetail,
    ports: Pick<ResponseActionInvocationPorts<TDetail>, 'validationReportValid'>,
): boolean | null {
    const fromPort = ports.validationReportValid?.(detail);
    if (typeof fromPort === 'boolean') {
        return fromPort;
    }
    if (!detail || typeof detail !== 'object') {
        return null;
    }
    const report = (detail as { validationReport?: { valid?: unknown } }).validationReport;
    return typeof report?.valid === 'boolean' ? report.valid : null;
}

function preconditionPassed(result: ResponseActionPreconditionResult): boolean {
    return typeof result === 'boolean' ? result : result.passed;
}

function preconditionReason(result: ResponseActionPreconditionResult): string | undefined {
    return typeof result === 'boolean' ? undefined : result.reason;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function effectErrorPolicy(effect: EffectRequest): 'fail' | 'defer' {
    if ('onError' in effect && (effect.onError === 'fail' || effect.onError === 'defer')) {
        return effect.onError;
    }
    return effect.type === 'evidenceRequest' ? 'defer' : 'fail';
}

interface NormalizedEffectDispatch {
    outcome: ResponseActionEffectOutcome;
    transitionBindings?: Readonly<Record<string, string>>;
}

function safeTransitionBindings(
    value: unknown,
): Readonly<Record<string, string>> | undefined {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('effect transitionBindings must be an object');
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new Error('effect transitionBindings must be a plain object');
    }
    const bindings: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const name of Object.keys(value)) {
        if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
            throw new Error(`effect transition binding ${JSON.stringify(name)} has an unsafe name`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, name);
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
            throw new Error(`effect transition binding ${JSON.stringify(name)} is not an own data property`);
        }
        if (typeof descriptor.value !== 'string' || descriptor.value.length === 0) {
            throw new Error(`effect transition binding ${JSON.stringify(name)} must be a non-empty string`);
        }
        bindings[name] = descriptor.value;
    }
    return Object.freeze(bindings);
}

function normalizeEffectDispatch(
    effect: EffectRequest,
    value: ResponseActionEffectDispatchValue,
    idempotencyKey?: string,
): NormalizedEffectDispatch {
    const fallback = { type: effect.type };
    if (!value) {
        return {
            outcome: {
                ...fallback,
                status: 'succeeded',
                ...(idempotencyKey ? { idempotencyKey } : {}),
            },
        };
    }
    const wrapped = Object.prototype.hasOwnProperty.call(value, 'outcome');
    const outcome = wrapped
        ? (value as ResponseActionEffectDispatchResult).outcome
        : value as ResponseActionEffectOutcome;
    if (!outcome || typeof outcome !== 'object') {
        throw new Error('effect dispatcher returned no outcome');
    }
    if (!['succeeded', 'failed', 'deferred', 'replayed', 'not-invoked'].includes(outcome.status)) {
        throw new Error('effect dispatcher returned an unsupported outcome status');
    }
    for (const member of ['outcomeRef', 'reason', 'replayToken'] as const) {
        if (outcome[member] !== undefined && typeof outcome[member] !== 'string') {
            throw new Error(`effect dispatcher outcome ${member} must be a string`);
        }
    }
    return {
        outcome: {
            ...fallback,
            status: outcome.status,
            ...(idempotencyKey ? { idempotencyKey } : {}),
            ...(outcome.outcomeRef !== undefined ? { outcomeRef: outcome.outcomeRef } : {}),
            ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
            ...(outcome.replayToken !== undefined ? { replayToken: outcome.replayToken } : {}),
        },
        ...(wrapped
            ? {
                transitionBindings: safeTransitionBindings(
                    (value as ResponseActionEffectDispatchResult).transitionBindings,
                ),
            }
            : {}),
    };
}

function mergeTransitionBindings(
    target: Record<string, string>,
    source: Readonly<Record<string, string>> | undefined,
): void {
    if (!source) return;
    for (const name of Object.keys(source)) {
        if (Object.prototype.hasOwnProperty.call(target, name)) {
            throw new Error(`duplicate transition binding ${JSON.stringify(name)}`);
        }
    }
    for (const [name, value] of Object.entries(source)) {
        target[name] = value;
    }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return value !== null
        && (typeof value === 'object' || typeof value === 'function')
        && typeof (value as { then?: unknown }).then === 'function';
}

function effectWithIdempotencyKey(effect: EffectRequest, idempotencyKey: string | undefined): EffectRequest {
    if (!idempotencyKey || !isDurableResponseActionEffect(effect)) {
        return effect;
    }
    return { ...effect, idempotencyKey } as EffectRequest;
}

/**
 * Static lint at runtime: warn when an idempotencyKey expression carries
 * no FEL `@`-binding. A literal-string expression (e.g., `"static-key"`)
 * is schema-valid but produces the same key for every invocation — hosts
 * that dedupe by key silently drop legitimate later invocations. Spec §6.3
 * expects an expression referencing at least one of @invocation, @action,
 * @effects, etc. The Rust lint pass `pass_response_actions` emits W1802 at
 * authoring time; the runtime emits console.warn so authors catch it even
 * when the lint hasn't run (e.g., dynamic document construction in tests).
 */
function maybeWarnAboutStaticIdempotencyKey(
    actionId: string,
    effectIndex: number,
    keyExpression: unknown,
): void {
    if (typeof keyExpression !== 'string') return;
    if (keyExpression.includes('@')) return;
    // eslint-disable-next-line no-console
    console.warn(
        `[formspec-engine] Response Action '${actionId}' effect[${effectIndex}] idempotencyKey expression `
        + `does not reference any @-binding (got "${keyExpression}"). A literal-string idempotencyKey `
        + `produces the same key for every invocation, defeating idempotency. Use a FEL expression like `
        + `"@invocation.id & '/<effect-name>'" so the key varies per invocation.`,
    );
}

let invocationCounter = 0;

function synthesizeInvocationId(): string {
    invocationCounter += 1;
    return `inv-${Date.now().toString(36)}-${invocationCounter.toString(36)}`;
}

function notInvokedEffectTrace(
    effects: readonly EffectRequest[],
    startIndex: number,
    reason: string,
): ResponseActionEffectOutcome[] {
    return effects.slice(startIndex).map((effect) => ({
        type: effect.type,
        status: 'not-invoked',
        reason,
    }));
}

function invokeResponseActionInternal<TDetail>(
    document: ResponseActionsDocumentInput | null | undefined,
    actionRef: string,
    ports: ResponseActionInvocationPorts<TDetail> | ResponseActionAsyncInvocationPorts<TDetail>,
    nodeId?: string,
    invocationContext?: ResponseActionInvocationContext,
    asyncEffects = false,
): ResponseActionInvocationResult<TDetail> | Promise<ResponseActionInvocationResult<TDetail>> {
    const resolution = resolveResponseAction(document, actionRef, nodeId);
    if (!resolution.resolved || !resolution.action) {
        return {
            status: 'unresolved',
            resolution,
            validationTuple: null,
            detail: null,
            effectTrace: [],
            ...(resolution.finding ? { finding: resolution.finding } : {}),
        };
    }

    const invocationId = invocationContext?.invocationId ?? synthesizeInvocationId();
    const priorInvocationRef = invocationContext?.priorInvocationRef;
    const actionId = resolution.action.id;
    const effects = resolution.action.effects ?? [];
    const invocationFacts: ResolvedResponseActionInvocationFacts = {
        invocationId,
        ...(invocationContext?.actionArtifact
            ? {
                actionOwner: {
                    ...invocationContext.actionArtifact,
                    subjectKind: 'response-action' as const,
                    subjectRef: actionId,
                },
            }
            : {}),
    };
    const appScoped =
        (document as unknown as { scope?: unknown } | null | undefined)?.scope === 'app';
    const emitLifecycle = (
        kind: ResponseActionLifecycleKind,
        extra: Partial<ResponseActionLifecyclePayload> = {},
    ) => {
        if (!ports.recordActionLifecycle) return;
        const payload: ResponseActionLifecyclePayload = {
            actionId,
            invocationId,
            attempt: extra.attempt ?? 1,
            ...extra,
        };
        ports.recordActionLifecycle(kind, payload);
    };

    // §11.3 begin-of-invocation lifecycle moment. action.replayed when the
    // host signals continuation via priorInvocationRef; otherwise action.invoked.
    if (priorInvocationRef) {
        emitLifecycle('action.replayed', { priorInvocationRef });
    } else {
        emitLifecycle('action.invoked');
    }

    const validationTuple = resolveResponseActionValidationTuple(resolution.action);
    if (appScoped && !isAppActionValidationTuple(validationTuple)) {
        return {
            status: 'failed',
            ...invocationFacts,
            resolution,
            validationTuple,
            detail: null,
            effectTrace: notInvokedEffectTrace(
                effects,
                0,
                'action scope rejected before effects',
            ),
            failureReason:
                'app actions require validation=(off, non-blocking, none)',
        };
    }
    for (const precondition of resolution.action.preconditions ?? []) {
        // §4.1 catalog gate: unregistered @name references are rejected
        // before host evaluation. Host evaluators MUST honor this catalog
        // (fel-core/src/evaluator/core.rs ContextBindingCatalog trait); the
        // lexical check here ensures the contract is enforced even when the
        // host installs a permissive evaluator.
        const catalogCheck = DEFAULT_PRECONDITION_CATALOG.validateExpression(
            precondition.expression ?? '',
        );
        if (!catalogCheck.ok) {
            return {
                status: 'failed',
                ...invocationFacts,
                resolution,
                validationTuple,
                detail: null,
                effectTrace: notInvokedEffectTrace(
                    effects,
                    0,
                    'precondition resolution failed before effects',
                ),
                failedPreconditionId: precondition.id,
                failureReason: `unbound context reference: @${catalogCheck.unbound.join(', @')}`,
            };
        }
        if (!ports.evaluatePrecondition) {
            return {
                status: 'failed',
                ...invocationFacts,
                resolution,
                validationTuple,
                detail: null,
                effectTrace: notInvokedEffectTrace(
                    effects,
                    0,
                    'precondition evaluation unavailable before effects',
                ),
                failedPreconditionId: precondition.id,
                failureReason: 'missing precondition evaluator',
            };
        }
        let preconditionResult: ResponseActionPreconditionResult;
        try {
            preconditionResult = ports.evaluatePrecondition(precondition, resolution.action);
        } catch (error) {
            return {
                status: 'failed',
                ...invocationFacts,
                resolution,
                validationTuple,
                detail: null,
                effectTrace: notInvokedEffectTrace(
                    effects,
                    0,
                    'precondition evaluation failed before effects',
                ),
                failedPreconditionId: precondition.id,
                failureReason: errorMessage(error),
            };
        }
        if (preconditionPassed(preconditionResult)) {
            continue;
        }
        if (precondition.severity === 'defer') {
            return {
                status: 'deferred',
                ...invocationFacts,
                resolution,
                validationTuple,
                detail: null,
                effectTrace: notInvokedEffectTrace(
                    effects,
                    0,
                    'action deferred by precondition',
                ),
                deferredPreconditionId: precondition.id,
                failureReason: preconditionReason(preconditionResult),
            };
        }
        return {
            status: 'blocked',
            ...invocationFacts,
            resolution,
            validationTuple,
            detail: null,
            effectTrace: notInvokedEffectTrace(
                effects,
                0,
                'action blocked by precondition',
            ),
            blockedCause: 'precondition',
            blockedPreconditionId: precondition.id,
            failureReason: preconditionReason(preconditionResult),
        };
    }

    const detail = appScoped
        ? ports.prepareAppAction?.(resolution.action) ?? null
        : ports.submit?.({
            profile: validationTuple.profile,
            validationTuple,
            emitEvent: false,
        }) ?? null;
    if (!detail) {
        return {
            status: 'failed',
            ...invocationFacts,
            resolution,
            validationTuple,
            detail: null,
            effectTrace: notInvokedEffectTrace(
                effects,
                0,
                'action input unavailable before effects',
            ),
            failureReason: appScoped
                ? 'app action adapter returned no detail'
                : 'submit adapter returned no detail',
        };
    }

    if (!appScoped) {
        const validationValid = inferValidationReportValid(detail, ports);
        if (validationTuple.profile !== 'off' && validationValid === null) {
            return {
                status: 'failed',
                ...invocationFacts,
                resolution,
                validationTuple,
                detail,
                effectTrace: notInvokedEffectTrace(
                    effects,
                    0,
                    'validation evidence unavailable before effects',
                ),
                failureReason: 'validation report missing valid flag',
            };
        }
        if (validationTuple.blocking === 'block-on-error' && validationValid === false) {
            return {
                status: 'blocked',
                ...invocationFacts,
                resolution,
                validationTuple,
                detail,
                effectTrace: notInvokedEffectTrace(
                    effects,
                    0,
                    'action blocked by validation',
                ),
                blockedCause: 'validation',
            };
        }
    }

    if (asyncEffects) {
        return invokeResponseActionEffectsAsync(
            resolution.action,
            resolution,
            validationTuple,
            detail,
            invocationFacts,
            ports as ResponseActionAsyncInvocationPorts<TDetail>,
            emitLifecycle,
        );
    }

    const effectTrace: ResponseActionEffectOutcome[] = [];
    const transitionBindings: Record<string, string> = Object.create(null) as Record<string, string>;
    const frozenIdempotencyKeys = new Map<number, string>();
    const retriedEffects = new Set<number>();
    for (let effectIndex = 0; effectIndex < effects.length; effectIndex += 1) {
        const effect = effects[effectIndex];
        let attempt = 0;

        while (true) {
            let idempotencyKey: string | undefined;
            let effectForDispatch = effect;
            let outcome: ResponseActionEffectOutcome;
            let retryableFailure = true;

            try {
                if (isDurableResponseActionEffect(effect)) {
                    idempotencyKey = frozenIdempotencyKeys.get(effectIndex);
                    if (!idempotencyKey) {
                        // Warn once per effect (only on first attempt) when the
                        // author-supplied expression is a literal string with no
                        // @-binding. Idempotency depends on the key varying.
                        maybeWarnAboutStaticIdempotencyKey(
                            actionId,
                            effectIndex,
                            (effect as { idempotencyKey?: unknown }).idempotencyKey,
                        );
                        if (!ports.resolveIdempotencyKey) {
                            throw new Error('missing idempotency key resolver');
                        }
                        idempotencyKey = ports.resolveIdempotencyKey(effect, resolution.action, { effectIndex });
                        if (!idempotencyKey) {
                            throw new Error('idempotency key resolver returned an empty key');
                        }
                        frozenIdempotencyKeys.set(effectIndex, idempotencyKey);
                    }
                    effectForDispatch = effectWithIdempotencyKey(effect, idempotencyKey);
                }

                if (effect.type === 'hostEvent' && typeof effect.eventName === 'string') {
                    ports.dispatchHostEvent(effect.eventName, detail, resolution.action);
                    outcome = normalizeEffectDispatch(effect, undefined).outcome;
                } else if (!ports.dispatchEffect) {
                    outcome = {
                        type: effect.type,
                        status: 'failed',
                        ...(idempotencyKey ? { idempotencyKey } : {}),
                        reason: 'missing effect dispatcher',
                    };
                } else {
                    const dispatchValue = ports.dispatchEffect(
                        effectForDispatch,
                        detail,
                        resolution.action,
                        {
                            effectIndex,
                            attempt,
                            ...(idempotencyKey ? { idempotencyKey } : {}),
                        },
                    );
                    if (isPromiseLike(dispatchValue)) {
                        retryableFailure = false;
                        void Promise.resolve(dispatchValue).catch(() => undefined);
                        throw new Error(
                            'async effect dispatcher returned a Promise; use invokeResponseActionAsync',
                        );
                    }
                    let normalized: NormalizedEffectDispatch;
                    try {
                        normalized = normalizeEffectDispatch(effect, dispatchValue, idempotencyKey);
                        if (
                            normalized.outcome.status === 'succeeded'
                            || normalized.outcome.status === 'replayed'
                        ) {
                            mergeTransitionBindings(
                                transitionBindings,
                                normalized.transitionBindings,
                            );
                        }
                    } catch (error) {
                        retryableFailure = false;
                        throw error;
                    }
                    outcome = normalized.outcome;
                }
            } catch (error) {
                outcome = {
                    type: effect.type,
                    status: 'failed',
                    ...(idempotencyKey ? { idempotencyKey } : {}),
                    reason: errorMessage(error),
                };
            }
            // One owner-produced record per declared effect. A retry replaces
            // that effect's prior failed attempt; dispatch context and
            // lifecycle events retain attempt detail without corrupting the
            // declaration-order trace.
            effectTrace[effectIndex] = outcome;

            if (outcome.status === 'succeeded' || outcome.status === 'replayed') {
                break;
            }

            const deferred = outcome.status === 'deferred'
                || (retryableFailure && effectErrorPolicy(effect) === 'defer');
            if (deferred) {
                emitLifecycle('action.deferred', {
                    terminal: 'deferred',
                    effectIndex,
                    attempt: attempt + 1,
                    ...(outcome.replayToken ? { replayTokenRef: outcome.replayToken } : {}),
                    ...(outcome.reason ? { causeRef: outcome.reason } : {}),
                });
                return {
                    status: 'deferred',
                    ...invocationFacts,
                    resolution,
                    validationTuple,
                    detail,
                    effectTrace: [
                        ...effectTrace,
                        ...notInvokedEffectTrace(
                            effects,
                            effectIndex + 1,
                            `action deferred at effect ${effectIndex}`,
                        ),
                    ],
                    deferredEffectIndex: effectIndex,
                    replayToken: outcome.replayToken,
                    failureReason: outcome.reason,
                };
            }

            if (
                retryableFailure
                && resolution.action.onFailure === 'retry-once'
                && !retriedEffects.has(effectIndex)
            ) {
                retriedEffects.add(effectIndex);
                attempt += 1;
                continue;
            }

            emitLifecycle('action.failed', {
                terminal: 'failed',
                effectIndex,
                attempt: attempt + 1,
                ...(outcome.reason ? { causeRef: outcome.reason } : {}),
            });
            return {
                status: 'failed',
                ...invocationFacts,
                resolution,
                validationTuple,
                detail,
                effectTrace: [
                    ...effectTrace,
                    ...notInvokedEffectTrace(
                        effects,
                        effectIndex + 1,
                        `action failed at effect ${effectIndex}`,
                    ),
                ],
                failedEffectIndex: effectIndex,
                failureReason: outcome.reason,
            };
        }
    }

    return {
        status: 'completed',
        ...invocationFacts,
        resolution,
        validationTuple,
        detail,
        effectTrace,
        ...(Object.keys(transitionBindings).length > 0
            ? { transitionBindings: Object.freeze(transitionBindings) }
            : {}),
    };
}

async function invokeResponseActionEffectsAsync<TDetail>(
    action: ResponseAction,
    resolution: ActionResolution,
    validationTuple: ValidationOverride,
    detail: TDetail,
    invocationFacts: ResolvedResponseActionInvocationFacts,
    ports: ResponseActionAsyncInvocationPorts<TDetail>,
    emitLifecycle: (
        kind: ResponseActionLifecycleKind,
        extra?: Partial<ResponseActionLifecyclePayload>,
    ) => void,
): Promise<ResponseActionInvocationResult<TDetail>> {
    const effects = action.effects ?? [];
    const effectTrace: ResponseActionEffectOutcome[] = [];
    const transitionBindings: Record<string, string> = Object.create(null) as Record<string, string>;
    const frozenIdempotencyKeys = new Map<number, string>();
    const retriedEffects = new Set<number>();

    for (let effectIndex = 0; effectIndex < effects.length; effectIndex += 1) {
        const effect = effects[effectIndex];
        let attempt = 0;

        while (true) {
            let idempotencyKey: string | undefined;
            let effectForDispatch = effect;
            let outcome: ResponseActionEffectOutcome;
            let retryableFailure = true;

            try {
                if (isDurableResponseActionEffect(effect)) {
                    idempotencyKey = frozenIdempotencyKeys.get(effectIndex);
                    if (!idempotencyKey) {
                        maybeWarnAboutStaticIdempotencyKey(
                            action.id,
                            effectIndex,
                            (effect as { idempotencyKey?: unknown }).idempotencyKey,
                        );
                        if (!ports.resolveIdempotencyKey) {
                            throw new Error('missing idempotency key resolver');
                        }
                        idempotencyKey = ports.resolveIdempotencyKey(effect, action, { effectIndex });
                        if (!idempotencyKey) {
                            throw new Error('idempotency key resolver returned an empty key');
                        }
                        frozenIdempotencyKeys.set(effectIndex, idempotencyKey);
                    }
                    effectForDispatch = effectWithIdempotencyKey(effect, idempotencyKey);
                }

                if (effect.type === 'hostEvent' && typeof effect.eventName === 'string') {
                    ports.dispatchHostEvent(effect.eventName, detail, action);
                    outcome = normalizeEffectDispatch(effect, undefined).outcome;
                } else if (!ports.dispatchEffect) {
                    outcome = {
                        type: effect.type,
                        status: 'failed',
                        ...(idempotencyKey ? { idempotencyKey } : {}),
                        reason: 'missing effect dispatcher',
                    };
                } else {
                    const dispatchValue = await ports.dispatchEffect(
                        effectForDispatch,
                        detail,
                        action,
                        {
                            effectIndex,
                            attempt,
                            ...(idempotencyKey ? { idempotencyKey } : {}),
                        },
                    );
                    let normalized: NormalizedEffectDispatch;
                    try {
                        normalized = normalizeEffectDispatch(effect, dispatchValue, idempotencyKey);
                        if (
                            normalized.outcome.status === 'succeeded'
                            || normalized.outcome.status === 'replayed'
                        ) {
                            mergeTransitionBindings(
                                transitionBindings,
                                normalized.transitionBindings,
                            );
                        }
                    } catch (error) {
                        retryableFailure = false;
                        throw error;
                    }
                    outcome = normalized.outcome;
                }
            } catch (error) {
                outcome = {
                    type: effect.type,
                    status: 'failed',
                    ...(idempotencyKey ? { idempotencyKey } : {}),
                    reason: errorMessage(error),
                };
            }

            effectTrace[effectIndex] = outcome;
            if (outcome.status === 'succeeded' || outcome.status === 'replayed') break;

            const deferred = outcome.status === 'deferred'
                || (retryableFailure && effectErrorPolicy(effect) === 'defer');
            if (deferred) {
                emitLifecycle('action.deferred', {
                    terminal: 'deferred',
                    effectIndex,
                    attempt: attempt + 1,
                    ...(outcome.replayToken ? { replayTokenRef: outcome.replayToken } : {}),
                    ...(outcome.reason ? { causeRef: outcome.reason } : {}),
                });
                return {
                    status: 'deferred',
                    ...invocationFacts,
                    resolution,
                    validationTuple,
                    detail,
                    effectTrace: [
                        ...effectTrace,
                        ...notInvokedEffectTrace(
                            effects,
                            effectIndex + 1,
                            `action deferred at effect ${effectIndex}`,
                        ),
                    ],
                    deferredEffectIndex: effectIndex,
                    replayToken: outcome.replayToken,
                    failureReason: outcome.reason,
                };
            }

            if (
                retryableFailure
                && action.onFailure === 'retry-once'
                && !retriedEffects.has(effectIndex)
            ) {
                retriedEffects.add(effectIndex);
                attempt += 1;
                continue;
            }

            emitLifecycle('action.failed', {
                terminal: 'failed',
                effectIndex,
                attempt: attempt + 1,
                ...(outcome.reason ? { causeRef: outcome.reason } : {}),
            });
            return {
                status: 'failed',
                ...invocationFacts,
                resolution,
                validationTuple,
                detail,
                effectTrace: [
                    ...effectTrace,
                    ...notInvokedEffectTrace(
                        effects,
                        effectIndex + 1,
                        `action failed at effect ${effectIndex}`,
                    ),
                ],
                failedEffectIndex: effectIndex,
                failureReason: outcome.reason,
            };
        }
    }

    return {
        status: 'completed',
        ...invocationFacts,
        resolution,
        validationTuple,
        detail,
        effectTrace,
        ...(Object.keys(transitionBindings).length > 0
            ? { transitionBindings: Object.freeze(transitionBindings) }
            : {}),
    };
}

/** Invoke an Action with synchronous effect adapters. Promise outcomes fail fast. */
export function invokeResponseAction<TDetail>(
    document: ResponseActionsDocumentInput | null | undefined,
    actionRef: string,
    ports: ResponseActionInvocationPorts<TDetail>,
    nodeId?: string,
    invocationContext?: ResponseActionInvocationContext,
): ResponseActionInvocationResult<TDetail> {
    return invokeResponseActionInternal(
        document,
        actionRef,
        ports,
        nodeId,
        invocationContext,
        false,
    ) as ResponseActionInvocationResult<TDetail>;
}

/** Invoke an Action while awaiting effect adapters in strict declaration order. */
export async function invokeResponseActionAsync<TDetail>(
    document: ResponseActionsDocumentInput | null | undefined,
    actionRef: string,
    ports: ResponseActionAsyncInvocationPorts<TDetail>,
    nodeId?: string,
    invocationContext?: ResponseActionInvocationContext,
): Promise<ResponseActionInvocationResult<TDetail>> {
    return await invokeResponseActionInternal(
        document,
        actionRef,
        ports,
        nodeId,
        invocationContext,
        true,
    );
}
