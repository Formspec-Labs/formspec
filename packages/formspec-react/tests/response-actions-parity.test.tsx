/** @filedesc React parity coverage for Response Actions auto-injected ActionButton behavior. */
import { beforeAll, describe, expect, it, vi } from 'vitest';
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
    url: 'https://example.gov/forms/response-actions-react-parity',
    version: '1.0.0',
    status: 'active',
    title: 'Response Actions React parity',
    items: [],
};

const responseActionsDocument = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    targetDefinition: {
        url: 'https://example.gov/forms/response-actions-react-parity',
    },
    actions: [
        {
            id: 'send-application',
            intent: 'submit',
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

describe('React Response Actions parity', () => {
    it('uses the loaded submit intent action id for the auto-injected ActionButton', async () => {
        const submitted = vi.fn();
        const onActionFinding = vi.fn();
        const { container, root } = renderInto(
            <FormspecForm
                definition={definition}
                responseActionsDocument={responseActionsDocument}
                onSubmit={submitted}
                onActionFinding={onActionFinding}
            />,
        );

        const button = container.querySelector('button[type="submit"]') as HTMLButtonElement;
        expect(button).toBeTruthy();
        expect(button.disabled).toBe(false);

        flushSync(() => { button.click(); });

        expect(submitted).toHaveBeenCalledTimes(1);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(onActionFinding).not.toHaveBeenCalled();

        root.unmount();
        container.remove();
    });
});
