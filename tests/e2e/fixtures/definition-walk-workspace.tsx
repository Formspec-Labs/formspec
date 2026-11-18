/** @filedesc Mount a synthetic React workspace for the Definition Walk accessibility check. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import type { FormDefinition } from '@formspec-org/types';
import { FormspecForm } from '../../../packages/formspec-react/src/index';
import { definition, mixedRepeatDefinition } from './definition-walk-workspace.definition';
import '../../../packages/formspec-layout/src/formspec-default.css';

await initFormspecEngine();
const options = new URLSearchParams(location.search);
const mixedRepeat = options.has('mixedRepeat');
let form: FormDefinition = mixedRepeat ? mixedRepeatDefinition : definition;
if (options.has('continuous')) {
  form = { ...definition, items: [], binds: [] };
}
if (options.has('extraSection')) {
  form = { ...definition, items: [...definition.items, { key: 'more', type: 'group', label: 'More information', children: [
    { key: 'description', type: 'display', label: 'More instructions.' },
  ] }] };
}
createRoot(document.getElementById('root')!).render(
  <FormspecForm definition={form}
    initialData={mixedRepeat ? { details: { rows: [{ show: false }, { show: true }] } } : undefined}
    hrefForSection={options.has('links') ? section => `#${section}` : undefined} />,
);
