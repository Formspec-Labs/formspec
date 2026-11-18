/** @filedesc Native browser Surface with opt-in autosave, explicit saves and version changes. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { dereferenceBundleExport } from '@formspec-org/surface';
import type { ComponentDocument } from '@formspec-org/types';
import { BrowserSurfaceApp } from '../../../packages/formspec-surface-react/src/index';

const query = new URLSearchParams(location.search);
const id = 'https://example.test/drafts';
const keyed = query.has('subject');
const definition = id + '/definition';
const surface = id + '/surface';
const actions = id + '/actions';
const tracker = query.has('tracker');
const component: ComponentDocument = {
  $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: definition },
  tree: { component: 'Stack', children: [
    { component: 'TextInput', bind: 'answer' },
    { component: 'Toggle', bind: 'show' },
    { component: 'TextInput', bind: 'detail' },
    { component: 'RepeatGroup', bind: 'rows', children: [{ component: 'TextInput', bind: 'row' }] },
    { component: 'ActionButton', actionRef: 'save' },
  ] },
};
const bundle = dereferenceBundleExport({
  manifest: {
    $formspecBundle: '2.4', id, definitions: [{ url: definition }], surfaces: [{ url: surface }],
    entrySurface: surface, responseActionDocuments: [{ url: actions }],
  },
  documents: {
    [surface]: {
      $formspecSurface: tracker ? '0.4' : '0.2', id: 'drafts', entry: 'form', routes: [
        { id: 'overview', path: '/overview', title: 'Overview', routeClass: 'intake', slots: tracker ? [{
          id: 'tracker', slotType: 'filing-status', binding: { groups: [{
            id: 'reports', label: 'Reports', forms: [{
              routeRef: 'form', slotRef: 'form', ...(keyed && { params: { year: { value: '2025' } } }),
            }],
          }] },
        }] : [] },
        { id: 'form', path: keyed ? '/filing/{year}' : '/filing', title: 'Filing', routeClass: 'intake',
          ...(keyed && { params: [{ name: 'year', type: 'string' }] }),
          slots: [{ id: 'form', slotType: 'definition-form', binding: {
            definitionRef: definition, ...(keyed && { subjectKeys: { year: 'year' } }),
          } }] },
      ],
    },
    [definition]: {
      $formspec: '1.0', url: definition, version: query.get('version') ?? '1.0.0', title: 'Filing',
      nonRelevantBehavior: 'remove',
      ...(keyed && { subject: { type: 'urn:test:filing-year', keys: { year: { dataType: 'integer' } } } }),
      items: [
        { key: 'answer', type: 'field', dataType: 'string', label: 'Answer' },
        { key: 'show', type: 'field', dataType: 'boolean', label: 'Show detail' },
        { key: 'detail', type: 'field', dataType: 'string', label: 'Detail' },
        { key: 'rows', type: 'group', repeatable: true, label: 'Rows',
          children: [{ key: 'row', type: 'field', dataType: 'string', label: 'Row value' }] },
      ],
      binds: [{ path: 'detail', relevant: '$show = true' }],
    },
    [actions]: {
      $formspecResponseActions: '1.0', version: '1.0.0', scope: 'response', targetDefinition: { url: definition },
      actions: [
        { id: 'save', intent: 'save-draft', label: { literal: 'Save draft' } },
        ...(query.has('auto') ? [{ id: 'autosave', intent: 'autosave', label: { literal: 'Autosave' } }] : []),
      ],
    },
  },
});

if (query.has('form')) {
  await initFormspecEngine();
  createRoot(document.getElementById('root')!).render(<BrowserSurfaceApp
    previewEditions={[{ scope: 'edition', bundle }]}
    mode="hash" routeParams={keyed ? { year: "2025" } : undefined}
    resolveDefinitionComponent={() => component}
  />);
}
