/** @filedesc Semantic set/activate operations use the mounted renderer paths. */

import React, { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import {
    initFormspecEngine,
    invokeResponseAction,
} from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import type { ResponseActionInvokerInput } from '../src/context';
import {
    createSemanticControlRegistry,
    type SemanticControlTarget,
} from '../src/semantic-controls';

beforeAll(async () => {
    await initFormspecEngine();
});

const DEFINITION_DIGEST = `sha256:${'d'.repeat(64)}`;
const ACTIONS_DIGEST = `sha256:${'e'.repeat(64)}`;

const definition = {
    $formspec: '1.0',
    url: 'https://example.test/forms/community-room',
    version: '1.0.0',
    status: 'active',
    title: 'Community room schedule',
    items: [
        {
            key: 'contact',
            type: 'group',
            label: 'Contact',
            children: [{
                key: 'email',
                type: 'field',
                dataType: 'string',
                label: 'Email',
            }],
        },
        {
            key: 'scheduleCode',
            type: 'field',
            dataType: 'string',
            label: 'Schedule code',
        },
    ],
    binds: [{ path: 'scheduleCode', readonly: 'true' }],
};

const responseActionsDocument = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    targetDefinition: { url: definition.url },
    actions: [{
        id: 'publish-schedule',
        intent: 'submit',
        label: { literal: 'Publish schedule' },
        effects: [{ type: 'hostEvent', eventName: 'schedule-published' }],
    }],
};

function target(
    subjectKind: 'definition-item' | 'response-action',
    subjectRef: string,
): SemanticControlTarget {
    return {
        renderInstanceId: 'render-community-room-1',
        control: {
            artifactRef: subjectKind === 'definition-item'
                ? definition.url
                : 'https://example.test/actions/community-room',
            artifactDigest: subjectKind === 'definition-item'
                ? DEFINITION_DIGEST
                : ACTIONS_DIGEST,
            subjectKind,
            subjectRef,
        },
    };
}

describe('renderer semantic controls', () => {
    it('sets fields and activates Actions through the same mounted control capabilities', async () => {
        const registry = createSemanticControlRegistry();
        const onActionResult = vi.fn();
        const responseActionInvoker = vi.fn((input: ResponseActionInvokerInput) => invokeResponseAction(
            input.document,
            input.actionRef,
            input.ports,
            input.nodeId,
            input.invocationContext,
        ));
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <FormspecForm
                    definition={definition}
                    responseActionsDocument={responseActionsDocument}
                    onSubmit={() => {}}
                    onActionResult={onActionResult}
                    responseActionInvoker={responseActionInvoker}
                    semanticControlScope={{
                        registry,
                        renderInstanceId: 'render-community-room-1',
                        definitionArtifact: {
                            artifactRef: definition.url,
                            artifactDigest: DEFINITION_DIGEST,
                        },
                        responseActionsArtifact: {
                            artifactRef: 'https://example.test/actions/community-room',
                            artifactDigest: ACTIONS_DIGEST,
                        },
                        responseId: 'community-room-response-9',
                    }}
                />,
            );
        });

        let setResult;
        await act(async () => {
            setResult = registry.setItem(
                target('definition-item', 'contact.email'),
                'organizer@example.test',
            );
        });
        expect(setResult).toMatchObject({
            status: 'set',
            responseBinding: {
                responseId: 'community-room-response-9',
                responseRevision: 1,
            },
        });
        expect(
            (container.querySelector('input[name="contact.email"]') as HTMLInputElement).value,
        ).toBe('organizer@example.test');

        expect(
            registry.setItem(
                target('definition-item', 'scheduleCode'),
                'SHOULD-NOT-WRITE',
            ),
        ).toMatchObject({ status: 'refused', reason: 'disabled' });

        let activation;
        await act(async () => {
            activation = await registry.activateControl(
                target('response-action', 'publish-schedule'),
                {
                    invocationId: 'case-11/run-2/activate-publish',
                    responseBinding: {
                        responseId: 'community-room-response-9',
                        responseRevision: 1,
                    },
                },
            );
        });
        expect(activation).toMatchObject({
            status: 'activated',
            invocationId: 'case-11/run-2/activate-publish',
            responseBinding: {
                responseId: 'community-room-response-9',
                responseRevision: 1,
            },
            invocation: {
                status: 'completed',
                invocationId: 'case-11/run-2/activate-publish',
                detail: {
                    response: {
                        id: 'community-room-response-9',
                        data: {
                            contact: { email: 'organizer@example.test' },
                        },
                    },
                },
            },
        });
        expect(onActionResult).toHaveBeenCalledWith(
            expect.objectContaining({
                invocationId: 'case-11/run-2/activate-publish',
            }),
        );
        expect(responseActionInvoker).toHaveBeenCalledWith(
            expect.objectContaining({
                actionRef: 'publish-schedule',
                invocationContext: {
                    invocationId: 'case-11/run-2/activate-publish',
                    actionArtifact: {
                        artifactRef: 'https://example.test/actions/community-room',
                        artifactDigest: ACTIONS_DIGEST,
                    },
                },
            }),
        );

        await act(async () => {
            root.unmount();
        });
        expect(
            await registry.activateControl(
                target('response-action', 'publish-schedule'),
                {
                    invocationId: 'too-late',
                    responseBinding: {
                        responseId: 'community-room-response-9',
                        responseRevision: 1,
                    },
                },
            ),
        ).toMatchObject({ status: 'refused', reason: 'unmounted' });
        container.remove();
    });

    it('does not claim a custom field override rendered a control', async () => {
        const registry = createSemanticControlRegistry();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <FormspecForm
                    definition={definition}
                    components={{
                        fields: {
                            TextInput: () => null,
                        },
                    }}
                    semanticControlScope={{
                        registry,
                        renderInstanceId: 'render-community-room-1',
                        definitionArtifact: {
                            artifactRef: definition.url,
                            artifactDigest: DEFINITION_DIGEST,
                        },
                        responseId: 'community-room-response-10',
                    }}
                />,
            );
        });

        expect(
            registry.setItem(
                target('definition-item', 'contact.email'),
                'not-rendered@example.test',
            ),
        ).toMatchObject({ status: 'refused', reason: 'unresolved' });

        await act(async () => {
            root.unmount();
        });
        container.remove();
    });
});
