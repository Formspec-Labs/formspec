/** @filedesc Synthetic Definitions for checking workspace accessibility coverage. */
import type { ComponentDocument, FormDefinition } from '@formspec-org/types';

export const definition: FormDefinition = {
  $formspec: '1.0',
  url: 'urn:test:axe-workspace',
  version: '1.0.0',
  title: 'Workspace accessibility',
  formPresentation: { pageMode: 'workspace' },
  items: [
    { key: 'intro', type: 'group', label: 'Introduction', children: [
      { key: 'showExtra', type: 'field', dataType: 'boolean', label: 'Show extra question' },
      { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
    ] },
    { key: 'instructions', type: 'group', label: 'Instructions', children: [
      { key: 'description', type: 'display', label: 'Read this before continuing.' },
    ] },
    { key: 'details', type: 'group', label: 'Details', children: [
      { key: 'name', type: 'field', dataType: 'string', label: '' },
      { key: 'extra', type: 'field', dataType: 'string', label: '' },
    ] },
  ],
  binds: [
    { path: 'intro.email', required: 'true' },
    { path: 'details.extra', relevant: 'intro.showExtra = true' },
  ],
};

export const mixedRepeatDefinition: FormDefinition = {
  ...definition,
  items: [...definition.items.slice(0, 2), { ...definition.items[2], children: [
    { key: 'rows', type: 'group', repeatable: true, minRepeat: 2, label: 'Rows', children: [
      { key: 'show', type: 'field', dataType: 'boolean', label: 'Show entry' },
      { key: 'entry', type: 'field', dataType: 'string', label: '' },
    ] },
  ] }],
  binds: [{ path: 'details.rows[*].entry', relevant: '$show' }],
};

export const conditionalSectionsDefinition: FormDefinition = {
  ...definition,
  items: [
    ...definition.items,
    { key: 'locked', type: 'group', label: 'Locked', children: [
      { key: 'internal', type: 'field', dataType: 'string', label: '' },
    ] },
    { key: 'followup', type: 'group', label: 'Followup', children: [
      { key: 'address', type: 'field', dataType: 'string', label: '' },
    ] },
  ],
  binds: [
    ...(definition.binds ?? []),
    { path: 'locked', relevant: 'false' },
    { path: 'followup', relevant: 'intro.showExtra = true' },
  ],
};

export const lockedRepeatDefinition: FormDefinition = {
  $formspec: '1.0', url: 'urn:test:walk-repeat-controls', version: '1.0.0', title: 'Record review',
  items: [{
    key: 'review', type: 'group', label: 'Review', children: [
      { key: 'records', type: 'group', label: 'Records', repeatable: true, children: [
        { key: 'title', type: 'field', dataType: 'string', label: 'Record title' },
      ] },
      { key: 'notes', type: 'group', label: 'Notes', repeatable: true, children: [
        { key: 'text', type: 'field', dataType: 'string', label: 'Note text' },
      ] },
    ],
  }],
  binds: [{ path: 'review.records[*].title', readonly: 'true' }],
};

export const lockedRepeatComponent: ComponentDocument = {
  $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: lockedRepeatDefinition.url },
  tree: { component: 'Stack', bind: 'review', children: [
    { component: 'Accordion', bind: 'records', allowAdd: false, allowRemove: false,
      children: [{ component: 'TextInput', bind: 'title' }] },
    { component: 'Accordion', bind: 'notes', labels: ['Notes 1'], children: [{ component: 'TextInput', bind: 'text' }] },
  ] },
};

/** The target is on step two, unmounted after the initial pass finishes step three. */
export function wizardWithMiddleTarget(form: FormDefinition): FormDefinition {
  return { ...form, formPresentation: { pageMode: 'wizard' }, items: [form.items[0], form.items[2], form.items[1]] };
}
