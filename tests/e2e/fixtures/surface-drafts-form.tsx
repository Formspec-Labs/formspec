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
const periodRange = query.has('periodRange');
const keyed = query.has('subject') || minted || periodRange;
const definition = id + '/definition';
const surface = id + '/surface';
const actions = id + '/actions';
const tracker = query.has('tracker') || periodRange;
const review = query.has('review');
const registry = id + '/registry';
const hydration = query.has('hydration');
const submit = query.has('submit');
const useRoster = query.has('roster');
const autoButtons = query.has('autoButtons');
const authoredAutosave = query.has('authoredAutosave');
const idCollision = query.has('idCollision');
const warnings = query.has('warnings');
const component: ComponentDocument = warnings ? {
  $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: definition },
  formPresentation: { pageMode: 'workspace' },
  tree: { component: 'Stack', children: [
    { component: 'Section', id: 'summary', title: 'Summary', children: [
      { component: 'TextInput', bind: 'answer' },
      { component: 'Toggle', bind: 'show' },
    ] },
    { component: 'Section', id: 'followup', title: 'Follow-up', children: [
      { component: 'TextInput', bind: 'detail' },
      { component: 'TextInput', bind: 'notes' },
    ] },
    { component: 'ActionButton', actionRef: 'save' },
    ...(authoredAutosave ? [{ component: 'ActionButton' as const, actionRef: 'autosave', label: { literal: 'Checkpoint now' } }] : []),
    ...(submit ? [{ component: 'ActionButton' as const, actionRef: 'submit' }] : []),
  ] },
} : {
  $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: definition },
  tree: { component: 'Stack', children: [
    { component: 'TextInput', bind: 'answer' },
    { component: 'Toggle', bind: 'show' },
    { component: 'TextInput', bind: 'detail' },
    { component: 'RepeatGroup', bind: 'rows', children: [{ component: 'TextInput', bind: 'row' }] },
    { component: 'ActionButton', actionRef: 'save' },
    ...(authoredAutosave ? [{ component: 'ActionButton' as const, actionRef: 'autosave', label: { literal: 'Checkpoint now' } }] : []),
    ...(submit ? [{ component: 'ActionButton' as const, actionRef: 'submit' }] : []),
  ] },
};
const authoredButton = component.tree.children?.find(
  (node): node is Extract<typeof node, { component: 'ActionButton' }> =>
    node.component === 'ActionButton' && node.actionRef === 'autosave',
);
if (authoredButton && query.has('styled')) authoredButton.style = { display: 'none' };
if (authoredButton && query.has('visibility')) authoredButton.style = { visibility: 'hidden' };
if (authoredButton && query.has('upperDisplay')) authoredButton.style = { display: 'NONE' };
if (authoredButton && query.has('conditional')) authoredButton.when = 'false';
if (authoredButton && query.has('autoModal')) {
  component.tree.children = component.tree.children!.map((node) =>
    node === authoredButton
      ? { component: 'Modal', title: 'Checkpoint', trigger: 'auto', when: 'false', children: [node] }
      : node,
  );
}
if (authoredButton) {
  const probe = query.get('visibilityCase');
  const variant = query.get('variant');
  if (probe === 'nested') {
    const outer = variant === 'display-precedence'
      ? { display: '  NoNe ' }
      : variant === 'var'
        ? { '--checkpoint-visibility': 'hidden' }
        : { visibility: '  CoLlApSe ' };
    if (variant === 'override' || variant === 'display-precedence') authoredButton.style = { visibility: ' VisIble ' };
    if (variant === 'initial') authoredButton.style = { visibility: 'initial' };
    if (variant === 'var') authoredButton.style = { visibility: 'var(--checkpoint-visibility)' };
    component.tree.children = component.tree.children!.map((node) =>
      node === authoredButton ? { component: 'Stack', style: outer, children: [node] } : node,
    );
  }
  if (probe === 'modal') {
    const trigger = variant === 'dismiss' ? 'auto' : 'button';
    component.tree.children = component.tree.children!.map((node) =>
      node === authoredButton
        ? {
            component: 'Modal',
            trigger,
            title: 'Confirm checkpoint',
            triggerLabel: 'Open checkpoint',
            when: variant === 'false' ? 'false' : 'true',
            children: [node],
          }
        : node,
    );
  }
}
if (query.has('responsiveProbe')) {
  component.breakpoints = { wide: 700 };
  const button = component.tree.children?.find(
    (node): node is Extract<typeof node, { component: 'ActionButton' }> =>
      node.component === 'ActionButton' && node.actionRef === 'autosave',
  );
  if (button) {
    button.actionRef = 'save';
    button.responsive = { wide: { actionRef: 'autosave', label: { literal: 'Responsive checkpoint' } } };
  }
}
const firstTabs = structuredClone(component);
if (query.has('multiTabs') && authoredButton) {
  const first = { component: 'Stack', children: [{ component: 'TextInput', bind: 'answer' }] };
  firstTabs.tree = {
    component: 'Tabs',
    id: 'common',
    tabLabels: ['First tab', 'Second tab'],
    children: [first, { component: 'Stack', children: [{ component: 'TextInput', bind: 'detail' }] }],
  };
  component.tree = {
    component: 'Tabs',
    id: 'common',
    tabLabels: ['First tab', 'Second tab'],
    children: [first, { component: 'Stack', children: [authoredButton] }],
  };
}
if (query.has('media') && authoredButton) {
  authoredButton.style = { visibility: 'var(--review6-visibility, visible)' };
}
if (query.has('content') && authoredButton) {
  component.tree.children = component.tree.children!.map((node) =>
    node === authoredButton
      ? { component: 'Stack', style: { contentVisibility: 'hidden' }, children: [node] }
      : node,
  );
}
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
      $formspecSurface: tracker || review || minted ? '0.4' : '0.2', id: 'drafts', entry: minted || periodRange ? 'overview' : 'form',
      ...(review && { modules: [{ id: reviewModule, version: '1.0.0' }] }), routes: [
        { id: 'overview', path: periodRange ? '/years/{ffy}' : minted || useRoster ? '/overview/{year}' : '/overview', title: 'Overview', routeClass: 'intake',
          ...(periodRange ? { params: [{ name: 'ffy', type: 'string' }] } : (minted || useRoster) && { params: [{ name: 'year', type: 'string' }] }),
          slots: minted ? [{
            id: 'start', slotType: 'draft-start', binding: { label: 'New filing', routeRef: 'form', slotRef: 'form' },
          }] : tracker ? [{
          id: 'tracker', slotType: 'filing-status', binding: { ...(useRoster && { placement: 'band' }), groups: [{
            id: 'reports', label: 'Reports', forms: [{
              routeRef: 'form', slotRef: 'form',
              ...(periodRange
                ? { subject: [
                    { key: 'first_ffy', op: 'le', from: { routeParam: 'ffy' } },
                    { key: 'last_ffy', op: 'ge', from: { routeParam: 'ffy' } },
                  ] }
                : keyed && { params: { year: { value: useRoster ? '2099' : '2025' } } }),
            }],
          }, ...(useRoster ? [{
            id: 'members', label: 'Members', repeat: {
              catalogRef: rosterCatalog, sourceRef: rosterSource, rowsField: 'units', labelField: 'name', waitingLabel: 'Waiting for',
            }, forms: [{ routeRef: 'form', slotRef: 'form', params: { year: { rowField: 'year' } } }],
          }] : [])] },
        }] : [] },
        { id: 'form', path: periodRange ? '/plans/{first_ffy}/{last_ffy}' : minted ? '/filing/{year}/{unit}' : keyed ? '/filing/{year}' : '/filing',
          title: periodRange ? 'Period Plan' : 'Filing', routeClass: 'intake',
          ...(periodRange ? {
            navigation: { visible: false, label: 'Period Plan' },
            params: [{ name: 'first_ffy', type: 'string' }, { name: 'last_ffy', type: 'string' }],
          } : keyed && { params: [{ name: 'year', type: 'string' }, ...(minted ? [{ name: 'unit', type: 'string' }] : [])] }),
          ...(authoredAutosave && { transitions: [{ trigger: 'autosave', to: 'overview' }] }),
          ...(idCollision && { transitions: [{ trigger: 'save-draft', to: 'overview' }] }),
          slots: [{ id: 'form', slotType: 'definition-form', binding: {
            definitionRef: definition,
            ...(periodRange
              ? { subjectKeys: { first_ffy: 'first_ffy', last_ffy: 'last_ffy' } }
              : keyed && { subjectKeys: { year: 'year', ...(minted && { unit: 'unit' }) } }),
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
      $formspec: '1.0', url: definition, version: query.get('version') ?? '1.0.0', title: periodRange ? 'Period Plan' : 'Filing',
      ...(hydration && { instances: hydrationInstances }),
      nonRelevantBehavior: 'remove',
      ...(periodRange
        ? { subject: { type: 'urn:test:period-plan', keys: {
            first_ffy: { dataType: 'integer' }, last_ffy: { dataType: 'integer' },
          } } }
        : keyed && { subject: { type: 'urn:test:filing-year', keys: {
            year: { dataType: 'integer' }, ...(minted && { unit: { dataType: 'string', minted: true } }),
          } } }),
      items: [
        { key: 'answer', type: 'field', dataType: 'string', label: 'Answer' },
        { key: 'show', type: 'field', dataType: 'boolean', label: 'Show detail' },
        { key: 'detail', type: 'field', dataType: 'string', label: 'Detail',
          ...(hydration && { prePopulate: { instance: 'accepted', path: 'result' } }) },
        ...(warnings ? [{ key: 'notes', type: 'field', dataType: 'string', label: 'Notes' }] : []),
        { key: 'rows', type: 'group', repeatable: true, label: 'Rows',
          children: [{ key: 'row', type: 'field', dataType: 'string', label: 'Row value' }] },
      ],
      ...(warnings && {
        warningExplanation: 'acknowledge',
        shapes: [
          { id: 'blankAnswer', target: 'answer', severity: 'warning', timing: 'submit', code: 'UNANSWERED_QUESTIONS', constraint: 'present($)', message: 'Answer is unanswered.' },
          { id: 'blankDetail', target: 'detail', severity: 'warning', timing: 'submit', code: 'UNANSWERED_QUESTIONS', constraint: 'present($)', message: 'Detail is unanswered.' },
          { id: 'blankNotes', target: 'notes', severity: 'warning', timing: 'submit', code: 'UNANSWERED_QUESTIONS', constraint: 'present($)', message: 'Notes is unanswered.' },
        ],
      }),
      binds: hydration ? [{ path: 'answer', calculate: "@instance('roster').result & '/' & @instance('sibling').result" }]
        : [{ path: 'detail', relevant: '$show = true' }],
    },
    [actions]: {
      $formspecResponseActions: '1.0', version: '1.0.0', scope: 'response', targetDefinition: { url: definition },
      actions: [
        { id: 'save', intent: 'save-draft', label: { literal: 'Save draft' },
          effects: [{ type: 'hostEvent', eventName: 'draft-saved' }] },
        ...(submit ? [{ id: 'submit', intent: 'submit', label: { literal: 'Submit report' },
          effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }] }] : []),
        ...((query.has('auto') || authoredAutosave || idCollision) ? [{
          id: idCollision ? 'save-draft' : 'autosave',
          intent: 'autosave',
          label: { literal: autoButtons ? 'Save as I go' : 'Autosave' },
          effects: [{ type: 'hostEvent', eventName: 'draft-autosaved' }],
        }] : []),
        ...(query.has('ambiguous') ? [{
          id: 'second-save',
          intent: 'autosave',
          effects: [{ type: 'hostEvent', eventName: 'second-save' }],
        }] : []),
      ],
    },
  },
};

