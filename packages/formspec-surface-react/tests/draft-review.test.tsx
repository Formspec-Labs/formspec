/** @filedesc Draft review delivers a qualified committed Response or a typed refusal. */
import { act } from 'react';
import { initFormspecEngine, initFormspecEngineTools } from '@formspec-org/engine';
import { dereferenceBundleExport, type DraftPort } from '@formspec-org/surface';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BrowserSurfaceApp } from '../src/index.js';
import { createMemoryFilingStore } from '../src/browser-draft-port.js';
import { loadDraftReviewInputs } from '../src/draft-review.js';
import { createDraftSession } from '../src/draft-session.js';
import type { FormDefinition, FormResponse } from '@formspec-org/types';
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
function reviewBundle(
  language?: string,
  bundledDefinition: Omit<typeof definition, 'subject'> & {
    subject: { type: string; keys: Record<string, { dataType: string }> };
  } = definition,
  subjectKey = 'year',
) {
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
        actions: [{ id: 'autosave', intent: 'autosave', label: { literal: 'Autosave' },
          effects: [{ type: 'hostEvent', eventName: 'draft-autosaved' }] }] },
      ...(language && { [locale]: { $formspecLocale: '2.1', version: '1.0.0', locale: language,
        target: { kind: 'definition', url: definition.url }, strings: { 'answer.label': 'Libellé localisé' } } }),
      [surface]: { $formspecSurface: '0.4', id: 'reports', entry: 'review',
        modules: [{ id: reviewModule, version: '1.0.0' }], routes: [
          { id: 'form', path: '/form/{unit}', params, slots: [{ id: 'form', slotType: 'definition-form',
            binding: { definitionRef: definition.url, subjectKeys: { [subjectKey]: 'unit' } } }] },
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
  const container = render(<BrowserSurfaceApp bundle={bundle} adapters={{ draftStorage: { scope: 'edition', port: { load, save, readSummaries } },
        dataSourceLoader,
        widgetModules: [{ ...module, widgets: { ResponseReview: widget } }] }} />);
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
  await vi.waitFor(() => expect(container.querySelector('[data-response-path="answer"] dd')?.textContent).toBe('Yes'));
});

