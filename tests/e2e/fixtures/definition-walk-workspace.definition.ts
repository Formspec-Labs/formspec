/** @filedesc Synthetic Definitions for checking workspace accessibility coverage. */
import type { FormDefinition } from '@formspec-org/types';

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


/** The target is on step two, unmounted after the initial pass finishes step three. */
export function wizardWithMiddleTarget(form: FormDefinition): FormDefinition {
  return { ...form, formPresentation: { pageMode: 'wizard' }, items: [form.items[0], form.items[2], form.items[1]] };
}