if (query.has('multiTabs')) {
  source.documents[surface].routes[1].slots.unshift({
    id: 'first',
    slotType: 'definition-form',
    binding: { definitionRef: definition },
  });
}

if (query.has('form')) {
  await initFormspecEngine();
  const root = createRoot(document.getElementById('root')!);
  async function edition(scope: string) {
    const preview = await createSurfacePreviewEdition({ scope, source, scenario: keyed ? {
      $formspecSurfaceScenario: '0.1', version: '1',
      initialPath: periodRange ? '/years/2025' : minted ? '/overview/2025' : '/filing/2025',
      ...(periodRange ? { routeParams: { ffy: '2025' } } : !useRoster && { routeParams: { year: '2025' } }),
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
    return { ...preview,
      bundle: query.has('themeProbe') ? { ...preview.bundle, tenantTheme: {
        $formspecTheme: '1.0', version: '1.0.0', targetDefinition: { url: definition },
        pages: [{ id: 'answers', title: 'Themed page probe', regions: [{ key: 'answer', span: 12 }] }],
      } } : preview.bundle,
      adapters: {
        ...preview.adapters,
        onDiagnostics: (batch) => {
          (window as unknown as { currentDiagnostics?: readonly unknown[] }).currentDiagnostics = batch;
          ((window as unknown as { observedDiagnostics?: unknown[] }).observedDiagnostics ??= []).push(...batch);
          const win = window as unknown as { numDeliveries?: number };
          win.numDeliveries = (win.numDeliveries ?? 0) + 1;
        },
        ...(query.has('withoutWriter') && { draftStorage: undefined, definitionActionInvoker: undefined }),
        ...(!autoButtons && { resolveDefinitionComponent: ({ slotId }) => (slotId === 'first' ? firstTabs : component) }),
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
