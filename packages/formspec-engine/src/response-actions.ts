/** @filedesc Response Actions resolution helpers for renderers and hosts. */

import type {
    Action as ResponseAction,
    BlockingPolicy,
    EffectRequest,
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

export interface ResponseActionsDocumentInput {
    actions?: ResponseAction[];
    [key: string]: unknown;
}

export interface ActionRefFinding {
    code: 'COMP-REFERENTIAL-INTEGRITY';
    severity: 'error';
    kind: 'actionRef';
    nodeId?: string;
    target: string;
    reason?: 'missing-actionRef' | 'no-response-actions-document';
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
export type ResponseActionEffectStatus = 'succeeded' | 'failed' | 'deferred' | 'replayed' | 'not-invoked';

export interface ResponseActionEffectOutcome {
    type: EffectRequest['type'];
    status: ResponseActionEffectStatus;
    idempotencyKey?: string;
    outcomeRef?: string;
    reason?: string;
    replayToken?: string;
}

export interface ResponseActionIdempotencyKeyContext {
    effectIndex: number;
}

export interface ResponseActionEffectDispatchContext {
    effectIndex: number;
    attempt: number;
    idempotencyKey?: string;
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
}

export interface ResponseActionInvocationPorts<TDetail> {
    submit: (options: ResponseActionSubmitOptions) => TDetail | null;
    dispatchHostEvent: (eventName: string, detail: TDetail, action: ResponseAction) => void;
    dispatchEffect?: (
        effect: EffectRequest,
        detail: TDetail,
        action: ResponseAction,
        context: ResponseActionEffectDispatchContext,
    ) => ResponseActionEffectOutcome | void;
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

export type ResponseActionInvocationStatus = 'unresolved' | 'blocked' | 'failed' | 'deferred' | 'completed';

export interface ResponseActionInvocationResult<TDetail> {
    status: ResponseActionInvocationStatus;
    resolution: ActionResolution;
    validationTuple: ValidationOverride | null;
    detail: TDetail | null;
    effectTrace: ResponseActionEffectOutcome[];
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
 * resolution is a projection of the schema, not a parallel literal. The
 * schema's MasterTable const is the single source of truth for this map
 * (schemas/validation-mapping.schema.json#/$defs/MasterTable/const).
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

    const action = document.actions.find(candidate => candidate?.id === actionRef) ?? null;
    if (!action) {
        return {
            resolved: false,
            action: null,
            finding: actionRefFinding(actionRef, nodeId),
        };
    }

    return { resolved: true, action };
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
    // VM §6.3: NOT (profile=off AND blocking=block-on-error)
    if (profile === 'off' && blocking === 'block-on-error') {
        throw new InvalidValidationTupleError(
            actionId,
            overrideRecord,
            `Response Action '${actionId}' violates VM §6.3 clause 3: profile=off cannot combine with blocking=block-on-error.`,
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
    ports: ResponseActionInvocationPorts<TDetail>,
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

function isDurableEffect(effect: EffectRequest): boolean {
    return effect.type !== 'hostEvent';
}

function effectErrorPolicy(effect: EffectRequest): 'fail' | 'defer' {
    if ('onError' in effect && (effect.onError === 'fail' || effect.onError === 'defer')) {
        return effect.onError;
    }
    return effect.type === 'evidenceRequest' ? 'defer' : 'fail';
}

function normalizeEffectOutcome(
    effect: EffectRequest,
    outcome: ResponseActionEffectOutcome | void,
    idempotencyKey?: string,
): ResponseActionEffectOutcome {
    const fallback = { type: effect.type };
    if (!outcome) {
        return {
            ...fallback,
            status: 'succeeded',
            ...(idempotencyKey ? { idempotencyKey } : {}),
        };
    }
    return {
        ...fallback,
        ...outcome,
        type: effect.type,
        ...(idempotencyKey ? { idempotencyKey } : {}),
    };
}

function effectWithIdempotencyKey(effect: EffectRequest, idempotencyKey: string | undefined): EffectRequest {
    if (!idempotencyKey || !isDurableEffect(effect)) {
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
 * @effects, etc. The matching Rust lint pass (sibling craftsman) emits a
 * W18xx code; the runtime emits console.warn so authors catch it without
 * breaking the flow.
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

export function invokeResponseAction<TDetail>(
    document: ResponseActionsDocumentInput | null | undefined,
    actionRef: string,
    ports: ResponseActionInvocationPorts<TDetail>,
    nodeId?: string,
    invocationContext?: ResponseActionInvocationContext,
): ResponseActionInvocationResult<TDetail> {
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
                resolution,
                validationTuple,
                detail: null,
                effectTrace: [],
                failedPreconditionId: precondition.id,
                failureReason: `unbound context reference: @${catalogCheck.unbound.join(', @')}`,
            };
        }
        if (!ports.evaluatePrecondition) {
            return {
                status: 'failed',
                resolution,
                validationTuple,
                detail: null,
                effectTrace: [],
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
                resolution,
                validationTuple,
                detail: null,
                effectTrace: [],
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
                resolution,
                validationTuple,
                detail: null,
                effectTrace: [],
                deferredPreconditionId: precondition.id,
                failureReason: preconditionReason(preconditionResult),
            };
        }
        return {
            status: 'blocked',
            resolution,
            validationTuple,
            detail: null,
            effectTrace: [],
            blockedCause: 'precondition',
            blockedPreconditionId: precondition.id,
            failureReason: preconditionReason(preconditionResult),
        };
    }

    const detail = ports.submit({
        profile: validationTuple.profile,
        validationTuple,
        emitEvent: false,
    });
    if (!detail) {
        return {
            status: 'failed',
            resolution,
            validationTuple,
            detail: null,
            effectTrace: [],
            failureReason: 'submit adapter returned no detail',
        };
    }

    const validationValid = inferValidationReportValid(detail, ports);
    if (validationTuple.profile !== 'off' && validationValid === null) {
        return {
            status: 'failed',
            resolution,
            validationTuple,
            detail,
            effectTrace: [],
            failureReason: 'validation report missing valid flag',
        };
    }
    if (validationTuple.blocking === 'block-on-error' && validationValid === false) {
        return {
            status: 'blocked',
            resolution,
            validationTuple,
            detail,
            effectTrace: [],
            blockedCause: 'validation',
        };
    }

    const effectTrace: ResponseActionEffectOutcome[] = [];
    const frozenIdempotencyKeys = new Map<number, string>();
    const retriedEffects = new Set<number>();
    const effects = resolution.action.effects ?? [];
    for (let effectIndex = 0; effectIndex < effects.length; effectIndex += 1) {
        const effect = effects[effectIndex];
        let attempt = 0;

        while (true) {
            let idempotencyKey: string | undefined;
            let effectForDispatch = effect;
            let outcome: ResponseActionEffectOutcome;

            try {
                if (isDurableEffect(effect)) {
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
                    outcome = normalizeEffectOutcome(effect, undefined);
                } else if (!ports.dispatchEffect) {
                    outcome = {
                        type: effect.type,
                        status: 'failed',
                        ...(idempotencyKey ? { idempotencyKey } : {}),
                        reason: 'missing effect dispatcher',
                    };
                } else {
                    outcome = normalizeEffectOutcome(
                        effect,
                        ports.dispatchEffect(effectForDispatch, detail, resolution.action, {
                            effectIndex,
                            attempt,
                            ...(idempotencyKey ? { idempotencyKey } : {}),
                        }),
                        idempotencyKey,
                    );
                }
            } catch (error) {
                outcome = {
                    type: effect.type,
                    status: 'failed',
                    ...(idempotencyKey ? { idempotencyKey } : {}),
                    reason: errorMessage(error),
                };
            }
            effectTrace.push(outcome);

            if (outcome.status === 'succeeded' || outcome.status === 'replayed') {
                break;
            }

            const deferred = outcome.status === 'deferred' || effectErrorPolicy(effect) === 'defer';
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
                    resolution,
                    validationTuple,
                    detail,
                    effectTrace,
                    deferredEffectIndex: effectIndex,
                    replayToken: outcome.replayToken,
                    failureReason: outcome.reason,
                };
            }

            if (resolution.action.onFailure === 'retry-once' && !retriedEffects.has(effectIndex)) {
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
                resolution,
                validationTuple,
                detail,
                effectTrace,
                failedEffectIndex: effectIndex,
                failureReason: outcome.reason,
            };
        }
    }

    return {
        status: 'completed',
        resolution,
        validationTuple,
        detail,
        effectTrace,
    };
}
