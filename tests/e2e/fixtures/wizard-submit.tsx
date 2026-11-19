/** @filedesc Real React Wizard host exercising cross-step invalid focus and declared host-event callbacks. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createFormEngine, initFormspecEngine, initFormspecEngineTools } from '@formspec-org/engine';
import { FormspecForm } from '../../../packages/formspec-react/src/renderer';

declare global {
    interface Window {
        wizardSubmitEvents: {
            results: Array<[string, string | null, string[]]>;
            events: Array<[string, string]>;
            submitted: string[];
        };
    }
}

const query = new URLSearchParams(location.search);
const fields = ['earlier', 'visible'] as const;
const invalidField = query.get('invalid') || 'visible';
const definition = {
    $formspec: '1.0',
    url: 'urn:test:wizard-submit',
    version: '1.0.0',
    title: 'Wizard submit',
    items: fields.map(key => ({ key, type: 'field', dataType: 'string', label: key })),
    binds: [{ path: invalidField, required: 'true' }],
} as never;
const componentDocument = {
    $formspecComponent: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'urn:test:wizard-submit' },
    tree: {
        component: 'Wizard',
        allowSkip: true,
        children: fields.map((field, index) => ({
            component: 'Section',
            id: index === 0 ? 'details' : 'review',
            title: field,
            children: [
                { component: 'TextInput', bind: field },
                ...(index === 0 ? [{ component: 'ActionButton', actionRef: 'submit' }] : []),
            ],
        })),
    },
} as never;
const isCheckpoint = query.has('checkpoint');
const responseActionsDocument = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    scope: 'response',
    targetDefinition: { url: 'urn:test:wizard-submit' },
    actions: [{
        id: 'submit',
        intent: 'submit',
        label: { literal: 'Placed' },
        validation: isCheckpoint
            ? { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' }
            : { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
        effects: [{ type: 'hostEvent', eventName: query.get('event') || 'formspec-submit' }],
    }],
} as never;

await initFormspecEngine();
await initFormspecEngineTools();
const engine = createFormEngine(definition);
const log = (window.wizardSubmitEvents = { results: [], events: [], submitted: [] });
createRoot(document.getElementById('root')!).render(
    <FormspecForm
        definition={definition}
        engine={engine}
        componentDocument={componentDocument}
        responseActionsDocument={responseActionsDocument}
        onActionResult={r => log.results.push([r.status, r.blockedCause ?? null, r.effectTrace.map(s => s.status)])}
        onHostEvent={(name, r) => log.events.push([name, (r as { response: { status: string } }).response.status])}
        onSubmit={r => log.submitted.push(r.response.status)}
    />,
);
