/** @filedesc Mount a synthetic React workspace for the Definition Walk accessibility check. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import type { FormDefinition } from '@formspec-org/types';
import { FormspecForm } from '../../../packages/formspec-react/src/index';
import { conditionalSectionsDefinition, definition, lockedRepeatComponent, lockedRepeatDefinition, mixedRepeatDefinition, wizardWithMiddleTarget } from './definition-walk-workspace.definition';
import '../../../packages/formspec-layout/src/formspec-default.css';

await initFormspecEngine();
const options = new URLSearchParams(location.search);
const mixedRepeat = options.has('mixedRepeat');
const lockedRepeat = options.has('lockedRepeat');
const seededRows = options.has('multipleRows') ? ['First record', 'Second record', 'Last record'] : ['Existing record'];
let form: FormDefinition = mixedRepeat ? mixedRepeatDefinition : definition;
if (lockedRepeat) form = lockedRepeatDefinition;
if (options.has('conditionalSections')) form = conditionalSectionsDefinition;
if (options.has('revealCases')) {
  form = { ...definition, items: [...definition.items.slice(0, 2), {
    key: 'details', type: 'group', label: 'Details', children: [
      ...Array.from({ length: 85 }, (_, i) => ({ key: `answer${i}`, type: 'field' as const, dataType: 'string' as const, label: `Answer ${i}` })),
      { key: 'extra', type: 'field', dataType: 'string', label: 'Extra' },
      { key: 'people', type: 'group', repeatable: true, label: 'People', children: [
        { key: 'phones', type: 'group', repeatable: true, label: 'Phones', children: [
          { key: 'show', type: 'field', dataType: 'boolean', label: 'Show number' },
          { key: 'number', type: 'field', dataType: 'string', label: 'Number' },
        ] },
      ] },
    ],
  }], binds: [...(definition.binds ?? []), { path: 'details.people[*].phones[*].number', relevant: '$show = true' }] };
}
if (options.has('wizard')) form = wizardWithMiddleTarget(form);
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
    componentDocument={lockedRepeat ? lockedRepeatComponent : undefined}
    initialData={lockedRepeat ? { review: { records: seededRows.map(title => ({ title })) } }
      : mixedRepeat ? { details: { rows: [{ show: false }, { show: true }] } } : undefined}
    hrefForSection={options.has('links') ? section => `#${section}` : undefined} />,
);