it('uses bundled wording without requesting external instances or options', async () => {
  const external = {
    ...definition,
    instances: { lookup: { source: 'https://example.test/lookup', data: { name: 'Bundled' } } },
    items: [
      { key: 'answer', type: 'field', dataType: 'choice', label: 'Answer for {{@instance("lookup").name}}',
        options: [{ value: 'yes', label: 'Bundled yes' }] },
      { key: 'externalChoice', type: 'field', dataType: 'choice', label: 'External choice',
        options: 'https://example.test/options' },
    ],
    binds: [],
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

/** The workshop form on /form/2026 in a workspace with Logistics and Program sections, reviewed on /review/2026. */
/** The explanations conformance workshop under this file's Definition identity, in a workspace. */
async function workshopDefinition() {
  const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
  return {
    ...(workshopJson as any),
    url: definition.url,
    version: definition.version,
    subject: definition.subject,
    formPresentation: { pageMode: 'workspace' },
  };
}

async function mountWorkshopForm() {
  const { createMemoryFilingStore } = await import('../src/browser-draft-port.js');
  const workshop = await workshopDefinition();
  const componentDoc = {
    $formspecComponent: '1.0',
    version: '1.0.0',
    targetDefinition: { url: definition.url },
    formPresentation: { pageMode: 'workspace' },
    tree: {
      component: 'Stack',
      children: [
        {
          component: 'Section',
          id: 'logistics',
          title: 'Logistics',
          children: [
            { component: 'TextInput', bind: 'venue' },
            { component: 'TextInput', bind: 'partner' },
          ],
        },
        {
          component: 'Section',
          id: 'program',
          title: 'Program',
          children: [
            { component: 'TextInput', bind: 'topic' },
            { component: 'TextInput', bind: 'outcome' },
            { component: 'NumberInput', bind: 'attendance' },
          ],
        },
      ],
    },
  };
  const store = createMemoryFilingStore({ scope: 'edition', definitions: new Map([[definition.url, workshop]]) });
  const bundle = reviewBundle(undefined, workshop);
  window.history.replaceState(null, '', '/form/2026');
  const module = starterWidgetModule(reviewModule);
  const container = render(
    <BrowserSurfaceApp
      bundle={bundle}
      adapters={{
        draftStorage: { scope: 'edition', port: store.drafts, responses: store.responses, author: { id: 'respondent-1', name: 'A. Preparer' } },
        resolveDefinitionComponent: () => componentDoc as any,
        widgetModules: [module],
      }}
    />,
  );
  return { container, store };
}

it('exposes grouped blank-answer acknowledgement on draft-review, saves with revision check, and links to another section', async () => {
  const { container, store } = await mountWorkshopForm();
  // Save a draft with partner='Library', attendance=10 so venue, topic, outcome remain unanswered
  await act(async () => {});
  await vi.waitFor(() => expect(container.querySelector('[data-name="partner"] input')).not.toBeNull());
  const partnerInput = container.querySelector<HTMLInputElement>('[data-name="partner"] input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(partnerInput, 'Library');
    partnerInput.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(async () => {
      const loaded = await store.drafts.load(
        { scope: 'edition', definitionUrl: definition.url, subject: { id: expect.any(String) as any, type: 'urn:test:year', keys: { year: 2026 } } },
        definition.version,
      ).catch(() => ({ status: 'absent' as const }));
      expect(loaded).toBeDefined();
    });
  });
  // Wait for autosave to commit
  await act(async () => { await new Promise(r => setTimeout(r, 500)); });

  // Navigate to respondent draft-review route
  await act(async () => {
    window.history.pushState(null, '', '/review/2026');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await vi.waitFor(() => expect(container.querySelector('.fs-response-review')).not.toBeNull());

  const groupPanel = await vi.waitFor(() => {
    const el = container.querySelector<HTMLFieldSetElement>('fieldset[data-explanation-code="WORKSHOP_NOT_ANSWERED"]');
    expect(el).not.toBeNull();
    return el!;
  });
  const acceptBtn = groupPanel.querySelector<HTMLButtonElement>('button')!;
  expect(acceptBtn.textContent).toBe('Accept 3 unanswered questions');
  expect(acceptBtn.disabled).toBe(false);

  // Click Accept -> persists via revision-checked DraftWriter and refreshes draft-review
  await act(async () => { acceptBtn.click(); });
  await vi.waitFor(() => {
    const refreshed = container.querySelector<HTMLButtonElement>('fieldset[data-explanation-code="WORKSHOP_NOT_ANSWERED"] button');
    expect(refreshed?.disabled).toBe(true);
    expect(refreshed?.textContent).toBe('Accepted 3 unanswered questions');
  });

  // Click field link for 'Topic' (in section 'program') -> navigates to /form/2026?slot=form&section=program
  const topicLink = [...container.querySelectorAll<HTMLAnchorElement>('fieldset[data-explanation-code="WORKSHOP_NOT_ANSWERED"] a')]
    .find(a => a.textContent === 'Topic');
  expect(topicLink).toBeDefined();
  expect(topicLink!.getAttribute('href')).toContain('/form/2026');
  expect(topicLink!.getAttribute('href')).toContain('section=program');
  await act(async () => { topicLink!.click(); });
  await vi.waitFor(() => {
    expect(window.location.pathname).toBe('/form/2026');
    expect(window.location.search).toContain('section=program');
    expect(container.querySelector('[data-formspec-section="program"]')).not.toBeNull();
  });
});

it('links the owed group from the form Findings margin to the review route, which focuses its Accept button', async () => {
  const { container } = await mountWorkshopForm();
  await vi.waitFor(() => expect(container.querySelector('[data-name="partner"] input')).not.toBeNull());
  const partnerInput = container.querySelector<HTMLInputElement>('[data-name="partner"] input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(partnerInput, 'Library');
    partnerInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Submit-timing blanks are owed before any Submit; the margin says so and points at the review control.
  const link = await vi.waitFor(() => {
    const found = container.querySelector<HTMLAnchorElement>(
      '.formspec-workspace__findings > ul > li[data-follow-up="WORKSHOP_NOT_ANSWERED"] a');
    expect(found?.textContent).toBe('Warning: 3 unanswered questions');
    return found!;
  });
  expect(container.querySelector('.formspec-workspace__findings-summary')?.textContent).toBe('1 to check');
  const href = new URL(link.href, window.location.href);
  expect([href.pathname, href.searchParams.get('acknowledge')]).toEqual(['/review/2026', 'WORKSHOP_NOT_ANSWERED']);

  await act(async () => { link.click(); });
  await vi.waitFor(() => {
    const accept = container.querySelector<HTMLButtonElement>('fieldset[data-explanation-code="WORKSHOP_NOT_ANSWERED"] button');
    expect(accept?.textContent).toBe('Accept 3 unanswered questions');
    expect(document.activeElement).toBe(accept);
  });
});

it('lands on the route heading when the linked group was already accepted', async () => {
  const { container } = await mountWorkshopForm();
  await vi.waitFor(() => expect(container.querySelector('[data-name="partner"] input')).not.toBeNull());
  const partnerInput = container.querySelector<HTMLInputElement>('[data-name="partner"] input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(partnerInput, 'Library');
    partnerInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // A popstate visit does not flush the form, so let autosave commit first, as the test above does.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)); });
  const visit = async (path: string) => act(async () => {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const button = () => container.querySelector<HTMLButtonElement>('fieldset[data-explanation-code="WORKSHOP_NOT_ANSWERED"] button');
  await visit('/review/2026');
  await vi.waitFor(() => expect(button()?.disabled).toBe(false));
  await act(async () => { button()!.click(); });
  await vi.waitFor(() => expect(button()?.textContent).toBe('Accepted 3 unanswered questions'));

  // A stale Findings link: nothing is left to accept, so focus stays where any route change puts it.
  await visit('/form/2026');
  await vi.waitFor(() => expect(container.querySelector('[data-name="partner"] input')).not.toBeNull());
  await visit('/review/2026?acknowledge=WORKSHOP_NOT_ANSWERED');
  await vi.waitFor(() => expect(button()?.disabled).toBe(true));
  expect(document.activeElement).toBe(container.querySelector('.fs-surface-route__title'));
});

describe('a review delivery that arrives after the route', () => {
  async function lateReview() {
    const workshop = await workshopDefinition();
    let deliver!: () => void;
    const arrived = new Promise<void>(resolve => { deliver = resolve; });
    const load = vi.fn<DraftPort['load']>(async key => {
      await arrived;
      return { status: 'loaded', draft: { revision: 'r1', snapshotJson: '{}', responseJson: JSON.stringify({
        $formspecResponse: '1.0', id: 'urn:test:late', definitionUrl: definition.url, definitionVersion: definition.version,
        status: 'in-progress', authored: '2026-01-01T12:00:00Z', subject: key.subject, data: { partner: 'Library' },
      }) } };
    });
    const view = mount(load, '/review/2026?acknowledge=WORKSHOP_NOT_ANSWERED', { bundle: reviewBundle(undefined, workshop) });
    await act(async () => { await vi.waitFor(() => expect(load).toHaveBeenCalled()); });
    const accept = async () => vi.waitFor(() => {
      const found = view.container.querySelector<HTMLButtonElement>('fieldset[data-explanation-code="WORKSHOP_NOT_ANSWERED"] button');
      expect(found?.textContent).toBe('Accept 3 unanswered questions');
      return found!;
    });
    return { ...view, deliver: () => act(async () => { deliver(); }), accept };
  }

  it('still focuses the Accept button', async () => {
    const view = await lateReview();
    await view.deliver();
    expect(document.activeElement).toBe(await view.accept());
  });

  it('leaves focus where the respondent moved it meanwhile', async () => {
    const view = await lateReview();
    const elsewhere = view.container.querySelector<HTMLAnchorElement>('nav a')!;
    act(() => { elsewhere.focus(); });
    await view.deliver();
    await view.accept();
    expect(document.activeElement).toBe(elsewhere);
  });
});

it.each(['/form/2026', '/review/2026'])('keeps a subject-refused draft unavailable on %s', async path => {
  const subjectKey = 'ffy-year';
  const bundle = reviewBundle(undefined, {
    ...definition, subject: { ...definition.subject, keys: { [subjectKey]: { dataType: 'integer' } } },
  }, subjectKey);
  const data = { answer: 'Saved answer' };
  const pin = { definitionUrl: definition.url, definitionVersion: definition.version, data };
  const load = vi.fn<DraftPort['load']>(async key => ({ status: 'loaded', draft: {
    revision: 'saved-revision',
    snapshotJson: JSON.stringify(pin),
    responseJson: JSON.stringify({
      ...pin, $formspecResponse: '1.0', id: 'urn:test:response', status: 'in-progress',
      authored: '2026-01-01T12:00:00Z', subject: key.subject,
    }),
  } }));
  const view = mount(load, path, { bundle });
  await act(async () => { await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1)); });
  await vi.waitFor(() => {
    if (path.startsWith('/form')) {
      expect(view.container.textContent).toContain('This draft could not be opened.');
    } else {
      expect(view.container.querySelector('[data-probe="slot-unavailable"]')).not.toBeNull();
    }
  });
  expect(view.widget).not.toHaveBeenCalled();
  expect(view.save).not.toHaveBeenCalled();
});

it('shows the blank-answer warning on committed review after the respondent clears an initialValue', async () => {
  const defaultWarningDef = {
    $formspec: '1.0',
    url: 'urn:review:default-warning',
    version: '1.0.0',
    status: 'draft',
    title: 'Shipping',
    items: [{ type: 'field', key: 'venue', dataType: 'string', label: 'Venue', initialValue: 'Town Hall' }],
    shapes: [{
      id: 'missingVenue',
      target: 'venue',
      severity: 'warning',
      timing: 'submit',
      code: 'BLANK',
      explanation: 'acknowledge',
      constraint: 'present($)',
      message: 'Choose a venue.',
    }],
  } as unknown as FormDefinition;
  const scope = 'review-initial-value';
  const key = { scope, definitionUrl: defaultWarningDef.url };
  const input = {
    plan: { definition: defaultWarningDef },
    grant: {},
    semanticControlScope: { responseId: 'urn:r:1' },
  } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
  const store = createMemoryFilingStore({ scope, definitions: new Map([[defaultWarningDef.url, defaultWarningDef]]) });
  const session = createDraftSession({ scope, port: store.drafts, responses: store.responses, author: { id: 'operator' } });
  try {
    const lease = session.acquire(key, input, () => {});
    const opened = await lease.result;
    if (opened.status !== 'ready') throw Error(opened.status);
    expect(opened.engine.signals.venue!.value).toBe('Town Hall');
    opened.engine.setValue('venue', undefined);
    expect(opened.engine.getExplanationState().groups.map(g => g.code)).toEqual(['BLANK']);
    expect(await opened.writer.flush(true)).toBe(true);
    lease.release();

    const delivery = await loadDraftReviewInputs(
      { status: 'ready', definition: defaultWarningDef } as Parameters<typeof loadDraftReviewInputs>[0],
      { session, site: { surfaceId: 's', routeId: 'r', slotId: 'review' }, signal: new AbortController().signal, localeDocuments: undefined, activeLocale: undefined },
    );
    expect(delivery.status).toBe('ready');
    if (delivery.status !== 'ready') return;
    expect(delivery.warningGroups.map(g => g.code)).toEqual(['BLANK']);
  } finally {
    session.dispose();
  }
});

it('refuses acknowledging a warning group when the retained writer is dirty or basis mismatches, preserving unsaved edits', async () => {
  const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
  const workshop = workshopJson as unknown as FormDefinition;
  const scope = 'review-dirty-mismatch';
  const key = { scope, definitionUrl: workshop.url };
  const input = {
    plan: { definition: workshop },
    grant: {},
    semanticControlScope: { responseId: 'urn:r:dirty-mismatch' },
  } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
  const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
  const session = createDraftSession({ scope, port: store.drafts, responses: store.responses, author: { id: 'operator' } });
  const notices: string[] = [];
  try {
    const lease = session.acquire(key, input, notice => notices.push(notice));
    const opened = await lease.result;
    if (opened.status !== 'ready') throw Error(opened.status);
    opened.engine.setValue('partner', 'Library');
    expect(await opened.writer.flush(true)).toBe(true);
    const savedRevision = opened.writer.revision!;
    const savedGroup = opened.engine.getExplanationState().groups.find(g => g.code === 'WORKSHOP_NOT_ANSWERED')!;
    expect(savedGroup.basis).toBeTruthy();

    // Create an unsaved edit that changes the blank-answer group in the retained writer.
    opened.engine.setValue('partner', undefined);
    expect(opened.writer.dirty).toBe(true);
    lease.release();

    const dirtyOutcome = await session.acknowledgeWarningGroup({
      definition: workshop,
      subject: undefined,
      expectedRevision: savedRevision,
      expectedBasis: savedGroup.basis,
      code: 'WORKSHOP_NOT_ANSWERED',
      report: notice => notices.push(notice),
    });
    expect(dirtyOutcome).toBe('mismatch');
    expect(notices).toContain('draftConflict');

    // Committed storage was untouched, and the retained writer still preserves the unsaved edit.
    const committed = await store.drafts.load(key, workshop.version);
    if (committed.status !== 'loaded') throw Error(committed.status);
    expect(committed.draft.revision).toBe(savedRevision);
    expect(JSON.parse(committed.draft.responseJson).explanations).toBeUndefined();
    const reopenedLease = session.acquire(key, input, () => {});
    const reopened = await reopenedLease.result;
    if (reopened.status !== 'ready') throw Error(reopened.status);
    expect(reopened.engine.signals.partner!.value).toBeNull();
    expect(reopened.writer.dirty).toBe(true);

    // Even when clean, a mismatched expectedBasis must be refused without saving.
    reopened.engine.setValue('partner', 'Library');
    expect(await reopened.writer.flush()).toBe(true);
    const cleanRevision = reopened.writer.revision!;
    reopenedLease.release();
    const badBasisOutcome = await session.acknowledgeWarningGroup({
      definition: workshop,
      subject: undefined,
      expectedRevision: cleanRevision,
      expectedBasis: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      code: 'WORKSHOP_NOT_ANSWERED',
      report: notice => notices.push(notice),
    });
    expect(badBasisOutcome).toBe('mismatch');
  } finally {
    session.dispose();
  }
});

it('allows a fresh decision after another session commits between review and acceptance', async () => {
  const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
  const workshop = workshopJson as unknown as FormDefinition;
  const scope = 'review-retry-conflict';
  const key = { scope, definitionUrl: workshop.url };
  const input = { plan: { definition: workshop }, grant: {} } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
  const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
  const sessionA = createDraftSession({ scope, port: store.drafts, responses: store.responses, author: { id: 'A' } });
  const sessionB = createDraftSession({ scope, port: store.drafts, responses: store.responses, author: { id: 'B' } });
  const notices: string[] = [];
  const report = (notice: string) => { notices.push(notice); };
  async function displayed() {
    const delivery = await loadDraftReviewInputs({ status: 'ready', definition: workshop } as Parameters<typeof loadDraftReviewInputs>[0], {
      session: sessionA, site: { surfaceId: 's', routeId: 'review', slotId: 'widget' },
      localeDocuments: undefined, activeLocale: undefined, signal: new AbortController().signal,
    });
    if (delivery.status !== 'ready') throw Error(delivery.status);
    const group = delivery.warningGroups.find(g => g.code === 'WORKSHOP_NOT_ANSWERED')!;
    return { expectedRevision: delivery.revision, expectedBasis: group.basis!, code: group.code, definition: workshop, subject: undefined, report };
  }
  try {
    const leaseA = sessionA.acquire(key, input, report);
    const readyA = await leaseA.result;
    if (readyA.status !== 'ready') throw Error(readyA.status);
    readyA.engine.setValue('partner', 'Library');
    expect(await readyA.writer.flush(true)).toBe(true);
    leaseA.release();

    const first = await displayed();
    const leaseB = sessionB.acquire(key, input, () => {});
    const readyB = await leaseB.result;
    if (readyB.status !== 'ready') throw Error(readyB.status);
    readyB.engine.setValue('venue', 'Town Hall');
    expect(await readyB.writer.flush()).toBe(true);
    leaseB.release();

    expect(await sessionA.acknowledgeWarningGroup(first)).toBe('mismatch');
    expect(notices).toContain('draftConflict');

    const refreshed = await displayed();
    expect(refreshed.expectedRevision).not.toBe(first.expectedRevision);
    expect(refreshed.expectedBasis).not.toBe(first.expectedBasis);
    expect(await sessionA.acknowledgeWarningGroup(refreshed)).toBe('saved');
  } finally {
    sessionA.dispose();
    sessionB.dispose();
  }
});

it('rejects an additional firing when a due date arrives with a clean retained writer', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
  const dueDateDef = {
    $formspec: '1.0',
    url: 'urn:example:due-date',
    version: '1.0.0',
    status: 'active',
    title: 'Quarterly report',
    items: ['first', 'second', 'deadline'].map(key => ({ key, type: 'field', dataType: 'string', label: key })),
    shapes: ['first', 'second', 'deadline'].map(key => ({
      id: `${key}Blank`,
      target: key,
      severity: 'warning',
      timing: 'submit',
      code: 'UNANSWERED',
      explanation: 'acknowledge',
      constraint: key === 'deadline' ? 'day(today()) < 19 or present($)' : 'present($)',
      message: 'Unanswered',
    })),
  } as unknown as FormDefinition;
  const scope = 'due-date-basis-check';
  const key = { scope, definitionUrl: dueDateDef.url };
  const input = { plan: { definition: dueDateDef }, grant: {} } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
  const store = createMemoryFilingStore({ scope, definitions: new Map([[dueDateDef.url, dueDateDef]]) });
  const session = createDraftSession({ scope, port: store.drafts, author: { id: 'A' } });
  try {
    const lease = session.acquire(key, input, () => {});
    const opened = await lease.result;
    if (opened.status !== 'ready') throw Error(opened.status);
    expect(await opened.writer.flush(true)).toBe(true);
    expect(opened.engine.getExplanationState().groups[0]?.paths).toEqual(['first', 'second']);
    lease.release();

    const delivery = await loadDraftReviewInputs({ status: 'ready', definition: dueDateDef } as Parameters<typeof loadDraftReviewInputs>[0], {
      session, site: { surfaceId: 's', routeId: 'review', slotId: 'widget' },
      localeDocuments: undefined, activeLocale: undefined, signal: new AbortController().signal,
    });
    if (delivery.status !== 'ready') throw Error(delivery.status);
    const group = delivery.warningGroups[0]!;
    expect(group.buttonLabel).toBe('Accept 2 unanswered questions');

    vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
    const outcome = await session.acknowledgeWarningGroup({
      definition: dueDateDef,
      subject: undefined,
      expectedBasis: group.basis!,
      expectedRevision: delivery.revision,
      code: group.code,
      report() {},
    });
    const stored = await store.drafts.load(key, dueDateDef.version);
    if (stored.status !== 'loaded') throw Error(stored.status);
    const entries = JSON.parse(stored.draft.responseJson).explanations;
    expect(outcome).toBe('mismatch');
    expect(entries).toBeUndefined();
  } finally {
    session.dispose();
    vi.useRealTimers();
  }
});

it.each(['conflict', 'unavailable'] as const)(
  'keeps an independent edit made on an open form while a review save awaits %s',
  async (status) => {
    const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    const workshop = workshopJson as unknown as FormDefinition;
    const scope = `in-flight-${status}`;
    const key = { scope, definitionUrl: workshop.url };
    const input = { plan: { definition: workshop }, grant: {} } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
    const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
    let fail = false;
    let notify!: () => void;
    let resume!: () => void;
    const started = new Promise<void>(r => { notify = r; });
    const wait = new Promise<void>(r => { resume = r; });
    const port: DraftPort = {
      ...store.drafts,
      async save(saveInput) {
        if (!fail) return store.drafts.save(saveInput);
        notify();
        await wait;
        return { status };
      },
    };
    const session = createDraftSession({ scope, port, author: { id: 'A' } });
    try {
      const reopen = vi.fn();
      const lease = session.acquire(key, input, () => {}, reopen);
      const opened = await lease.result;
      if (opened.status !== 'ready') throw Error(opened.status);
      expect(await opened.writer.flush(true)).toBe(true);

      const delivery = await loadDraftReviewInputs(
        { status: 'ready', definition: workshop } as Parameters<typeof loadDraftReviewInputs>[0],
        { session, site: { surfaceId: 's', routeId: 'review', slotId: 'widget' }, signal: new AbortController().signal, localeDocuments: undefined, activeLocale: undefined },
      );
      if (delivery.status !== 'ready') throw Error(delivery.status);
      const group = delivery.warningGroups[0]!;

      fail = true;
      const saving = session.acknowledgeWarningGroup({
        definition: workshop,
        subject: undefined,
        expectedRevision: delivery.revision,
        expectedBasis: group.basis!,
        code: group.code,
        report: vi.fn(),
      });
      await started;
      opened.engine.setValue('partner', 'Typed as the save was pending');
      resume();
      expect(await saving).toBe(status === 'conflict' ? 'mismatch' : 'failed');
      expect(reopen).not.toHaveBeenCalled();

      const stored = await store.drafts.load(key, workshop.version);
      if (stored.status !== 'loaded') throw Error(stored.status);
      expect(JSON.parse(stored.draft.responseJson).explanations).toBeUndefined();
      lease.release();

      const reopened = session.acquire(key, input, () => {});
      const actual = await reopened.result;
      if (actual.status !== 'ready') throw Error(actual.status);
      expect(actual.engine.getDraftSnapshot().data.partner).toBe('Typed as the save was pending');
      expect(actual.writer.dirty).toBe(true);
      reopened.release();
    } finally {
      session.dispose();
    }
  },
);

it('preserves an answer typed after returning to the form during a delayed review save on both conflict and success', async () => {
  const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
  const workshop = workshopJson as unknown as FormDefinition;
  for (const competingCommit of [true, false]) {
    const scope = competingCommit ? 'back-during-save-conflict' : 'back-during-save-success';
    const key = { scope, definitionUrl: workshop.url };
    const input = { plan: { definition: workshop }, grant: {} } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
    const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
    let delay = false;
    let seen!: () => void;
    let finish!: () => void;
    const entered = new Promise<void>(resolve => { seen = resolve; });
    const pause = new Promise<void>(resolve => { finish = resolve; });
    const port: DraftPort = {
      ...store.drafts,
      async save(saveInput) {
        if (delay) {
          seen();
          await pause;
        }
        return store.drafts.save(saveInput);
      },
    };
    const sessionA = createDraftSession({ scope, port, author: { id: 'A' } });
    const sessionB = createDraftSession({ scope, port: store.drafts, author: { id: 'B' } });
    try {
      const initial = sessionA.acquire(key, input, () => {});
      const opened = await initial.result;
      if (opened.status !== 'ready') throw Error(opened.status);
      expect(await opened.writer.flush(true)).toBe(true);
      initial.release();

      const view = await loadDraftReviewInputs(
        { status: 'ready', definition: workshop } as Parameters<typeof loadDraftReviewInputs>[0],
        { session: sessionA, site: { surfaceId: 's', routeId: 'review', slotId: 'w' }, signal: new AbortController().signal, activeLocale: undefined, localeDocuments: undefined },
      );
      if (view.status !== 'ready') throw Error(view.status);
      const group = view.warningGroups[0]!;

      delay = true;
      const saving = sessionA.acknowledgeWarningGroup({
        definition: workshop,
        subject: undefined,
        expectedRevision: view.revision,
        expectedBasis: group.basis!,
        code: group.code,
        report: vi.fn(),
      });
      await entered;

      const reload = vi.fn();
      const back = sessionA.acquire(key, input, vi.fn(), reload);
      const editing = await back.result;
      if (editing.status !== 'ready') throw Error(editing.status);
      editing.engine.setValue('partner', 'User typed this while saving');

      if (competingCommit) {
        const elsewhere = sessionB.acquire(key, input, vi.fn());
        const other = await elsewhere.result;
        if (other.status !== 'ready') throw Error(other.status);
        other.engine.setValue('venue', 'Library');
        expect(await other.writer.flush()).toBe(true);
        elsewhere.release();
      }

      finish();
      expect(await saving).toBe(competingCommit ? 'mismatch' : 'saved');
      expect(reload).not.toHaveBeenCalled();

      const stored = await store.drafts.load(key, workshop.version);
      if (stored.status !== 'loaded') throw Error(stored.status);
      const saved = JSON.parse(stored.draft.responseJson);
      expect(saved.data.partner).toBeUndefined();
      if (competingCommit) {
        expect(saved.data.venue).toBe('Library');
        expect(saved.explanations).toBeUndefined();
      } else {
        expect(saved.explanations?.[0]?.paths).toEqual(['outcome', 'partner', 'topic', 'venue']);
      }
      expect(editing.engine.getDraftSnapshot().data.partner).toBe('User typed this while saving');
      expect(editing.writer.dirty).toBe(true);
      back.release();

      const after = sessionA.acquire(key, input, vi.fn());
      const active = await after.result;
      if (active.status !== 'ready') throw Error(active.status);
      expect(active.engine.getDraftSnapshot().data.partner).toBe('User typed this while saving');
      after.release();
    } finally {
      sessionA.dispose();
      sessionB.dispose();
    }
  }
});

it.each(['answer', 'explanation'] as const)(
  'reconciles the committed review revision and stamps onto a dirty live writer (%s) through the next explicit Save',
  async (kind) => {
    const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    const workshop = workshopJson as unknown as FormDefinition;
    const scope = `review-reconcile-${kind}`;
    const key = { scope, definitionUrl: workshop.url };
    const input = { plan: { definition: workshop }, grant: {} } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
    const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
    const saving = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    let delay = false;
    const save = vi.fn<DraftPort['save']>(async (saveInput) => {
      if (delay) {
        delay = false;
        saving.resolve();
        await finish.promise;
      }
      return store.drafts.save(saveInput);
    });
    const session = createDraftSession({ scope, port: { ...store.drafts, save }, author: { id: 'Filer' } });
    const reopen = vi.fn();
    const lease = session.acquire(key, input, vi.fn(), reopen);
    try {
      const live = await lease.result;
      if (live.status !== 'ready') throw Error(live.status);
      live.engine.setValue('attendance', 150);
      expect(await live.writer.flush(true)).toBe(true);

      const review = await loadDraftReviewInputs(
        { status: 'ready', definition: workshop } as Parameters<typeof loadDraftReviewInputs>[0],
        { session, site: { surfaceId: 's', routeId: 'review', slotId: 'w' }, signal: new AbortController().signal, activeLocale: undefined, localeDocuments: undefined },
      );
      if (review.status !== 'ready') throw Error(review.status);
      const group = review.warningGroups[0]!;

      delay = true;
      save.mockClear();
      const pending = session.acknowledgeWarningGroup({
        definition: workshop,
        subject: undefined,
        code: group.code,
        expectedRevision: review.revision,
        expectedBasis: group.basis!,
      });
      await saving.promise;

      if (kind === 'answer') {
        live.engine.setValue('attendance', 151);
      } else {
        live.engine.setExplanation('largeEvent', 'attendance', { text: 'Two events combined' });
      }
      finish.resolve();
      expect(await pending).toBe('saved');

      const storedAfterReview = await store.drafts.load(key, workshop.version);
      if (storedAfterReview.status !== 'loaded') throw Error(storedAfterReview.status);
      const baselineResp = JSON.parse(storedAfterReview.draft.responseJson);
      expect(baselineResp.data.attendance).toBe(150);
      expect(baselineResp.explanations.map((x: any) => x.code)).toEqual(['WORKSHOP_NOT_ANSWERED']);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0]![0].expectedRevision).toBe(review.revision);
      expect(live.writer.dirty).toBe(true);
      expect(reopen).not.toHaveBeenCalled();
      expect(live.writer.revision).toBe(storedAfterReview.draft.revision);
      expect(live.engine.getExplanationEntries()).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'WORKSHOP_NOT_ANSWERED', author: { id: 'Filer' }, recorded: expect.any(String) }),
      ]));

      expect(await live.writer.flush()).toBe(true);
      expect(live.writer.conflict).toBe(false);
      expect(live.writer.dirty).toBe(false);

      const storedAfterFlush = await store.drafts.load(key, workshop.version);
      if (storedAfterFlush.status !== 'loaded') throw Error(storedAfterFlush.status);
      const afterResp = JSON.parse(storedAfterFlush.draft.responseJson);
      expect(afterResp.explanations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'WORKSHOP_NOT_ANSWERED',
          author: baselineResp.explanations[0].author,
          recorded: baselineResp.explanations[0].recorded,
        }),
      ]));
      if (kind === 'answer') {
        expect(afterResp.data.attendance).toBe(151);
      } else {
        expect(afterResp.explanations).toEqual(expect.arrayContaining([
          expect.objectContaining({ text: 'Two events combined' }),
        ]));
      }
    } finally {
      lease.release();
      session.dispose();
    }
  },
);

