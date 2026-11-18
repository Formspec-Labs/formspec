/** @filedesc Exercise the browser binding with an admitted standalone Surface bundle. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { invokeResponseAction } from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { dereferenceBundleExport, type FilingDraftObservation, type FilingStatusReader } from '@formspec-org/surface';
import type { ComponentDocument } from '@formspec-org/types';
import { BrowserSurfaceApp, renderDefaultDefinitionForm } from '../../../packages/formspec-surface-react/src/index';
import '../../../packages/formspec-surface-react/src/formspec-surface.css';
import '../../../packages/formspec-layout/src/formspec-default.css';
import { scaleForms } from './surface-filing-scale';

const fixtureOptions = new URLSearchParams(location.search);
const workspace = fixtureOptions.has('workspace');
const alternatingMode = fixtureOptions.get('alternating');
const twoForms = fixtureOptions.has('twoForms');
const id = 'https://example.test/filing';
const definition = `${id}/definition`;
const surface = `${id}/surface`;
const theme = `${id}/theme`;
const actions = `${id}/actions`;
const trackerMode = new URLSearchParams(location.search).get('tracker');
const showsTracker = trackerMode !== null;
const largeTracker = trackerMode === 'large';
const smallTracker = showsTracker && !largeTracker;
const extraForms = largeTracker ? scaleForms : [];
const roster = `${id}/roster`;
const report = `${id}/report`;
const tracker = { id: 'tracker', slotType: 'filing-status', ...(trackerMode === 'band' && !fixtureOptions.has('untitled') && { title: 'Filing map' }), binding: { ...(trackerMode === 'band' && { placement: 'band' }), groups: [{
  id: 'annual', label: 'Annual forms', forms: largeTracker ? extraForms.map(({ routeRef }) => ({ routeRef: `scale-${routeRef}`, slotRef: 'filing' })) : [{
    routeRef: 'form', slotRef: 'filing', hint: 'Have the contact details ready.', params: { state: { value: 'ny' } },
  }, { routeRef: 'roster', slotRef: 'filing' }, { routeRef: 'report', slotRef: 'filing' }],
}] } };
const contact = { key: 'contact', type: 'field', dataType: 'string', label: 'Contact name' };
const supplemental = ['officer', 'submissionDate'].map(key => ({ ...contact, key, label: key }));
const reportSections = [['people', 'People served', 7], ['outcomes', 'Outcomes', 4], ['notes', 'Notes', 1]] as const;
const counts = { total: 4, filled: 2, toFix: 1, toCheck: 2 };
const complete = (total: number) => ({ total, filled: total, toFix: 0, toCheck: 0 });
const observations = new Map<string, FilingDraftObservation>([
  [definition, alternatingMode || workspace ? { status: 'absent' } : { status: 'current', form: { total: 5, filled: 2, toFix: 1, toCheck: 3, ready: false }, sections: {
    'report-details': counts,
    'certification': { total: 1, filled: 0, toFix: 0, toCheck: 1 },
  } }],
  [roster, { status: 'absent' }],
  [report, { status: 'current', form: { ...complete(12), ready: true },
    sections: Object.fromEntries(reportSections.map(([key, , size]) => [key, complete(size)])) }],
  ...extraForms.map(({ url, observation }) => [url, observation] as const),
]);
const readTracker: FilingStatusReader = async queries => new Map(queries.map(query => {
  const draft = observations.get(query.definitionUrl);
  return [query.key, draft
    ? { draft, filing: { status: 'none' } }
    : { draft: { status: 'unavailable' }, filing: { status: 'unavailable' } }];
}));
const contactControl = { component: 'TextInput', bind: showsTracker ? 'details.contact' : 'contact' };
const componentDocument: ComponentDocument = {
  $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: definition },
  tree: { component: 'Stack', children: [
    showsTracker
      ? { component: 'Section', id: 'report-details', title: 'Report details', children: [contactControl] }
      : contactControl,
    ...(showsTracker ? [{ component: 'Section', id: 'certification', title: 'Certification',
      children: supplemental.map(field => ({ component: 'TextInput', bind: `details.${field.key}` })) }] : []),
    { component: 'ActionButton', actionRef: 'save', label: { literal: 'Save draft' } },
  ] },
};
const bundle = dereferenceBundleExport({
  manifest: {
    $formspecBundle: '2.4', id, title: 'Example filing', entrySurface: surface,
    definitions: [definition, ...(smallTracker ? [roster, report] : []), ...extraForms.map(({ url }) => url)].map(url => ({ url })),
    surfaces: [{ url: surface }], theme: { url: theme },
    responseActionDocuments: [{ url: actions }],
  },
  documents: {
    [surface]: {
      $formspecSurface: showsTracker ? '0.4' : '0.2', id: 'filing', entry: 'home', routes: [
        { id: 'home', path: '/overview', title: 'Overview', routeClass: 'intake', slots: showsTracker ? [tracker] : [] },
        { id: 'root', path: '/', title: 'Root route', routeClass: 'intake', slots: [] },
        { id: 'form', path: '/filing/{state}', title: 'Filing', routeClass: 'intake',
          ...(showsTracker ? { navigation: { visible: false } } : {}),
          params: [{ name: 'state', type: 'string' }],
          slots: [
            { id: 'filing', slotType: 'definition-form', binding: { definitionRef: definition } },
            ...(twoForms ? [{ id: 'additional', slotType: 'definition-form', binding: { definitionRef: definition } }] : []),
          ] },
        ...(smallTracker ? [['roster', 'Eligible entity list', roster], ['report', 'Annual report', report]].map(([key, title, url]) => ({
          id: key, path: `/${key}`, title, routeClass: 'intake', navigation: { visible: false },
          slots: [{ id: 'filing', slotType: 'definition-form', binding: { definitionRef: url } }],
        })) : []),
        ...extraForms.map(({ routeRef, title, url }) => ({
          id: `scale-${routeRef}`, path: `/scale/${routeRef}`, title, routeClass: 'intake', navigation: { visible: false },
          slots: [{ id: 'filing', slotType: 'definition-form', binding: { definitionRef: url } }],
        })),
        { id: 'staff', path: '/staff', title: 'Staff', routeClass: 'operation', slots: [] },
      ],
    },
    [definition]: {
      $formspec: '1.0', url: definition, version: '1.0.0', title: 'Filing',
      ...(alternatingMode ? {
        formPresentation: { pageMode: alternatingMode },
        items: [
          { key: 'before', type: 'display', label: 'Before you start', presentation: { widgetHint: 'Heading' } },
          { ...contact, key: 'reference', label: 'Reference number' },
          { key: 'intro', type: 'group', label: 'Introduction', children: [contact] },
          { key: 'keep', type: 'display', label: 'Keep these records.' },
          { key: 'review', type: 'display', label: 'Review checklist', presentation: { widgetHint: 'Heading' } },
          { ...contact, key: 'reviewer', label: 'Reviewer name' },
          { key: 'details', type: 'group', label: 'Details', children: [{ ...contact, key: 'notes', label: 'Notes' }] },
          { key: 'submit', type: 'display', label: 'Save a copy after filing.' },
        ],
      } : workspace ? {
        formPresentation: { pageMode: 'workspace' },
        items: [
          { key: 'intro', type: 'group', label: 'Introduction', children: [
            { key: 'contact', type: 'field', dataType: 'string', label: 'Contact name' },
            { key: 'kind', type: 'field', dataType: 'choice', label: 'Filing type',
              options: [{ value: 'initial', label: 'Initial' }, { value: 'revision', label: 'Revision' }] },
            ...(fixtureOptions.has('emptyRepeat') ? [
              { key: 'otherRows', type: 'group', repeatable: true, minRepeat: 0, label: 'Rows', children: [
                { key: 'otherEntry', type: 'field', dataType: 'string', label: 'Other entry' },
              ] },
            ] : []),
          ] },
          { key: 'details', type: 'group', label: 'Details', children: [
            { key: 'notes', type: 'field', dataType: 'string', label: 'Notes' },
            { key: 'rows', type: 'group', repeatable: true, minRepeat: fixtureOptions.has('emptyRepeat') ? 0 : 1, label: 'Rows', children: [
              { key: 'entry', type: 'field', dataType: 'string', label: 'Entry' },
            ] },
          ] },
        ],
        binds: [{ path: 'details.notes', required: 'true' }],
      } : {
        description: 'Submit the annual filing and certify the information provided.',
        items: showsTracker ? [{ key: 'details', type: 'group', label: 'Details', children: [contact, ...supplemental] }] : [contact],
      }),
    },
    [roster]: { $formspec: '1.0', url: roster, version: '1.0.0', title: 'Eligible entity list',
      description: 'Identify eligible entities and the areas they serve.', items: [
      { key: 'entities', type: 'group', label: 'Entities', children: [contact] },
    ] },
    [report]: { $formspec: '1.0', url: report, version: '1.0.0', title: 'Annual report',
      description: 'Report people served and outcomes for the filing period.',
      items: reportSections.map(([key, label, size]) => ({ key, type: 'group', label,
        children: Array.from({ length: size }, (_, i) => ({ ...contact, key: `answer${i}`, label: `Question ${i + 1}` })),
      })),
    },
    ...Object.fromEntries(extraForms.map(({ url, definition }) => [url, definition])),
    [theme]: {
      tokens: { 'color.primary': '#123456', 'font.weight.medium': 550 },
      ...(fixtureOptions.has('themePages') && {
        pages: [{ id: 'theme-intro', title: 'Contact details', regions: [{ key: 'intro', span: 12 }] }],
      }),
    },
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
  <BrowserSurfaceApp bundle={bundle} adapters={{ mode,
        basePath: "/surface-browser-history",
        routeParams: { state: 'ny' },
        viewerPreferenceKey: fixtureOptions.get('viewer') ?? undefined,
        readSummaries: showsTracker ? readTracker : undefined,
        resolveDefinitionComponent: ({ definition: target }) => !workspace && !alternatingMode && target.url === definition ? componentDocument : undefined,
        definitionActionInvoker: ({ document, actionRef, nodeId, ports }) => invokeResponseAction(document, actionRef, ports, nodeId),
        renderDefinitionForm: fixtureOptions.has('displayFirst') ? input => renderDefaultDefinitionForm({
      ...input,
      componentDocument: { ...componentDocument, tree: { component: 'Stack', children: [
        { component: 'Section', id: 'instructions', title: 'Instructions', children: [
          { component: 'Text', text: 'Read this before starting.' },
        ] },
        { component: 'Section', id: 'intro', title: 'Introduction', children: [
          { component: 'TextInput', bind: 'intro.contact' },
        ] },
      ] } },
    }) : workspace || alternatingMode ? undefined : input => <>
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
      {renderDefaultDefinitionForm(input)}
    </> }} />,
);
