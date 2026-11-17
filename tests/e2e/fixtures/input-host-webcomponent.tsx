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
if (new URLSearchParams(location.search).has('uswds')) el.adapter = 'uswds';
el.definition = { $formspec: '1.0', url: 'urn:test:wc-input-host', version: '1.0.0', items: [
    { key: 'state', type: 'field', dataType: 'choice', label: 'State', options },
] };
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
