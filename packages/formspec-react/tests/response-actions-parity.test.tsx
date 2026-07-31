/** @filedesc React parity coverage for Response Actions auto-injected ActionButton behavior. */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { initFormspecEngine, invokeResponseAction } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import type { ResponseActionInvokerInput } from '../src/context';

beforeAll(async () => {
    await initFormspecEngine();
});

const definition = {
    $formspec: '1.0',
    url: 'https://example.gov/forms/response-actions-react-parity',
    version: '1.0.0',
    status: 'active',
    title: 'Response Actions React parity',
    items: [],
};

const responseActionsDocument = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    targetDefinition: {
        url: 'https://example.gov/forms/response-actions-react-parity',
    },
    actions: [
        {
            id: 'send-application',
            intent: 'submit',
            label: { literal: 'Send application' },
            effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
            'x-generation': { anchors: ['need:submit-proof@3'] },
        },
    ],
};

const multiActionDocument = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    scope: 'response',
    targetDefinition: {
        url: definition.url,
    },
    actions: [
        {
            id: 'save-form-draft',
            intent: 'save-draft',
            label: { literal: 'Save draft' },
            effects: [{ type: 'hostEvent', eventName: 'draft-saved' }],
            'x-generation': { anchors: ['need:save-progress@2'] },
        },
        {
            id: 'review-form',
            intent: 'review',
            label: { literal: 'Review form' },
            effects: [{ type: 'hostEvent', eventName: 'form-reviewed' }],
            'x-generation': { anchors: ['need:review-before-publish@1'] },
        },
        {
            id: 'publish-form',
            intent: 'submit',
            label: { literal: 'Publish form' },
            effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
            'x-generation': { anchors: ['need:publish-form@4'] },
        },
    ],
};

function renderInto(element: React.ReactElement): { container: HTMLElement; root: ReturnType<typeof createRoot> } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() => { root.render(element); });
    return { container, root };
}