it('a form whose old revision load resolves after a review commit opens at the acknowledged revision', async () => {
  const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
  const workshop = workshopJson as unknown as FormDefinition;
  const scope = 'review-open-underway';
  const key = { scope, definitionUrl: workshop.url };
  const input = { plan: { definition: workshop }, grant: {} } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
  const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
  const saving = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const loading = Promise.withResolvers<void>();
  const finishLoad = Promise.withResolvers<void>();
  let delaySave = false;
  let delayLoad = false;
  const port: DraftPort = {
    ...store.drafts,
    async save(saveInput) {
      if (delaySave) {
        delaySave = false;
        saving.resolve();
        await finish.promise;
      }
      return store.drafts.save(saveInput);
    },
    async load(...args) {
      const draft = await store.drafts.load(...args);
      if (delayLoad) {
        delayLoad = false;
        loading.resolve();
        await finishLoad.promise;
      }
      return draft;
    },
  };
  const session = createDraftSession({ scope, port, author: { id: 'Filer' } });
  try {
    const initial = session.acquire(key, input, vi.fn());
    const opened0 = await initial.result;
    if (opened0.status !== 'ready') throw Error(opened0.status);
    opened0.engine.setValue('attendance', 150);
    expect(await opened0.writer.flush(true)).toBe(true);
    initial.release();

    const review = await loadDraftReviewInputs(
      { status: 'ready', definition: workshop } as Parameters<typeof loadDraftReviewInputs>[0],
      { session, site: { surfaceId: 's', routeId: 'review', slotId: 'w' }, signal: new AbortController().signal, activeLocale: undefined, localeDocuments: undefined },
    );
    if (review.status !== 'ready') throw Error(review.status);
    const group = review.warningGroups[0]!;

    delaySave = true;
    const pending = session.acknowledgeWarningGroup({
      definition: workshop,
      subject: undefined,
      code: group.code,
      expectedRevision: review.revision,
      expectedBasis: group.basis!,
    });
    await saving.promise;

    delayLoad = true;
    const refresh = vi.fn();
    const back = session.acquire(key, input, vi.fn(), refresh);
    await loading.promise;

    finish.resolve();
    expect(await pending).toBe('saved');

    finishLoad.resolve();
    const opened = await back.result;
    if (opened.status !== 'ready') throw Error(opened.status);
    const stored = await store.drafts.load(key, workshop.version);
    if (stored.status !== 'loaded') throw Error(stored.status);
    expect(opened.writer.revision).toBe(stored.draft.revision);
    expect(opened.engine.getExplanationEntries()).toEqual(JSON.parse(stored.draft.responseJson).explanations);
    back.release();
  } finally {
    finishLoad.resolve();
    session.dispose();
  }
});

