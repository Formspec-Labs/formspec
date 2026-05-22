/** @filedesc Response Actions resolution helpers for renderers and hosts. */

import type {
    Action as ResponseAction,
    EffectRequest,
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

export function defaultActionRefForIntent(
    document: ResponseActionsDocumentInput | null | undefined,
    intent: StandardResponseActionIntent = 'submit',
    fallback = '',
): string {
    return findResponseActionByIntent(document, intent)?.id ?? fallback;
}

export function resolveResponseActionValidationTuple(action: ResponseAction): ValidationOverride {
    const override = action.validation;
    if (override) {
        return override;
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

export function invokeResponseAction<TDetail>(
    document: ResponseActionsDocumentInput | null | undefined,
    actionRef: string,
    ports: ResponseActionInvocationPorts<TDetail>,
    nodeId?: string,
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
