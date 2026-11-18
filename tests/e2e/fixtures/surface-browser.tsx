/** @filedesc Exercise the browser binding with an admitted standalone Surface bundle. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { invokeResponseAction } from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { dereferenceBundleExport } from '@formspec-org/surface';
import type { ComponentDocument } from '@formspec-org/types';
import { BrowserSurfaceApp, renderDefaultDefinitionForm } from '../../../packages/formspec-surface-react/src/index';
import '../../../packages/formspec-surface-react/src/formspec-surface.css';
import '../../../packages/formspec-layout/src/formspec-default.css';

const id = 'https://example.test/filing';
const definition = `${id}/definition`;
const surface = `${id}/surface`;
const theme = `${id}/theme`;
const actions = `${id}/actions`;
const componentDocument: ComponentDocument = {
  $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: definition },
  tree: { component: 'Stack', children: [
    { component: 'TextInput', bind: 'contact' },
    { component: 'ActionButton', actionRef: 'save', label: { literal: 'Save draft' } },
  ] },
};
const bundle = dereferenceBundleExport({
  manifest: {
    $formspecBundle: '2.4', id, title: 'Example filing', entrySurface: surface,
    definitions: [{ url: definition }], surfaces: [{ url: surface }], theme: { url: theme },
    responseActionDocuments: [{ url: actions }],
  },
  documents: {
    [surface]: {
      $formspecSurface: '0.2', id: 'filing', entry: 'home', routes: [
        { id: 'home', path: '/overview', title: 'Overview', routeClass: 'intake', slots: [] },
        { id: 'root', path: '/', title: 'Root route', routeClass: 'intake', slots: [] },
        { id: 'form', path: '/filing/{state}', title: 'Filing', routeClass: 'intake',
          params: [{ name: 'state', type: 'string' }],
          slots: [{ id: 'filing', slotType: 'definition-form', binding: { definitionRef: definition } }] },
        { id: 'staff', path: '/staff', title: 'Staff', routeClass: 'operation', slots: [] },
      ],
    },
    [definition]: {
      $formspec: '1.0', url: definition, version: '1.0.0', title: 'Filing',
      items: [{ key: 'contact', type: 'field', dataType: 'string', label: 'Contact name' }],
    },
    [theme]: { tokens: { 'color.primary': '#123456' } },
    [actions]: {
      $formspecResponseActions: '1.0', version: '1.0.0', scope: 'response',
      targetDefinition: { url: definition },
      actions: [{ id: 'save', intent: 'save-draft', label: { literal: 'Save draft' } }],
    },
  },
});
await initFormspecEngine();

const mode = location.pathname.startsWith('/surface-browser-history') ? 'history' : 'hash';
createRoot(document.getElementById('root')!).render(
  <BrowserSurfaceApp bundle={bundle} mode={mode} basePath="/surface-browser-history" routeParams={{ state: 'ny' }}
    definitionActionInvoker={({ document, actionRef, nodeId, ports }) => invokeResponseAction(document, actionRef, ports, nodeId)}
    renderDefinitionForm={input => <>
      <a href={input.hrefForSection?.('details')} onClick={event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        event.preventDefault();
        input.onActiveSectionChange?.('details');
      }}>Details</a>
      <p data-fixture-section>{input.activeSection ?? 'intro'}</p>
      {mode === 'hash' && <>
        <a href="#fixture-anchor">Skip to report controls</a>
        <p id="fixture-anchor" tabIndex={-1}>Report controls</p>
      </>}
      {renderDefaultDefinitionForm({ ...input, componentDocument })}
    </>}
  />,
);
