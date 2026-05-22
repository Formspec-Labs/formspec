/** @filedesc Minimal Response Actions resolver/invoker for ActionButton triggers. */
import { submit, type SubmitHost } from './submit/index.js';
import type { SubmitDetail } from './hub-types.js';

export interface ResponseActionEffect {
    type?: string;
    eventName?: string;
    [key: string]: unknown;
}

export interface ResponseAction {
    id: string;
    intent?: string;
    validation?: {
        profile?: 'live' | 'on-submit' | 'on-demand' | 'off';
    };
    effects?: ResponseActionEffect[];
    [key: string]: unknown;
}

export interface ResponseActionsDocument {
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

export interface ActionHost extends SubmitHost {
    _responseActionsDocument: ResponseActionsDocument | null;
    dispatchEvent(event: Event): boolean;
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

export function resolveActionRef(
    host: Pick<ActionHost, '_responseActionsDocument'>,
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

    const doc = host._responseActionsDocument;
    if (!doc || !Array.isArray(doc.actions)) {
        return {
            resolved: false,
            action: null,
            finding: actionRefFinding(actionRef, nodeId, 'no-response-actions-document'),
        };
    }

    const action = doc.actions.find(candidate => candidate?.id === actionRef) ?? null;
    if (!action) {
        return {
            resolved: false,
            action: null,
            finding: actionRefFinding(actionRef, nodeId),
        };
    }

    return { resolved: true, action };
}

export function emitActionFinding(host: Pick<ActionHost, 'dispatchEvent'>, finding: ActionRefFinding): void {
    host.dispatchEvent(new CustomEvent('formspec-action-finding', {
        detail: { finding },
        bubbles: true,
        composed: true,
    }));
}

function submitModeForAction(action: ResponseAction): 'continuous' | 'submit' {
    const profile = action.validation?.profile;
    return profile === 'live' ? 'continuous' : 'submit';
}

export function invokeAction(host: ActionHost, actionRef: string, nodeId?: string): SubmitDetail | null {
    const resolution = resolveActionRef(host, actionRef, nodeId);
    if (!resolution.resolved || !resolution.action) {
        if (resolution.finding) {
            emitActionFinding(host, resolution.finding);
        }
        return null;
    }

    const detail = submit(host, {
        mode: submitModeForAction(resolution.action),
        emitEvent: false,
    });
    if (!detail) return null;

    for (const effect of resolution.action.effects ?? []) {
        if (effect?.type !== 'hostEvent' || typeof effect.eventName !== 'string') {
            continue;
        }
        host.dispatchEvent(new CustomEvent(effect.eventName, {
            detail,
            bubbles: true,
            composed: true,
        }));
    }

    return detail;
}
