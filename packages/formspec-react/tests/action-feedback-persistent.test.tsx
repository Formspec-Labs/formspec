/** @filedesc Real provider feedback survives readiness branches and retires with ownership. */
import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { signal, computed, effect, batch } from '@preact/signals-core';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFormEngine, initFormspecEngine, invokeResponseAction } from '@formspec-org/engine';
import { FormspecForm, FormspecFormContent } from '../src/renderer.js';
import { FormspecProvider, useFormspecContext, type ResponseActionInvokerInput } from '../src/context.js';
import { FormspecNode } from '../src/node-renderer.js';
import { createSemanticControlRegistry } from '../src/semantic-controls.js';

beforeAll(() => initFormspecEngine());
const definition = { $formspec: '1.0', url: 'urn:persistent-feedback', version: '1.0.0',
    items: [{ key: 'answer', type: 'field', dataType: 'string', label: 'Answer' }],
    instances: { draftReadiness: { readonly: false, data: { ready: true, owned: false } } } };
const actions = { $formspecResponseActions: '1.0', version: '1.0.0', targetDefinition: { url: definition.url },
    actions: ['save', 'other'].map(id => ({ id, intent: 'save-draft', label: { literal: id },
        'x-generation': { anchors: ['need:save-result@1'] }, effects: [{ type: 'hostEvent', eventName: id }] })) };
const component = (when?: string) => ({ $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: definition.url },
    tree: { component: 'Stack', children: [
        { component: 'TextInput', bind: 'answer' },
        { component: 'ActionButton', actionRef: 'save', when, 'x-generation': { anchors: ['need:save-control@1'] } },
        { component: 'ActionButton', actionRef: 'other' },
    ] } });
const roots = new Set<ReturnType<typeof createRoot>>();
afterEach(() => { act(() => { roots.forEach(root => root.unmount()); roots.clear(); }); document.body.replaceChildren(); });
function mount(element: React.ReactElement) {
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container); roots.add(root); act(() => root.render(element)); return { container, root };
}
const message = (container: HTMLElement) => container.querySelector('[role="status"]')?.textContent;
const button = (container: HTMLElement, label = 'save') => Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(node => node.textContent === label)!;
async function click(container: HTMLElement, label = 'save') { await act(async () => { button(container, label).click(); }); }
function operation() {
    let finish!: () => void; const gate = new Promise<void>(resolve => { finish = resolve; });
    const invoker = vi.fn((input: ResponseActionInvokerInput) => gate.then(() => invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId)));
    return { gate, finish, invoker };
}
const form = (props: Partial<React.ComponentProps<typeof FormspecForm>> = {}) => <FormspecForm definition={definition}
    responseActionsDocument={actions} componentDocument={component()} {...props} />;