it('retains the recorded displayedLocale of the reviewed response on an acknowledgement-only save', async () => {
  const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
  const workshop = workshopJson as unknown as FormDefinition;
  const scope = 'review-locale-preserved';
  const key = { scope, definitionUrl: workshop.url };
  const input = { plan: { definition: workshop }, grant: {} } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
  const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
  const save = vi.fn<DraftPort['save']>(saveInput => store.drafts.save(saveInput));
  const session = createDraftSession({ scope, port: { ...store.drafts, save }, author: { id: 'Filer' } });
  const lease = session.acquire(key, input, vi.fn());
  try {
    const live = await lease.result;
    if (live.status !== 'ready') throw Error(live.status);
    const locale = {
      $formspecLocale: '2.1',
      locale: 'fr',
      version: '1.2.3',
      url: 'urn:example:review-fr',
      target: { kind: 'definition', url: workshop.url },
      strings: { 'venue.label': 'Lieu' },
    } as any;
    live.engine.loadLocale(locale);
    live.engine.setLocale('fr');
    live.engine.setValue('attendance', 150);
    expect(await live.writer.flush(true)).toBe(true);

    const before = await store.drafts.load(key, workshop.version);
    if (before.status !== 'loaded') throw Error(before.status);
    const displayPin = JSON.parse(before.draft.responseJson).displayedLocale;
    expect(displayPin).toMatchObject({ url: 'urn:example:review-fr', locale: 'fr', version: '1.2.3' });

    const review = await loadDraftReviewInputs(
      { status: 'ready', definition: workshop } as Parameters<typeof loadDraftReviewInputs>[0],
      { session, site: { surfaceId: 's', routeId: 'review', slotId: 'w' }, signal: new AbortController().signal, activeLocale: 'fr', localeDocuments: [locale] },
    );
    if (review.status !== 'ready') throw Error(review.status);
    expect(review.warningGroups[0]!.items.find(i => i.path === 'venue')?.label).toBe('Lieu');

    save.mockClear();
    expect(await session.acknowledgeWarningGroup({
      definition: workshop,
      subject: undefined,
      code: review.warningGroups[0]!.code,
      expectedRevision: review.revision,
      expectedBasis: review.warningGroups[0]!.basis!,
    })).toBe('saved');

    const after = await store.drafts.load(key, workshop.version);
    if (after.status !== 'loaded') throw Error(after.status);
    expect(JSON.parse(save.mock.calls[0]![0].responseJson).displayedLocale).toEqual(displayPin);
    expect(JSON.parse(after.draft.responseJson).displayedLocale).toEqual(displayPin);
  } finally {
    lease.release();
    session.dispose();
  }
});