describe('React Response Actions parity', () => {
    it('uses the loaded submit intent action id for the auto-injected ActionButton', async () => {
        const submitted = vi.fn();
        const onActionFinding = vi.fn();
        const { container, root } = renderInto(
            <FormspecForm
                definition={definition}
                responseActionsDocument={responseActionsDocument}
                onSubmit={submitted}
                onActionFinding={onActionFinding}
            />,
        );

        const button = container.querySelector('button.formspec-submit') as HTMLButtonElement;
        expect(button).toBeTruthy();
        expect(button.disabled).toBe(false);
        expect(button.textContent).toBe('Send application');
        expect(button.getAttribute('data-need-anchors')).toBe('need:submit-proof@3');
        expect(button.getAttribute('data-need-ids')).toBe('submit-proof');

        flushSync(() => { button.click(); });

        expect(submitted).toHaveBeenCalledTimes(1);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(onActionFinding).not.toHaveBeenCalled();

        root.unmount();
        container.remove();
    });

    it('renders every literal-labeled Definition action in document order and invokes its validation semantics', async () => {
        const submitted = vi.fn();
        const onHostEvent = vi.fn();
        const onActionResult = vi.fn();
        const responseActionInvoker = vi.fn((input: ResponseActionInvokerInput) =>
            invokeResponseAction(
                input.document,
                input.actionRef,
                input.ports,
                input.nodeId,
                input.invocationContext,
            ));
        const { container, root } = renderInto(
            <FormspecForm
                definition={definition}
                responseActionsDocument={multiActionDocument}
                onSubmit={submitted}
                onHostEvent={onHostEvent}
                onActionResult={onActionResult}
                responseActionInvoker={responseActionInvoker}
            />,
        );

        const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button.formspec-submit'));
        expect(buttons.map(button => button.textContent)).toEqual([
            'Save draft',
            'Review form',
            'Publish form',
        ]);
        expect(buttons.map(button => button.getAttribute('data-need-anchors'))).toEqual([
            'need:save-progress@2',
            'need:review-before-publish@1',
            'need:publish-form@4',
        ]);

        for (const button of buttons) {
            flushSync(() => { button.click(); });
        }
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(onActionResult.mock.calls.map(([result]) => ({
            actionRef: result.resolution.action?.id,
            validationTuple: result.validationTuple,
            status: result.status,
            responseStatus: result.detail?.response.status,
        }))).toEqual([
            {
                actionRef: 'save-form-draft',
                validationTuple: {
                    profile: 'off',
                    blocking: 'non-blocking',
                    persistence: 'draft-checkpoint',
                },
                status: 'completed',
                responseStatus: 'in-progress',
            },
            {
                actionRef: 'review-form',
                validationTuple: {
                    profile: 'on-submit',
                    blocking: 'non-blocking',
                    persistence: 'none',
                },
                status: 'completed',
                responseStatus: 'in-progress',
            },
            {
                actionRef: 'publish-form',
                validationTuple: {
                    profile: 'on-submit',
                    blocking: 'block-on-error',
                    persistence: 'complete-response',
                },
                status: 'completed',
                responseStatus: 'completed',
            },
        ]);
        expect(onHostEvent.mock.calls.map(([, , action]) => action.id)).toEqual([
            'save-form-draft',
            'review-form',
            'publish-form',
        ]);
        expect(responseActionInvoker.mock.calls.map(([input]) => input.actionRef)).toEqual([
            'save-form-draft',
            'review-form',
            'publish-form',
        ]);
        expect(responseActionInvoker.mock.calls.every(([input]) => (
            input.document === multiActionDocument
            && typeof input.nodeId === 'string'
        ))).toBe(true);
        expect(submitted).toHaveBeenCalledTimes(1);

        root.unmount();
        container.remove();
    });

    it('preserves an explicit ActionButton and auto-places only missing actionRefs', () => {
        const componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: definition.url },
            tree: {
                component: 'Stack',
                children: [
                    {
                        component: 'ActionButton',
                        id: 'authored-save',
                        actionRef: 'save-form-draft',
                        label: { literal: 'Keep my draft' },
                        'x-generation': { anchors: ['need:authored-save@1'] },
                    },
                ],
            },
        };
        const { container, root } = renderInto(
            <FormspecForm
                definition={definition}
                componentDocument={componentDocument}
                responseActionsDocument={multiActionDocument}
                onSubmit={() => {}}
            />,
        );

        const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button.formspec-submit'));
        expect(buttons.map(button => button.textContent)).toEqual([
            'Keep my draft',
            'Review form',
            'Publish form',
        ]);
        expect(buttons[0]?.getAttribute('data-need-anchors')).toBe(
            'need:authored-save@1 need:save-progress@2',
        );

        root.unmount();
        container.remove();
    });

    it('places declared actions on the final Wizard step and suppresses its duplicate native submit', () => {
        const componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: definition.url },
            tree: {
                component: 'Wizard',
                children: [
                    {
                        component: 'Section',
                        id: 'details-step',
                        title: 'Details',
                        children: [],
                    },
                    {
                        component: 'Section',
                        id: 'review-step',
                        title: 'Review',
                        children: [],
                    },
                ],
            },
        };
        const { container, root } = renderInto(
            <FormspecForm
                definition={definition}
                componentDocument={componentDocument}
                responseActionsDocument={multiActionDocument}
                onSubmit={() => {}}
            />,
        );

        expect(container.querySelector('button.formspec-submit')).toBeNull();
        const next = container.querySelector<HTMLButtonElement>('.formspec-wizard-next');
        expect(next).toBeTruthy();
        flushSync(() => { next?.click(); });

        const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button.formspec-submit'));
        expect(buttons.map(button => button.textContent)).toEqual([
            'Save draft',
            'Review form',
            'Publish form',
        ]);
        expect(container.querySelector('.formspec-wizard-submit')).toBeNull();

        const reviewOnlyDocument = {
            ...multiActionDocument,
            actions: [multiActionDocument.actions[1]],
        };
        flushSync(() => {
            root.render(
                <FormspecForm
                    definition={definition}
                    componentDocument={componentDocument}
                    responseActionsDocument={reviewOnlyDocument}
                    onSubmit={() => {}}
                />,
            );
        });
        expect(container.querySelector('button.formspec-submit')?.textContent).toBe('Review form');
        expect(container.querySelector('.formspec-wizard-submit')).toBeTruthy();

        root.unmount();
        container.remove();
    });

    it('does not auto-place controls without opt-in or from missing, mismatched, app-scoped, or invalid documents', () => {
        const documents = [
            undefined,
            { ...multiActionDocument, scope: 'app', targetDefinition: undefined },
            {
                ...multiActionDocument,
                targetDefinition: { url: 'https://example.gov/forms/another-form' },
            },
            {
                ...multiActionDocument,
                actions: [multiActionDocument.actions[0], multiActionDocument.actions[0]],
            },
            {
                ...multiActionDocument,
                actions: [{
                    ...multiActionDocument.actions[0],
                    label: { ref: '$action.save-draft' },
                }],
            },
        ];

        for (const document of documents) {
            const { container, root } = renderInto(
                <FormspecForm
                    definition={definition}
                    responseActionsDocument={document as typeof multiActionDocument | undefined}
                    onSubmit={() => {}}
                />,
            );
            expect(container.querySelector('button.formspec-submit')).toBeNull();
            root.unmount();
            container.remove();
        }

        const { container, root } = renderInto(
            <FormspecForm
                definition={definition}
                responseActionsDocument={multiActionDocument}
            />,
        );
        expect(container.querySelector('button.formspec-submit')).toBeNull();
        root.unmount();
        container.remove();
    });
});
