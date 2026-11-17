/** @filedesc A native select keeps the person's choice when the host re-renders between the browser's input and change events. */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { initFormspecEngine, createFormEngine } from '@formspec-org/engine';
import { FormspecProvider } from '../src/context';
import { FormspecForm, FormspecFormContent } from '../src/renderer';

beforeAll(async () => {
    await initFormspecEngine();
});

const definition = {
    $formspec: '1.0',
    url: 'https://test.example/state-select',
    version: '1.0.0',
    status: 'active',
    title: 'State select',
    name: 'state-select',
    items: [{
        key: 'state', type: 'field', dataType: 'choice', label: 'State',
        options: [{ value: 'AK', label: 'Alaska' }, { value: 'CA', label: 'California' }],
    }],
};

/** A host that updates its own state on every input event, as an autosave status line does. */
function Host({ engine }: { engine: ReturnType<typeof createFormEngine> }) {
    const [, setEdits] = useState(0);
    return (
        <div onInput={() => setEdits((n) => n + 1)}>
            <FormspecProvider engine={engine}>
                <FormspecFormContent />
            </FormspecProvider>
        </div>
    );
}

describe('native select', () => {
    // A browser choosing an option (mouse on the list, or one keystroke) dispatches `input` and then
    // `change` as two separate events; the microtask checkpoint between them lets React commit any
    // update the `input` event scheduled. Each event is its own act() here for that reason.
    it('keeps the chosen option when the host re-renders on the input event', () => {
        const engine = createFormEngine(definition);
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        act(() => { flushSync(() => root.render(<Host engine={engine} />)); });
        const select = container.querySelector('select') as HTMLSelectElement;
        expect(select.value).toBe('');

        const writes = vi.spyOn(engine, 'setValue');
        select.value = 'CA';
        act(() => { select.dispatchEvent(new Event('input', { bubbles: true })); });
        act(() => { select.dispatchEvent(new Event('change', { bubbles: true })); });

        expect(engine.getResponse().data.state).toBe('CA');
        expect(select.value).toBe('CA');
        expect(writes).toHaveBeenCalledTimes(1); // one choice, one commit
    });

    it('commits each successive choice once, including returning to an earlier value', () => {
        const engine = createFormEngine(definition);
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        act(() => root.render(<Host engine={engine} />));
        const select = container.querySelector('select')!;
        const writes = vi.spyOn(engine, 'setValue');
        for (const value of ['AK', 'CA', 'AK']) {
            select.value = value;
            act(() => { select.dispatchEvent(new Event('input', { bubbles: true })); });
            act(() => { select.dispatchEvent(new Event('change', { bubbles: true })); });
            expect(engine.getResponse().data.state).toBe(value);
            expect(select.value).toBe(value);
        }
        expect(writes).toHaveBeenCalledTimes(3);
    });

    it('commits a choice reported by `change` alone', () => {
        const engine = createFormEngine(definition);
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        act(() => { flushSync(() => root.render(<Host engine={engine} />)); });
        const select = container.querySelector('select') as HTMLSelectElement;
        select.value = 'AK';
        act(() => { select.dispatchEvent(new Event('change', { bubbles: true })); });
        expect(engine.getFieldVM('state')?.value.value).toBe('AK');
    });
});

it('writes once when an integration dispatches input and change in the same task', () => {
    const engine = createFormEngine(definition);
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<Host engine={engine} />));
    const select = container.querySelector('select')!;
    const writes = vi.spyOn(engine, 'setValue');
    select.value = 'CA';
    act(() => {
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(engine.getResponse().data.state).toBe('CA');
    expect(writes).toHaveBeenCalledTimes(1);
});

describe.each([true, false])('numeric selects (host rerender: %s)', (hostRerender) => {
    it.each(['1.50', '02'])('keeps numeric option %s through input and change', (picked) => {
        const engine = createFormEngine({ ...definition, items: [{
            key: 'amount', type: 'field', dataType: 'decimal', label: 'Amount',
            options: ['0', '1.50', '02'].map(value => ({ value, label: value })),
        }] });
        const componentDocument = {
            $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: definition.url },
            tree: { component: 'Select', bind: 'amount' },
        };
        function NumericHost() {
            const [, setEdits] = useState(0);
            return <div onInput={hostRerender ? () => setEdits(n => n + 1) : undefined}>
                <FormspecForm engine={engine} componentDocument={componentDocument} />
            </div>;
        }
        const container = document.createElement('div');
        const root = createRoot(container);
        act(() => root.render(<NumericHost />));
        const select = container.querySelector('select')!;
        const writes = vi.spyOn(engine, 'setValue');
        select.value = picked;
        act(() => { select.dispatchEvent(new Event('input', { bubbles: true })); });
        act(() => { select.dispatchEvent(new Event('change', { bubbles: true })); });
        expect(engine.getResponse().data.amount).toBe(Number(picked));
        expect(select.value).toBe(picked);
        expect(writes).toHaveBeenCalledTimes(1);
        // A later engine update must also select the matching authored spelling.
        act(() => engine.setValue('amount', picked === '02' ? 1.5 : 2));
        expect(select.value).toBe(picked === '02' ? '1.50' : '02');
    });
});

it('keeps editable DataTable choices across host input rerenders, including an added row', () => {
    const engine = createFormEngine({ ...definition, items: [{
        key: 'offices', type: 'group', label: 'Offices', repeatable: true, minRepeat: 1,
        children: definition.items,
    }] });
    const componentDocument = {
        $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: definition.url },
        tree: { component: 'DataTable', bind: 'offices', columns: [{ bind: 'state', header: 'State' }] },
    };
    function TableHost() {
        const [, setEdits] = useState(0);
        return <div onInput={() => setEdits(n => n + 1)}>
            <FormspecForm engine={engine} componentDocument={componentDocument} />
        </div>;
    }
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<TableHost />));
    const writes = vi.spyOn(engine, 'setValue');
    for (const [index, picked] of ['CA', 'AK'].entries()) {
        if (index) act(() => (container.querySelector('.formspec-datatable-add') as HTMLButtonElement).click());
        const select = container.querySelectorAll('select')[index];
        expect(select).toBeTruthy();
        select.value = picked;
        act(() => { select.dispatchEvent(new Event('input', { bubbles: true })); });
        act(() => { select.dispatchEvent(new Event('change', { bubbles: true })); });
        expect(engine.getResponse().data.offices[index].state).toBe(picked);
        expect(select.value).toBe(picked);
    }
    expect(writes).toHaveBeenCalledTimes(2);
});