it.each(['remove', 'update'] as const)(
  'concurrent %s of a previously stamped instance explanation survives review and next Save',
  async (op) => {
    const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    const workshop = workshopJson as unknown as FormDefinition;
    const scope = `review6-instance-${op}`;
    const key = { scope, definitionUrl: workshop.url };
    const input = { plan: { definition: workshop }, grant: {} } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
    const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
    const delivered = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    let holdAfterCommit = false;
    const save = vi.fn<DraftPort['save']>(async (saveInput) => {
      const result = await store.drafts.save(saveInput);
      if (holdAfterCommit) {
        holdAfterCommit = false;
        delivered.resolve();
        await finish.promise;
      }
      return result;
    });
    const session = createDraftSession({ scope, port: { ...store.drafts, save }, author: { id: 'Reviewer' } });
    const lease = session.acquire(key, input, vi.fn());
    try {
      const live = await lease.result;
      if (live.status !== 'ready') throw Error(live.status);
      live.engine.setValue('attendance', 150);
      live.engine.setExplanation('largeEvent', 'attendance', { text: 'Original' });
      expect(await live.writer.flush(true)).toBe(true);

      const view = await loadDraftReviewInputs(
        { status: 'ready', definition: workshop } as Parameters<typeof loadDraftReviewInputs>[0],
        { session, site: { surfaceId: 's', routeId: 'r', slotId: 'w' }, signal: new AbortController().signal, activeLocale: undefined, localeDocuments: undefined },
      );
      if (view.status !== 'ready') throw Error(view.status);
      const group = view.warningGroups[0]!;

      holdAfterCommit = true;
      const pending = session.acknowledgeWarningGroup({
        definition: workshop, subject: undefined, code: group.code, expectedRevision: view.revision, expectedBasis: group.basis!,
      });
      await delivered.promise;

      if (op === 'remove') live.engine.removeExplanation({ shapeId: 'largeEvent', path: 'attendance' });
      else live.engine.setExplanation('largeEvent', 'attendance', { text: 'Replacement' });
      expect(live.writer.dirty).toBe(true);

      finish.resolve();
      expect(await pending).toBe('saved');
      const intermediate = await store.drafts.load(key, workshop.version);
      if (intermediate.status !== 'loaded') throw Error(intermediate.status);
      expect(live.writer.revision).toBe(intermediate.draft.revision);
      expect(await live.writer.flush()).toBe(true);

      const after = await store.drafts.load(key, workshop.version);
      if (after.status !== 'loaded') throw Error(after.status);
      const explanations = JSON.parse(after.draft.responseJson).explanations;
      expect(explanations.filter((x: any) => x.group)).toHaveLength(1);
      expect(explanations.filter((x: any) => !x.group).map((x: any) => x.text)).toEqual(op === 'remove' ? [] : ['Replacement']);
    } finally {
      finish.resolve();
      lease.release();
      session.dispose();
    }
  },
);

it('re-accepting a stale group updates unchanged live group when an unrelated answer is typed', async () => {
  const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
  const workshop = workshopJson as unknown as FormDefinition;
  const scope = 'review6-reaccept';
  const key = { scope, definitionUrl: workshop.url };
  const input = { plan: { definition: workshop }, grant: {} } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
  const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
  const delivered = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  let holdAfterCommit = false;
  const save = vi.fn<DraftPort['save']>(async (saveInput) => {
    const result = await store.drafts.save(saveInput);
    if (holdAfterCommit) {
      holdAfterCommit = false;
      delivered.resolve();
      await finish.promise;
    }
    return result;
  });
  const session = createDraftSession({ scope, port: { ...store.drafts, save }, author: { id: 'Reviewer' } });
  const lease = session.acquire(key, input, vi.fn());
  try {
    const live = await lease.result;
    if (live.status !== 'ready') throw Error(live.status);
    live.engine.setValue('attendance', 150);
    live.engine.acknowledge('WORKSHOP_NOT_ANSWERED');
    expect(await live.writer.flush(true)).toBe(true);
    live.engine.setValue('topic', 'Local history');
    expect(await live.writer.flush()).toBe(true);

    const view = await loadDraftReviewInputs(
      { status: 'ready', definition: workshop } as Parameters<typeof loadDraftReviewInputs>[0],
      { session, site: { surfaceId: 's', routeId: 'r', slotId: 'w' }, signal: new AbortController().signal, activeLocale: undefined, localeDocuments: undefined },
    );
    if (view.status !== 'ready') throw Error(view.status);
    const group = view.warningGroups[0]!;

    holdAfterCommit = true;
    const pending = session.acknowledgeWarningGroup({
      definition: workshop, subject: undefined, code: group.code, expectedRevision: view.revision, expectedBasis: group.basis!,
    });
    await delivered.promise;

    const committed = await store.drafts.load(key, workshop.version);
    if (committed.status !== 'loaded') throw Error(committed.status);
    const committedExplanations = JSON.parse(committed.draft.responseJson).explanations;
    expect(committedExplanations[0].paths).toEqual(['outcome', 'partner', 'venue']);

    live.engine.setValue('attendance', 151);
    finish.resolve();
    expect(await pending).toBe('saved');
    expect(live.writer.dirty).toBe(true);
    expect(await live.writer.flush()).toBe(true);

    const after = await store.drafts.load(key, workshop.version);
    if (after.status !== 'loaded') throw Error(after.status);
    const afterResp = JSON.parse(after.draft.responseJson);
    expect(afterResp.data.attendance).toBe(151);
    expect(afterResp.explanations).toEqual(committedExplanations);
  } finally {
    finish.resolve();
    lease.release();
    session.dispose();
  }
});

it('durable port returning revision-only still retains recorded acknowledgement through next explicit Save', async () => {
  const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
  const workshop = workshopJson as unknown as FormDefinition;
  const scope = 'review6-revision-only';
  const key = { scope, definitionUrl: workshop.url };
  const input = { plan: { definition: workshop }, grant: {} } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
  const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let pause = false;
  const save: DraftPort['save'] = async (saveInput) => {
    if (pause) {
      pause = false;
      entered.resolve();
      await release.promise;
    }
    const result = await store.drafts.save(saveInput);
    return result.status === 'saved' ? { status: 'saved', revision: result.revision } : result;
  };
  const session = createDraftSession({ scope, port: { ...store.drafts, save }, author: { id: 'Filer' } });
  const lease = session.acquire(key, input, vi.fn());
  try {
    const live = await lease.result;
    if (live.status !== 'ready') throw Error(live.status);
    live.engine.setValue('attendance', 150);
    expect(await live.writer.flush(true)).toBe(true);
    const group = live.engine.getExplanationState().groups[0]!;

    pause = true;
    const pending = session.acknowledgeWarningGroup({
      definition: workshop, subject: undefined, code: group.code, expectedRevision: live.writer.revision!, expectedBasis: group.basis!,
    });
    await entered.promise;
    live.engine.setValue('attendance', 151);
    release.resolve();
    expect(await pending).toBe('saved');

    const before = await store.drafts.load(key, workshop.version);
    if (before.status !== 'loaded') throw Error(before.status);
    const acknowledged = JSON.parse(before.draft.responseJson).explanations;
    expect(acknowledged).toHaveLength(1);
    expect(live.writer.dirty).toBe(true);
    expect(await live.writer.flush()).toBe(true);

    const after = await store.drafts.load(key, workshop.version);
    if (after.status !== 'loaded') throw Error(after.status);
    const resp = JSON.parse(after.draft.responseJson);
    expect(resp.data.attendance).toBe(151);
    expect(resp.explanations).toEqual(acknowledged);
  } finally {
    release.resolve();
    lease.release();
    session.dispose();
  }
});

it.each(['explicit', 'autosave'] as const)(
  'an %s save during delivery of a committed review queues cleanly without spurious conflict',
  async (path) => {
    const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    const workshop = workshopJson as unknown as FormDefinition;
    const scope = `review6-slow-${path}`;
    const key = { scope, definitionUrl: workshop.url };
    const input: any = {
      plan: { definition: workshop },
      grant: {},
      ...(path === 'autosave'
        ? {
          responseActionsDocument: {
            $formspecResponseActions: '1.0',
            version: '1.0.0',
            scope: 'response',
            targetDefinition: { url: workshop.url },
            actions: [{ id: 'automatic', intent: 'autosave', label: { literal: 'Autosave' }, effects: [{ type: 'hostEvent', eventName: 'draft-saved' }] }],
          },
        }
        : {}),
    };
    const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
    const delivered = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    const competingResult = Promise.withResolvers<string>();
    let holdAfterCommit = false;
    let observeCompeting = false;
    const save = vi.fn<DraftPort['save']>(async (saveInput) => {
      const result = await store.drafts.save(saveInput);
      if (holdAfterCommit) {
        holdAfterCommit = false;
        observeCompeting = true;
        delivered.resolve();
        await finish.promise;
      } else if (observeCompeting) {
        competingResult.resolve(result.status);
      }
      return result;
    });
    const session = createDraftSession({ scope, port: { ...store.drafts, save }, author: { id: 'Reviewer' } });
    const lease = session.acquire(key, input, vi.fn());
    try {
      const live = await lease.result;
      if (live.status !== 'ready') throw Error(live.status);
      live.engine.setValue('attendance', 150);
      expect(await live.writer.flush(true)).toBe(true);

      const view = await loadDraftReviewInputs(
        { status: 'ready', definition: workshop } as Parameters<typeof loadDraftReviewInputs>[0],
        { session, site: { surfaceId: 's', routeId: 'r', slotId: 'w' }, signal: new AbortController().signal, activeLocale: undefined, localeDocuments: undefined },
      );
      if (view.status !== 'ready') throw Error(view.status);
      const group = view.warningGroups[0]!;

      holdAfterCommit = true;
      const pending = session.acknowledgeWarningGroup({
        definition: workshop, subject: undefined, code: group.code, expectedRevision: view.revision, expectedBasis: group.basis!,
      });
      await delivered.promise;

      const committed = await store.drafts.load(key, workshop.version);
      if (committed.status !== 'loaded') throw Error(committed.status);
      const committedExplanations = JSON.parse(committed.draft.responseJson).explanations;

      live.engine.setValue('attendance', 151);
      const flush = path === 'explicit' ? live.writer.flush() : undefined;
      const competing = await Promise.race([
        competingResult.promise,
        new Promise<string>(resolve => setTimeout(() => resolve('queued'), 600)),
      ]);
      expect(competing).toBe('queued');

      finish.resolve();
      expect(await pending).toBe('saved');
      if (flush) expect(await flush).toBe(true);
      expect(await live.writer.flush()).toBe(true);
      expect(live.writer.conflict).toBe(false);

      const after = await store.drafts.load(key, workshop.version);
      if (after.status !== 'loaded') throw Error(after.status);
      const afterResp = JSON.parse(after.draft.responseJson);
      expect(afterResp.data.attendance).toBe(151);
      expect(afterResp.explanations).toEqual(committedExplanations);
    } finally {
      finish.resolve();
      lease.release();
      session.dispose();
    }
  },
);

