/** @filedesc Real React host that rerenders the form during every native input event. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import { FormspecForm } from '../../../packages/formspec-react/src/renderer';

await initFormspecEngine();
const options = [{ value: 'AK', label: 'Alaska' }, { value: 'CA', label: 'California' }];
const field = (key: string) => ({ key, type: 'field', dataType: 'choice', label: 'State', options });
const mode = new URLSearchParams(location.search);
const items = mode.has('display') ? [{ type: 'display', key: 'intro', label: 'Instructions' }] : [
    field('state'),
    { key: 'offices', type: 'group', label: 'Offices', repeatable: true, minRepeat: 1, children: [field('state')] },
    { key: 'amount', type: 'field', dataType: 'decimal', label: 'Amount', options: [
        { value: '0.5', label: 'Half' }, { value: '1.0', label: 'Full' },
        { value: '1.50', label: 'One and a half' }, { value: '02', label: 'Two' },
    ] },
];
const engine = createFormEngine({ $formspec: '1.0', url: 'urn:test:input-host', version: '1.0.0', title: 'Input host', items } as never);
const tree = mode.has('numeric') ? { component: 'Select', bind: 'amount' }
    : mode.has('table') ? { component: 'DataTable', bind: 'offices', columns: [{ bind: 'state', header: 'State' }] }
    : undefined;
const componentDocument = tree ? { $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: 'urn:test:input-host' }, tree } : undefined;
function Host() {
    const [edits, setEdits] = useState(0);
    return <main onInput={() => setEdits(n => n + 1)}><output data-edits={edits}>{edits} inputs</output><FormspecForm engine={engine} componentDocument={componentDocument} /></main>;
}
createRoot(document.getElementById('root')!).render(<Host />);
