/** @filedesc React parity coverage for Response Actions auto-injected ActionButton behavior. */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { initFormspecEngine, initFormspecEngineTools, invokeResponseAction, createFormEngine, evaluateResponseActionEffectExpression } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import type { ResponseActionInvokerInput } from '../src/context';

beforeAll(async () => {
    await initFormspecEngine();
    await initFormspecEngineTools();
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

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

describe('React Response Actions parity', () => {

    it.each([false, true])('places and dispatches owned actions without a generic submit callback, observer=%s', async observe => {
        const onHostEvent = vi.fn();
        const onActionResult = observe ? vi.fn() : undefined;
        const responseActionInvoker = vi.fn((input: ResponseActionInvokerInput) => ({ invocation: invokeResponseAction(
            input.document, input.actionRef, input.ports, input.nodeId, input.invocationContext,
        ) }));
        const { container, root } = renderInto(<FormspecForm definition={definition}
            responseActionsDocument={multiActionDocument} responseActionInvoker={responseActionInvoker}
            onHostEvent={onHostEvent} onActionResult={onActionResult} />);
        const buttons = [...container.querySelectorAll<HTMLButtonElement>('button.formspec-submit')];
        expect(buttons.map(button => button.textContent)).toEqual(['Save draft', 'Review form', 'Publish form']);
        await act(async () => { buttons[0].click(); });
        await act(async () => { buttons[1].click(); });
        expect(responseActionInvoker.mock.calls.map(([input]) => input.actionRef)).toEqual(['save-form-draft', 'review-form']);
        expect(onHostEvent.mock.calls.map(([event]) => event)).toEqual(['draft-saved', 'form-reviewed']);
        if (onActionResult) expect(onActionResult).toHaveBeenCalledTimes(2);
        root.unmount(); container.remove();
    });

    it('identifies distinct authored actions even when their visible labels match', async () => {
        const document = structuredClone(multiActionDocument);
        document.actions[1].label = { literal: 'Save draft' };
        const invoker = vi.fn((input: ResponseActionInvokerInput) => ({ invocation: invokeResponseAction(
            input.document, input.actionRef, input.ports, input.nodeId, input.invocationContext,
        ) }));
        const { container, root } = renderInto(<FormspecForm definition={definition}
            responseActionsDocument={document} responseActionInvoker={invoker} />);
        const buttons = [...container.querySelectorAll<HTMLButtonElement>('button[data-action-ref]')];
        expect(buttons.map(button => button.dataset.actionRef)).toEqual(document.actions.map(action => action.id));
        expect(buttons.filter(button => button.textContent === 'Save draft')).toHaveLength(2);
        const owned = container.querySelector<HTMLButtonElement>('button[data-action-ref="review-form"]')!;
        await act(async () => { owned.click(); });
        expect(invoker.mock.calls.map(([input]) => input.actionRef)).toEqual(['review-form']);
        root.unmount(); container.remove();
    });

    it('does not treat an action result observer as an execution capability', () => {
        const observer = vi.fn();
        const { container, root } = renderInto(<FormspecForm definition={definition}
            responseActionsDocument={multiActionDocument} onActionResult={observer} />);
        expect(container.querySelectorAll('button.formspec-submit')).toHaveLength(0);
        expect(observer).not.toHaveBeenCalled();
        root.unmount(); container.remove();
    });

    it.each(['foreign-target', 'duplicate-action', 'invalid-validation'] as const)('keeps invalid %s action documents out of invoker-only automatic controls', mode => {
        const document = structuredClone(multiActionDocument);
        if (mode === 'foreign-target') document.targetDefinition.url = 'urn:test:foreign';
        if (mode === 'duplicate-action') document.actions.push(structuredClone(document.actions[0]));
        if (mode === 'invalid-validation') Object.assign(document.actions[0], { validation: {
            profile: 'off', blocking: 'block-on-error', persistence: 'draft-checkpoint',
        } });
        const invoker = vi.fn();
        const { container, root } = renderInto(<FormspecForm definition={definition}
            responseActionsDocument={document} responseActionInvoker={invoker} />);
        expect(container.querySelectorAll('button.formspec-submit')).toHaveLength(0);
        expect(invoker).not.toHaveBeenCalled();
        root.unmount(); container.remove();
    });

    it('adds and removes automatic controls with the explicit invoker capability', () => {
        const engine = createFormEngine(definition);
        const invoker = vi.fn((input: ResponseActionInvokerInput) => ({ invocation: invokeResponseAction(
            input.document, input.actionRef, input.ports, input.nodeId, input.invocationContext,
        ) }));
        const view = (responseActionInvoker?: typeof invoker) => <FormspecForm engine={engine}
            responseActionsDocument={multiActionDocument} responseActionInvoker={responseActionInvoker} />;
        const { container, root } = renderInto(view());
        expect(container.querySelectorAll('button.formspec-submit')).toHaveLength(0);
        flushSync(() => root.render(view(invoker)));
        expect(container.querySelectorAll('button.formspec-submit')).toHaveLength(3);
        flushSync(() => root.render(view()));
        expect(container.querySelectorAll('button.formspec-submit')).toHaveLength(0);
        expect(invoker).not.toHaveBeenCalled();
        root.unmount(); container.remove(); engine.dispose();
    });

    it('dispatches evaluated transient detail while onSubmit retains the original response', () => {
        const submitted = vi.fn();
        const hostEvent = vi.fn();
        const document = { ...responseActionsDocument, actions: [{
            ...responseActionsDocument.actions[0], effects: [{
                type: 'hostEvent', eventName: 'formspec-submit', detailRef: "'neutral detail'",
            }],
        }] };
        const { container, root } = renderInto(<FormspecForm definition={definition}
            responseActionsDocument={document} onSubmit={submitted} onHostEvent={hostEvent}
            evaluateActionEffectExpression={(expression, snapshot, action, context) =>
                evaluateResponseActionEffectExpression(expression, { fields: snapshot.response.data,
                    bindings: { response: snapshot.response, action, validation: { lastReport: snapshot.validationReport },
                        invocation: context.invocation, effects: context.effects } })} />);
        flushSync(() => container.querySelector<HTMLButtonElement>('button.formspec-submit')!.click());
        expect(hostEvent).toHaveBeenCalledWith('formspec-submit', 'neutral detail', expect.any(Object));
        expect(submitted).toHaveBeenCalledTimes(1);
        expect(submitted.mock.calls[0]?.[0]).toHaveProperty('response.data', {});
        root.unmount(); container.remove();
    });

    it('auto-places reference-only labels and follows locale switching and explicit fallback', () => {
        const engine = createFormEngine(definition);
        for (const [locale, strings, fallback] of [
            ['en', { '$action.send-application.label': 'Send application' }, undefined],
            ['es', { '$action.send-application.label': 'Enviar solicitud' }, undefined],
            ['es-US', {}, 'es'],
            ['fr', {}, undefined],
        ] as const) {
            engine.loadLocale({ $formspecLocale: '2.0', version: '1.0.0', locale,
                target: { kind: 'definition', url: definition.url }, strings,
                ...(fallback ? { fallback } : {}),
            });
        }
        engine.setLocale('en');
        const document = { ...responseActionsDocument, actions: [{
            ...responseActionsDocument.actions[0], label: { ref: '$action.send-application.label' },
        }] };
        const submitted = vi.fn();
        const { container, root } = renderInto(<FormspecForm engine={engine}
            responseActionsDocument={document} onSubmit={submitted} />);
        const button = container.querySelector<HTMLButtonElement>('button.formspec-submit')!;
        expect(button).toBeTruthy();
        expect(button.textContent).toBe('Send application');
        act(() => engine.setLocale('es-US'));
        expect(button.textContent).toBe('Enviar solicitud');
        act(() => engine.setLocale('fr'));
        expect(button.textContent).toBe('');
        expect(button.disabled).toBe(false);
        act(() => engine.setLocale('en'));
        expect(button.textContent).toBe('Send application');
        flushSync(() => button.click());
        expect(submitted).toHaveBeenCalledTimes(1);
        root.unmount(); container.remove();
    });

    it('keeps explicit Component labels ahead of referenced Action labels', () => {
        const engine = createFormEngine(definition);
        engine.loadLocale({ $formspecLocale: '2.0', version: '1.0.0', locale: 'es',
            target: { kind: 'definition', url: definition.url },
            strings: { '$action.send-application.label': 'Enviar solicitud', '$component.send.label': 'Enviar ahora' },
        });
        const document = { ...responseActionsDocument, actions: [{
            ...responseActionsDocument.actions[0], label: { ref: '$action.send-application.label' },
        }] };
        const { container, root } = renderInto(<FormspecForm engine={engine}
            responseActionsDocument={document} onSubmit={() => {}}
            componentDocument={{ $formspecComponent: '1.0', version: '1.0.0',
                targetDefinition: { url: definition.url },
                tree: { component: 'ActionButton', id: 'send', actionRef: 'send-application', label: { literal: 'Send now' } },
            }} />);
        const button = container.querySelector<HTMLButtonElement>('button.formspec-submit')!;
        expect(container.querySelectorAll('button.formspec-submit')).toHaveLength(1);
        expect(button.textContent).toBe('Send now');
        act(() => engine.setLocale('es'));
        expect(button.textContent).toBe('Enviar ahora');
        root.unmount(); container.remove();
    });

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

    it('renders accessible pending and completed feedback while suppressing duplicate activation', async () => {
        const gate = deferred<void>();
        const onActionResult = vi.fn();
        const responseActionInvoker = vi.fn((input: ResponseActionInvokerInput) =>
            gate.promise.then(() => ({
                invocation: invokeResponseAction(
                    input.document,
                    input.actionRef,
                    input.ports,
                    input.nodeId,
                    input.invocationContext,
                ),
            })));
        const { container, root } = renderInto(
            <FormspecForm
                definition={definition}
                responseActionsDocument={responseActionsDocument}
                onSubmit={() => {}}
                onActionResult={onActionResult}
                responseActionInvoker={responseActionInvoker}
            />,
        );

        const button = container.querySelector<HTMLButtonElement>('button.formspec-submit')!;
        await act(async () => {
            button.click();
            button.click();
        });

        const status = container.querySelector<HTMLElement>('[role="status"]')!;
        expect(responseActionInvoker).toHaveBeenCalledTimes(1);
        expect(button.textContent).toBe('Send application');
        expect(button.disabled).toBe(false);
        expect(button.getAttribute('aria-disabled')).toBe('true');
        expect(button.getAttribute('aria-busy')).toBe('true');
        expect(button.getAttribute('aria-describedby')).toBe(status.id);
        expect(status.getAttribute('aria-live')).toBe('polite');
        expect(status.getAttribute('aria-atomic')).toBe('true');
        expect(status.textContent).toBe('In progress.');
        expect(status.getAttribute('data-need-anchors')).toBe(
            button.getAttribute('data-need-anchors'),
        );
        expect(status.getAttribute('data-need-ids')).toBe(
            button.getAttribute('data-need-ids'),
        );

        await act(async () => {
            gate.resolve(undefined);
            await gate.promise;
        });

        expect(responseActionInvoker).toHaveBeenCalledTimes(1);
        expect(onActionResult).toHaveBeenCalledTimes(1);
        expect(button.textContent).toBe('Send application');
        expect(button.disabled).toBe(false);
        expect(button.getAttribute('aria-busy')).toBe('false');
        expect(button.getAttribute('aria-disabled')).toBe('false');
        expect(status.textContent).toBe('Completed.');

        root.unmount();
        container.remove();
    });

    it('shows server failure text and allows a successful retry', async () => {
        const gates = [deferred<void>(), deferred<void>()];
        let attempt = 0;
        const responseActionInvoker = vi.fn((input: ResponseActionInvokerInput) => {
            const currentAttempt = attempt++;
            return gates[currentAttempt]!.promise.then(() => {
                if (currentAttempt === 0) {
                    throw new Error('The Formspec server returned HTTP 503. Service unavailable');
                }
                return {
                    invocation: invokeResponseAction(
                        input.document,
                        input.actionRef,
                        input.ports,
                        input.nodeId,
                        input.invocationContext,
                    ),
                };
            });
        });
        const { container, root } = renderInto(
            <FormspecForm
                definition={definition}
                responseActionsDocument={responseActionsDocument}
                onSubmit={() => {}}
                responseActionInvoker={responseActionInvoker}
            />,
        );

        const button = container.querySelector<HTMLButtonElement>('button.formspec-submit')!;
        const status = container.querySelector<HTMLElement>('[role="status"]')!;
        await act(async () => {
            button.click();
        });
        expect(status.textContent).toBe('In progress.');

        await act(async () => {
            gates[0]!.resolve(undefined);
            await gates[0]!.promise;
        });
        expect(status.textContent).toBe(
            'Failed.',
        );
        expect(button.disabled).toBe(false);
        expect(button.getAttribute('aria-busy')).toBe('false');

        await act(async () => {
            button.click();
        });
        expect(responseActionInvoker).toHaveBeenCalledTimes(2);
        expect(status.textContent).toBe('In progress.');
        expect(button.disabled).toBe(false);
        expect(button.getAttribute('aria-disabled')).toBe('true');

        await act(async () => {
            gates[1]!.resolve(undefined);
            await gates[1]!.promise;
        });
        expect(status.textContent).toBe('Completed.');
        expect(button.disabled).toBe(false);

        root.unmount();
        container.remove();
    });

    it('renders structured invocation terminals without diagnostic reasons', async () => {
        const cases = [
            { status: 'completed', expected: 'Completed.' },
            { status: 'blocked', expected: 'Blocked.', failureReason: 'Complete the required fields.' },
            { status: 'failed', expected: 'Failed.' },
            { status: 'deferred', expected: 'Deferred.', failureReason: 'Waiting for review.' },
            { status: 'unresolved', expected: 'Unresolved.' },
        ] as const;

        for (const terminal of cases) {
            const responseActionInvoker = vi.fn((input: ResponseActionInvokerInput) => ({
                ...invokeResponseAction(
                    input.document,
                    input.actionRef,
                    input.ports,
                    input.nodeId,
                    input.invocationContext,
                ),
                status: terminal.status,
                ...('failureReason' in terminal
                    ? { failureReason: terminal.failureReason }
                    : {}),
            }));
            const { container, root } = renderInto(
                <FormspecForm
                    definition={definition}
                    responseActionsDocument={responseActionsDocument}
                    onSubmit={() => {}}
                    responseActionInvoker={responseActionInvoker}
                />,
            );

            const button = container.querySelector<HTMLButtonElement>('button.formspec-submit')!;
            await act(async () => {
                button.click();
            });

            expect(container.querySelector('[role="status"]')?.textContent).toBe(terminal.expected);
            expect(button.disabled).toBe(false);
            expect(button.textContent).toBe('Send application');

            root.unmount();
            container.remove();
        }
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
                    label: { ref: '$action.save-draft.label', literal: 'Ambiguous' },
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

    it('skips auto-placing interactive buttons for autosave actions alongside manual actions', () => {
        const autosaveAction = {
            id: 'autosave-progress',
            intent: 'autosave' as const,
            label: { literal: 'Save as I go' },
            effects: [{ type: 'hostEvent' as const, eventName: 'draft-autosaved' }],
        };
        const documentWithAutosave = {
            ...multiActionDocument,
            actions: [
                multiActionDocument.actions[0]!,
                autosaveAction,
                {
                    id: 'autosave-ref',
                    intent: 'autosave' as const,
                    label: { ref: '$action.autosave.label' },
                    effects: [{ type: 'hostEvent' as const, eventName: 'draft-autosaved' }],
                },
                multiActionDocument.actions[2]!,
            ],
        };

        // 1. Standalone with onSubmit: only manual actions render as buttons.
        const standalone = renderInto(
            <FormspecForm
                definition={definition}
                responseActionsDocument={documentWithAutosave}
                onSubmit={() => {}}
            />,
        );
        expect([...standalone.container.querySelectorAll<HTMLButtonElement>('button.formspec-submit')].map(b => b.textContent))
            .toEqual(['Save draft', 'Publish form']);
        expect(standalone.container.querySelector('button[data-action-ref="autosave-progress"]')).toBeNull();
        expect(standalone.container.querySelector('button[data-action-ref="autosave-ref"]')).toBeNull();
        standalone.root.unmount();
        standalone.container.remove();

        // 2. Invoker-only (e.g. Surface definition-form slot without ComponentDocument): no autosave button.
        const invoker = vi.fn((input: ResponseActionInvokerInput) => ({
            invocation: invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId, input.invocationContext),
        }));
        const invokerOnly = renderInto(
            <FormspecForm
                definition={definition}
                responseActionsDocument={documentWithAutosave}
                responseActionInvoker={invoker}
            />,
        );
        expect([...invokerOnly.container.querySelectorAll<HTMLButtonElement>('button.formspec-submit')].map(b => b.textContent))
            .toEqual(['Save draft', 'Publish form']);
        invokerOnly.root.unmount();
        invokerOnly.container.remove();

        // 3. Autosave-only ResponseActionsDocument: renders zero manual buttons.
        const autosaveOnly = renderInto(
            <FormspecForm
                definition={definition}
                responseActionsDocument={{ ...multiActionDocument, actions: [autosaveAction] }}
                onSubmit={() => {}}
            />,
        );
        expect(autosaveOnly.container.querySelectorAll('button.formspec-submit')).toHaveLength(0);
        autosaveOnly.root.unmount();
        autosaveOnly.container.remove();

        // 4. ComponentDocument placing manual buttons + onSubmit: still never injects autosave.
        const authoredManual = renderInto(
            <FormspecForm
                definition={definition}
                componentDocument={{
                    $formspecComponent: '1.0',
                    version: '1.0.0',
                    targetDefinition: { url: definition.url },
                    tree: {
                        component: 'Stack',
                        children: [
                            { component: 'ActionButton', actionRef: 'save-form-draft', label: { literal: 'Save draft' } },
                            { component: 'ActionButton', actionRef: 'publish-form', label: { literal: 'Publish form' } },
                        ],
                    },
                }}
                responseActionsDocument={documentWithAutosave}
                onSubmit={() => {}}
            />,
        );
        expect([...authoredManual.container.querySelectorAll<HTMLButtonElement>('button.formspec-submit')].map(b => b.dataset.actionRef))
            .toEqual(['save-form-draft', 'publish-form']);
        authoredManual.root.unmount();
        authoredManual.container.remove();

        // 5. Explicitly authored ActionButton referencing autosave in ComponentDocument still renders as authored.
        const explicitAutosave = renderInto(
            <FormspecForm
                definition={definition}
                componentDocument={{
                    $formspecComponent: '1.0',
                    version: '1.0.0',
                    targetDefinition: { url: definition.url },
                    tree: {
                        component: 'Stack',
                        children: [
                            { component: 'ActionButton', actionRef: 'autosave-progress', label: { literal: 'Save now' } },
                        ],
                    },
                }}
                responseActionsDocument={documentWithAutosave}
                onSubmit={() => {}}
            />,
        );
        expect([...explicitAutosave.container.querySelectorAll<HTMLButtonElement>('button.formspec-submit')].map(b => b.dataset.actionRef))
            .toEqual(['autosave-progress', 'save-form-draft', 'publish-form']);
        explicitAutosave.root.unmount();
        explicitAutosave.container.remove();
    });

    it('automatically fires debounced autosave and updates status on standalone field edits, unless draftSaveFeedback="external"', async () => {
        vi.useFakeTimers();
        const formDef = {
            $formspec: '1.0',
            url: 'https://example.gov/forms/standalone-react-autosave',
            version: '1.0.0',
            status: 'active',
            title: 'Standalone React Autosave',
            items: [
                { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
            ],
            binds: [{ path: 'email', required: 'true' }],
        };
        const autosaveDoc = {
            $formspecResponseActions: '1.0',
            version: '1.0.0',
            scope: 'response',
            targetDefinition: { url: formDef.url },
            actions: [
                {
                    id: 'autosave-progress',
                    intent: 'autosave' as const,
                    label: { literal: 'Save as I go' },
                    effects: [{ type: 'hostEvent' as const, eventName: 'draft-autosaved' }],
                },
            ],
        };

        const engine = createFormEngine(formDef);
        const onHostEvent = vi.fn();
        const onActionResult = vi.fn();
        const { container, root } = renderInto(
            <FormspecForm
                engine={engine}
                responseActionsDocument={autosaveDoc}
                onHostEvent={onHostEvent}
                onActionResult={onActionResult}
            />,
        );

        try {
            expect(container.querySelectorAll('button.formspec-submit')).toHaveLength(0);

            // Initial mount does not fire autosave.
            await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
            expect(onHostEvent).not.toHaveBeenCalled();

            // User edits field without clicking any button; rapid edits coalesce.
            await act(async () => { engine.setValue('name', 'A'); });
            await act(async () => { await vi.advanceTimersByTimeAsync(200); });
            await act(async () => { engine.setValue('name', 'Ada'); });
            await act(async () => { await vi.advanceTimersByTimeAsync(399); });
            expect(onHostEvent).not.toHaveBeenCalled();

            await act(async () => { await vi.advanceTimersByTimeAsync(1); });
            expect(onHostEvent).toHaveBeenCalledTimes(1);
            expect(onHostEvent).toHaveBeenCalledWith(
                'draft-autosaved',
                expect.objectContaining({
                    response: expect.objectContaining({ data: { name: 'Ada' }, status: 'in-progress' }),
                }),
                expect.objectContaining({ id: 'autosave-progress' }),
            );
            expect(onActionResult).toHaveBeenCalledTimes(1);
            expect(onActionResult.mock.calls[0]?.[0]?.detail?.response?.data?.name).toBe('Ada');
            expect(container.querySelector('[role="status"]')?.textContent).toBe('Completed.');
            // Untouched required field must NOT be marked touched/invalid by background autosave.
            expect(container.querySelector('#field-email-error')?.textContent ?? '').toBe('');

            // With draftSaveFeedback="external", the embedding draft writer owns autosave exclusively.
            const externalHostEvent = vi.fn();
            const externalEngine = createFormEngine(formDef);
            const external = renderInto(
                <FormspecForm
                    engine={externalEngine}
                    responseActionsDocument={autosaveDoc}
                    draftSaveFeedback="external"
                    onHostEvent={externalHostEvent}
                />,
            );
            await act(async () => { externalEngine.setValue('name', 'Grace'); });
            await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
            expect(externalHostEvent).not.toHaveBeenCalled();
            external.root.unmount();
            external.container.remove();
            externalEngine.dispose();
        } finally {
            root.unmount();
            container.remove();
            engine.dispose();
            vi.useRealTimers();
        }
    });

    it('refuses automatic background autosave and reports ambiguity identically regardless of action order when multiple autosave actions exist', async () => {
        vi.useFakeTimers();
        const formDef = {
            $formspec: '1.0',
            url: 'https://example.gov/forms/ambiguous-autosave-react',
            version: '1.0.0',
            title: 'Ambiguous Autosave',
            items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
        };
        const makeAction = (id: string) => ({
            id,
            intent: 'autosave' as const,
            effects: [{ type: 'hostEvent' as const, eventName: id }],
        });
        const forward = {
            $formspecResponseActions: '1.0' as const,
            version: '1.0.0',
            targetDefinition: { url: formDef.url },
            actions: [makeAction('checkpointA'), makeAction('checkpointB')],
        };
        const reversed = {
            ...forward,
            actions: [...forward.actions].reverse(),
        };

        try {
            for (const doc of [forward, reversed]) {
                const engine = createFormEngine(formDef);
                const onHostEvent = vi.fn();
                const onActionFinding = vi.fn();
                const mounted = renderInto(
                    <FormspecForm
                        engine={engine}
                        responseActionsDocument={doc}
                        onHostEvent={onHostEvent}
                        onActionFinding={onActionFinding}
                    />,
                );
                await act(async () => { engine.setValue('name', 'Ada'); });
                await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
                expect(onHostEvent).not.toHaveBeenCalled();
                expect(onActionFinding).toHaveBeenCalledWith(
                    expect.objectContaining({
                        code: 'COMP-REFERENTIAL-INTEGRITY',
                        reason: 'ambiguous-autosave-action',
                    }),
                );
                mounted.root.unmount();
                mounted.container.remove();
                engine.dispose();
            }
        } finally {
            vi.useRealTimers();
        }
    });

    it('settles an in-flight autosave without writing stale status into a replacement document while preserving 1-arg observer delivery, and applies ActionButton node.style', async () => {
        vi.useFakeTimers();
        const definition = {
            $formspec: '1.0',
            version: '1.0.0',
            url: 'urn:review:status-swap',
            title: 'Review',
            items: [{ key: 'field', type: 'field', dataType: 'string', label: 'Name' }],
        };
        const engine = createFormEngine(definition);
        const action = {
            id: 'save',
            intent: 'autosave' as const,
            effects: [{ type: 'hostEvent' as const, eventName: 'saved' }],
        };
        const oldDoc = {
            $formspecResponseActions: '1.0' as const,
            version: '1.0.0',
            targetDefinition: { url: definition.url },
            actions: [action],
        };
        const nextDoc = {
            ...oldDoc,
            actions: [{ ...action, id: 'different', intent: 'review' as const, label: { literal: 'Hidden review' } }],
        };
        const styledComponent = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: definition.url },
            tree: {
                component: 'Stack',
                children: [
                    { component: 'TextInput', bind: 'field' },
                    { component: 'ActionButton', actionRef: 'different', style: { display: 'none' } },
                ],
            },
        };
        const completed = vi.fn();
        let finish!: (value: any) => void;
        const invoke = vi.fn(() => new Promise<any>((resolve) => { finish = resolve; }));
        const { container, root } = renderInto(
            <FormspecForm
                engine={engine}
                responseActionsDocument={oldDoc}
                responseActionInvoker={invoke}
                onActionResult={completed}
            />,
        );
        try {
            await act(async () => { engine.setValue('field', 'Example'); });
            await act(async () => { await vi.advanceTimersByTimeAsync(400); });
            expect(invoke).toHaveBeenCalledTimes(1);

            await act(async () => {
                root.render(
                    <FormspecForm
                        engine={engine}
                        componentDocument={styledComponent}
                        responseActionsDocument={nextDoc}
                        responseActionInvoker={invoke}
                        onActionResult={completed}
                    />,
                );
            });

            const controlWrapper = container.querySelector<HTMLElement>('.formspec-action-control');
            expect(controlWrapper?.style.display).toBe('none');

            const status = () => container.querySelector('.formspec-action-status')?.textContent ?? '';
            expect(status()).toBe('');

            await act(async () => {
                finish({
                    status: 'completed',
                    resolution: { action, resolved: true },
                    detail: null,
                    validationTuple: null,
                    effectTrace: [],
                });
            });
            expect(completed).toHaveBeenCalledTimes(1);
            expect(completed.mock.calls[0]).toHaveLength(1);
            expect(status()).toBe('');
        } finally {
            root.unmount();
            container.remove();
            engine.dispose();
            vi.useRealTimers();
        }
    });

    it('matches Core compatibleVersions range and prerelease semantics and disables authored buttons on incompatible documents', async () => {
        const {
            autoPlacedDefinitionActions,
            isValidDefinitionResponseActionsDocument,
            resolveAutosaveResponseAction,
        } = await import('@formspec-org/engine');
        const { satisfies } = await import('semver');
        const baseDef = {
            $formspec: '1.0' as const,
            url: 'urn:review:binding',
            version: '1.0.0',
            title: 'Form',
            items: [],
        };
        const actions = [
            {
                id: 'manual',
                intent: 'review' as const,
                label: { literal: 'Manual' },
                effects: [{ type: 'hostEvent' as const, eventName: 'processed' }],
            },
            {
                id: 'checkpoint',
                intent: 'autosave' as const,
                effects: [{ type: 'hostEvent' as const, eventName: 'auto' }],
            },
        ];
        const makeDoc = (range: string) => ({
            $formspecResponseActions: '1.0' as const,
            version: '1.0.0',
            targetDefinition: { url: baseDef.url, compatibleVersions: range },
            actions,
        });

        for (const [range, version, expected] of [
            ['>=9.0.0', '1.0.0', false],
            ['^0.1.0', '0.2.0', false],
            ['>=1.0.0 <2.0.0', '2.0.0-rc.1', true],
        ] as const) {
            const def = { ...baseDef, version };
            const doc = makeDoc(range);
            expect(satisfies(version, range, { includePrerelease: true })).toBe(expected);
            expect({
                accepted: isValidDefinitionResponseActionsDocument(doc, def),
                manual: autoPlacedDefinitionActions(doc as never, def).map((a) => a.id),
                automatic: resolveAutosaveResponseAction(doc as never, def).action?.id ?? null,
            }).toEqual({
                accepted: expected,
                manual: expected ? ['manual'] : [],
                automatic: expected ? 'checkpoint' : null,
            });
        }

        const onHostEvent = vi.fn();
        const { container, root } = renderInto(
            <FormspecForm
                definition={baseDef}
                responseActionsDocument={makeDoc('>=9.0.0')}
                componentDocument={{
                    $formspecComponent: '1.0',
                    version: '1.0.0',
                    targetDefinition: { url: baseDef.url },
                    tree: { component: 'ActionButton', actionRef: 'manual' },
                }}
                onHostEvent={onHostEvent}
            />,
        );
        try {
            const btn = container.querySelector<HTMLButtonElement>('button[data-action-ref="manual"]');
            expect(btn).not.toBeNull();
            expect(btn!.disabled).toBe(true);
            await act(async () => {
                btn!.click();
            });
            expect(onHostEvent).not.toHaveBeenCalled();
        } finally {
            root.unmount();
            container.remove();
        }
    });

    it('rejects malformed OR-ranges and incompatible replacements on both authored and generated buttons', async () => {
        const url = 'urn:review:admission';
        const def: FormDefinition = {
            $formspec: '1.0',
            version: '1.0.0',
            url,
            title: 'Admission',
            items: [],
        };
        const make = () => ({
            $formspecResponseActions: '1.0' as const,
            version: '1.0.0',
            targetDefinition: { url },
            actions: [{
                id: 'manual',
                intent: 'submit' as const,
                label: { literal: 'Manual' },
                effects: [{ type: 'hostEvent' as const, eventName: 'checked' }],
            }],
        });
        const cases = [
            ['wrong-url', (d: ReturnType<typeof make>) => ({ ...d, targetDefinition: { url: 'urn:review:other' } })],
            ['wrong-version', (d: ReturnType<typeof make>) => ({ ...d, targetDefinition: { url, compatibleVersions: '>=9.0.0' } })],
            ['invalid-shape', (d: ReturnType<typeof make>) => ({ ...d, actions: [...d.actions, null as never] })],
            ['malformed-or-after', (d: ReturnType<typeof make>) => ({ ...d, targetDefinition: { url, compatibleVersions: '1.x || bad' } })],
            ['malformed-or-before', (d: ReturnType<typeof make>) => ({ ...d, targetDefinition: { url, compatibleVersions: 'bad || 1.x' } })],
        ] as const;

        for (const mode of ['authored', 'generated'] as const) {
            for (const [_name, change] of cases) {
                const invoke = vi.fn((input: ResponseActionInvokerInput) =>
                    invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId),
                );
                const onHostEvent = vi.fn();
                const component = {
                    $formspecComponent: '1.0' as const,
                    version: '1.0.0',
                    targetDefinition: { url },
                    tree: { component: 'ActionButton' as const, actionRef: 'manual' },
                };
                const form = (doc: ReturnType<typeof make>) => (
                    <FormspecForm
                        definition={def}
                        componentDocument={mode === 'authored' ? component : undefined}
                        responseActionsDocument={doc}
                        responseActionInvoker={invoke}
                        onHostEvent={onHostEvent}
                    />
                );
                const original = make();
                const { container, root } = renderInto(form(original));
                try {
                    expect(container.querySelector<HTMLButtonElement>('button[data-action-ref="manual"]')?.disabled).toBe(false);
                    await act(async () => {
                        root.render(form(change(original)));
                    });
                    const replacement = container.querySelector<HTMLButtonElement>('button[data-action-ref="manual"]');
                    await act(async () => {
                        replacement?.click();
                    });
                    expect({
                        state: replacement?.disabled,
                        hooks: invoke.mock.calls.length,
                        events: onHostEvent.mock.calls.length,
                    }).toEqual({
                        state: mode === 'authored' ? true : undefined,
                        hooks: 0,
                        events: 0,
                    });
                } finally {
                    root.unmount();
                    container.remove();
                }
            }
        }
    });

    it('preserves pending dirty autosave across equivalent or corrected document replacement and cancels on ambiguity', async () => {
        vi.useFakeTimers();
        const def: FormDefinition = {
            $formspec: '1.0',
            version: '1.0.0',
            url: 'urn:review:retained-edit',
            title: 'Filing',
            items: [{ type: 'field', key: 'name', dataType: 'string', label: 'Name' }],
        };
        const makeDoc = (count: number) => ({
            $formspecResponseActions: '1.0' as const,
            version: '1.0.0',
            targetDefinition: { url: def.url },
            actions: Array.from({ length: count }, (_, index) => ({
                id: `auto${index}`,
                intent: 'autosave' as const,
                effects: [{ type: 'hostEvent' as const, eventName: 'saved' }],
            })),
        });

        try {
            for (const [label, firstCount, secondCount, replace, expectedCount] of [
                ['unchanged reference', 1, 1, false, 1],
                ['identical re-parsed document', 1, 1, true, 1],
                ['document correction before another edit', 2, 1, true, 1],
                ['ambiguity cancels pending write', 1, 2, true, 0],
            ] as const) {
                const engine = createFormEngine(def);
                const onHostEvent = vi.fn();
                const firstDoc = makeDoc(firstCount);
                const { container, root } = renderInto(
                    <FormspecForm engine={engine} responseActionsDocument={firstDoc} onHostEvent={onHostEvent} />,
                );
                try {
                    await act(async () => { engine.setValue('name', 'unsaved edit'); });
                    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
                    await act(async () => {
                        root.render(
                            <FormspecForm
                                engine={engine}
                                responseActionsDocument={replace ? makeDoc(secondCount) : firstDoc}
                                onHostEvent={onHostEvent}
                            />,
                        );
                    });
                    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
                    expect(engine.getResponse({ profile: 'off' }).data.name).toBe('unsaved edit');
                    expect(onHostEvent, label).toHaveBeenCalledTimes(expectedCount);
                } finally {
                    await act(async () => { root.unmount(); });
                    container.remove();
                    engine.dispose();
                }
            }
        } finally {
            vi.useRealTimers();
        }
    });

    it('retires settled autosave Completed feedback when replacement removes or ambiguates autosave, while preserving it for equivalent replacement', async () => {
        vi.useFakeTimers();
        const def: FormDefinition = {
            $formspec: '1.0',
            version: '1.0.0',
            url: 'urn:review7:settled-feedback',
            title: 'Settled feedback',
            items: [{ type: 'field', key: 'name', dataType: 'string', label: 'Name' }],
        };
        const makeDoc = (count: number) => ({
            $formspecResponseActions: '1.0' as const,
            version: '1.0.0',
            targetDefinition: { url: def.url },
            actions: Array.from({ length: count }, (_, index) => ({
                id: `auto${index}`,
                intent: 'autosave' as const,
                effects: [{ type: 'hostEvent' as const, eventName: 'saved' }],
            })),
        });
        const removedDoc = {
            $formspecResponseActions: '1.0' as const,
            version: '1.0.0',
            targetDefinition: { url: def.url },
            actions: [
                {
                    id: 'submit',
                    intent: 'submit' as const,
                    label: { literal: 'Submit' },
                    effects: [{ type: 'hostEvent' as const, eventName: 'submitted' }],
                },
            ],
        };

        try {
            for (const mode of ['same', 'clone', 'ambiguous', 'removed', 'undefined'] as const) {
                const engine = createFormEngine(def);
                const first = makeDoc(1);
                const { container, root } = renderInto(
                    <FormspecForm engine={engine} responseActionsDocument={first} />,
                );
                const status = () => (container.querySelector('[role="status"]')?.textContent ?? '').trim();
                try {
                    await act(async () => { engine.setValue('name', 'Ada'); });
                    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
                    expect(status(), `${mode}: initial`).toBe('Completed.');

                    const nextDoc =
                        mode === 'same' ? first
                            : mode === 'clone' ? makeDoc(1)
                                : mode === 'ambiguous' ? makeDoc(2)
                                    : mode === 'removed' ? removedDoc
                                        : undefined;
                    await act(async () => {
                        root.render(<FormspecForm engine={engine} responseActionsDocument={nextDoc} />);
                    });
                    expect(status(), `${mode}: after`).toBe(mode === 'same' || mode === 'clone' ? 'Completed.' : '');
                } finally {
                    await act(async () => { root.unmount(); });
                    container.remove();
                    engine.dispose();
                }
            }
        } finally {
            vi.useRealTimers();
        }
    });

    it('flushes pre-policy edits for both registered FormEngine and conforming wrapper, and autosaves when evaluation applies an editable default', async () => {
        vi.useFakeTimers();
        const def: FormDefinition = {
            $formspec: '1.0',
            version: '1.0.0',
            url: 'urn:review8:consumer-react',
            title: 'Consumer',
            items: [{ type: 'field', key: 'answer', label: 'Answer', dataType: 'string' }],
        };
        const doc = {
            $formspecResponseActions: '1.0' as const,
            version: '1.0.0',
            targetDefinition: { url: def.url },
            actions: [{ id: 'automatic', intent: 'autosave' as const, effects: [{ type: 'hostEvent' as const, eventName: 'saved' }] }],
        };

        try {
            // 1. Both registered engine and conforming Proxy wrapper flush edits typed before autosave policy arrives
            for (const mode of ['registered', 'adapter'] as const) {
                const engine = createFormEngine(def);
                const supplied = mode === 'registered'
                    ? engine
                    : new Proxy(engine, {
                        get(target, prop) {
                            const entry = Reflect.get(target, prop, target);
                            return typeof entry === 'function' ? entry.bind(target) : entry;
                        },
                    });
                const events: string[] = [];
                const { container, root } = renderInto(
                    <FormspecForm engine={supplied} responseActionsDocument={undefined} onHostEvent={(name) => events.push(name)} />,
                );
                try {
                    await act(async () => {
                        supplied.setValue('answer', 'Saved when a policy arrives');
                        await vi.advanceTimersByTimeAsync(500);
                    });
                    await act(async () => {
                        root.render(
                            <FormspecForm engine={supplied} responseActionsDocument={doc} onHostEvent={(name) => events.push(name)} />,
                        );
                    });
                    await act(async () => {
                        await vi.advanceTimersByTimeAsync(500);
                    });
                    expect(engine.getDraftSnapshot().data.answer, mode).toBe('Saved when a policy arrives');
                    expect(events, mode).toEqual(['saved']);
                } finally {
                    await act(async () => { root.unmount(); });
                    container.remove();
                    engine.dispose();
                }
            }

            // 2. Changing a named instance makes a field relevant and applies its editable default -> autosave fires once
            const defaultDef: FormDefinition = {
                ...def,
                instances: {
                    flags: { readonly: false, data: { show: false }, schema: { show: 'boolean' } },
                },
                binds: [
                    { path: 'answer', relevant: "instance('flags', 'show') = true", default: 'Relevant default' },
                ],
            } as unknown as FormDefinition;
            const defaultEngine = createFormEngine(defaultDef);
            const defaultEvents: string[] = [];
            const { container, root } = renderInto(
                <FormspecForm engine={defaultEngine} responseActionsDocument={doc} onHostEvent={(name) => defaultEvents.push(name)} />,
            );
            try {
                await act(async () => {
                    defaultEngine.setInstanceValue('flags', 'show', true);
                    await vi.advanceTimersByTimeAsync(500);
                });
                expect(defaultEngine.getDraftSnapshot().data.answer).toBe('Relevant default');
                expect(defaultEvents).toEqual(['saved']);
            } finally {
                await act(async () => { root.unmount(); });
                container.remove();
                defaultEngine.dispose();
            }
        } finally {
            vi.useRealTimers();
        }
    });
});