describe('persistent action feedback', () => {
    it('keeps feedback through an unrelated public semantic revision', async () => {
        let advance!: () => unknown;
        function Probe() { advance = useFormspecContext().advanceSemanticResponseRevision; return null; }
        const scope = { responseId: 'response', renderInstanceId: 'view', registry: createSemanticControlRegistry(),
            definitionArtifact: { artifactRef: definition.url, artifactDigest: 'a'.repeat(64) } };
        const { container } = mount(<FormspecProvider definition={definition} responseActionsDocument={actions} componentDocument={component()}
            semanticControlScope={scope as any}>
            <Probe /><FormspecFormContent />
        </FormspecProvider>);
        await click(container); act(() => { expect(advance()).toEqual({ responseId: 'response', responseRevision: 1 }); });
        expect(message(container)).toBe('Completed.');
    });
    it('executes actions with a custom runtime while refusing persistent freshness feedback', async () => {
        const runtime = { signal: <T,>(initial: T) => {
            const cell = signal(initial);
            return { get value() { return cell.value; }, set value(next: T) { cell.value = next; } };
        }, computed, effect, batch };
        const engine = createFormEngine(definition, { reactiveRuntime: runtime }); const raw = vi.fn(); const events = vi.fn();
        const { container } = mount(form({ engine, onActionResult: raw, onHostEvent: events }));
        await click(container); expect(raw).toHaveBeenCalledTimes(1); expect(events).toHaveBeenCalledTimes(1);
        expect(message(container)).toBe(''); expect(button(container).disabled).toBe(false); engine.dispose();
    });
    it('keeps actual initial Save completion after owned readiness removes its When branch', async () => {
        const engine = createFormEngine(definition); const onResult = vi.fn(); const onEvent = vi.fn(() => engine.setInstanceValue('draftReadiness', 'owned', true));
        const { container } = mount(<StrictMode>{form({ engine, onActionResult: onResult, onHostEvent: onEvent,
            componentDocument: component("@instance('draftReadiness').ready and not(@instance('draftReadiness').owned)") })}</StrictMode>);
        await click(container);
        expect(button(container)).toBeUndefined(); expect(message(container)).toBe('Completed.');
        expect(onEvent).toHaveBeenCalledTimes(1); expect(onResult).toHaveBeenCalledTimes(1);
        const status = container.querySelector('[role="status"]')!;
        expect(status.getAttribute('data-need-anchors')).toBe('need:save-control@1 need:save-result@1');
        engine.dispose();
    });
    it('clears after UI edits and keeps pending focus/in-flight refusal independent of freshness', async () => {
        const engine = createFormEngine(definition); const pending = operation();
        const { container } = mount(form({ engine, responseActionInvoker: pending.invoker }));
        const control = button(container); control.focus(); await click(container);
        act(() => { const input = container.querySelector<HTMLInputElement>('input')!;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Edited');
            input.dispatchEvent(new Event('input', { bubbles: true })); });
        expect(engine.signals.answer.value).toBe('Edited');
        expect(message(container)).toBe(''); expect(control.getAttribute('aria-busy')).toBe('true');
        expect(control.disabled).toBe(false); expect(control.getAttribute('aria-disabled')).toBe('true');
        expect(document.activeElement).toBe(control); await click(container); expect(pending.invoker).toHaveBeenCalledTimes(1);
        await act(async () => { pending.finish(); await pending.gate; });
        expect(message(container)).toBe(''); expect(control.getAttribute('aria-busy')).toBe('false'); engine.dispose();
    });
    it('latest started action wins across controls with the same intent and reversed completion', async () => {
        const first = operation(); const second = operation(); const onResult = vi.fn();
        const { container } = mount(form({ onActionResult: onResult, responseActionInvoker: input => input.actionRef === 'save' ? first.invoker(input) : second.invoker(input) }));
        await click(container); await click(container, 'other');
        await act(async () => { first.finish(); await first.gate; }); expect(message(container)).toBe('In progress.');
        await act(async () => { second.finish(); await second.gate; }); expect(message(container)).toBe('Completed.'); expect(onResult).toHaveBeenCalledTimes(2);
    });
    it('announces only in the originating content root', async () => {
        const { container } = mount(<FormspecProvider definition={definition} responseActionsDocument={actions} componentDocument={component()}>
            <section data-origin="first"><FormspecFormContent /></section><section data-origin="second"><FormspecFormContent /></section>
        </FormspecProvider>);
        await click(container.querySelector<HTMLElement>('[data-origin="first"]')!);
        expect(container.querySelector('[data-origin="first"] [role="status"]')?.textContent).toBe('Completed.');
        expect(container.querySelector('[data-origin="second"] [role="status"]')?.textContent).toBe('');
        const control = button(container); expect(control.getAttribute('aria-describedby')).toBe(container.querySelector('[data-origin="first"] [role="status"]')?.id);
    });
    it('standalone FormspecNode retains local feedback without a content outlet', async () => {
        const { container } = mount(<FormspecProvider definition={definition} responseActionsDocument={actions}>
            <FormspecNode node={{ id: 'standalone', component: 'ActionButton', category: 'interactive', props: { actionRef: 'save' }, children: [], cssClasses: [] } as any} />
        </FormspecProvider>);
        await click(container); expect(message(container)).toBe('Completed.');
    });
    it('engine replacement and explicit Clear-style withdrawal refuse late old completion while delivering raw result', async () => {
        const oldEngine = createFormEngine(definition); const nextEngine = createFormEngine(definition); const pending = operation(); const raw = vi.fn();
        const { container, root } = mount(form({ engine: oldEngine, responseActionInvoker: pending.invoker, onActionResult: raw }));
        await click(container); act(() => root.render(form({ engine: nextEngine, responseActionInvoker: pending.invoker, onActionResult: raw })));
        expect(message(container)).toBe('');
        act(() => root.render(<div>Cleared</div>));
        await act(async () => { pending.finish(); await pending.gate; });
        expect(raw).toHaveBeenCalledTimes(1); expect(container.textContent).toBe('Cleared'); oldEngine.dispose(); nextEngine.dispose();
    });
    it('semantic subject replacement retires equal-answer feedback without relying on revision', async () => {
        const engine = createFormEngine(definition); const registry = createSemanticControlRegistry();
        const scope = (responseId: string) => ({ responseId, renderInstanceId: 'view', registry,
            definitionArtifact: { artifactRef: definition.url, artifactDigest: 'a'.repeat(64) } });
        const { container, root } = mount(form({ engine, semanticControlScope: scope('response-a') as any }));
        await click(container); expect(message(container)).toBe('Completed.');
        act(() => root.render(form({ engine, semanticControlScope: scope('response-b') as any })));
        expect(message(container)).toBe(''); engine.dispose();
    });
});
