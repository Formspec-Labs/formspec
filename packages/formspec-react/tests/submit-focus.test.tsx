/** @filedesc Submit moves focus to the first invalid field in page order (parity with webcomponent submit). */
import { describe, it, expect, beforeAll } from 'vitest';
import React, { act } from 'react';
import { initFormspecEngine, createFormEngine, createDemoSubmitResponseActions } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import { actRender } from './render-utils';

beforeAll(async () => {
    await initFormspecEngine();
});

const definition = {
    $formspec: '1.0',
    url: 'urn:test:submit-focus',
    version: '1.0.0',
    title: 'Submit focus',
    items: [
        { key: 'first', type: 'field', dataType: 'string', label: 'First in the Definition' },
        { key: 'second', type: 'field', dataType: 'string', label: 'Second in the Definition' },
        { key: 'third', type: 'field', dataType: 'string', label: 'Third in the Definition' },
    ],
    binds: [
        { path: 'first', required: 'true' },
        { path: 'second', required: 'true' },
    ],
};

/** Page order differs from Definition (and report) order: third, second, first. */
const componentDocument = {
    $formspecComponent: '1.0',
    version: '1.0.0',
    targetDefinition: { url: definition.url },
    tree: {
        component: 'Stack',
        children: [
            { component: 'TextInput', bind: 'third' },
            { component: 'TextInput', bind: 'second' },
            { component: 'TextInput', bind: 'first' },
        ],
    },
};

function renderForm(onSubmit: (result: any) => void = () => {}) {
    const engine = createFormEngine(definition);
    const container = actRender(
        <FormspecForm
            engine={engine}
            componentDocument={componentDocument}
            responseActionsDocument={createDemoSubmitResponseActions({ definitionUrl: definition.url })}
            onSubmit={onSubmit}
        />,
    );
    return { container, engine };
}

function clickSubmit(container: HTMLElement) {
    const button = container.querySelector<HTMLButtonElement>('button.formspec-submit')!;
    button.focus();
    act(() => button.click());
    return button;
}

describe('submit focus', () => {
    it('focuses the first invalid field in page order, not report order', () => {
        let report: any = null;
        const { container } = renderForm((result) => { report = result.validationReport; });
        clickSubmit(container);

        expect(report.valid).toBe(false);
        expect(report.results.find((r: any) => r.severity === 'error')?.path).toBe('first');
        expect(document.activeElement).toBe(container.querySelector('input[name="second"]'));
    });

    it('focuses the invalid repeat row, not its neighbour (0-based result paths)', () => {
        const rowsDefinition = {
            $formspec: '1.0',
            url: 'urn:test:submit-focus-rows',
            version: '1.0.0',
            title: 'Rows',
            items: [{
                key: 'jobs',
                type: 'group',
                label: 'Job',
                repeatable: true,
                minRepeat: 3,
                children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
            }],
            binds: [{ path: 'jobs[*].employer', required: 'true' }],
        };
        const engine = createFormEngine(rowsDefinition);
        act(() => {
            engine.setValue('jobs[0].employer', 'a');
            engine.setValue('jobs[2].employer', 'c');
        });
        const container = actRender(
            <FormspecForm
                engine={engine}
                responseActionsDocument={createDemoSubmitResponseActions({ definitionUrl: rowsDefinition.url })}
                onSubmit={() => {}}
            />,
        );
        clickSubmit(container);
        expect(document.activeElement).toBe(container.querySelector('input[name="jobs[1].employer"]'));
        expect(container.querySelector('input[name="jobs[1].employer"]')?.getAttribute('aria-invalid')).toBe('true');
    });

    it('leaves focus on the submit control when the form is valid', () => {
        const { container, engine } = renderForm();
        act(() => {
            engine.setValue('first', 'a');
            engine.setValue('second', 'b');
        });
        const button = clickSubmit(container);
        expect(document.activeElement).toBe(button);
    });
});
