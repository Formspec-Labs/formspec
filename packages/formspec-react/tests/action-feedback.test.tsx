/** @filedesc Semantic action feedback follows Locale while original diagnostics remain available. */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFormEngine, initFormspecEngine, invokeResponseAction } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import type { ResponseActionInvokerInput } from '../src/context';

beforeAll(() => initFormspecEngine());
const definition = { $formspec: '1.0', url: 'urn:action-feedback', version: '1.0.0', items: [] };
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { act(() => roots.splice(0).forEach(root => root.unmount())); document.body.replaceChildren(); });
function documentFor(intent: string, id = 'unrelated-id', label = 'Unrelated label') {
    return { $formspecResponseActions: '1.0', version: '1.0.0', targetDefinition: { url: definition.url },
        actions: [{ id, intent, label: { literal: label }, effects: [{ type: 'hostEvent', eventName: 'probe' }] }] };
}
function FeedbackForm(props: React.ComponentProps<typeof FormspecForm>) {
    const document = props.responseActionsDocument as ReturnType<typeof documentFor>;
    const componentDocument = { $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: definition.url },
        tree: { component: 'ActionButton', actionRef: document.actions[0]!.id } };
    return <FormspecForm {...props} componentDocument={componentDocument} />;
}
function mount(element: React.ReactElement) {
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container); roots.push(root); act(() => root.render(element));
    return { container, root };
}
async function click(container: HTMLElement) { await act(async () => { container.querySelector<HTMLButtonElement>('button')!.click(); }); }
const message = (container: HTMLElement) => container.querySelector('[role="status"]')?.textContent;
const en = 'Saving could not be confirmed. Keep this page open.';
const es = 'No se pudo confirmar que se haya guardado. Mantenga esta página abierta.';

describe('semantic action feedback', () => {
    it.each(['failed', 'unresolved'] as const)('uses canonical save-draft intent for %s, independent of IDs and labels', async status => {
        const onActionResult = vi.fn();
        const responseActionInvoker = vi.fn((input: ResponseActionInvokerInput) => ({
            ...invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId),
            status, failureReason: 'port-failed/internal-details',
        }));
        const { container } = mount(<FeedbackForm definition={definition} responseActionsDocument={documentFor('save-draft')}
            responseActionInvoker={responseActionInvoker} onActionResult={onActionResult} />);
        await click(container);
        expect(message(container)).toBe(en);
        expect(container.textContent).not.toContain('port-failed');
        expect(onActionResult).toHaveBeenCalledWith(expect.objectContaining({ status, failureReason: 'port-failed/internal-details' }));
    });

    it.each(['completed', 'blocked', 'deferred'] as const)('keeps %s Save on its existing generic status path', async status => {
        const { container } = mount(<FeedbackForm definition={definition} responseActionsDocument={documentFor('save-draft')}
            responseActionInvoker={input => ({ ...invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId),
                status, failureReason: 'diagnostic-only' })} />);
        await click(container);
        expect(message(container)).toBe(`${status[0]!.toUpperCase()}${status.slice(1)}.`);
        expect(container.textContent).not.toContain('diagnostic-only');
    });

    it('does not infer Save from a label or ID and keeps rejected adapter diagnostics', async () => {
        const onActionResult = vi.fn();
        const { container } = mount(<FeedbackForm definition={definition} responseActionsDocument={documentFor('review', 'save', 'Save')}
            responseActionInvoker={async () => { throw new Error('private adapter detail'); }} onActionResult={onActionResult} />);
        await click(container);
        expect(message(container)).toBe('Failed.');
        expect(container.textContent).not.toContain('private adapter detail');
        expect(onActionResult).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', failureReason: 'private adapter detail' }));
    });

    it('translates pending and settled feedback live and captures the invocation intent', async () => {
        const engine = createFormEngine(definition);
        engine.loadLocale({ $formspecLocale: '2.0', locale: 'es', version: '1.0.0', target: { kind: 'definition', url: definition.url },
            strings: { '$ui.action.inProgress': 'En curso.', '$ui.draft.saveUnconfirmed': es } } as any);
        let finish!: (value: any) => void;
        const pending = new Promise<any>(resolve => { finish = resolve; });
        let original: any;
        const onActionResult = vi.fn();
        const responseActionInvoker = vi.fn((input: ResponseActionInvokerInput) => {
            original = { ...invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId), status: 'failed', failureReason: 'port-failed' };
            return pending;
        });
        const view = (intent: string) => <FeedbackForm engine={engine} responseActionsDocument={documentFor(intent)}
            responseActionInvoker={responseActionInvoker} onActionResult={onActionResult} />;
        const { container, root } = mount(view('save-draft'));
        await click(container);
        expect(message(container)).toBe('In progress.');
        act(() => engine.setLocale('es'));
        expect(message(container)).toBe('En curso.');
        act(() => root.render(view('review')));
        await act(async () => { finish(original); await pending; });
        expect(message(container)).toBe(es);
        expect(onActionResult.mock.calls[0]![0]).toBe(original);
        act(() => engine.setLocale(''));
        expect(message(container)).toBe(en);
        act(() => engine.setLocale('es'));
        expect(message(container)).toBe(es);
    });
});
