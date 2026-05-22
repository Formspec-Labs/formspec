/** @filedesc React submit parity for ValidationReport payloads. */
import { beforeAll, describe, expect, it } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { initFormspecEngine } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';

beforeAll(async () => {
    await initFormspecEngine();
});

const definition = {
    $formspec: '1.0',
    url: 'https://example.gov/forms/validation-report-parity',
    version: '1.0.0',
    status: 'active',
    title: 'Validation report parity',
    items: [
        {
            key: 'name',
            type: 'field',
            dataType: 'string',
            label: 'Name',
        },
    ],
    binds: [{ path: 'name', required: 'true' }],
};

const responseActionsDocument = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    actions: [
        {
            id: 'submit',
            intent: 'submit',
            validation: { profile: 'on-submit', blocking: 'non-blocking', persistence: 'none' },
            effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
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

describe('React ValidationReport parity', () => {
    it('submits the same ValidationReport envelope fields exposed by renderer packages', () => {
        let submitted: any = null;
        const { container, root } = renderInto(
            <FormspecForm
                definition={definition}
                responseActionsDocument={responseActionsDocument}
                onSubmit={(result) => { submitted = result; }}
            />,
        );

        const button = container.querySelector('button.formspec-submit') as HTMLButtonElement;
        expect(button).toBeTruthy();

        flushSync(() => { button.click(); });

        expect(submitted).toBeTruthy();
        expect(submitted.validationReport).toMatchObject({
            $formspecValidationReport: '1.0',
            valid: false,
            counts: expect.objectContaining({
                error: expect.any(Number),
                warning: expect.any(Number),
                info: expect.any(Number),
            }),
        });
        expect(Array.isArray(submitted.validationReport.results)).toBe(true);
        expect(typeof submitted.validationReport.timestamp).toBe('string');

        root.unmount();
        container.remove();
    });
});
