/** @filedesc Existing-provider renderer ownership, scoped tokens, issuer and authored actions. */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createFormEngine, initFormspecEngine, invokeResponseAction } from '@formspec-org/engine';
import { FormspecFormContent } from '../src/index';
import { FormspecProvider, useFormspecContext } from '../src/context';
import type { FieldComponentProps } from '../src/component-map';

beforeAll(() => initFormspecEngine());
const definition = { $formspec: '1.0', url: 'urn:provider-content', version: '1.0.0', title: 'Owned form',
    issuer: { $formspecIssuer: '1.0', url: 'urn:issuer', version: '1.0.0', name: 'Owned issuer', kind: 'organization' },
    items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
    binds: [{ path: 'name', required: 'true' }],
};
const component = { $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: definition.url },
    tree: { component: 'Stack', children: [{ component: 'TextInput', bind: 'name' }] },
};
const theme = { $formspecTheme: '1.0' as const, version: '1.0.0', tokens: { 'color.primary': '#713245' } };
function mount(element: React.ReactElement) {
    const container = document.createElement('div'); document.body.appendChild(container);
    const root = createRoot(container); act(() => root.render(element));
    return { container, root };
}
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

describe('FormspecFormContent under an existing provider', () => {
    it('keeps the exact engine, Component overrides and issuer in one maintained container', async () => {
        const engine = createFormEngine(definition);
        engine.setValue('name', 'Saved value');
        const contexts: ReturnType<typeof useFormspecContext>[] = [];
        function Field(props: FieldComponentProps) {
            contexts.push(useFormspecContext());
            return <output data-probe="owned-field">{String(props.field.value)}</output>;
        }
        const { container } = mount(<FormspecProvider engine={engine} componentDocument={component}
            themeDocument={theme} components={{ fields: { TextInput: Field } }}>
            <FormspecFormContent className="native-content" />
        </FormspecProvider>);
        await flush();
        expect(contexts.length).toBeGreaterThan(0);
        expect(contexts.every(context => context.engine === engine)).toBe(true);
        expect(container.querySelectorAll('.formspec-theme-scope')).toHaveLength(1);
        expect(container.querySelectorAll('.formspec-container')).toHaveLength(1);
        expect(container.querySelector('.formspec-container')?.classList.contains('native-content')).toBe(true);
        expect(container.querySelector('[data-probe="owned-field"]')?.textContent).toBe('Saved value');
        expect(container.querySelectorAll('.fs-issuer-chrome-slot')).toHaveLength(1);
        expect(container.querySelector('.fs-issuer-name')?.textContent).toBe('Owned issuer');
        act(() => engine.setValue('name', 'Local edit'));
        expect(container.querySelector('[data-probe="owned-field"]')?.textContent).toBe('Local edit');
    });

    it.each([true, false])('honors scoped token emission and cleanup (enabled=%s)', enabled => {
        const engine = createFormEngine(definition);
        const { container, root } = mount(<FormspecProvider engine={engine} componentDocument={component}
            themeDocument={theme} emitThemeTokens={enabled}><FormspecFormContent /></FormspecProvider>);
        const form = container.querySelector<HTMLElement>('.formspec-container')!;
        expect(form.style.getPropertyValue('--formspec-color-primary')).toBe(enabled ? '#713245' : '');
        expect(document.documentElement.style.getPropertyValue('--formspec-color-primary')).toBe('');
        act(() => root.unmount());
        expect(form.style.getPropertyValue('--formspec-color-primary')).toBe('');
    });

    it('uses full provider-owned action validation and terminal ports without automatic ceremony controls', async () => {
        const engine = createFormEngine(definition);
        const actions = { $formspecResponseActions: '1.0', version: '1.0.0', scope: 'response',
            targetDefinition: { url: definition.url, compatibleVersions: '1.0.0' }, actions: [
                { id: 'save', intent: 'save-draft', label: { literal: 'Save' },
                    validation: { profile: 'off', blocking: 'non-blocking', persistence: 'none' },
                    effects: [{ type: 'hostEvent', eventName: 'saved' }] },
                { id: 'prepare', intent: 'complete', label: { literal: 'Prepare' },
                    validation: { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
                    effects: [{ type: 'hostEvent', eventName: 'prepared' }] },
                ...['sign', 'submit', 'paper'].map(id => ({ id, intent: id === 'submit' ? 'submit' : 'review',
                    label: { literal: id }, effects: [{ type: 'hostEvent', eventName: id }] })),
            ] };
        const authored = { ...component, tree: { component: 'Stack', children: [component.tree.children[0],
            ...['save', 'prepare'].map(id => ({ component: 'ActionButton', actionRef: id, label: { literal: id === 'save' ? 'Save' : 'Prepare' } })),
        ] } };
        const onHostEvent = vi.fn(); const onActionResult = vi.fn();
        const responseActionInvoker = vi.fn(input => ({ invocation: invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId) }));
        const { container } = mount(<FormspecProvider engine={engine} componentDocument={authored}
            responseActionsDocument={actions} responseActionInvoker={responseActionInvoker}
            onHostEvent={onHostEvent} onActionResult={onActionResult}><FormspecFormContent /></FormspecProvider>);
        const buttons = () => [...container.querySelectorAll('button')];
        expect(buttons().map(button => button.textContent)).toEqual(['Save', 'Prepare']);
        act(() => buttons()[0]!.click()); await flush();
        expect(onActionResult.mock.calls.at(-1)![0].status).toBe('completed');
        act(() => buttons()[1]!.click()); await flush();
        expect(onActionResult.mock.calls.at(-1)![0].status).toBe('blocked');
        expect(onHostEvent.mock.calls.map(call => call[0])).toEqual(['saved']);
        act(() => engine.setValue('name', 'Ada'));
        act(() => buttons()[1]!.click()); await flush();
        expect(responseActionInvoker.mock.calls.every(call => call[0].document === actions)).toBe(true);
        expect(onActionResult.mock.calls.at(-1)![0].status).toBe('completed');
        expect(onHostEvent.mock.calls.at(-1)![0]).toBe('prepared');
        expect(onHostEvent.mock.calls.at(-1)![1].validationReport.valid).toBe(true);
        expect(buttons().map(button => button.textContent)).toEqual(['Save', 'Prepare']);
    });
});
