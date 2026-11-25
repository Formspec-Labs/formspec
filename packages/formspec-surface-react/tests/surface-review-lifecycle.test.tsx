/** @filedesc End-to-end verification of filed/returned/blocked lifecycles, ResponseReview formatting, filing map rollups, and shell accessibility. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, useState } from 'react';
import { initFormspecEngine, initFormspecEngineTools, responseSubjectId } from '@formspec-org/engine';
import {
  dereferenceBundleExport,
  prepareResponseFiling,
  type FilingStatusObservation,
} from '@formspec-org/surface';
import type { FormDefinition, ResponseActionsDocument } from '@formspec-org/types';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import canonicalize from 'canonicalize';
import { BrowserSurfaceApp } from '../src/BrowserSurfaceApp.js';
import { SurfaceApp } from '../src/SurfaceApp.js';
import { createMemoryFilingStore, previewResponseRecordTools } from '../src/browser-draft-port.js';
import { previewFilingInvoker } from '../src/preview-filing-invoker.js';
import { RESPONSE_REVIEW_COPY_KEYS, RESPONSE_REVIEW_WIDGET_SHAPE } from '../src/widget-metadata.js';
import { createResponseReviewWidget, responseReviewHandoffHash, starterWidgetModule } from '../src/widgets/index.js';
import { render } from './render.js';

const SURFACE_URL = 'https://example.test/surface';
const REGISTRY_URL = 'https://example.test/registry';
const REVIEW_MODULE = 'x-lifecycle-review';
const REVIEW_COPY = Object.fromEntries(RESPONSE_REVIEW_COPY_KEYS.map((key) => [key, key]));

const originalAddress = window.location.href;

beforeAll(async () => {
  await initFormspecEngine();
  await initFormspecEngineTools();
});

afterEach(() => {
  window.history.replaceState(null, '', originalAddress);
});

function navigateBrowser(path: string) {
  act(() => {
    window.history.replaceState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

function makeRegistry() {
  return {
    $formspecRegistry: '1.1',
    publisher: { name: 'Example', url: 'https://example.test' },
    published: '2026-01-01T00:00:00Z',
    entries: [
      { name: REVIEW_MODULE, category: 'module', version: '1.0.0', status: 'stable', contributes: ['x-review-widget'] },
      { name: 'x-review-widget', category: 'widget', version: '0.1.0', status: 'stable', widgetShape: RESPONSE_REVIEW_WIDGET_SHAPE },
    ],
  };
}

function reviewSlot(routeRef: string, slotRef = 'form') {
  return {
    id: 'review',
    slotType: 'module-widget',
    binding: {
      moduleId: REVIEW_MODULE,
      widgetName: 'ResponseReview',
      config: { copy: { en: REVIEW_COPY } },
      draftReview: { routeRef, slotRef },
    },
  };
}

describe('Filed, Returned, and Prerequisite-Blocked lifecycles (P0-1, P0-3, P1-3)', () => {
  const keyedDef: FormDefinition = {
    $formspec: '1.0',
    url: 'https://example.test/award',
    version: '1.0.0',
    title: 'Annual Grant Award',
    subject: { type: 'urn:test:award', keys: { year: { dataType: 'integer' } } },
    items: [
      { key: 'title', type: 'field', dataType: 'string', label: 'Award title' },
      { key: 'amount', type: 'field', dataType: 'money', label: 'Award amount' },
    ],
    binds: [{ path: 'title', required: 'true' }],
  };

  const mintedDef: FormDefinition = {
    $formspec: '1.0',
    url: 'https://example.test/initiative',
    version: '1.0.0',
    title: 'Community Project',
    subject: {
      type: 'urn:test:project',
      keys: {
        year: { dataType: 'integer' },
        project_id: { dataType: 'string', minted: true },
      },
    },
    items: [{ key: 'summary', type: 'field', dataType: 'string', label: 'Project summary' }],
  };

  const prerequisiteDef: FormDefinition = {
    $formspec: '1.0',
    url: 'https://example.test/prerequisite-doc',
    version: '1.0.0',
    title: 'Annual Charter',
    subject: { type: 'urn:test:charter', keys: { year: { dataType: 'integer' } } },
    items: [{ key: 'approved', type: 'field', dataType: 'boolean', label: 'Charter approved' }],
  };

  const blockedDef: FormDefinition = {
    $formspec: '1.0',
    url: 'https://example.test/dependent-report',
    version: '1.0.0',
    title: 'Quarterly Report',
    subject: { type: 'urn:test:report', keys: { year: { dataType: 'integer' } } },
    instances: {
      charter: {
        schema: { approved: 'boolean' },
        response: {
          definition: { url: prerequisiteDef.url },
          subject: [{ key: 'year', op: 'eq', from: { subject: 'year' } }],
          status: 'completed',
          disposition: 'urn:review:accepted',
          cardinality: 'latest',
          pin: 'at-open',
          whenNone: 'unavailable',
        },
      },
    },
    items: [{ key: 'notes', type: 'field', dataType: 'string', label: 'Notes' }],
  };

  const actionsDoc: ResponseActionsDocument = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    scope: 'response',
    targetDefinition: { url: keyedDef.url },
    actions: [
      { id: 'autosave', intent: 'autosave', label: { literal: 'Autosave' }, effects: [{ type: 'hostEvent', eventName: 'saved' }] },
      {
        id: 'submit-award',
        intent: 'submit',
        label: { literal: 'Submit award' },
        validation: { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
        effects: [{ type: 'hostEvent', eventName: 'submitted' }],
      },
    ],
  };

  const navActionsDoc: ResponseActionsDocument = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    scope: 'surface',
    targetSurface: { url: SURFACE_URL },
    actions: [
      { id: 'go-review', intent: 'custom', label: { literal: 'Review' }, effects: [{ type: 'hostEvent', eventName: 'nav' }] },
      { id: 'go-back', intent: 'custom', label: { literal: 'Back' }, effects: [{ type: 'hostEvent', eventName: 'nav' }] },
    ],
  };

  function lifecycleBundle() {
    return dereferenceBundleExport({
      manifest: {
        $formspecBundle: '2.4',
        id: 'https://example.test/lifecycle-app',
        entrySurface: SURFACE_URL,
        definitions: [
          { url: keyedDef.url },
          { url: mintedDef.url },
          { url: prerequisiteDef.url },
          { url: blockedDef.url },
        ],
        surfaces: [{ url: SURFACE_URL }],
        registries: [{ url: REGISTRY_URL }],
        responseActionDocuments: [
          { url: 'https://example.test/actions-award' },
          { url: 'https://example.test/actions-surface' },
        ],
      },
      documents: {
        [keyedDef.url]: keyedDef,
        [mintedDef.url]: mintedDef,
        [prerequisiteDef.url]: prerequisiteDef,
        [blockedDef.url]: blockedDef,
        [REGISTRY_URL]: makeRegistry(),
        'https://example.test/actions-award': actionsDoc,
        'https://example.test/actions-surface': navActionsDoc,
        [SURFACE_URL]: {
          $formspecSurface: '0.4',
          id: 'lifecycle',
          entry: 'overview',
          routes: [
            {
              id: 'overview',
              path: '/overview/{year}',
              title: 'Year overview',
              params: [{ name: 'year', type: 'string' }],
              slots: [{
                id: 'tracker',
                slotType: 'filing-status',
                binding: {
                  groups: [{
                    id: 'core',
                    label: 'Core forms',
                    forms: [
                      { routeRef: 'award', slotRef: 'form', params: { year: { routeParam: 'year' } } },
                      { routeRef: 'dependent', slotRef: 'form', params: { year: { routeParam: 'year' } } },
                    ],
                  }],
                },
              }],
            },
            {
              id: 'award',
              path: '/award/{year}',
              title: 'Annual Grant Award',
              params: [{ name: 'year', type: 'string' }],
              navigation: { visible: true, label: 'Award' },
              slots: [{
                id: 'form',
                slotType: 'definition-form',
                binding: { definitionRef: keyedDef.url, subjectKeys: { year: 'year' } },
              }],
              transitions: [{ trigger: 'go-review', to: 'award-review' }],
            },
            {
              id: 'award-review',
              path: '/award/{year}/review',
              title: 'Review saved answers: Award',
              params: [{ name: 'year', type: 'string' }],
              navigation: { visible: false },
              slots: [reviewSlot('award')],
              transitions: [{ trigger: 'go-back', to: 'award' }],
            },
            {
              id: 'project',
              path: '/project/{year}/{project_id}',
              title: 'Community Project',
              params: [{ name: 'year', type: 'string' }, { name: 'project_id', type: 'string' }],
              navigation: { visible: false },
              slots: [{
                id: 'form',
                slotType: 'definition-form',
                binding: { definitionRef: mintedDef.url, subjectKeys: { year: 'year', project_id: 'project_id' } },
              }],
              transitions: [{ trigger: 'go-review', to: 'project-review' }],
            },
            {
              id: 'project-review',
              path: '/project/{year}/{project_id}/review',
              title: 'Review project',
              params: [{ name: 'year', type: 'string' }, { name: 'project_id', type: 'string' }],
              navigation: { visible: false },
              slots: [reviewSlot('project')],
              transitions: [{ trigger: 'go-back', to: 'project' }],
            },
            {
              id: 'dependent',
              path: '/report/{year}',
              title: 'Quarterly Report',
              params: [{ name: 'year', type: 'string' }],
              navigation: { visible: true, label: 'Quarterly Report' },
              slots: [{
                id: 'form',
                slotType: 'definition-form',
                binding: { definitionRef: blockedDef.url, subjectKeys: { year: 'year' } },
              }],
              transitions: [{ trigger: 'go-review', to: 'dependent-review' }],
            },
            {
              id: 'dependent-review',
              path: '/report/{year}/review',
              title: 'Review Quarterly Report',
              params: [{ name: 'year', type: 'string' }],
              navigation: { visible: false },
              slots: [reviewSlot('dependent')],
              transitions: [{ trigger: 'go-back', to: 'dependent' }],
            },
          ],
          modules: [{ id: REVIEW_MODULE, version: '1.0.0' }],
        },
      },
    });
  }

  it('shows a clean Filed summary on a filed minted form and loads its answers on Review without looping', async () => {
    const definitions = new Map<string, FormDefinition>([
      [keyedDef.url, keyedDef],
      [mintedDef.url, mintedDef],
      [prerequisiteDef.url, prerequisiteDef],
      [blockedDef.url, blockedDef],
    ]);
    const mintedSubject = {
      id: responseSubjectId(mintedDef.subject!.type, { year: 2026, project_id: 'proj-01' }),
      type: mintedDef.subject!.type,
      keys: { year: 2026, project_id: 'proj-01' },
    };
    const filedMintedJson = JSON.stringify({
      $formspecResponse: '1.0',
      id: 'urn:example:2026:project:proj-01',
      definitionUrl: mintedDef.url,
      definitionVersion: mintedDef.version,
      status: 'completed',
      authored: '2026-03-10T12:00:00Z',
      subject: mintedSubject,
      data: { summary: 'Neighborhood solar retrofit' },
    });
    const store = createMemoryFilingStore({
      scope: 'edition-1',
      definitions,
      fixtures: { filings: [{ responseJson: filedMintedJson }] },
    });
    navigateBrowser('/project/2026/proj-01');
    const container = render(
      <BrowserSurfaceApp
        bundle={lifecycleBundle()}
        adapters={{
          routeParams: { year: '2026' },
          draftStorage: { scope: 'edition-1', port: store.drafts },
          responses: store.responses,
          widgetModules: [starterWidgetModule(REVIEW_MODULE)],
          onFireTransition: async () => ({ advanced: true }),
        }}
      />,
    );

    await vi.waitFor(() => expect(container.querySelector('.fs-surface-filed-summary')).not.toBeNull());
    const summary = container.querySelector('.fs-surface-filed-summary')!;
    expect(summary.textContent).toContain('Filed');
    expect(summary.textContent).toContain('urn:example:2026:project:proj-01');
    expect(summary.textContent).not.toContain('This draft could not be opened');
    // Minted filed record is one-shot (no Revise button), but has working Review + Return to overview links.
    expect(summary.querySelector('button')).toBeNull();
    const reviewLink = summary.querySelector<HTMLAnchorElement>('a.fs-surface-action-link--primary')!;
    expect(reviewLink.textContent).toBe('Review submitted answers');

    act(() => reviewLink.click());
    await vi.waitFor(() => expect(container.querySelector('.fs-response-review')).not.toBeNull());
    expect(container.querySelector('[data-response-path="summary"] dd')?.textContent).toBe('Neighborhood solar retrofit');
    expect(container.querySelector('.fs-surface-filing-banner[data-filing-status="filed"]')).not.toBeNull();
    // Return transition uses concise "Back to form" instead of long "Continue to ...".
    const backBtn = container.querySelector<HTMLButtonElement>('.fs-surface-transition__button');
    expect(backBtn?.textContent).toBe('Back to form');
  });

  it('presents a Filed keyed form cleanly and pre-hydrates answers when clicking Revise filing', async () => {
    const definitions = new Map<string, FormDefinition>([
      [keyedDef.url, keyedDef],
      [mintedDef.url, mintedDef],
      [prerequisiteDef.url, prerequisiteDef],
      [blockedDef.url, blockedDef],
    ]);
    const awardSubject = {
      id: responseSubjectId(keyedDef.subject!.type, { year: 2026 }),
      type: keyedDef.subject!.type,
      keys: { year: 2026 },
    };
    const filedAwardJson = JSON.stringify({
      $formspecResponse: '1.0',
      id: 'urn:example:2026:award',
      definitionUrl: keyedDef.url,
      definitionVersion: keyedDef.version,
      status: 'completed',
      authored: '2026-02-01T12:00:00Z',
      subject: awardSubject,
      data: { title: 'FY26 Base Grant', amount: { amount: '125000', currency: 'USD' } },
    });
    const store = createMemoryFilingStore({
      scope: 'edition-2',
      definitions,
      fixtures: { filings: [{ responseJson: filedAwardJson }] },
    });
    navigateBrowser('/award/2026');
    const container = render(
      <BrowserSurfaceApp
        bundle={lifecycleBundle()}
        adapters={{
          routeParams: { year: '2026' },
          draftStorage: { scope: 'edition-2', port: store.drafts },
          responses: store.responses,
          widgetModules: [starterWidgetModule(REVIEW_MODULE)],
          onFireTransition: async () => ({ advanced: true }),
        }}
      />,
    );

    await vi.waitFor(() => expect(container.querySelector('.fs-surface-filed-summary')).not.toBeNull());
    const reviseBtn = container.querySelector<HTMLButtonElement>('.fs-surface-filed-summary button')!;
    expect(reviseBtn.textContent).toBe('Revise filing');
    act(() => reviseBtn.click());

    await vi.waitFor(() =>
      expect(container.querySelector<HTMLInputElement>('[data-name="title"] input')?.value).toBe('FY26 Base Grant'),
    );
    expect(container.querySelector('.fs-surface-filing-banner[data-filing-status="filed"]')).not.toBeNull();
  });

  it('pre-hydrates a RETURNED filing and renders reviewer comments prominently inside the form', async () => {
    const definitions = new Map<string, FormDefinition>([
      [keyedDef.url, keyedDef],
      [mintedDef.url, mintedDef],
      [prerequisiteDef.url, prerequisiteDef],
      [blockedDef.url, blockedDef],
    ]);
    const tools = await previewResponseRecordTools();
    const awardSubject = {
      id: responseSubjectId(keyedDef.subject!.type, { year: 2026 }),
      type: keyedDef.subject!.type,
      keys: { year: 2026 },
    };
    const returnedAwardJson = JSON.stringify({
      $formspecResponse: '1.0',
      id: 'urn:example:2026:award:returned',
      definitionUrl: keyedDef.url,
      definitionVersion: keyedDef.version,
      status: 'completed',
      authored: '2026-02-01T12:00:00Z',
      subject: awardSubject,
      data: { title: 'Returned Grant Entry', amount: { amount: '5000', currency: 'USD' } },
    });
    const prepared = prepareResponseFiling('edition-3', definitions, returnedAwardJson, 'fixture', tools);
    const store = createMemoryFilingStore({
      scope: 'edition-3',
      definitions,
      fixtures: {
        filings: [{ responseJson: returnedAwardJson }],
        decisions: [{
          responseId: prepared.responseId,
          responseHash: prepared.responseHash,
          decision: {
            status: 'decided',
            review: 'returned',
            disposition: 'urn:review:returned',
            comments: ['Please verify the total against your general ledger.'],
          },
        }],
      },
    });
    navigateBrowser('/award/2026');
    const container = render(
      <BrowserSurfaceApp
        bundle={lifecycleBundle()}
        adapters={{
          routeParams: { year: '2026' },
          draftStorage: { scope: 'edition-3', port: store.drafts },
          responses: store.responses,
          widgetModules: [starterWidgetModule(REVIEW_MODULE)],
          onFireTransition: async () => ({ advanced: true }),
        }}
      />,
    );

    await vi.waitFor(() =>
      expect(container.querySelector<HTMLInputElement>('[data-name="title"] input')?.value).toBe('Returned Grant Entry'),
    );
    const banner = container.querySelector('.fs-surface-filing-banner[data-filing-status="returned"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Returned');
    expect(banner?.textContent).toContain('Please verify the total against your general ledger.');
  });

  it('suppresses the Review CTA on prerequisite-blocked forms and offers Return to overview', async () => {
    const definitions = new Map<string, FormDefinition>([
      [keyedDef.url, keyedDef],
      [mintedDef.url, mintedDef],
      [prerequisiteDef.url, prerequisiteDef],
      [blockedDef.url, blockedDef],
    ]);
    const store = createMemoryFilingStore({ scope: 'edition-4', definitions });
    navigateBrowser('/report/2026');
    const container = render(
      <BrowserSurfaceApp
        bundle={lifecycleBundle()}
        adapters={{
          routeParams: { year: '2026' },
          draftStorage: { scope: 'edition-4', port: store.drafts },
          responses: store.responses,
          widgetModules: [starterWidgetModule(REVIEW_MODULE)],
          onFireTransition: async () => ({ advanced: true }),
        }}
      />,
    );

    await vi.waitFor(() =>
      expect(container.querySelector('.fs-surface-prerequisite-notice[data-draft-status="pin-unavailable"]')).not.toBeNull(),
    );
    const notice = container.querySelector('.fs-surface-prerequisite-notice')!;
    expect(notice.textContent).toContain('Annual Charter');
    expect(notice.querySelector('a')?.textContent).toBe('Return to overview');
    // Dead-end "Continue to Review..." transition must be suppressed when form is prerequisite-blocked.
    expect(container.querySelector('.fs-surface-transitions')).toBeNull();
  });

  it('shows a prominent blocked alert banner on invalid submit and a submitted confirmation + honest masthead status on valid submit', async () => {
    const definitions = new Map<string, FormDefinition>([
      [keyedDef.url, keyedDef],
      [mintedDef.url, mintedDef],
      [prerequisiteDef.url, prerequisiteDef],
      [blockedDef.url, blockedDef],
    ]);
    const store = createMemoryFilingStore({ scope: 'edition-5', definitions });
    navigateBrowser('/award/2026');
    const container = render(
      <BrowserSurfaceApp
        bundle={lifecycleBundle()}
        adapters={{
          routeParams: { year: '2026' },
          draftStorage: { scope: 'edition-5', port: store.drafts },
          responses: store.responses,
          definitionActionInvoker: previewFilingInvoker(store.submit),
          widgetModules: [starterWidgetModule(REVIEW_MODULE)],
          onFireTransition: async () => ({ advanced: true }),
        }}
      />,
    );

    await vi.waitFor(() => expect(container.querySelector('[data-name="title"] input')).not.toBeNull());
    const submitBtn = () => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Submit award')!;
    await act(async () => { submitBtn().click(); });

    await vi.waitFor(() => expect(container.querySelector('.fs-surface-action-banner--blocked[role="alert"]')).not.toBeNull());
    expect(container.querySelector('.fs-surface-action-banner--blocked')?.textContent).toContain('1 required question unanswered');

    // Fill required field and submit cleanly.
    const titleInput = container.querySelector<HTMLInputElement>('[data-name="title"] input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(titleInput, 'Approved Grant');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { submitBtn().click(); });

    await vi.waitFor(() => expect(container.querySelector('.fs-surface-action-banner--submitted')).not.toBeNull());
    const submittedBanner = container.querySelector('.fs-surface-action-banner--submitted')!;
    expect(submittedBanner.textContent).toContain('Submitted');
    expect(submittedBanner.textContent).toContain('Review submitted answers');
    expect(container.querySelector('.fs-surface-save-notice')?.textContent).toBe('Submitted in this browser.');
    // fs-onrf: one Submit produces exactly one non-empty polite live-region announcement across the Surface app.
    const liveStatusNodes = [...container.querySelectorAll('[role="status"], [aria-live="polite"]')]
      .filter((el) => (el.textContent?.trim().length ?? 0) > 0);
    expect(liveStatusNodes).toHaveLength(1);
    expect(liveStatusNodes[0]).toBe(submittedBanner);

    // Clicking "Review submitted answers" right after submitting loads the filed Response cleanly (no unavailable error box).
    const postSubmitReview = submittedBanner.querySelector<HTMLAnchorElement>('a.fs-surface-action-link--primary')!;
    act(() => postSubmitReview.click());
    await vi.waitFor(() => expect(container.querySelector('.fs-response-review')).not.toBeNull());
    expect(container.querySelector('[data-response-path="title"] dd')?.textContent).toBe('Approved Grant');
    expect(container.querySelector('.fs-surface-filing-banner[data-filing-status="filed"]')).not.toBeNull();
  });
});

describe('ResponseReview human formatting, filtering, and chrome cleanup (P0-2)', () => {
  const richDef: FormDefinition = {
    $formspec: '1.0',
    url: 'https://example.test/rich-form',
    version: '1.0.0',
    title: 'Annual Metrics',
    subject: { type: 'urn:test:metrics', keys: { year: { dataType: 'integer' } } },
    items: [
      { key: 'allocation', type: 'field', dataType: 'money', label: 'Grant allocation' },
      { key: 'partial_amount', type: 'field', dataType: 'money', label: 'Adjusted allocation' },
      {
        key: 'category',
        type: 'field',
        dataType: 'choice',
        label: 'Primary category',
        options: [{ value: 'youth_services', label: 'Youth Services' }],
      },
      {
        key: 'streams',
        type: 'field',
        dataType: 'multiChoice',
        label: 'Funding streams',
        options: [
          { value: 'regular_grant', label: 'Regular Grant' },
          { value: 'supplemental_fund', label: 'Supplemental Fund' },
        ],
      },
      { key: 'effective_date', type: 'field', dataType: 'date', label: 'Effective date' },
      { key: 'completion_rate', type: 'field', dataType: 'decimal', suffix: '%', label: 'Completion rate' },
      {
        key: 'indicator',
        type: 'group',
        label: 'Active indicator',
        children: [
          { key: 'served', type: 'field', dataType: 'integer', label: 'Served' },
          { key: 'pct', type: 'field', dataType: 'decimal', suffix: '%', label: 'Outcome percentage', readonly: 'true', calculate: 'null' },
        ],
      },
      {
        key: 'unused_section',
        type: 'group',
        label: 'Unselected optional section',
        children: [
          { key: 'note_a', type: 'field', dataType: 'string', label: 'Optional note A' },
          { key: 'note_b', type: 'field', dataType: 'string', label: 'Optional note B' },
        ],
      },
    ],
  };

  it('formats money, multiChoice, choice, dates, percentages, calculated nulls, hides empty groups, and cleans draft-review chrome', async () => {
    const bundle = dereferenceBundleExport({
      manifest: {
        $formspecBundle: '2.4',
        id: 'https://example.test/rich-app',
        entrySurface: SURFACE_URL,
        definitions: [{ url: richDef.url }],
        surfaces: [{ url: SURFACE_URL }],
        registries: [{ url: REGISTRY_URL }],
      },
      documents: {
        [richDef.url]: richDef,
        [REGISTRY_URL]: makeRegistry(),
        [SURFACE_URL]: {
          $formspecSurface: '0.4',
          id: 'rich',
          entry: 'review',
          modules: [{ id: REVIEW_MODULE, version: '1.0.0' }],
          routes: [
            {
              id: 'form',
              path: '/form/{year}',
              title: 'Annual Metrics',
              params: [{ name: 'year', type: 'string' }],
              navigation: { visible: true, label: 'Metrics' },
              slots: [{
                id: 'form',
                slotType: 'definition-form',
                binding: { definitionRef: richDef.url, subjectKeys: { year: 'year' } },
              }],
            },
            {
              id: 'review',
              path: '/review/{year}',
              title: 'Review Metrics',
              params: [{ name: 'year', type: 'string' }],
              navigation: { visible: false },
              slots: [reviewSlot('form')],
            },
          ],
        },
      },
    });
    const load = vi.fn(async (key: any) => ({
      status: 'loaded' as const,
      draft: {
        revision: 'rev-1',
        snapshotJson: '{}',
        responseJson: JSON.stringify({
          $formspecResponse: '1.0',
          id: 'urn:test:rich:2026',
          definitionUrl: richDef.url,
          definitionVersion: richDef.version,
          status: 'in-progress',
          subject: key.subject,
          data: {
            allocation: { amount: '1000', currency: 'USD' },
            partial_amount: { amount: '1234.5', currency: 'USD' },
            category: 'youth_services',
            streams: ['regular_grant', 'supplemental_fund'],
            effective_date: '2026-04-09',
            completion_rate: 87.5,
            indicator: { served: 0, pct: null },
            unused_section: { note_a: null, note_b: '' },
          },
        }),
        pins: {},
      },
    }));

    navigateBrowser('/review/2026');
    const container = render(
      <BrowserSurfaceApp
        bundle={bundle}
        adapters={{
          routeParams: { year: '2026' },
          draftStorage: { scope: 'rich-scope', port: { load, save: vi.fn(), readSummaries: vi.fn() } },
          widgetModules: [starterWidgetModule(REVIEW_MODULE)],
        }}
      />,
    );

    await vi.waitFor(() => expect(container.querySelector('.fs-response-review')).not.toBeNull());
    // Money formatted as currency, never raw JSON.
    expect(container.querySelector('[data-response-path="allocation"] dd')?.textContent).toBe('$1,000');
    expect(container.querySelector('[data-response-path="partial_amount"] dd')?.textContent).toBe('$1,234.50');
    // Choice & multiChoice strip raw snake_case keys and delete duplicate JSON <pre> dump.
    expect(container.querySelector('[data-response-path="category"] dd')?.textContent).toBe('Youth Services');
    const streamsDd = container.querySelector('[data-response-path="streams"] dd')!;
    expect([...streamsDd.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Regular Grant',
      'Supplemental Fund',
    ]);
    expect(streamsDd.querySelector('pre')).toBeNull();
    // Date formatted MM/DD/YYYY and percent formatted with %.
    expect(container.querySelector('[data-response-path="effective_date"] dd')?.textContent).toBe('04/09/2026');
    expect(container.querySelector('[data-response-path="completion_rate"] dd')?.textContent).toBe('87.5%');
    // Calculated read-only null inside an answered group displays "—", not "No answer".
    expect(container.querySelector('[data-response-path="indicator.pct"] dd')?.textContent).toBe('—');
    // Empty nested group heading is suppressed by default, with working disclosure toggle.
    expect(container.textContent).not.toContain('Unselected optional section');
    const toggle = container.querySelector<HTMLButtonElement>('.fs-response-review-toggle')!;
    expect(toggle.textContent).toBe('Show 2 unanswered items');
    act(() => toggle.click());
    expect(container.textContent).toContain('Unselected optional section');
    expect(toggle.textContent).toBe('Hide 2 unanswered items');
    // Internal chrome hidden in in-progress draft-review.
    expect(container.querySelector('.fs-response-review-context')).toBeNull();
    expect(container.querySelector('.fs-response-review-record-details')).toBeNull();
    // Sidebar keeps active highlight resolved to the owning form route on /review.
    expect(container.querySelector('a[data-nav-route="form"]')?.getAttribute('aria-current')).toBe('page');
  });

  it('formats year integers without comma grouping and omits redundant Form reference disclosure on submitted draft-review', async () => {
    const yearDef: FormDefinition = {
      $formspec: '1.0',
      url: 'https://example.test/year-review',
      version: '1.0.0',
      title: 'Annual Filing',
      subject: {
        type: 'urn:example:annual-filing',
        keys: { year: { dataType: 'integer' } },
      },
      items: [
        { key: 'reporting_year', type: 'field', dataType: 'integer', label: 'Fiscal Year' },
        { key: 'participants_this_year', type: 'field', dataType: 'integer', label: 'Number of participants served this year' },
      ],
    };
    const bundle = dereferenceBundleExport({
      manifest: {
        $formspecBundle: '2.4',
        id: 'https://example.test/year-app',
        entrySurface: SURFACE_URL,
        definitions: [{ url: yearDef.url }],
        surfaces: [{ url: SURFACE_URL }],
        registries: [{ url: REGISTRY_URL }],
      },
      documents: {
        [yearDef.url]: yearDef,
        [REGISTRY_URL]: makeRegistry(),
        [SURFACE_URL]: {
          $formspecSurface: '0.4',
          id: 'year-review',
          entry: 'review',
          modules: [{ id: REVIEW_MODULE, version: '1.0.0' }],
          routes: [
            {
              id: 'form',
              path: '/annual/{year}',
              title: 'Annual Filing',
              params: [{ name: 'year', type: 'string' }],
              slots: [{
                id: 'form',
                slotType: 'definition-form',
                binding: { definitionRef: yearDef.url, subjectKeys: { year: 'year' } },
              }],
            },
            {
              id: 'review',
              path: '/annual/{year}/review',
              title: 'Review Annual Filing',
              params: [{ name: 'year', type: 'string' }],
              navigation: { visible: false },
              slots: [reviewSlot('form')],
            },
          ],
        },
      },
    });
    const store = createMemoryFilingStore({
      scope: 'year-scope',
      definitions: new Map([[yearDef.url, yearDef]]),
      fixtures: {
        filings: [{
          responseJson: JSON.stringify({
            $formspecResponse: '1.0',
            id: 'urn:example:annual:2028',
            definitionUrl: yearDef.url,
            definitionVersion: yearDef.version,
            status: 'completed',
            authored: '2028-04-01T12:00:00Z',
            subject: {
              id: responseSubjectId(yearDef.subject!.type, { year: 2028 }),
              type: yearDef.subject!.type,
              keys: { year: 2028 },
            },
            data: {
              reporting_year: 2028,
              participants_this_year: 2028,
            },
          }),
        }],
      },
    });

    navigateBrowser('/annual/2028/review');
    const container = render(
      <BrowserSurfaceApp
        bundle={bundle}
        adapters={{
          routeParams: { year: '2028' },
          draftStorage: { scope: 'year-scope', port: store.drafts },
          responses: store.responses,
          widgetModules: [starterWidgetModule(REVIEW_MODULE)],
        }}
      />,
    );

    await vi.waitFor(() => expect(container.querySelector('.fs-response-review')).not.toBeNull());
    expect(container.querySelector('[data-response-path="reporting_year"] dd')?.textContent).toBe('2028');
    expect(container.querySelector('[data-response-path="participants_this_year"] dd')?.textContent).toBe('2,028');
    expect(container.querySelector('.fs-response-review-record-details')).toBeNull();
  });
});

describe('Filing map KPIs, completed strips, shell accessibility, and responsive CSS (P1-4, P1-5, P1-10, P1-13, P2-2, P2-4, P3-1)', () => {
  it('counts warning-explanation findings under TO CHECK on seeded drafts and renders completed strips & empty states', async () => {
    const warningDef: FormDefinition = {
      $formspec: '1.0',
      url: 'https://example.test/warn-form',
      version: '1.0.0',
      title: 'Spending Report',
      items: [
        {
          key: 'sec',
          type: 'group',
          label: 'Section A',
          children: [{ key: 'total', type: 'field', dataType: 'integer', label: 'Total' }],
        },
      ],
      shapes: [{
        id: 'highTotal',
        target: 'sec.total',
        constraint: '$ <= 100',
        code: 'HIGH_TOTAL',
        severity: 'warning',
        timing: 'submit',
        explanation: 'explain',
        message: 'Check unusually high total.',
      }],
    };
    const store = createMemoryFilingStore({
      scope: 'warn-scope',
      definitions: new Map([[warningDef.url, warningDef]]),
      fixtures: {
        drafts: [{
          definitionUrl: warningDef.url,
          data: { sec: { total: 500 } },
        }],
      },
    });
    await store.ready();
    const summaries = await store.drafts.readSummaries(
      [{
        key: 'q1',
        definitionUrl: warningDef.url,
        definitionVersion: warningDef.version,
        sections: [{ id: 'sec', fields: ['sec.total'] }],
      }],
      { previewScope: 'warn-scope', signal: new AbortController().signal },
    );
    const obs = summaries.get('q1');
    expect(obs?.draft.status).toBe('current');
    if (obs?.draft.status === 'current') {
      expect(obs.draft.form.toFix).toBe(0);
      expect(obs.draft.form.toCheck).toBe(1);
      expect(obs.draft.form.ready).toBe(false);
    }

    // Verify completed strips, Filed KPI, URN <wbr> wrapping, and empty-group copy in FilingStatus.
    const trackerBundle = dereferenceBundleExport({
      manifest: {
        $formspecBundle: '2.4',
        id: 'https://example.test/tracker-app',
        surfaces: [{ url: SURFACE_URL }],
        definitions: [{ url: warningDef.url }],
      },
      documents: {
        [warningDef.url]: warningDef,
        [SURFACE_URL]: {
          $formspecSurface: '0.4',
          id: 'tracker',
          entry: 'home',
          routes: [
            {
              id: 'home',
              path: '/home/{unit}',
              title: 'Year overview',
              params: [{ name: 'unit', type: 'string' }],
              navigation: { visible: true, label: 'Year overview' },
              slots: [{
                id: 'map',
                slotType: 'filing-status',
                binding: {
                  groups: [{
                    id: 'g1',
                    label: 'Filings',
                    forms: [{ routeRef: 'form', slotRef: 'form', params: { unit: { routeParam: 'unit' } } }],
                  }],
                },
              }],
            },
            {
              id: 'form',
              path: '/form/{unit}',
              title: 'Spending Report',
              params: [{ name: 'unit', type: 'string' }],
              navigation: { visible: true, label: 'Spending Report' },
              slots: [{ id: 'form', slotType: 'definition-form', binding: { definitionRef: warningDef.url } }],
            },
          ],
        },
      },
    });
    const navigate = vi.fn();
    const dom = render(
      <SurfaceApp
        bundle={trackerBundle}
        location="/home/north"
        routeParams={{ unit: 'north' }}
        onNavigate={navigate}
        readSummaries={async ([query]) =>
          new Map<string, FilingStatusObservation>([[query!.key, {
            draft: { status: 'absent' },
            filing: {
              status: 'accepted',
              receiptRef: 'urn:example:2026:north:spending',
              responseHash: ('sha256:' + 'a'.repeat(64)) as `sha256:${string}`,
              review: 'available',
              comments: [],
            },
          }]])}
      />,
    );
    await act(async () => {});

    // Skip link is first focusable link targeting #fs-surface-main.
    const skipLink = dom.querySelector<HTMLAnchorElement>('.fs-surface-skip-link');
    expect(skipLink?.textContent).toBe('Skip to main content');
    expect(skipLink?.getAttribute('href')).toBe('#fs-surface-main');
    expect(dom.querySelector('main')?.id).toBe('fs-surface-main');

    // Route context displays active parameter clearly.
    expect(dom.querySelector('.fs-surface-route__context [data-route-param="unit"] dd')?.textContent).toBe('north');

    // Clicking the [1] v hub toggle button (and its inner badge) collapses the active hub without navigating.
    const hubToggle = dom.querySelector<HTMLButtonElement>('.fs-surface-nav__hub-toggle')!;
    const hubBadge = hubToggle.querySelector<HTMLElement>('.fs-surface-nav__hub-badge')!;
    expect(hubToggle.getAttribute('aria-expanded')).toBe('true');
    act(() => hubBadge.click());
    expect(hubToggle.getAttribute('aria-expanded')).toBe('false');
    expect(navigate).not.toHaveBeenCalled();

    // Accepted row renders completed filled strip (100%) and Filed summary metric (1 of 1).
    const strip = dom.querySelector<HTMLElement>('.fs-surface-filing__strip')!;
    expect(strip.dataset.stripState).toBe('accepted');
    expect(strip.querySelector<HTMLElement>('.fs-surface-filing__fill')?.style.inlineSize).toBe('100%');
    expect(dom.querySelector('.fs-surface-filing__totals dd[data-filing-completed]')?.textContent).toBe('1 of 1');
    // Receipt URN inserts <wbr> break points while keeping exact textContent.
    const receiptEl = dom.querySelector('.fs-surface-filing__meta[data-receipt-ref]')!;
    expect(receiptEl.querySelectorAll('wbr').length).toBeGreaterThanOrEqual(3);
    expect(receiptEl.textContent).toContain('urn:example:2026:north:spending');
  });

  it('styles DraftStart button, wires aria-describedby on prerequisite failure, differentiates stacked transitions, and renders empty group copy', async () => {
    const startDef: FormDefinition = {
      $formspec: '1.0',
      url: 'https://example.test/startable',
      version: '1.0.0',
      title: 'Project Entry',
      subject: {
        type: 'urn:test:startable',
        keys: { year: { dataType: 'integer' }, id: { dataType: 'string', minted: true } },
      },
      items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
    };
    const navActions: ResponseActionsDocument = {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      scope: 'surface',
      targetSurface: { url: SURFACE_URL },
      actions: [
        { id: 'go-a', intent: 'custom', label: { literal: 'A' }, effects: [{ type: 'hostEvent', eventName: 'a' }] },
        { id: 'go-b', intent: 'custom', label: { literal: 'B' }, effects: [{ type: 'hostEvent', eventName: 'b' }] },
      ],
    };
    const bundle = dereferenceBundleExport({
      manifest: {
        $formspecBundle: '2.4',
        id: 'https://example.test/start-app',
        entrySurface: SURFACE_URL,
        definitions: [{ url: startDef.url }],
        surfaces: [{ url: SURFACE_URL }],
        responseActionDocuments: [{ url: 'https://example.test/start-actions' }],
      },
      documents: {
        [startDef.url]: startDef,
        'https://example.test/start-actions': navActions,
        [SURFACE_URL]: {
          $formspecSurface: '0.4',
          id: 'start-app',
          entry: 'hub',
          routes: [
            {
              id: 'hub',
              path: '/hub/{year}',
              title: 'Hub',
              params: [{ name: 'year', type: 'string' }],
              slots: [{
                id: 'start',
                slotType: 'draft-start',
                binding: { label: 'Start a new project', routeRef: 'project', slotRef: 'form' },
              }],
              transitions: [
                { trigger: 'go-a', to: 'dest-a' },
                { trigger: 'go-b', to: 'dest-b' },
              ],
            },
            {
              id: 'project',
              path: '/hub/{year}/project/{id}',
              title: 'Project Entry',
              params: [{ name: 'year', type: 'string' }, { name: 'id', type: 'string' }],
              slots: [{
                id: 'form',
                slotType: 'definition-form',
                binding: { definitionRef: startDef.url, subjectKeys: { year: 'year', id: 'id' } },
              }],
            },
            { id: 'dest-a', path: '/dest-a', title: 'The agency reports', slots: [] },
            { id: 'dest-b', path: '/dest-b', title: 'Federal settings', slots: [] },
          ],
        },
      },
    });
    const failingPort = {
      start: vi.fn(async () => ({ status: 'pin-unavailable' as const, instance: 'charter' })),
      load: vi.fn(async () => ({ status: 'absent' as const })),
      save: vi.fn(),
      readSummaries: vi.fn(async () => new Map()),
    };
    navigateBrowser('/hub/2026');
    const container = render(
      <BrowserSurfaceApp
        bundle={bundle}
        adapters={{
          routeParams: { year: '2026' },
          draftStorage: { scope: 'start-scope', port: failingPort },
          onFireTransition: async () => ({ advanced: true }),
        }}
      />,
    );

    const startBtn = container.querySelector<HTMLButtonElement>('button.fs-surface-draft-start__button')!;
    expect(startBtn).not.toBeNull();
    expect(startBtn.textContent).toBe('Start a new project');
    await act(async () => { startBtn.click(); });
    await vi.waitFor(() => expect(startBtn.getAttribute('aria-describedby')).toBeTruthy());
    const descId = startBtn.getAttribute('aria-describedby')!;
    expect(container.querySelector(`[id="${descId}"]`)?.textContent).toContain('charter');

    // Stacked transitions: first is primary with lowercased "the", second is secondary.
    const transitionBtns = [...container.querySelectorAll<HTMLButtonElement>('.fs-surface-transition__button')];
    expect(transitionBtns.map((b) => b.textContent)).toEqual([
      'Continue to the agency reports',
      'Continue to Federal settings',
    ]);
    expect(transitionBtns[0]!.classList.contains('fs-surface-transition__button--secondary')).toBe(false);
    expect(transitionBtns[1]!.classList.contains('fs-surface-transition__button--secondary')).toBe(true);
  });

  it('navigates repeated roster rows for returned and in-progress members and shows empty copy when a repeated group has 0 items', async () => {
    const memberDef: FormDefinition = {
      $formspec: '1.0',
      url: 'https://example.test/member-spending',
      version: '1.0.0',
      title: 'Member Spending',
      subject: { type: 'urn:test:member-spending', keys: { year: { dataType: 'integer' }, org: { dataType: 'string' } } },
      items: [{ key: 'total', type: 'field', dataType: 'integer', label: 'Total' }],
    };
    const directoryDef: FormDefinition = {
      $formspec: '1.0',
      url: 'https://example.test/member-directory',
      version: '1.0.0',
      title: 'Directory',
      items: [{
        key: 'orgs',
        type: 'group',
        repeatable: true,
        children: [
          { key: 'id', type: 'field', dataType: 'string', label: 'ID' },
          { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
        ],
      }],
    };
    const rosterSource = {
      id: 'response:orgs',
      kind: 'definition-response' as const,
      owner: 'host' as const,
      definitionRef: directoryDef.url,
      scope: 'route' as const,
      availability: { level: 'app' as const },
      schema: {
        type: 'object',
        properties: {
          orgs: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } },
        },
      },
      runtime: {
        delivery: 'draft' as const,
        authorizationBoundary: 'host' as const,
        failureMode: 'block-render' as const,
        cache: { mode: 'draft' as const },
        provenance: { kind: 'definition-response' as const, source: directoryDef.url },
      },
    };
    const emptySource = { ...rosterSource, id: 'response:projects' };
    const rosterBundle = dereferenceBundleExport({
      manifest: {
        $formspecBundle: '2.4',
        id: 'https://example.test/roster-nav-app',
        surfaces: [{ url: SURFACE_URL }],
        definitions: [{ url: memberDef.url }, { url: directoryDef.url }],
        dataSources: [{ url: 'https://example.test/roster-catalog' }],
      },
      documents: {
        [memberDef.url]: memberDef,
        [directoryDef.url]: directoryDef,
        'https://example.test/roster-catalog': {
          $formspecDataSources: '1.0',
          id: 'https://example.test/roster-catalog',
          version: '1.0.0',
          sources: [rosterSource, emptySource],
        },
        [SURFACE_URL]: {
          $formspecSurface: '0.4',
          id: 'roster-nav',
          entry: 'overview',
          routes: [
            {
              id: 'overview',
              path: '/years/{year}',
              title: 'Year overview',
              params: [{ name: 'year', type: 'string' }],
              slots: [{
                id: 'map',
                slotType: 'filing-status',
                binding: {
                  groups: [
                    {
                      id: 'members',
                      label: 'Member reports',
                      repeat: {
                        catalogRef: 'https://example.test/roster-catalog',
                        sourceRef: 'response:orgs',
                        rowsField: 'orgs',
                        labelField: 'name',
                        waitingLabel: 'Waiting on members',
                      },
                      forms: [{
                        routeRef: 'spending',
                        slotRef: 'form',
                        params: { year: { routeParam: 'year' }, org: { rowField: 'id' } },
                      }],
                    },
                    {
                      id: 'projects',
                      label: 'Optional projects',
                      repeat: {
                        catalogRef: 'https://example.test/roster-catalog',
                        sourceRef: 'response:projects',
                        rowsField: 'orgs',
                        labelField: 'name',
                        waitingLabel: 'Waiting on projects',
                      },
                      forms: [{
                        routeRef: 'spending',
                        slotRef: 'form',
                        params: { year: { routeParam: 'year' }, org: { rowField: 'id' } },
                      }],
                    },
                  ],
                },
              }],
            },
            {
              id: 'spending',
              path: '/years/{year}/orgs/{org}/spending',
              title: 'Member Spending',
              params: [{ name: 'year', type: 'string' }, { name: 'org', type: 'string' }],
              slots: [{
                id: 'form',
                slotType: 'definition-form',
                binding: { definitionRef: memberDef.url, subjectKeys: { year: 'year', org: 'org' } },
              }],
            },
          ],
        },
      },
    });
    const navigate = vi.fn();
    const dom = render(
      <SurfaceApp
        bundle={rosterBundle}
        location="/years/2026"
        routeParams={{ year: '2026' }}
        onNavigate={navigate}
        dataSourceLoader={async (request) => ({
          status: 'loaded',
          freshness: 'fresh',
          value: request.descriptor.source.id === 'response:orgs'
            ? { orgs: [{ id: 'ORG002', name: 'Valley Council' }, { id: 'ORG003', name: 'Ridge Services' }] }
            : { orgs: [] },
        })}
        authorizeDataSource={() => ({ status: 'authorized' })}
        validateDataSourcePayload={() => ({ valid: true })}
        readSummaries={async (queries) => new Map<string, FilingStatusObservation>(queries.map((query) => [
          query.key,
          query.subject?.keys.org === 'ORG002'
            ? {
                draft: { status: 'absent' },
                filing: {
                  status: 'returned',
                  receiptRef: 'urn:example:2026:org002:spending',
                  responseHash: ('sha256:' + 'c'.repeat(64)) as `sha256:${string}`,
                  review: 'available',
                  comments: ['Please review line 2.'],
                },
              }
            : {
                draft: { status: 'current', form: { total: 1, filled: 0, toFix: 0, toCheck: 1, ready: false }, sections: {} },
                filing: { status: 'none' },
              },
        ]))}
      />,
    );
    await act(async () => {});

    const returnedLink = dom.querySelector<HTMLAnchorElement>('a[href="/years/2026/orgs/ORG002/spending?slot=form"]')!;
    const draftLink = dom.querySelector<HTMLAnchorElement>('a[href="/years/2026/orgs/ORG003/spending?slot=form"]')!;
    expect(returnedLink).not.toBeNull();
    expect(draftLink).not.toBeNull();
    act(() => returnedLink.click());
    expect(navigate).toHaveBeenCalledWith('/years/2026/orgs/ORG002/spending?slot=form');
    act(() => draftLink.click());
    expect(navigate).toHaveBeenCalledWith('/years/2026/orgs/ORG003/spending?slot=form');
    // Empty available repeated group renders clear empty-state copy instead of blank space.
    expect(dom.querySelector('.fs-surface-filing__empty')?.textContent).toBe('None added yet.');
  });

  it('maintains responsive masthead, unsticky tablet breakpoint, flexible select width, and clean section lists in CSS', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/formspec-surface.css'), 'utf8');
    expect(css).toMatch(/\.fs-surface-brand\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*break-word;/s);
    expect(css).toMatch(/\.fs-surface-masthead-controls select\s*\{[^}]*max-width:\s*min\(100%,\s*34rem\);/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*64rem\)\s*\{[^}]*\.fs-surface-header\s*\{[^}]*position:\s*static;/s);
    expect(css).toMatch(/\.fs-surface-skip-link\s*\{[^}]*transform:\s*translateY\(-200%\);/s);
    expect(css).toMatch(/\.fs-surface-skip-link:focus,\s*\.fs-surface-skip-link:focus-visible\s*\{[^}]*transform:\s*none;/s);
    expect(css).not.toContain('.fs-surface-filing__sections li:not(:last-child)::after');
    expect(css).toContain('.fs-surface-draft-start__button');
  });

  it('filters static and dynamic non-relevant items on draft-review without inflating unanswered counts, supports [*] binds and defaultCurrency, and keeps ceremony money lossless', async () => {
    const conditionalDef: FormDefinition = {
      $formspec: '1.0',
      url: 'https://example.test/conditional-review',
      version: '1.0.0',
      title: 'Conditional Report',
      formPresentation: { defaultCurrency: 'EUR' },
      subject: { type: 'urn:test:cond', keys: { year: { dataType: 'integer' } } },
      items: [
        { key: 'show_extra', type: 'field', dataType: 'boolean', label: 'Include extra details' },
        { key: 'budget', type: 'field', dataType: 'decimal', prefix: '$', label: 'Budget amount' },
        { key: 'precise_fee', type: 'field', dataType: 'money', label: 'Precise fee' },
        { key: 'optional_note', type: 'field', dataType: 'string', label: 'Optional note' },
        {
          key: 'rows',
          type: 'group',
          repeatable: true,
          label: 'Entries',
          children: [
            { key: 'count', type: 'field', dataType: 'integer', label: 'Count' },
            { key: 'rate', type: 'field', dataType: 'decimal', suffix: '%', label: 'Rate' },
          ],
        },
        {
          key: 'dynamic_hidden',
          type: 'group',
          label: 'Dynamic hidden group',
          children: [
            { key: 'kept_val', type: 'field', dataType: 'string', label: 'Kept dynamic value' },
            { key: 'empty_val', type: 'field', dataType: 'string', label: 'Empty dynamic value' },
          ],
        },
        {
          key: 'static_hidden',
          type: 'group',
          label: 'Hidden calculation group',
          children: [
            { key: 'flag', type: 'field', dataType: 'boolean', label: 'Internal flag' },
            { key: 'shadow_null', type: 'field', dataType: 'string', label: 'Shadow null' },
          ],
        },
      ],
      binds: [
        { path: 'rows[*].rate', readonly: 'true', calculate: 'null' },
        { path: 'dynamic_hidden', relevant: 'show_extra = true' },
        { path: 'static_hidden', relevant: 'false' },
        { path: 'static_hidden.flag', calculate: 'true', nonRelevantBehavior: 'keep' },
      ],
    };

    const bundle = dereferenceBundleExport({
      manifest: {
        $formspecBundle: '2.4',
        id: 'https://example.test/cond-app',
        entrySurface: SURFACE_URL,
        definitions: [{ url: conditionalDef.url }],
        surfaces: [{ url: SURFACE_URL }],
        registries: [{ url: REGISTRY_URL }],
      },
      documents: {
        [conditionalDef.url]: conditionalDef,
        [REGISTRY_URL]: makeRegistry(),
        [SURFACE_URL]: {
          $formspecSurface: '0.4',
          id: 'cond',
          entry: 'review',
          modules: [{ id: REVIEW_MODULE, version: '1.0.0' }],
          routes: [
            {
              id: 'form',
              path: '/form/{year}',
              title: 'Conditional Report',
              params: [{ name: 'year', type: 'string' }],
              slots: [{
                id: 'form',
                slotType: 'definition-form',
                binding: { definitionRef: conditionalDef.url, subjectKeys: { year: 'year' } },
              }],
            },
            {
              id: 'review',
              path: '/review/{year}',
              title: 'Review Conditional Report',
              params: [{ name: 'year', type: 'string' }],
              slots: [reviewSlot('form')],
            },
          ],
        },
      },
    });

    const load = vi.fn(async (key: any) => ({
      status: 'loaded' as const,
      draft: {
        revision: 'rev-cond',
        snapshotJson: '{}',
        responseJson: JSON.stringify({
          $formspecResponse: '1.0',
          id: 'urn:test:cond:2026',
          definitionUrl: conditionalDef.url,
          definitionVersion: conditionalDef.version,
          status: 'in-progress',
          subject: key.subject,
          data: {
            show_extra: false,
            budget: 2500,
            precise_fee: { amount: '10.125', currency: 'USD' },
            optional_note: null,
            rows: [{ count: 5, rate: null }],
            dynamic_hidden: { kept_val: 'Should hide', empty_val: null },
            static_hidden: { flag: true, shadow_null: null },
          },
        }),
        pins: {},
      },
    }));

    navigateBrowser('/review/2026');
    const container = render(
      <BrowserSurfaceApp
        bundle={bundle}
        adapters={{
          routeParams: { year: '2026' },
          draftStorage: { scope: 'cond-scope', port: { load, save: vi.fn(), readSummaries: vi.fn() } },
          widgetModules: [starterWidgetModule(REVIEW_MODULE)],
        }}
      />,
    );

    await vi.waitFor(() => expect(container.querySelector('.fs-response-review')).not.toBeNull());
    // Neither static relevant="false" (even with nonRelevantBehavior="keep") nor dynamic relevant===false appear.
    expect(container.textContent).not.toContain('Hidden calculation group');
    expect(container.textContent).not.toContain('Internal flag');
    expect(container.textContent).not.toContain('Dynamic hidden group');
    expect(container.textContent).not.toContain('Should hide');
    // Unanswered count includes ONLY relevant empty optional_note (1), NOT shadow_null or empty_val.
    const toggle = container.querySelector<HTMLButtonElement>('.fs-response-review-toggle')!;
    expect(toggle.textContent).toBe('Show 1 unanswered item');
    act(() => toggle.click());
    expect(container.textContent).toContain('Optional note');
    expect(container.textContent).not.toContain('Shadow null');
    expect(container.textContent).not.toContain('Empty dynamic value');
    // Wildcard rows[*].rate bind hint renders em-dash for calculated null inside answered repeat row.
    expect(container.querySelector('[data-response-path="rows[0].rate"] dd')?.textContent).toBe('—');
    // formPresentation.defaultCurrency EUR applied to numeric currency field, and 3-decimal money preserved without rounding.
    expect(container.querySelector('[data-response-path="budget"] dd')?.textContent).toContain('2,500');
    expect(container.querySelector('[data-response-path="budget"] dd')?.textContent).toMatch(/€|EUR/);
    expect(container.querySelector('[data-response-path="precise_fee"] dd')?.textContent).toBe('$10.125');

    // Verify lossless money formatting in cryptographic before-sign ceremony (>2 decimals and >2^53).
    const handoffBytes = (res: unknown) => new TextEncoder().encode(`formspec.response.handoff.v1\0${canonicalize(res)}`);
    const ceremonyDef = {
      $formspec: '1.0',
      url: 'urn:test:ceremony-money',
      version: '1.0.0',
      items: [
        { key: 'precise', type: 'field', dataType: 'money', label: 'Precise' },
        { key: 'huge', type: 'field', dataType: 'money', label: 'Huge' },
      ],
    };
    const ceremonyResponse = {
      $formspecResponse: '1.0',
      id: 'resp-money-1',
      definitionUrl: ceremonyDef.url,
      definitionVersion: ceremonyDef.version,
      status: 'completed',
      authored: '2026-01-01T00:00:00Z',
      displayedLocale: { locale: 'en' },
      data: {
        precise: { amount: '10.125', currency: 'USD' },
        huge: { amount: '9007199254740993.25', currency: 'USD' },
      },
    };
    const responseHash = await responseReviewHandoffHash(ceremonyResponse, handoffBytes);
    const CeremonyWidget = createResponseReviewWidget({ canonicalResponseHandoffBytes: handoffBytes });
    const ceremonyDom = render(
      <CeremonyWidget
        moduleId="x-starter"
        widgetName="ResponseReview"
        slot={{ id: 'review' }}
        route={{ surfaceId: 's', routeId: 'r', params: {} }}
        headingLevel={2}
        admitsTenantTheme={false}
        config={{ copy: { en: REVIEW_COPY } }}
        data={{
          definition: ceremonyDef,
          response: ceremonyResponse,
          presentation: {
            responseHash,
            definitionUrl: ceremonyDef.url,
            definitionVersion: ceremonyDef.version,
            locale: 'en',
            actorRef: 'actor-1',
            draft: { id: 'draft-1', version: 1 },
            phase: 'before-sign',
            fields: {
              precise: { label: 'Precise' },
              huge: { label: 'Huge' },
            },
          },
        }}
        emitAction={vi.fn()}
      />,
    );
    await vi.waitFor(() => expect(ceremonyDom.querySelector('[data-response-path="precise"] dd')).not.toBeNull());
    expect(ceremonyDom.querySelector('[data-response-path="precise"] dd')?.textContent).toBe('$10.125');
    expect(ceremonyDom.querySelector('[data-response-path="huge"] dd')?.textContent).toBe('$9,007,199,254,740,993.25');
  });

  it('triggers blocked and submitted actionBanner on Wizard-mode forms and clears stale save notices on sessionGeneration reset', async () => {
    const wizardDef: FormDefinition = {
      $formspec: '1.0',
      url: 'https://example.test/wizard-form',
      version: '1.0.0',
      title: 'Guided Filing',
      formPresentation: { pageMode: 'wizard' },
      subject: { type: 'urn:test:wizard', keys: { year: { dataType: 'integer' } } },
      items: [{
        key: 'step1',
        type: 'group',
        label: 'Step 1',
        children: [{ key: 'name', type: 'field', dataType: 'string', label: 'Applicant name' }],
      }],
      binds: [{ path: 'step1.name', required: 'true' }],
    };
    const wizardActions: ResponseActionsDocument = {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      scope: 'response',
      targetDefinition: { url: wizardDef.url },
      actions: [
        { id: 'autosave', intent: 'autosave', label: { literal: 'Autosave' }, effects: [{ type: 'hostEvent', eventName: 'saved' }] },
        {
          id: 'submit-wizard',
          intent: 'submit',
          label: { literal: 'Submit filing' },
          validation: { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
          effects: [{ type: 'hostEvent', eventName: 'submitted' }],
        },
      ],
    };
    const bundle = dereferenceBundleExport({
      manifest: {
        $formspecBundle: '2.4',
        id: 'https://example.test/wizard-app',
        entrySurface: SURFACE_URL,
        definitions: [{ url: wizardDef.url }],
        surfaces: [{ url: SURFACE_URL }],
        responseActionDocuments: [{ url: 'https://example.test/wizard-actions' }],
      },
      documents: {
        [wizardDef.url]: wizardDef,
        'https://example.test/wizard-actions': wizardActions,
        [SURFACE_URL]: {
          $formspecSurface: '0.4',
          id: 'wizard-app',
          entry: 'wizard',
          routes: [{
            id: 'wizard',
            path: '/wizard/{year}',
            title: 'Guided Filing',
            params: [{ name: 'year', type: 'string' }],
            slots: [{
              id: 'form',
              slotType: 'definition-form',
              binding: { definitionRef: wizardDef.url, subjectKeys: { year: 'year' } },
            }],
          }],
        },
      },
    });
    const store = createMemoryFilingStore({ scope: 'wiz-scope', definitions: new Map([[wizardDef.url, wizardDef]]) });
    navigateBrowser('/wizard/2026');
    let setGen!: (next: string) => void;
    function Host() {
      const [gen, updateGen] = useState('gen-1');
      setGen = updateGen;
      return (
        <BrowserSurfaceApp
          bundle={bundle}
          adapters={{
            routeParams: { year: '2026' },
            sessionGeneration: gen,
            draftStorage: { scope: 'wiz-scope', port: store.drafts },
            responses: store.responses,
            definitionActionInvoker: previewFilingInvoker(store.submit),
          }}
        />
      );
    }
    const container = render(<Host />);

    await vi.waitFor(() => expect(container.querySelector('[data-name="step1.name"] input')).not.toBeNull());
    const submitBtn = () => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Submit filing')!;
    await act(async () => { submitBtn().click(); });
    await vi.waitFor(() => expect(container.querySelector('.fs-surface-action-banner--blocked[role="alert"]')).not.toBeNull());

    const input = container.querySelector<HTMLInputElement>('[data-name="step1.name"] input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Ada Lovelace');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { submitBtn().click(); });
    await vi.waitFor(() => expect(container.querySelector('.fs-surface-action-banner--submitted')).not.toBeNull());
    expect(container.querySelector('.fs-surface-save-notice')?.textContent).toBe('Submitted in this browser.');

    // Changing sessionGeneration on the same mounted BrowserSurfaceApp clears the stale masthead save notice.
    await act(async () => { setGen('gen-2'); });
    expect(container.querySelector('.fs-surface-save-notice')?.textContent).toBe('');
  });

  it('resolves Return to overview to the nearest parent overview hub by path affinity with active route params', async () => {
    const unitSpendingDef: FormDefinition = {
      $formspec: '1.0',
      url: 'https://example.test/unit-spending',
      version: '1.0.0',
      title: 'Unit Spending',
      subject: {
        type: 'urn:test:unit-spending',
        keys: { year: { dataType: 'integer' }, unit: { dataType: 'string' } },
      },
      items: [{ key: 'total', type: 'field', dataType: 'integer', label: 'Total spent' }],
      binds: [{ path: 'total', required: 'true' }],
    };
    const unitActions: ResponseActionsDocument = {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      scope: 'response',
      targetDefinition: { url: unitSpendingDef.url },
      actions: [
        { id: 'autosave', intent: 'autosave', label: { literal: 'Autosave' }, effects: [{ type: 'hostEvent', eventName: 'saved' }] },
        {
          id: 'submit-unit',
          intent: 'submit',
          label: { literal: 'Submit spending' },
          validation: { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
          effects: [{ type: 'hostEvent', eventName: 'submitted' }],
        },
      ],
    };
    const nestedBundle = dereferenceBundleExport({
      manifest: {
        $formspecBundle: '2.4',
        id: 'https://example.test/nested-hub-app',
        entrySurface: SURFACE_URL,
        definitions: [{ url: unitSpendingDef.url }],
        surfaces: [{ url: SURFACE_URL }],
        responseActionDocuments: [{ url: 'https://example.test/unit-actions' }],
      },
      documents: {
        [unitSpendingDef.url]: unitSpendingDef,
        'https://example.test/unit-actions': unitActions,
        [SURFACE_URL]: {
          $formspecSurface: '0.4',
          id: 'nested',
          entry: 'year-overview',
          routes: [
            {
              id: 'year-overview',
              path: '/years/{year}',
              title: 'Year overview',
              params: [{ name: 'year', type: 'string' }],
              navigation: { visible: true, label: 'Year overview' },
              slots: [{
                id: 'year-tracker',
                slotType: 'filing-status',
                binding: {
                  groups: [{
                    id: 'all',
                    label: 'Annual filings',
                    forms: [{ routeRef: 'unit-spending', slotRef: 'form', params: { year: { routeParam: 'year' }, unit: { value: 'UNIT-A' } } }],
                  }],
                },
              }],
            },
            {
              id: 'unit-overview',
              path: '/years/{year}/units/{unit}',
              title: 'Unit overview',
              params: [{ name: 'year', type: 'string' }, { name: 'unit', type: 'string' }],
              navigation: { visible: true, label: 'Unit overview' },
              slots: [{
                id: 'unit-tracker',
                slotType: 'filing-status',
                binding: {
                  groups: [{
                    id: 'unit-group',
                    label: 'Unit reports',
                    forms: [{ routeRef: 'unit-spending', slotRef: 'form', params: { year: { routeParam: 'year' }, unit: { routeParam: 'unit' } } }],
                  }],
                },
              }],
            },
            {
              id: 'unit-spending',
              path: '/years/{year}/units/{unit}/spending',
              title: 'Unit Spending',
              params: [{ name: 'year', type: 'string' }, { name: 'unit', type: 'string' }],
              navigation: { visible: true, label: 'Unit Spending' },
              slots: [{
                id: 'form',
                slotType: 'definition-form',
                binding: { definitionRef: unitSpendingDef.url, subjectKeys: { year: 'year', unit: 'unit' } },
              }],
            },
          ],
        },
      },
    });

    const store = createMemoryFilingStore({
      scope: 'nested-scope',
      definitions: new Map([[unitSpendingDef.url, unitSpendingDef]]),
    });
    navigateBrowser('/years/2025/units/UNIT-B/spending');
    const container = render(
      <BrowserSurfaceApp
        bundle={nestedBundle}
        adapters={{
          routeParams: { year: '2025', unit: 'UNIT-A' },
          draftStorage: { scope: 'nested-scope', port: store.drafts },
          responses: store.responses,
          definitionActionInvoker: previewFilingInvoker(store.submit),
        }}
      />,
    );

    await vi.waitFor(() => expect(container.querySelector('[data-name="total"] input')).not.toBeNull());
    const input = container.querySelector<HTMLInputElement>('[data-name="total"] input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '420');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submitBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Submit spending')!;
    await act(async () => { submitBtn.click(); });

    await vi.waitFor(() => expect(container.querySelector('.fs-surface-action-banner--submitted')).not.toBeNull());
    const returnLink = [...container.querySelectorAll<HTMLAnchorElement>('.fs-surface-action-banner--submitted a')]
      .find((a) => a.textContent?.trim() === 'Return to overview')!;
    expect(returnLink).not.toBeUndefined();
    expect(returnLink.getAttribute('href')).toBe('/years/2025/units/UNIT-B');

    act(() => returnLink.click());
    await vi.waitFor(() => expect(container.querySelector('article')?.dataset.route).toBe('unit-overview'));
    expect(window.location.pathname).toBe('/years/2025/units/UNIT-B');
  });

  it('measures sticky header bottom for --formspec-sticky-offset and maintains mobile nav nowrap + print styles in CSS', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/formspec-surface.css'), 'utf8');
    expect(css).toMatch(/\.fs-surface-nav__toggle-main\s*\{[^}]*flex-shrink:\s*0;[^}]*white-space:\s*nowrap;/s);
    expect(css).toMatch(/\.fs-surface-nav__toggle-current\s*\{[^}]*min-width:\s*0;/s);
    expect(css).toMatch(/@media\s+print\s*\{[\s\S]*\.fs-surface-header[\s\S]*\.fs-surface-nav[\s\S]*\.fs-response-review-controls[\s\S]*display:\s*none\s*!important;/);

    const simpleBundle = dereferenceBundleExport({
      manifest: {
        $formspecBundle: '2.4',
        id: 'https://example.test/sticky-app',
        title: 'Sticky App',
        entrySurface: SURFACE_URL,
        surfaces: [{ url: SURFACE_URL }],
      },
      documents: {
        [SURFACE_URL]: {
          $formspecSurface: '0.4',
          id: 'sticky',
          entry: 'home',
          routes: [{ id: 'home', path: '/', title: 'Home', slots: [] }],
        },
      },
    });
    const originalGetComputedStyle = window.getComputedStyle.bind(window);
    const computedSpy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
      const style = originalGetComputedStyle(el, pseudo);
      if (el instanceof HTMLElement && el.classList.contains('fs-surface-header')) {
        return new Proxy(style, {
          get(target, prop) {
            if (prop === 'position') return 'sticky';
            const value = Reflect.get(target, prop);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      }
      return style;
    });
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('fs-surface-header')) {
        return { top: 48, bottom: 104, height: 56, left: 0, right: 1200, width: 1200, x: 0, y: 48, toJSON: () => ({}) } as DOMRect;
      }
      return { top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    try {
      const container = render(<SurfaceApp bundle={simpleBundle} location="/" onNavigate={() => {}} />);
      const rootEl = container.querySelector<HTMLElement>('.fs-surface-app')!;
      expect(rootEl.style.getPropertyValue('--fs-surface-header-height')).toBe('104px');
      expect(rootEl.style.getPropertyValue('--formspec-sticky-offset')).toBe('120px');
    } finally {
      computedSpy.mockRestore();
      rectSpy.mockRestore();
    }
  });
});