it('publishes the latest open or calls reopen across all load/commit microtask orderings (lead=0..9)', async () => {
  const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
  const workshop = workshopJson as unknown as FormDefinition;
  for (const lead of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const scope = `review6-pub-${lead}`;
    const key = { scope, definitionUrl: workshop.url };
    const input = { plan: { definition: workshop }, grant: {} } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
    const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
    const atSave = Promise.withResolvers<void>();
    const doCommit = Promise.withResolvers<void>();
    const durable = Promise.withResolvers<void>();
    const deliverSave = Promise.withResolvers<void>();
    const atLoad = Promise.withResolvers<void>();
    const deliverLoad = Promise.withResolvers<void>();
    let delaySave = false;
    let delayLoad = false;
    const port: DraftPort = {
      ...store.drafts,
      async save(saveInput) {
        if (!delaySave) return store.drafts.save(saveInput);
        delaySave = false;
        atSave.resolve();
        await doCommit.promise;
        const result = await store.drafts.save(saveInput);
        durable.resolve();
        await deliverSave.promise;
        return result;
      },
      async load(...args) {
        const draft = await store.drafts.load(...args);
        if (delayLoad) {
          delayLoad = false;
          atLoad.resolve();
          await deliverLoad.promise;
        }
        return draft;
      },
    };
    const session = createDraftSession({ scope, port, author: { id: 'Filer' } });
    try {
      const lease = session.acquire(key, input, vi.fn());
      const initial = await lease.result;
      if (initial.status !== 'ready') throw Error(initial.status);
      initial.engine.setValue('attendance', 150);
      expect(await initial.writer.flush(true)).toBe(true);
      lease.release();

      const review = await loadDraftReviewInputs(
        { status: 'ready', definition: workshop } as Parameters<typeof loadDraftReviewInputs>[0],
        { session, site: { surfaceId: 's', routeId: 'review', slotId: 'w' }, signal: new AbortController().signal, activeLocale: undefined, localeDocuments: undefined },
      );
      if (review.status !== 'ready') throw Error(review.status);
      const group = review.warningGroups[0]!;

      delaySave = true;
      const pending = session.acknowledgeWarningGroup({
        definition: workshop, subject: undefined, code: group.code, expectedRevision: review.revision, expectedBasis: group.basis!,
      });
      await atSave.promise;

      delayLoad = true;
      const reopen = vi.fn();
      const back = session.acquire(key, input, vi.fn(), reopen);
      await atLoad.promise;
      doCommit.resolve();
      await durable.promise;
      deliverLoad.resolve();
      for (let i = 0; i < lead; i++) await Promise.resolve();
      deliverSave.resolve();

      const [reviewStatus, live] = await Promise.all([pending, back.result]);
      expect(reviewStatus).toBe('saved');
      if (live.status !== 'ready') throw Error(live.status);
      const disk = await store.drafts.load(key, workshop.version);
      if (disk.status !== 'loaded') throw Error(disk.status);
      expect(live.writer.revision === disk.draft.revision || reopen.mock.calls.length > 0, `lead=${lead}`).toBe(true);
      back.release();
    } finally {
      doCommit.resolve();
      deliverLoad.resolve();
      deliverSave.resolve();
      session.dispose();
    }
  }
});

it.each(['explicit', 'autosave'] as const)(
  '%s Save started while review reads storage preserves both the review and the newer answer',
  async (path) => {
    const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    const workshop = workshopJson as unknown as FormDefinition;
    const key = { scope: `review7-ordering-${path}`, definitionUrl: workshop.url };
    const store = createMemoryFilingStore({ scope: key.scope, definitions: new Map([[workshop.url, workshop]]) });
    const loadRead = Promise.withResolvers<void>();
    const deliverLoad = Promise.withResolvers<void>();
    const localEntered = Promise.withResolvers<void>();
    const runLocal = Promise.withResolvers<void>();
    const localReplied = Promise.withResolvers<void>();
    const reviewCommitted = Promise.withResolvers<void>();
    const deliverReview = Promise.withResolvers<void>();
    const gates = { holdReviewRead: false, observe: false, localStarted: false };
    const port: DraftPort = {
      ...store.drafts,
      async load(...args) {
        const result = await store.drafts.load(...args);
        if (gates.holdReviewRead) {
          gates.holdReviewRead = false;
          loadRead.resolve();
          await deliverLoad.promise;
        }
        return result;
      },
      async save(saveInput) {
        if (!gates.observe) return store.drafts.save(saveInput);
        if (JSON.parse(saveInput.snapshotJson).data.attendance === 151) {
          gates.localStarted = true;
          localEntered.resolve();
          await runLocal.promise;
          const result = await store.drafts.save(saveInput);
          localReplied.resolve();
          return result;
        }
        const result = await store.drafts.save(saveInput);
        reviewCommitted.resolve();
        await deliverReview.promise;
        return result;
      },
    };
    const actionsDoc: any = {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      scope: 'response',
      targetDefinition: { url: workshop.url },
      actions: [
        { id: 'save', intent: 'save-draft', label: { literal: 'Save' }, effects: [{ type: 'hostEvent', eventName: 'draft-saved' }] },
        ...(path === 'autosave' ? [{ id: 'auto', intent: 'autosave' as const, label: { literal: 'Autosave' }, effects: [{ type: 'hostEvent', eventName: 'draft-saved' }] }] : []),
      ],
    };
    const session = createDraftSession({ scope: key.scope, port, author: { id: 'Filer' } });
    const input = { plan: { definition: workshop }, grant: {}, responseActionsDocument: actionsDoc } as Parameters<typeof session.acquire>[1];
    const lease = session.acquire(key, input, vi.fn(), vi.fn());
    try {
      const live = await lease.result;
      if (live.status !== 'ready') throw Error(live.status);
      live.engine.setValue('attendance', 150);
      expect(await live.writer.flush(true)).toBe(true);
      const group = live.engine.getExplanationState().groups[0]!;
      gates.holdReviewRead = true;
      gates.observe = true;
      const review = session.acknowledgeWarningGroup({
        definition: workshop, subject: undefined, code: group.code, expectedRevision: live.writer.revision!, expectedBasis: group.basis,
      });
      await loadRead.promise;
      live.engine.setValue('attendance', 151);
      const save = path === 'explicit'
        ? live.writer.invoke({ document: actionsDoc, actionRef: 'save', ports: { submit: live.writer.captureActionResponse, dispatchHostEvent: () => {} } })
        : undefined;
      await Promise.race([localEntered.promise, new Promise<void>(r => setTimeout(r, path === 'autosave' ? 550 : 80))]);
      deliverLoad.resolve();
      await reviewCommitted.promise;
      runLocal.resolve();
      if (gates.localStarted) await localReplied.promise;
      deliverReview.resolve();
      expect(await review).toBe('saved');
      if (save) await save;
      await live.writer.waitForSaves();
      const retry = await live.writer.flush();
      const conflict = live.writer.conflict;
      const read = await store.drafts.load(key, workshop.version);
      if (read.status !== 'loaded') throw Error(read.status);
      const saved = JSON.parse(read.draft.responseJson);
      expect(saved.data.attendance).toBe(151);
      expect(saved.explanations?.filter((e: any) => e.group).length ?? 0).toBe(1);
      expect(conflict).toBe(false);
      expect(retry).toBe(true);
    } finally {
      deliverLoad.resolve();
      runLocal.resolve();
      deliverReview.resolve();
      lease.release();
      session.dispose();
    }
  },
);

it.each(['unavailable', 'throws', 'normal'] as const)(
  'preserves acknowledgement after revision-only review commit and %s readback across retries',
  async (mode) => {
    const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    const workshop = workshopJson as unknown as FormDefinition;
    const scope = `review7-readback-${mode}`;
    const key = { scope, definitionUrl: workshop.url };
    const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
    const atSave = Promise.withResolvers<void>();
    const deliver = Promise.withResolvers<void>();
    let pause = false;
    let fault = false;
    const port: DraftPort = {
      ...store.drafts,
      async save(saveInput) {
        const res = await store.drafts.save(saveInput);
        if (pause) {
          pause = false;
          atSave.resolve();
          await deliver.promise;
          fault = true;
        }
        return res.status === 'saved' ? { status: 'saved', revision: res.revision } : res;
      },
      async load(...args) {
        if (fault) {
          fault = false;
          if (mode === 'unavailable') return { status: 'unavailable' };
          if (mode === 'throws') throw new Error('network unavailable');
        }
        return store.drafts.load(...args);
      },
    };
    const session = createDraftSession({ scope, port, author: { id: 'Filer' } });
    const lease = session.acquire(key, { plan: { definition: workshop }, grant: {} } as any, vi.fn());
    try {
      const live = await lease.result;
      if (live.status !== 'ready') throw Error(live.status);
      live.engine.setValue('attendance', 150);
      expect(await live.writer.flush(true)).toBe(true);
      const group = live.engine.getExplanationState().groups[0]!;
      pause = true;
      const review = session.acknowledgeWarningGroup({
        definition: workshop, subject: undefined, code: group.code, expectedRevision: live.writer.revision!, expectedBasis: group.basis!,
      });
      await atSave.promise;
      live.engine.setValue('attendance', 151);
      deliver.resolve();
      expect(await review).toBe('saved');

      const committed = await store.drafts.load(key, workshop.version);
      if (committed.status !== 'loaded') throw Error(committed.status);
      const acknowledged = JSON.parse(committed.draft.responseJson).explanations;
      expect(acknowledged).toHaveLength(1);

      expect(await live.writer.flush()).toBe(true);
      expect(live.writer.conflict).toBe(false);
      const reread = await store.drafts.load(key, workshop.version);
      if (reread.status !== 'loaded') throw Error(reread.status);
      const persisted = JSON.parse(reread.draft.responseJson);
      expect(persisted.data.attendance).toBe(151);
      expect(persisted.explanations).toEqual(acknowledged);
    } finally {
      deliver.resolve();
      lease.release();
      session.dispose();
    }
  },
);

