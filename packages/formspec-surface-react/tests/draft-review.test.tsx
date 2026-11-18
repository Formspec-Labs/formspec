/** @filedesc Draft review delivers a qualified committed Response or a typed refusal. */
import { act } from 'react';
import { initFormspecEngine, initFormspecEngineTools } from '@formspec-org/engine';
import { dereferenceBundleExport, type DraftPort } from '@formspec-org/surface';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { BrowserSurfaceApp } from '../src/index.js';
import type { SurfaceWidget } from '../src/widget-api.js';
import { RESPONSE_REVIEW_COPY_KEYS, RESPONSE_REVIEW_WIDGET_SHAPE } from '../src/widget-metadata.js';
import { starterWidgetModule } from '../src/widgets/index.js';
import { render } from './render.js';

const definition = {
  $formspec: '1.0', url: 'https://example.test/form', version: '1.0.0', title: 'Report',
  subject: { type: 'urn:test:year', keys: { year: { dataType: 'integer' } } },
  items: [{ key: 'answer', type: 'field', dataType: 'string', label: 'Form label' }],
};
const surface = 'https://example.test/surface';
const registry = 'https://example.test/registry';
const actions = 'https://example.test/actions';
const reviewModule = 'x-draft-review-fixture';
const params = [{ name: 'unit' }];
const copy = Object.fromEntries(RESPONSE_REVIEW_COPY_KEYS.map(key => [key, key]));
const reviewSlot = {
  id: 'review', slotType: 'module-widget', binding: {
    moduleId: reviewModule, widgetName: 'ResponseReview', config: { copy: { en: copy, fr: copy } },
    draftReview: { routeRef: 'form', slotRef: 'form' },
  },
};
function reviewBundle(language?: string, bundledDefinition = definition) {
  const locale = 'https://example.test/locale';
  return dereferenceBundleExport({
    manifest: { $formspecBundle: '2.4', id: 'https://example.test/app', entrySurface: surface,
      definitions: [{ url: definition.url }], surfaces: [{ url: surface }], registries: [{ url: registry }],
      responseActionDocuments: [{ url: actions }], ...(language && { locales: [{ locale: language, url: locale }] }) },
    documents: {
      [definition.url]: bundledDefinition,
      [registry]: { $formspecRegistry: '1.1', publisher: { name: 'Test', url: 'https://example.test' },
        published: '2026-01-01T00:00:00Z', entries: [
          { name: reviewModule, category: 'module', version: '1.0.0', status: 'stable', contributes: ['x-review-widget'] },
          { name: 'x-review-widget', category: 'widget', version: '0.1.0', status: 'stable', widgetShape: RESPONSE_REVIEW_WIDGET_SHAPE },
        ] },
      [actions]: { $formspecResponseActions: '1.0', version: '1.0.0', scope: 'response', targetDefinition: { url: definition.url },
        actions: [{ id: 'autosave', intent: 'autosave', label: { literal: 'Autosave' } }] },
      ...(language && { [locale]: { $formspecLocale: '2.1', version: '1.0.0', locale: language,
        target: { kind: 'definition', url: definition.url }, strings: { 'answer.label': 'Libellé localisé' } } }),
      [surface]: { $formspecSurface: '0.4', id: 'reports', entry: 'review',
        modules: [{ id: reviewModule, version: '1.0.0' }], routes: [
          { id: 'form', path: '/form/{unit}', params, slots: [{ id: 'form', slotType: 'definition-form',
            binding: { definitionRef: definition.url, subjectKeys: { year: 'unit' } } }] },
          { id: 'review', path: '/review/{unit}', params, slots: [reviewSlot] },
        ],
      },
    },
  });
}
const address = window.location.href;
beforeAll(async () => {
  await initFormspecEngine();
  await initFormspecEngineTools();
});
afterEach(() => window.history.replaceState(null, '', address));

