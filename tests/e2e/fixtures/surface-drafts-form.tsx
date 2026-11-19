/** @filedesc Native browser Surface with opt-in autosave, explicit saves and version changes. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import type { ComponentDocument } from '@formspec-org/types';
import { BrowserSurfaceApp, createSurfacePreviewEdition, previewFilingInvoker } from '../../../packages/formspec-surface-react/src/index';
import { reviewModule, reviewRegistry, reviewSlot } from './surface-draft-review';

import { hydrationInstances, hydrationStorage, upstream, upstreamUrl } from './surface-hydration';
import { catalogDocument, directory, directoryDefinition, rosterCatalog, rosterSource, rosterStorage } from './surface-draft-roster';

const query = new URLSearchParams(location.search);
const id = 'https://example.test/drafts';
const minted = query.has('minted');
const keyed = query.has('subject') || minted;
const definition = id + '/definition';
const surface = id + '/surface';
const actions = id + '/actions';
const tracker = query.has('tracker');
const review = query.has('review');
const registry = id + '/registry';
const hydration = query.has('hydration');
const submit = query.has('submit');
const useRoster = query.has('roster');
const component: ComponentDocument = {
  $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: definition },
  tree: { component: 'Stack', children: [
    { component: 'TextInput', bind: 'answer' },
    { component: 'Toggle', bind: 'show' },
    { component: 'TextInput', bind: 'detail' },
    { component: 'RepeatGroup', bind: 'rows', children: [{ component: 'TextInput', bind: 'row' }] },
    { component: 'ActionButton', actionRef: 'save' },
    ...(submit ? [{ component: 'ActionButton' as const, actionRef: 'submit' }] : []),
  ] },
};
const source = {
  manifest: {
    $formspecBundle: '2.4', id, definitions: [{ url: definition }, ...(hydration ? [{ url: upstreamUrl }] : []),
      ...(useRoster ? [{ url: directory }] : [])], surfaces: [{ url: surface }],
    entrySurface: surface, responseActionDocuments: [{ url: actions }],
    ...(review && { registries: [{ url: registry }], modules: [{ id: reviewModule, version: '1.0.0' }] }),
    ...(useRoster && { dataSources: [{ url: rosterCatalog }] }),
  },
  documents: {
    [surface]: {
      $formspecSurface: tracker || review || minted ? '0.4' : '0.2', id: 'drafts', entry: minted ? 'overview' : 'form',
      ...(review && { modules: [{ id: reviewModule, version: '1.0.0' }] }), routes: [
        { id: 'overview', path: minted || useRoster ? '/overview/{year}' : '/overview', title: 'Overview', routeClass: 'intake',
          ...((minted || useRoster) && { params: [{ name: 'year', type: 'string' }] }),
          slots: minted ? [{
            id: 'start', slotType: 'draft-start', binding: { label: 'New filing', routeRef: 'form', slotRef: 'form' },
          }] : tracker ? [{
          id: 'tracker', slotType: 'filing-status', binding: { ...(useRoster && { placement: 'band' }), groups: [{
            id: 'reports', label: 'Reports', forms: [{
              routeRef: 'form', slotRef: 'form', ...(keyed && { params: { year: { value: useRoster ? '2099' : '2025' } } }),
            }],
          }, ...(useRoster ? [{
            id: 'members', label: 'Members', repeat: {
              catalogRef: rosterCatalog, sourceRef: rosterSource, rowsField: 'units', labelField: 'name', waitingLabel: 'Waiting for',
            }, forms: [{ routeRef: 'form', slotRef: 'form', params: { year: { rowField: 'year' } } }],
          }] : [])] },
        }] : [] },
        { id: 'form', path: minted ? '/filing/{year}/{unit}' : keyed ? '/filing/{year}' : '/filing', title: 'Filing', routeClass: 'intake',
          ...(keyed && { params: [{ name: 'year', type: 'string' }, ...(minted ? [{ name: 'unit', type: 'string' }] : [])] }),
          slots: [{ id: 'form', slotType: 'definition-form', binding: {
            definitionRef: definition, ...(keyed && { subjectKeys: { year: 'year', ...(minted && { unit: 'unit' }) } }),
          } }] },
        ...(useRoster ? [{ id: 'help', path: '/help', title: 'Help', routeClass: 'intake', slots: [] }] : []),
        ...(review ? [{ id: 'review', path: keyed ? '/review/{year}' : '/review', title: 'Review draft',
          routeClass: 'intake', ...(keyed && { params: [{ name: 'year', type: 'string' }] }), slots: [reviewSlot] }] : []),
      ],
    },
    ...(review && { [registry]: reviewRegistry }),
    ...(hydration && { [upstreamUrl]: upstream }),
    ...(useRoster && { [directory]: directoryDefinition, [rosterCatalog]: catalogDocument }),
    [definition]: {
      $formspec: '1.0', url: definition, version: query.get('version') ?? '1.0.0', title: 'Filing',
      ...(hydration && { instances: hydrationInstances }),
      nonRelevantBehavior: 'remove',
      ...(keyed && { subject: { type: 'urn:test:filing-year', keys: {
        year: { dataType: 'integer' }, ...(minted && { unit: { dataType: 'string', minted: true } }),
      } } }),
      items: [
        { key: 'answer', type: 'field', dataType: 'string', label: 'Answer' },
        { key: 'show', type: 'field', dataType: 'boolean', label: 'Show detail' },
        { key: 'detail', type: 'field', dataType: 'string', label: 'Detail',
          ...(hydration && { prePopulate: { instance: 'accepted', path: 'result' } }) },
        { key: 'rows', type: 'group', repeatable: true, label: 'Rows',
          children: [{ key: 'row', type: 'field', dataType: 'string', label: 'Row value' }] },
      ],
      binds: hydration ? [{ path: 'answer', calculate: "@instance('roster').result & '/' & @instance('sibling').result" }]
        : [{ path: 'detail', relevant: '$show = true' }],
    },
    [actions]: {
      $formspecResponseActions: '1.0', version: '1.0.0', scope: 'response', targetDefinition: { url: definition },
      actions: [
        { id: 'save', intent: 'save-draft', label: { literal: 'Save draft' } },
        ...(submit ? [{ id: 'submit', intent: 'submit', label: { literal: 'Submit report' } }] : []),
        ...(query.has('auto') ? [{ id: 'autosave', intent: 'autosave', label: { literal: 'Autosave' } }] : []),
      ],
    },
  },
};

if (query.has('form')) {
  await initFormspecEngine();
  const root = createRoot(document.getElementById('root')!);
  async function edition(scope: string) {
    const preview = await createSurfacePreviewEdition({ scope, source, scenario: keyed ? {
      $formspecSurfaceScenario: '0.1', version: '1', initialPath: minted ? '/overview/2025' : '/filing/2025',
      ...(!useRoster && { routeParams: { year: '2025' } }),
      defaultProfile: 'local', profiles: { local: {
        authorization: { default: 'authorized' }, sources: [],
        ...(query.has('seed') && { drafts: [{
          definitionUrl: definition,
          subject: { type: 'urn:test:filing-year', keys: { year: 2025 } },
          data: { answer: 'Seeded answer' },
        }] }),
      } },
      actions: { default: { status: 'complete' } },
    } : undefined });
    return { ...preview, adapters: {
      ...preview.adapters,
      resolveDefinitionComponent: () => component,
    } };
  }
  const first = await edition('edition');
  const reads = hydration ? await hydrationStorage(first.scope, first.bundle.definitions) : undefined;
  const roster = useRoster ? await rosterStorage(first.bundle.definitions, first.bundle.dataSources) : undefined;
  if (reads) {
    first.adapters.draftStorage = { scope: first.scope, port: reads.storage.port };
    first.adapters.responses = reads.storage.responses;
  }
  if (roster) {
    first.adapters.draftStorage = { scope: first.scope, port: roster.store.drafts };
    first.adapters.responses = roster.store.responses;
    first.adapters.validateDataSourcePayload = roster.validate;
    first.adapters.definitionActionInvoker = previewFilingInvoker(roster.store.submit);
  }
  const editions = submit ? [first, await edition('edition-b')] as const : [first] as const;
  const mount = (visit: number) => root.render(<>
    <span hidden data-fixture-render={visit} />
    {reads && <button onClick={async event => {
      const button = event.currentTarget;
      await reads.fileNewer();
      button.textContent = 'Updated filing stored';
    }}>File updated directory</button>}
    {roster && <button onClick={async event => {
      const button = event.currentTarget;
      await roster.fileDirectory();
      button.textContent = 'Directory filed';
    }}>File directory</button>}
    <BrowserSurfaceApp previewEditions={[...editions]} />
  </>);
  mount(0);
  window.addEventListener('rerender-draft-fixture', () => mount(1), { once: true });
}