it('overlapping review saves serialize so a later conflict does not release a dirty local writer early', async () => {
  const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
  const workshop = workshopJson as unknown as FormDefinition;
  const scope = 'review7-overlapping';
  const key = { scope, definitionUrl: workshop.url };
  const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
  const atFirst = Promise.withResolvers<void>();
  const atSecond = Promise.withResolvers<void>();
  const finishFirst = Promise.withResolvers<void>();
  const allowSecond = Promise.withResolvers<void>();
  let reviews = 0;
  let tracking = false;
  const port: DraftPort = {
    ...store.drafts,
    async save(saveInput) {
      if (!tracking || !saveInput.explanations?.some(e => 'group' in e)) return store.drafts.save(saveInput);
      reviews++;
      if (reviews === 1) {
        atFirst.resolve();
        await atSecond.promise;
        const reply = await store.drafts.save(saveInput);
        allowSecond.resolve();
        await finishFirst.promise;
        return reply;
      }
      atSecond.resolve();
      await allowSecond.promise;
      return store.drafts.save(saveInput);
    },
  };
  const session = createDraftSession({ scope, port, author: { id: 'Filer' } });
  const lease = session.acquire(key, { plan: { definition: workshop }, grant: {} } as any, vi.fn());
  try {
    const live = await lease.result;
    if (live.status !== 'ready') throw Error(live.status);
    live.engine.setValue('attendance', 150);
    expect(await live.writer.flush(true)).toBe(true);
    const g = live.engine.getExplanationState().groups[0]!;
    const args = { definition: workshop, subject: undefined, expectedRevision: live.writer.revision!, code: g.code, expectedBasis: g.basis! };
    tracking = true;
    const a = session.acknowledgeWarningGroup(args);
    const b = session.acknowledgeWarningGroup(args);
    await atFirst.promise;
    const bothEntered = await Promise.race([
      atSecond.promise.then(() => true),
      new Promise<boolean>(ok => setTimeout(() => ok(false), 100)),
    ]);
    if (!bothEntered) atSecond.resolve();
    await allowSecond.promise;
    if (bothEntered) await b;
    live.engine.setValue('attendance', 151);
    const flush = live.writer.flush();
    const premature = await Promise.race([
      flush.then(v => String(v)),
      new Promise<string>(ok => setTimeout(() => ok('queued'), 150)),
    ]);
    expect(premature).toBe('queued');
    finishFirst.resolve();
    const [winner, loser, saved] = await Promise.all([a, b, flush]);
    expect(winner).toBe('saved');
    expect(loser).toBe('mismatch');
    expect(saved).toBe(true);
    expect(live.writer.conflict).toBe(false);
    const reread = await store.drafts.load(key, workshop.version);
    if (reread.status !== 'loaded') throw Error(reread.status);
    const response = JSON.parse(reread.draft.responseJson);
    expect(response.data.attendance).toBe(151);
    expect(response.explanations).toHaveLength(1);
  } finally {
    atSecond.resolve();
    finishFirst.resolve();
    lease.release();
    session.dispose();
  }
});

it.each([true, false])('Wizard completes after DraftWriter persists acknowledgement with echo=%s', async (echo) => {
  const { FormspecForm } = await import('@formspec-org/react');
  const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
  const workshop = workshopJson as any;
  const key = { scope: `review7-writer-echo-${echo}`, definitionUrl: workshop.url };
  const store = createMemoryFilingStore({ scope: key.scope, definitions: new Map([[workshop.url, workshop]]) });
  const save = vi.fn(async (saveInput: Parameters<typeof store.drafts.save>[0]) => {
    const result = await store.drafts.save(saveInput);
    return echo || result.status !== 'saved' ? result : { status: 'saved' as const, revision: result.revision };
  });
  const autosaveDoc = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    scope: 'response',
    targetDefinition: { url: workshop.url },
    actions: [{ id: 'auto', intent: 'autosave', label: { literal: 'Save draft' }, validation: { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' }, effects: [{ type: 'hostEvent', eventName: 'draft-saved' }] }],
  } as any;
  const component = {
    $formspecComponent: '1.0',
    version: '1.0.0',
    targetDefinition: { url: workshop.url },
    tree: {
      component: 'Wizard',
      children: [
        { component: 'Section', id: 'details', title: 'Details', children: [{ component: 'TextInput', bind: 'venue' }] },
        { component: 'Section', id: 'review', title: 'Review', children: [{ component: 'NumberInput', bind: 'attendance' }] },
      ],
    },
  } as any;
  const session = createDraftSession({ scope: key.scope, port: { ...store.drafts, save }, author: { id: 'Respondent' } });
  const lease = session.acquire(key, { plan: { definition: workshop }, grant: {}, responseActionsDocument: autosaveDoc, componentDocument: component } as any, vi.fn());
  try {
    const live = await lease.result;
    if (live.status !== 'ready') throw Error(live.status);
    live.engine.setValue('attendance', 0);
    expect(await live.writer.flush(true)).toBe(true);
    const onSubmit = vi.fn();
    const invoker = vi.fn((inv: any) => live.writer.invoke(inv));
    const el = render(
      <FormspecForm
        definition={workshop}
        engine={live.engine}
        componentDocument={component}
        responseActionsDocument={autosaveDoc}
        responseActionInvoker={invoker}
        onSubmit={onSubmit}
      />,
    );
    const button = (selector: string) => el.querySelector<HTMLButtonElement>(selector)!;
    const submit = async () => act(async () => {
      button('.formspec-wizard-submit').click();
      await live.writer.waitForSaves();
      await new Promise<void>(resolve => setTimeout(resolve, 5));
    });
    act(() => button('.formspec-wizard-next').click());
    await submit();
    act(() => [...el.querySelectorAll('button')].find(b => b.textContent?.startsWith('Accept '))!.click());
    await submit();
    const disk = await store.drafts.load(key, workshop.version);
    if (disk.status !== 'loaded') throw Error(disk.status);
    const response = JSON.parse(disk.draft.responseJson);
    expect(response.explanations[0].author.id).toBe('Respondent');
    expect(live.engine.getExplanationState().pendingStamps).toBe(false);
    expect(onSubmit.mock.calls.at(-1)?.[0]?.response?.status).toBe('completed');
  } finally {
    lease.release();
    session.dispose();
  }
});

it('retries deferred stamp readback across multiple transient load failures without overwriting or conflicting', async () => {
  const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
  const workshop = workshopJson as unknown as FormDefinition;
  const scope = 'review7-multi-retry-readback';
  const key = { scope, definitionUrl: workshop.url };
  const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
  let remainingLoadFaults = 0;
  const save = vi.fn<DraftPort['save']>(async (saveInput) => {
    const result = await store.drafts.save(saveInput);
    return result.status === 'saved' ? { status: 'saved', revision: result.revision } : result;
  });
  const port: DraftPort = {
    ...store.drafts,
    save,
    async load(...args) {
      if (remainingLoadFaults > 0) {
        remainingLoadFaults--;
        return { status: 'unavailable' };
      }
      return store.drafts.load(...args);
    },
  };
  const session = createDraftSession({ scope, port, author: { id: 'Filer' } });
  const lease = session.acquire(key, { plan: { definition: workshop }, grant: {} } as any, vi.fn());
  try {
    const live = await lease.result;
    if (live.status !== 'ready') throw Error(live.status);
    live.engine.setValue('attendance', 0);
    live.engine.acknowledge('WORKSHOP_NOT_ANSWERED');
    // Save commits durably (revision-only), then both immediate readback and first retry fail transiently.
    remainingLoadFaults = 2;
    expect(await live.writer.flush(true)).toBe(false);
    expect(live.writer.conflict).toBe(false);
    expect(live.engine.getExplanationState().pendingStamps).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);

    // Retry #1 still hits unavailable readback: must NOT issue a duplicate save or flag conflict.
    expect(await live.writer.flush()).toBe(false);
    expect(live.writer.conflict).toBe(false);
    expect(live.engine.getExplanationState().pendingStamps).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);

    // Retry #2 succeeds readback and adopts server stamps without resending a save.
    expect(await live.writer.flush()).toBe(true);
    expect(live.writer.conflict).toBe(false);
    expect(live.engine.getExplanationState().pendingStamps).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
  } finally {
    lease.release();
    session.dispose();
  }
});

