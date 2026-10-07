/** @filedesc Pending controls remain inert without taking ownership of keyboard focus. */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initFormspecEngine, invokeResponseAction } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import type { ResponseActionInvokerInput } from '../src/context';
import { createSemanticControlRegistry } from '../src/semantic-controls';

beforeAll(() => initFormspecEngine());
const definition = { $formspec: '1.0', url: 'urn:pending-focus', version: '1.0.0', items: [] };
const actions = { $formspecResponseActions: '1.0', version: '1.0.0', targetDefinition: { url: definition.url },
    actions: [{ id: 'perform', intent: 'review', label: { literal: 'Perform action' },
        effects: [{ type: 'hostEvent', eventName: 'probe' }] }] };
const roots = new Set<ReturnType<typeof createRoot>>();
afterEach(() => { act(() => { roots.forEach(root => root.unmount()); roots.clear(); }); document.body.replaceChildren(); });
function render(invoker: React.ComponentProps<typeof FormspecForm>['responseActionInvoker'], actionRef = 'perform',
    semanticControlScope?: React.ComponentProps<typeof FormspecForm>['semanticControlScope']) {
    const onActionResult = vi.fn();
    const onHostEvent = vi.fn();
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container); roots.add(root);
    act(() => root.render(<FormspecForm definition={definition} responseActionsDocument={actions}
        componentDocument={{ $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: definition.url },
            tree: { component: 'ActionButton', actionRef } }}
        responseActionInvoker={invoker} onActionResult={onActionResult} onHostEvent={onHostEvent}
        semanticControlScope={semanticControlScope} />));
    const button = container.querySelector<HTMLButtonElement>('button')!;
    return { root, container, button, onActionResult, onHostEvent };
}
function pending(status: 'failed' | 'unresolved' | 'completed' = 'failed') {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const invoker = vi.fn((input: ResponseActionInvokerInput) => gate.then(() => ({
        ...invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId), status,
    })));
    return { invoker, finish, gate };
}

describe('pending ActionButton focus ownership', () => {
    it.each(['failed', 'unresolved', 'completed'] as const)('retains the same focused control through %s without duplicate delivery', async status => {
        const operation = pending(status);
        const view = render(operation.invoker);
        view.button.focus();
        await act(async () => { view.button.click(); view.button.click(); });
        expect(view.button.disabled).toBe(false);
        expect(view.button.getAttribute('aria-disabled')).toBe('true');
        expect(view.button.getAttribute('aria-busy')).toBe('true');
        expect(document.activeElement).toBe(view.button);
        await act(async () => { view.button.click(); });
        expect(operation.invoker).toHaveBeenCalledTimes(1);
        await act(async () => { operation.finish(); await operation.gate; });
        expect(view.onHostEvent).toHaveBeenCalledTimes(1);
        expect(view.onActionResult).toHaveBeenCalledTimes(1);
        expect(view.button.getAttribute('aria-disabled')).toBe('false');
        expect(document.activeElement).toBe(view.button);
    });

    it('does not reclaim focus after a deliberate move during pending work', async () => {
        const operation = pending();
        const view = render(operation.invoker);
        const next = document.createElement('input'); document.body.append(next);
        view.button.focus();
        await act(async () => { view.button.click(); });
        next.focus();
        await act(async () => { operation.finish(); await operation.gate; });
        expect(document.activeElement).toBe(next);
    });

    it('does not reclaim focus after unmount and late completion', async () => {
        const operation = pending();
        const view = render(operation.invoker);
        view.button.focus();
        await act(async () => { view.button.click(); });
        act(() => view.root.unmount()); roots.delete(view.root);
        const next = document.createElement('input'); document.body.append(next); next.focus();
        await act(async () => { operation.finish(); await operation.gate; });
        expect(view.container.childElementCount).toBe(0);
        expect(document.activeElement).toBe(next);
    });

    it('preserves focused control and failure delivery when the invoker rejects', async () => {
        let reject!: (error: Error) => void;
        const operation = new Promise<never>((_, fail) => { reject = fail; });
        const invoker = vi.fn(() => operation);
        const view = render(invoker);
        view.button.focus();
        await act(async () => { view.button.click(); view.button.click(); });
        await act(async () => { reject(new Error('adapter failed')); await operation.catch(() => {}); });
        expect(invoker).toHaveBeenCalledTimes(1);
        expect(view.onActionResult).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(view.button);
        expect(view.button.getAttribute('aria-disabled')).toBe('false');
    });

    it('keeps an unresolved action natively disabled', () => {
        const invoker = vi.fn();
        const view = render(invoker, 'missing');
        expect(view.button.disabled).toBe(true);
        expect(view.button.getAttribute('aria-disabled')).toBe('true');
        view.button.click();
        expect(invoker).not.toHaveBeenCalled();
    });

    it('refuses semantic activation of the focusable pending control', async () => {
        const operation = pending();
        const registry = createSemanticControlRegistry();
        const artifact = { artifactRef: 'urn:pending-focus:actions', artifactDigest: `sha256:${'a'.repeat(64)}` };
        const view = render(operation.invoker, 'perform', { registry, renderInstanceId: 'focus-test', responseId: 'response-1',
            definitionArtifact: { artifactRef: definition.url, artifactDigest: `sha256:${'d'.repeat(64)}` },
            responseActionsArtifact: artifact });
        await act(async () => { view.button.click(); });
        expect(await registry.activateControl({ renderInstanceId: 'focus-test',
            control: { ...artifact, subjectKind: 'response-action', subjectRef: 'perform' } },
        { invocationId: 'repeat', responseBinding: { responseId: 'response-1', responseRevision: 0 } }))
            .toMatchObject({ status: 'refused', reason: 'disabled' });
        expect(operation.invoker).toHaveBeenCalledTimes(1);
        await act(async () => { operation.finish(); await operation.gate; });
    });
});
