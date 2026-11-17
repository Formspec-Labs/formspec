/** @filedesc Control event ordering keeps answers when a host rerenders on input. */
import React, { act, useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import { FormspecScreener } from '../src/screener/FormspecScreener';
import { FormspecProvider } from '../src/context';
import { FormspecFormContent } from '../src/renderer';
import { FormspecNode } from '../src/node-renderer';
import { actRender } from './render-utils';

beforeAll(() => initFormspecEngine());
const options = [{ value: 'AK', label: 'Alaska' }, { value: 'CA', label: 'California' }];
const definition = (items: any[]) => ({ $formspec: '1.0', url: 'urn:test:input-order', version: '1.0.0', items });
// The provider must render with the host, just as it does in an application's autosave wrapper.
function FieldHost({ engine, component, props = {} }: { engine: ReturnType<typeof createFormEngine>; component: string; props?: Record<string, unknown> }) {
    const [edits, setEdits] = useState(0);
    return <div data-edits={edits} onInput={() => setEdits(n => n + 1)}>
        <FormspecProvider engine={engine}><FormspecNode node={{ id: 'answer', component, category: 'field', bindPath: 'answer', props, cssClasses: [], children: [] }} /></FormspecProvider>
    </div>;
}
const mount = (component: string, dataType: string, props = {}) => {
    const engine = createFormEngine(definition([{ key: 'answer', type: 'field', dataType, label: 'Answer', options }]));
    const container = actRender(<FieldHost engine={engine} component={component} props={props} />);
    return { engine, container };
};
function inputThenChange(el: HTMLInputElement | HTMLSelectElement, value: string) {
    // Use the native setter, bypassing React's value tracker, as a browser edit does.
    const prototype = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(el, value);
    act(() => { el.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => { el.dispatchEvent(new Event('change', { bubbles: true })); });
}

describe('host input rerenders', () => {
    for (const [component, dataType, type, value, expected] of [
        ['DatePicker', 'date', 'date', '2026-11-17', '2026-11-17'],
        ['DatePicker', 'dateTime', 'datetime-local', '2026-11-17T12:30', '2026-11-17T12:30'],
        ['DatePicker', 'time', 'time', '12:30', '12:30'],
        ['MoneyInput', 'money', 'text', '12.50', { amount: '12.5', currency: 'USD' }],
        ['NumberInput', 'integer', 'number', '12', 12],
        ['Slider', 'integer', 'range', '12', 12],
        ['TextInput', 'string', 'text', 'hello', 'hello'],
    ] as const) {
        it(`${component} ${dataType} commits before the host input rerender`, () => {
            const { engine, container } = mount(component, dataType);
            const input = container.querySelector<HTMLInputElement>(`input[type="${type}"]`)!;
            inputThenChange(input, value);
            expect(container.firstElementChild!.getAttribute('data-edits')).toBe('1');
            expect(engine.getResponse().data.answer).toEqual(expected);
            // Money uses the engine's canonical decimal spelling.
            expect(input.value).toBe(component === 'MoneyInput' ? '12.5' : value);
        });
    }
    for (const [component, dataType, type, expected] of [
        ['Toggle', 'boolean', 'checkbox', true],
        ['RadioGroup', 'choice', 'radio', 'AK'],
        ['CheckboxGroup', 'multiChoice', 'checkbox', ['AK']],
    ] as const) {
        it(`${component} commits during click, before browser input`, () => {
            const { engine, container } = mount(component, dataType);
            const input = container.querySelector<HTMLInputElement>(`input[type="${type}"]`)!;
            act(() => input.click());
            expect(container.firstElementChild!.getAttribute('data-edits')).toBe('1');
            expect(input.checked).toBe(true);
            expect(engine.getResponse().data.answer).toEqual(expected);
        });
    }
    it('file input keeps its uncontrolled selection until change', () => {
        const { engine, container } = mount('FileUpload', 'attachment');
        const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
        const file = new File(['proof'], 'proof.txt', { type: 'text/plain' });
        Object.defineProperty(input, 'files', { value: [file] });
        act(() => { input.dispatchEvent(new Event('input', { bubbles: true })); });
        expect(input.files![0]).toBe(file);
        act(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
        expect(container.textContent).toContain('proof.txt');
        expect(engine.getFieldVM('answer')!.value.value).toBeTruthy();
    });
    it('searchable combobox keeps its query through input and commits on keyboard selection', () => {
        const { engine, container } = mount('Select', 'choice', { searchable: true });
        const input = container.querySelector<HTMLInputElement>('[role="combobox"]')!;
        act(() => input.focus());
        inputThenChange(input, 'Cal');
        expect(input.value).toBe('Cal');
        act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
        act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
        expect(engine.getResponse().data.answer).toBe('CA');
        expect(input.value).toBe('California');
    });
    it('native selects in existing and newly added repeat rows keep one-action choices', () => {
        const engine = createFormEngine(definition([{ key: 'offices', type: 'group', label: 'Offices', repeatable: true, minRepeat: 1, children: [{ key: 'state', type: 'field', dataType: 'choice', label: 'State', options }] }]));
        function RepeatHost() {
            const [, update] = useState(0);
            return <div onInput={() => update(n => n + 1)}><FormspecProvider engine={engine}><FormspecFormContent /></FormspecProvider></div>;
        }
        const container = actRender(<RepeatHost />);
        inputThenChange(container.querySelector('select')!, 'AK');
        act(() => container.querySelector<HTMLButtonElement>('.formspec-repeat-add')!.click());
        inputThenChange(container.querySelectorAll('select')[1], 'CA');
        expect(engine.getResponse().data.offices).toEqual([{ state: 'AK' }, { state: 'CA' }]);
        expect([...container.querySelectorAll('select')].map(el => el.value)).toEqual(['AK', 'CA']);
    });
});

for (const [dataType, selected, answer] of [['boolean', 'no', false], ['choice', 'CA', 'CA']] as const) {
    it(`screener ${dataType} keeps the chosen answer across host input rerenders`, () => {
        const routed = vi.fn(() => ({ status: 'accepted' as const }));
        const screener = { $formspecScreener: '1.0', url: 'urn:test:input-screener', version: '1.0.0', items: [{ key: 'answer', type: 'field', dataType, label: 'Answer', options }], evaluation: [{ id: 'main', strategy: 'first-match', routes: [{ condition: 'true', target: 'surface:test' }] }] } as never;
        function ScreenerHost() {
            const [, update] = useState(0);
            return <div onInput={() => update(n => n + 1)}><FormspecScreener screenerDocument={screener} activeLocale="en" onDetermination={routed} /></div>;
        }
        const container = actRender(<ScreenerHost />);
        const select = container.querySelector('select')!;
        inputThenChange(select, selected);
        expect(select.value).toBe(selected);
        act(() => container.querySelector<HTMLButtonElement>('button')!.click());
        expect(routed).toHaveBeenCalledWith(expect.anything(), { answer }, expect.anything(), expect.anything());
    });
}