it.each(['immediate', 'deferred', 'unchanged'] as const)(
  'preserves our own accepted group and local edit when another session supersedes %s readback',
  async (mode) => {
    const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    const workshop = workshopJson as unknown as FormDefinition;
    const scope = `review8-superseded-${mode}`;
    const key = { scope, definitionUrl: workshop.url };
    const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
    const committed = Promise.withResolvers<void>();
    const deliver = Promise.withResolvers<void>();
    let reviewNext = false;
    let fault = false;
    const expectedRevisions: Array<string | null> = [];
    const port: DraftPort = {
      ...store.drafts,
      async save(saveInput) {
        expectedRevisions.push(saveInput.expectedRevision);
        const reply = await store.drafts.save(saveInput);
        if (reviewNext) {
          reviewNext = false;
          committed.resolve();
          await deliver.promise;
          if (mode === 'deferred') fault = true;
        }
        return reply.status === 'saved' ? { status: 'saved', revision: reply.revision } : reply;
      },
      async load(...args) {
        if (fault) {
          fault = false;
          return { status: 'unavailable' };
        }
        return store.drafts.load(...args);
      },
    };
    const loadDisk = async () => {
      const result = await store.drafts.load(key, workshop.version);
      if (result.status !== 'loaded') throw new Error(result.status);
      return { revision: result.draft.revision, response: JSON.parse(result.draft.responseJson) };
    };
    const input = { plan: { definition: workshop }, grant: {} } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
    const rival = createDraftSession({ scope, port: store.drafts, author: { id: 'Other tab' } });
    async function editElsewhere() {
      const other = await rival.acquire(key, input, () => {}).result;
      if (other.status !== 'ready') throw new Error(other.status);
      other.engine.setValue('attendance', 152);
      expect(await other.writer.flush()).toBe(true);
    }
    const notices: string[] = [];
    const report = (notice: string) => { notices.push(notice); };
    const session = createDraftSession({ scope, port, author: { id: 'Filer' } });
    const lease = session.acquire(key, input, report);
    try {
      const live = await lease.result;
      if (live.status !== 'ready') throw new Error(live.status);
      live.engine.setValue('attendance', 150);
      expect(await live.writer.flush(true)).toBe(true);
      const baseRevision = live.writer.revision!;
      const group = live.engine.getExplanationState().groups[0]!;
      reviewNext = true;
      const review = session.acknowledgeWarningGroup({
        definition: workshop,
        subject: undefined,
        expectedRevision: baseRevision,
        code: group.code,
        expectedBasis: group.basis!,
        report,
      });
      await committed.promise;
      const accepted = await loadDisk();
      expect(accepted.response.explanations).toHaveLength(1);
      expect(accepted.response.explanations[0].author.id).toBe('Filer');

      live.engine.setValue('attendance', 151);
      if (mode === 'immediate') await editElsewhere();
      deliver.resolve();
      expect(await review).toBe('saved');
      const notifiedAtReview = notices.at(-1);
      const conflictedAtReview = live.writer.conflict;
      if (mode === 'deferred') await editElsewhere();

      const before = await loadDisk();
      expect(before.response.explanations).toEqual(accepted.response.explanations);
      expect(before.response.data.attendance).toBe(mode === 'unchanged' ? 150 : 152);
      if (mode !== 'unchanged') expect(before.revision).not.toBe(accepted.revision);

      const writesBeforeFlush = expectedRevisions.length;
      const saved = await live.writer.flush();
      const staleExtraPosts = expectedRevisions.slice(writesBeforeFlush).includes(baseRevision);
      const conflict = live.writer.conflict;
      const conflictNotice = notices.at(-1);
      const kept = conflict ? await live.writer.resolveConflict('keep') : undefined;
      const after = await loadDisk();

      if (mode !== 'unchanged') {
        expect(saved).toBe(false);
        expect(conflict).toBe(true);
        expect(conflictNotice).toBe('draftConflict');
        expect(kept).toBe(true);
      }
      if (mode === 'immediate') {
        expect(conflictedAtReview).toBe(true);
        expect(notifiedAtReview).toBe('draftConflict');
        expect(staleExtraPosts).toBe(false);
      }
      expect(after.response.data.attendance).toBe(151);
      expect(after.response.explanations).toEqual(accepted.response.explanations);
    } finally {
      deliver.resolve();
      lease.release();
      session.dispose();
      rival.dispose();
    }
  },
);

describe('staged Keep reconciliation across second conflicts and local retractions', () => {
  const sequences = [
    'remove before Keep',
    'remove while Keep writes',
    'replace before Keep',
    'replace while Keep writes',
    'retain while Keep writes',
    'load after refused Keep',
    'remove locally after refused Keep',
    'retry unavailable Keep',
  ] as const;

  for (const readback of ['immediate', 'deferred'] as const) {
    it.each(sequences)(`${readback}: %s`, async (sequence) => {
      const { default: workshopJson } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
      const workshop = workshopJson as unknown as FormDefinition;
      const scope = `review9-keep-${readback}-${sequence}`;
      const key = { scope, definitionUrl: workshop.url };
      const store = createMemoryFilingStore({ scope, definitions: new Map([[workshop.url, workshop]]) });
      const reviewSaved = Promise.withResolvers<void>();
      const deliverReply = Promise.withResolvers<void>();
      let waitReview = false;
      let failRead = false;
      let onKeepWrite: (() => Promise<void>) | undefined;
      let refuseKeepWrite = false;
      const attempts: Array<Parameters<DraftPort['save']>[0]> = [];
      const port: DraftPort = {
        ...store.drafts,
        async load(...args) {
          if (failRead) {
            failRead = false;
            return { status: 'unavailable' };
          }
          return store.drafts.load(...args);
        },
        async save(saveInput) {
          attempts.push(saveInput);
          if (onKeepWrite) {
            const update = onKeepWrite;
            onKeepWrite = undefined;
            await update();
          }
          if (refuseKeepWrite) {
            refuseKeepWrite = false;
            return { status: 'unavailable' };
          }
          const result = await store.drafts.save(saveInput);
          if (waitReview && result.status === 'saved') {
            waitReview = false;
            reviewSaved.resolve();
            await deliverReply.promise;
            failRead = readback === 'deferred';
            return { status: 'saved', revision: result.revision };
          }
          return result;
        },
      };
      async function loadStorage() {
        const result = await store.drafts.load(key, workshop.version);
        if (result.status !== 'loaded') throw new Error(result.status);
        return { revision: result.draft.revision, response: JSON.parse(result.draft.responseJson) as FormResponse };
      }
      const input = { plan: { definition: workshop }, grant: {} } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
      const session = createDraftSession({ scope, port, author: { id: 'Original' } });
      const rival = createDraftSession({ scope, port: store.drafts, author: { id: 'Other' } });
      const notices: string[] = [];
      const reviewNotices: string[] = [];
      const lease = session.acquire(key, input, notice => notices.push(notice));
      try {
        const local = await lease.result;
        if (local.status !== 'ready') throw new Error(local.status);
        local.engine.setValue('attendance', 150);
        expect(await local.writer.flush(true)).toBe(true);
        const group = local.engine.getExplanationState().groups[0]!;
        waitReview = true;
        const reviewed = session.acknowledgeWarningGroup({
          definition: workshop,
          subject: undefined,
          expectedRevision: local.writer.revision!,
          code: group.code,
          expectedBasis: group.basis!,
          report: notice => reviewNotices.push(notice),
        });
        await reviewSaved.promise;
        const reviewedDraft = await loadStorage();
        expect(reviewedDraft.response.explanations?.[0]?.author.id).toBe('Original');
        local.engine.setValue('attendance', 151);

        const elsewhere = await rival.acquire(key, input, () => {}).result;
        if (elsewhere.status !== 'ready') throw new Error(elsewhere.status);
        elsewhere.engine.setValue('attendance', 152);
        if (readback === 'immediate') expect(await elsewhere.writer.flush()).toBe(true);
        deliverReply.resolve();
        expect(await reviewed).toBe('saved');
        if (readback === 'deferred') {
          expect(await elsewhere.writer.flush()).toBe(true);
          expect(await local.writer.flush()).toBe(false);
        } else {
          expect(notices.at(-1)).toBe('draftConflict');
          expect(reviewNotices).toEqual(['draftConflict']);
        }
        expect(local.writer.conflict).toBe(true);
        expect(local.engine.getExplanationEntries()).toHaveLength(0);
        expect((await loadStorage()).response.explanations).toEqual(reviewedDraft.response.explanations);

        const latestRemote = async () => {
          if (sequence.startsWith('remove ') || sequence.startsWith('load ')) {
            elsewhere.engine.removeExplanation({ code: group.code });
          } else if (sequence.startsWith('replace ')) {
            elsewhere.engine.setValue('venue', 'Community Center');
            const current = elsewhere.engine.getExplanationState().groups[0]!;
            expect(elsewhere.engine.acknowledge(current.code, { expectedBasis: current.basis! })).toBe(true);
          } else {
            elsewhere.engine.setValue('attendance', 153);
          }
          expect(await elsewhere.writer.flush()).toBe(true);
        };

        if (sequence.endsWith('before Keep')) {
          await latestRemote();
        } else {
          if (sequence === 'remove locally after refused Keep' || sequence === 'retry unavailable Keep') {
            refuseKeepWrite = true;
          } else {
            onKeepWrite = latestRemote;
          }
          expect(await local.writer.resolveConflict('keep')).toBe(false);
          expect(local.writer.conflict).toBe(true);
        }
        if (sequence === 'remove locally after refused Keep') {
          local.engine.removeExplanation({ code: group.code });
        }
        const latest = await loadStorage();
        const attemptedRevision = attempts.length;
        const choice = sequence === 'load after refused Keep' ? 'load' : 'keep';
        expect(await local.writer.resolveConflict(choice)).toBe(true);
        expect(local.writer.conflict).toBe(false);
        const after = await loadStorage();
        if (choice === 'load') {
          expect(attempts).toHaveLength(attemptedRevision);
          expect(after).toEqual(latest);
          expect(local.engine.getExplanationEntries()).toEqual(latest.response.explanations ?? []);
          expect(local.engine.getFieldVM('attendance').value.value).toBe(152);
        } else {
          expect(attempts[attemptedRevision]?.expectedRevision).toBe(latest.revision);
          expect(after.response.data.attendance).toBe(151);
          if (sequence === 'retain while Keep writes' || sequence === 'retry unavailable Keep') {
            expect(after.response.explanations).toEqual(reviewedDraft.response.explanations);
          } else {
            expect(after.response.explanations ?? []).toHaveLength(0);
          }
        }
        if (sequence === 'load after refused Keep' || sequence === 'retain while Keep writes') {
          const third = createDraftSession({ scope, port: store.drafts, author: { id: 'Third' } });
          try {
            const last = await third.acquire(key, input, () => {}).result;
            if (last.status !== 'ready') throw new Error(last.status);
            last.engine.setValue('attendance', 155);
            const groupNow = last.engine.getExplanationState().groups[0]!;
            expect(last.engine.acknowledge(groupNow.code, { expectedBasis: groupNow.basis! })).toBe(true);
            expect(await last.writer.flush()).toBe(true);
            local.engine.setValue('attendance', 154);
            local.engine.removeExplanation({ code: group.code });
            expect(await local.writer.flush()).toBe(false);
            expect(await local.writer.resolveConflict('keep')).toBe(true);
            const unrelated = await loadStorage();
            expect(unrelated.response.data.attendance).toBe(154);
            expect(unrelated.response.explanations ?? []).toHaveLength(0);
          } finally {
            third.dispose();
          }
        }
      } finally {
        deliverReply.resolve();
        lease.release();
        session.dispose();
        rival.dispose();
      }
    });
  }
});
