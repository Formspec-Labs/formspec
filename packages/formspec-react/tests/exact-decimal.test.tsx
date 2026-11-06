/** @filedesc Exact numeric leaves remain usable by React controls and submit. */
import { beforeAll, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { FormEngine, initFormspecEngine, parseJsonNumber } from '@formspec-org/engine';
import { FormspecProvider } from '../src/context';
import { FormspecNode } from '../src/node-renderer';
import { useForm } from '../src/use-form';

beforeAll(async () => { await initFormspecEngine(); });

it.each(['NumberInput', 'Slider', 'Select', 'TextInput', 'MoneyInput'])('renders %s with all decimal digits', component => {
    const third = '0.3333333333333333333333333333';
    const engine = new FormEngine({ $formspec: '1.0', url: 'urn:test:react-decimal', version: '1',
        items: [{ key: 'n', label: 'Number', type: 'field', dataType: component === 'MoneyInput' ? 'money' : 'decimal', options: [{ value: third, label: 'Third' }] }] });
    engine.setValue('n', component === 'MoneyInput' ? { amount: third, currency: 'USD' } : third);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => flushSync(() => root.render(<FormspecProvider engine={engine}><FormspecNode node={{
        id: 'number', component, category: 'field', bindPath: 'n', cssClasses: [], children: [],
        props: { min: parseJsonNumber(third), max: 1, step: parseJsonNumber(component === 'MoneyInput' ? third : '1e-28'),
            ticks: [{ value: parseJsonNumber(third), label: 'Third' }], showStepper: component === 'NumberInput' },
    }} /></FormspecProvider>)));
    const control = container.querySelector('input, select') as HTMLInputElement;
    expect(control.value).toBe(third);
    if (component === 'NumberInput') {
        act(() => (container.querySelector('.formspec-stepper-increment') as HTMLButtonElement).click());
        expect(JSON.stringify(engine.getResponse().data.n)).toBe('0.3333333333333333333333333334');
        act(() => engine.setValue('n', '1e-100'));
        expect((container.querySelector('.formspec-stepper-increment') as HTMLButtonElement).disabled).toBe(true);
        expect(engine.getResponse({ profile: 'on-submit' }).status).toBe('in-progress');
    }
    act(() => root.unmount()); container.remove(); engine.dispose();
});

it('submits data and a report from the same advancing clock reading', () => {
    let calls = 0;
    const engine = new FormEngine({ $formspec: '1.0', url: 'urn:test:react-clock', version: '1',
        items: [{ key: 'stamp', label: 'Stamp', type: 'field', dataType: 'dateTime' }],
        binds: [{ path: 'stamp', calculate: 'now()', constraint: '$ = now()' }],
    }, { runtimeContext: { now: () => new Date(Date.UTC(2026, 10, 6, 0, 0, calls++)) } });
    let result: ReturnType<FormEngine['getResponseSnapshot']> | undefined;
    function Submit() { const form = useForm(); return <button onClick={() => { result = form.submit(); }}>Save</button>; }
    const container = document.createElement('div'); const root = createRoot(container);
    act(() => root.render(<FormspecProvider engine={engine}><Submit /></FormspecProvider>));
    const before = calls;
    act(() => container.querySelector('button')!.click());
    expect(calls).toBe(before + 1);
    expect(result!.validationReport!.timestamp).toBe(result!.response.authored);
    expect(result!.validationReport!.valid).toBe(true);
    act(() => root.unmount()); engine.dispose();
});