function mount(load: DraftPort['load'], path = '/review/2026', {
  bundle = reviewBundle(), save = vi.fn<DraftPort['save']>(), useNativeReview = false,
}: { bundle?: ReturnType<typeof reviewBundle>; save?: DraftPort['save']; useNativeReview?: boolean } = {}) {
  window.history.replaceState(null, '', path);
  const module = starterWidgetModule(reviewModule);
  const NativeReview = module.widgets.ResponseReview!;
  const widget = vi.fn<SurfaceWidget>(props => useNativeReview ? <NativeReview {...props} /> : <output>Review delivered</output>);
  const readSummaries = vi.fn();
  const dataSourceLoader = vi.fn();
  const container = render(<BrowserSurfaceApp bundle={bundle} draftStorage={{ scope: 'edition', port: { load, save, readSummaries } }}
    dataSourceLoader={dataSourceLoader} widgetModules={[{ ...module, widgets: { ResponseReview: widget } }]} />);
  return { widget, container, save, readSummaries, dataSourceLoader };
}

it.each([
  [undefined, 'en', 'Form label'],
  ['fr', 'fr', 'Libellé localisé'],
] as const)('supplies committed answers and derives wording with Locale %s', async (language, locale, label) => {
  const response = { $formspecResponse: '1.0', id: 'urn:test:response', definitionUrl: definition.url,
    definitionVersion: definition.version, status: 'in-progress', authored: '2026-01-01T12:00:00Z',
    author: { id: 'urn:test:respondent' }, extensions: { 'x-test': { kept: true } }, data: { answer: 'Saved answer' } };
  const load = vi.fn<DraftPort['load']>(async key => ({ status: 'loaded', draft: {
    revision: 'opaque-revision', snapshotJson: '{"ignored":true}', responseJson: JSON.stringify({ ...response, subject: key.subject }),
  } }));
  const view = mount(load, undefined, { bundle: reviewBundle(language), useNativeReview: true });
  await act(async () => { await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1)); });
  await vi.waitFor(() => expect(view.widget).toHaveBeenCalled());
  const key = load.mock.calls[0]![0];
  expect(key).toEqual({ scope: 'edition', definitionUrl: definition.url,
    subject: { id: expect.stringMatching(/^[a-f0-9]{64}$/), type: 'urn:test:year', keys: { year: 2026 } } });
  expect(load.mock.calls[0]![1]).toBe(definition.version);
  const data = view.widget.mock.lastCall?.[0].data;
  expect(data?.definition).toEqual(definition);
  expect(data?.response).toEqual({ ...response, subject: key.subject });
  expect(data?.presentation).toEqual({
    phase: 'draft-review', revision: 'opaque-revision', locale,
    fields: { answer: { label } },
  });
  expect(view.container.querySelector('.fs-response-review')?.getAttribute('lang')).toBe(locale);
  expect(view.container.querySelector('[data-response-path="answer"] dt')?.textContent).toBe(label);
  expect(view.save).not.toHaveBeenCalled();
  expect(view.readSummaries).not.toHaveBeenCalled();
  expect(view.dataSourceLoader).not.toHaveBeenCalled();
});

it('shows the saved answer when other Definition options have an empty value or label', async () => {
  const choice = {
    ...definition,
    items: [{
      key: 'answer', type: 'field', dataType: 'choice', label: 'Form label',
      options: [{ value: '', label: 'Blank' }, { value: 'unlabelled', label: '' }, { value: 'yes', label: 'Yes' }],
    }],
  };
  const load = vi.fn<DraftPort['load']>(async key => ({ status: 'loaded', draft: {
    revision: 'saved-revision', snapshotJson: '{}', responseJson: JSON.stringify({
      $formspecResponse: '1.0', id: 'urn:test:draft', definitionUrl: definition.url,
      definitionVersion: definition.version, status: 'in-progress', subject: key.subject, data: { answer: 'yes' },
    }),
  } }));
  const { container } = mount(load, undefined, { bundle: reviewBundle('fr', choice), useNativeReview: true });
  await act(async () => { await vi.waitFor(() => expect(load).toHaveBeenCalled()); });
  await vi.waitFor(() => expect(container.querySelector('[data-response-path="answer"] dd')?.textContent).toBe('Yes (yes)'));
});

