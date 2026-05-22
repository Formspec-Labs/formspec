/** @filedesc Response Actions host adapter for ActionButton triggers. */
import {
    invokeResponseAction,
    resolveResponseAction,
    type ActionRefFinding,
    type ActionResolution,
    type ResponseAction,
    type ResponseActionEffectDispatchContext,
    type ResponseActionEffectOutcome,
    type ResponseActionInvocationResult,
    type ResponseActionIdempotencyKeyContext,
    type ResponseActionPreconditionResult,
    type ResponseActionsDocumentInput,
} from '@formspec-org/engine/render';
import type { EffectRequest, Precondition } from '@formspec-org/types';
import { submit, type SubmitHost } from './submit/index.js';
import type { SubmitDetail } from './hub-types.js';

export type ResponseActionEffect = NonNullable<ResponseAction['effects']>[number];
export type ResponseActionsDocument = ResponseActionsDocumentInput;
export type { ActionRefFinding, ActionResolution, ResponseAction };

export interface ActionHost extends SubmitHost {
    _responseActionsDocument: ResponseActionsDocument | null;
    dispatchEvent(event: Event): boolean;
}

export function resolveActionRef(
    host: Pick<ActionHost, '_responseActionsDocument'>,
    actionRef: string,
    nodeId?: string,
): ActionResolution {
    return resolveResponseAction(host._responseActionsDocument, actionRef, nodeId);
}

export function emitActionFinding(host: Pick<ActionHost, 'dispatchEvent'>, finding: ActionRefFinding): void {
    host.dispatchEvent(new CustomEvent('formspec-action-finding', {
        detail: { finding },
        bubbles: true,
        composed: true,
    }));
}

function evaluatePrecondition(host: ActionHost, precondition: Precondition, action: ResponseAction): ResponseActionPreconditionResult {
    const detail: {
        precondition: Precondition;
        action: ResponseAction;
        result?: ResponseActionPreconditionResult;
    } = { precondition, action };
    host.dispatchEvent(new CustomEvent('formspec-action-precondition', {
        detail,
        bubbles: true,
        composed: true,
    }));
    if (typeof detail.result === 'undefined') {
        throw new Error(`No precondition result supplied for Response Action precondition '${precondition.id}'`);
    }
    return detail.result;
}

function dispatchDurableEffect(
    host: ActionHost,
    effect: EffectRequest,
    detail: SubmitDetail,
    action: ResponseAction,
    context: ResponseActionEffectDispatchContext,
): ResponseActionEffectOutcome {
    const eventDetail: {
        effect: EffectRequest;
        submitDetail: SubmitDetail;
        action: ResponseAction;
        context: ResponseActionEffectDispatchContext;
        outcome?: ResponseActionEffectOutcome;
    } = { effect, submitDetail: detail, action, context };
    host.dispatchEvent(new CustomEvent('formspec-action-effect', {
        detail: eventDetail,
        bubbles: true,
        composed: true,
    }));
    return eventDetail.outcome ?? {
        type: effect.type,
        status: 'failed',
        reason: `No effect outcome supplied for Response Action effect '${effect.type}'`,
    };
}

function resolveIdempotencyKey(
    host: ActionHost,
    effect: EffectRequest,
    action: ResponseAction,
    context: ResponseActionIdempotencyKeyContext,
): string {
    const detail: {
        effect: EffectRequest;
        action: ResponseAction;
        context: ResponseActionIdempotencyKeyContext;
        idempotencyKey?: string;
    } = { effect, action, context };
    host.dispatchEvent(new CustomEvent('formspec-action-idempotency-key', {
        detail,
        bubbles: true,
        composed: true,
    }));
    if (!detail.idempotencyKey) {
        throw new Error(`No idempotency key supplied for Response Action effect '${effect.type}'`);
    }
    return detail.idempotencyKey;
}

function emitActionResult(
    host: Pick<ActionHost, 'dispatchEvent'>,
    result: ResponseActionInvocationResult<SubmitDetail>,
): void {
    host.dispatchEvent(new CustomEvent('formspec-action-result', {
        detail: { result },
        bubbles: true,
        composed: true,
    }));
}

export function invokeAction(host: ActionHost, actionRef: string, nodeId?: string): SubmitDetail | null {
    const result = invokeResponseAction(
        host._responseActionsDocument,
        actionRef,
        {
            submit: ({ profile, validationTuple }) => submit(host, { profile, validationTuple, emitEvent: false }),
            dispatchHostEvent: (eventName, detail) => {
                host.dispatchEvent(new CustomEvent(eventName, {
                    detail,
                    bubbles: true,
                    composed: true,
                }));
            },
            evaluatePrecondition: (precondition, action) => evaluatePrecondition(host, precondition, action),
            dispatchEffect: (effect, detail, action, context) => dispatchDurableEffect(host, effect, detail, action, context),
            resolveIdempotencyKey: (effect, action, context) => resolveIdempotencyKey(host, effect, action, context),
        },
        nodeId,
    );
    emitActionResult(host, result);
    if (result.finding) {
        emitActionFinding(host, result.finding);
    }
    return result.detail;
}
