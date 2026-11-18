/** @filedesc React status host around an existing webcomponent, with default or USWDS controls. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initFormspecEngine } from '@formspec-org/engine';
import { FormspecRender, globalRegistry } from '../../../packages/formspec-webcomponent/src/index';
import { uswdsAdapter } from '../../../packages/formspec-adapters/src/uswds/index';
await initFormspecEngine();
globalRegistry.registerAdapter(uswdsAdapter);
customElements.define('formspec-render', FormspecRender);
const options = [{ value: 'AK', label: 'Alaska' }, { value: 'CA', label: 'California' }];
const el = document.querySelector('formspec-render') as any;
const mode = new URLSearchParams(location.search);
if (mode.has('uswds')) el.adapter = 'uswds';
if (mode.has('shadow')) {
    const host = document.createElement('div');
    el.replaceWith(host);
    host.attachShadow({ mode: 'open' }).append(el);
}
const registry = { key: 'registry', type: 'field', dataType: 'string', label: 'Registry ID' };
const registryBind = { letterCase: 'upper', whitespace: 'normalize', constraint: "$ = 'AB CD'" };
el.definition = {
    $formspec: '1.0', url: 'urn:test:wc-input-host', version: '1.0.0',
    items: mode.has('table')
        ? [{ key: 'offices', type: 'group', label: 'Offices', repeatable: true, minRepeat: 1, children: [registry] }]
        : [{ key: 'state', type: 'field', dataType: 'choice', label: 'State', options }, registry],
    binds: [{ path: mode.has('table') ? 'offices[*].registry' : 'registry', ...registryBind }],
};
if (mode.has('table')) {
    el.componentDocument = {
        $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: 'urn:test:wc-input-host' },
        tree: { component: 'DataTable', bind: 'offices', columns: [{ bind: 'registry', header: 'Office ID' }] },
    };
}
// Reconcile a host status update without changing the custom element's authored documents.
const status = document.querySelector('output')!;
const statusRoot = createRoot(status);
function Status() {
    const [edits, setEdits] = useState(0);
    React.useEffect(() => {
        const update = () => setEdits(n => n + 1);
        el.addEventListener('input', update);
        return () => el.removeEventListener('input', update);
    }, []);
    return <span data-input-count={edits}>{edits} inputs</span>;
}
statusRoot.render(<Status />);