it('uses bundled wording without requesting external instances or options', async () => {
  const external = {
    ...definition,
    instances: { lookup: { source: 'https://example.test/lookup', data: { name: 'Bundled' } } },
    items: [{ key: 'answer', type: 'field', dataType: 'choice', label: 'Answer for {{@instance("lookup").name}}',
      options: [{ value: 'yes', label: 'Bundled yes' }] }],
    binds: [{ path: 'answer', remoteOptions: 'https://example.test/options' }],
  };
  const load = vi.fn<DraftPort['load']>(async key => ({ status: 'loaded', draft: {
    revision: 'saved-revision', snapshotJson: '{}', responseJson: JSON.stringify({
      $formspecResponse: '1.0', id: 'urn:test:draft', definitionUrl: definition.url,
      definitionVersion: definition.version, status: 'in-progress', subject: key.subject, data: { answer: 'yes' },
    }),
  } }));
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'));
  try {
    const { widget } = mount(load, undefined, { bundle: reviewBundle(undefined, external) });
    await act(async () => { await vi.waitFor(() => expect(load).toHaveBeenCalled()); });
    await vi.waitFor(() => expect(widget).toHaveBeenCalled());
    expect(widget.mock.lastCall?.[0].data.presentation).toMatchObject({
      fields: { answer: { label: 'Answer for Bundled', options: [{ value: 'yes', label: 'Bundled yes' }] } },
    });
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});

it('waits for an in-flight save when history opens review without the navigation flush', async () => {
  let saved: Extract<Awaited<ReturnType<DraftPort['load']>>, { status: 'loaded' }>['draft'] | undefined;
  const complete = Promise.withResolvers<void>();
  const load = vi.fn<DraftPort['load']>(async () => saved ? { status: 'loaded', draft: saved } : { status: 'absent' });
  const save = vi.fn<DraftPort['save']>(async request => {
    await complete.promise;
    saved = { revision: 'saved-revision', snapshotJson: request.snapshotJson, responseJson: request.responseJson };
    return { status: 'saved', revision: saved.revision };
  });
  const { container } = mount(load, '/form/2026', { save, useNativeReview: true });
  await act(async () => {});
  await vi.waitFor(() => expect(container.querySelector('input')).not.toBeNull());
  const input = container.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Just saved');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });
  try {
    await act(async () => {
      window.history.replaceState(null, '', '/review/2026');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(window.location.pathname).toBe('/review/2026');
    expect(container.querySelector('[data-route="review"]')).not.toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('Just saved');
  } finally {
    await act(async () => { complete.resolve(); });
  }
  await vi.waitFor(() => expect(container.querySelector('[data-response-path="answer"] dd')?.textContent).toBe('Just saved'));
  expect(load).toHaveBeenCalledTimes(2);
});

it.each(['absent', 'denied', 'version-mismatch'] as const)('keeps a %s draft out of the widget', async reason => {
  const load = vi.fn<DraftPort['load']>(async () => reason === 'version-mismatch'
    ? { status: reason, storedVersion: 'private-pin', revision: 'private-revision' } : { status: reason });
  const view = mount(load);
  await act(async () => { await vi.waitFor(() => expect(load).toHaveBeenCalled()); });
  await vi.waitFor(() => expect(view.container.querySelector(`[data-draft-review-reason="${reason}"]`)).not.toBeNull());
  expect(view.widget).not.toHaveBeenCalled();
  expect(view.container.textContent).not.toMatch(/private-pin|private-revision/);
  expect(view.save).not.toHaveBeenCalled();
});

it('refuses a noncanonical integer subject before requesting a draft', async () => {
  const load = vi.fn<DraftPort['load']>();
  const view = mount(load, '/review/02026');
  await vi.waitFor(() => expect(view.container.querySelector('[data-draft-review-reason="subject-keys-invalid"]')).not.toBeNull());
  expect(load).not.toHaveBeenCalled();
});
