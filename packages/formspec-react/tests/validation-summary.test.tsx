/** @filedesc ValidationSummary resolves repeat-row results to their field label and jump target. */
import { describe, it, expect, beforeAll } from 'vitest';
import React, { act } from 'react';
import { initFormspecEngine, createFormEngine } from '@formspec-org/engine';
import { FormspecProvider, useFormspecContext } from '../src/context';
import { FormspecNode } from '../src/node-renderer';
import { ValidationSummary } from '../src/validation-summary';
import { actRender } from './render-utils';

beforeAll(async () => {
    await initFormspecEngine();
});

const definition = {
    $formspec: '1.0',
    url: 'urn:test:summary',
    version: '1.0.0',
    title: 'Summary',
    items: [
        {
            key: 'rows',
            type: 'group',
            label: 'Row',
            repeatable: true,
            minRepeat: 2,
            children: [{ key: 'rowName', type: 'field', dataType: 'string', label: 'Row name' }],
        },
    ],
    binds: [{ path: 'rows[*].rowName', required: 'true' }],
};

/** Live summary above the planned form, both under one provider. */
function SummaryWithForm() {
    const { layoutPlan } = useFormspecContext();
    return (
        <>
            <ValidationSummary source="live" autoFocus={false} />
            {layoutPlan ? <FormspecNode node={layoutPlan} /> : null}
        </>
    );
}

describe('ValidationSummary — repeat rows', () => {
    it('labels a repeat-row result from its field view model (0-based instance path) and jumps to that row', () => {
        const engine = createFormEngine(definition);
        act(() => engine.setValue('rows[0].rowName', 'filled'));
        expect(engine.getValidationReport({ profile: 'live' }).results.map((r) => r.path)).toEqual(['rows[1].rowName']);

        const container = actRender(
            <FormspecProvider engine={engine}>
                <SummaryWithForm />
            </FormspecProvider>,
        );

        // A link to the control — the same rows and wording the web component's adapters draw.
        const link = container.querySelector<HTMLAnchorElement>('a.formspec-validation-summary-link');
        expect(link?.textContent).toMatch(/^Row name: /);
        expect(link?.getAttribute('href')).toBe('#' + container.querySelector('input[name="rows[1].rowName"]')!.id);

        act(() => link!.click());
        expect(document.activeElement).toBe(container.querySelector('input[name="rows[1].rowName"]'));
    });
});
