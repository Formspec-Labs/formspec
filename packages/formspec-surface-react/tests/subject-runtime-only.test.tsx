/** @filedesc A subject-declaring Surface form renders, keys its draft and files its Response without tools WASM. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, expect, it, vi } from 'vitest';

vi.mock('@formspec-org/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@formspec-org/engine')>();
  return {
    ...actual,
    initFormspecEngineTools: vi.fn(() => Promise.reject(new Error('tools WASM must not load for subject identity'))),
  };
});

import { initFormspecEngine, initFormspecEngineTools, isFormspecEngineToolsInitialized } from '@formspec-org/engine';
import type { DraftKey, ResolvedBundle } from '@formspec-org/surface';
import type { FormDefinition, ResponseActionsDocument, SurfaceDocument } from '@formspec-org/types';
import { BrowserSurfaceApp } from '../src/BrowserSurfaceApp.js';
import { createDraftSession } from '../src/draft-session.js';
import { SurfaceApp } from '../src/SurfaceApp.js';
import { renderDefaultDefinitionForm, type SurfaceDefinitionFormRenderer } from '../src/SurfaceSlot.js';

// Core's shared vector: the engine must reproduce it from the route's typed keys alone.
const vector = JSON.parse(readFileSync(
  resolve(import.meta.dirname, '../../../tests/conformance/fixtures/subject-id/vectors.json'), 'utf8',
)).vectors.find((entry: { name: string }) => entry.name === 'org-period') as {
  type: string; keys: { period: number; orgId: string }; id: string;
};
const definitionUrl = 'https://example.test/definitions/org-period';

function bundle(): ResolvedBundle {
  const surfaceRef = 'https://example.test/surfaces/org-period';
  const surface = {
    $formspecSurface: '0.2', id: 'org-period', entry: 'filing', routes: [{
      id: 'filing', path: '/filing/{orgId}/{period}', title: 'Filing', routeClass: 'intake',
      params: [{ name: 'orgId', type: 'string' }, { name: 'period', type: 'string' }],
      slots: [{ id: 'form', slotType: 'definition-form', binding: {
        definitionRef: definitionUrl, subjectKeys: { period: 'period', orgId: 'orgId' },
      } }],
    }],
  } as unknown as SurfaceDocument;
  const definition = {
    $formspec: '1.0', url: definitionUrl, version: '1.0.0', title: 'Agency year',
    subject: { type: vector.type, keys: { period: { dataType: 'integer' }, orgId: { dataType: 'string' } } },
    items: [
      { type: 'field', key: 'year', dataType: 'integer', label: 'Filing year' },
      { type: 'field', key: 'name', dataType: 'string', label: 'Name' },
    ],
    binds: [{ path: 'year', calculate: "subject('period')" }],
  } as unknown as FormDefinition;
  const actions = {
    $formspecResponseActions: '1.0', version: '1.0.0', targetDefinition: { url: definitionUrl },
    actions: [{ id: 'submit', intent: 'submit', label: { literal: 'Submit' },
      effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }] }],
  } as unknown as ResponseActionsDocument;
  return {
    manifest: { $formspecBundle: '2.4', surfaces: [{ url: surfaceRef }], entrySurface: surfaceRef,
      definitions: [{ url: definitionUrl }] },
    title: 'Agency year', surfaces: [surface], surfaceRefs: new Map([[surface, surfaceRef]]), experiences: [],
    tenantTheme: undefined, registries: [], responseActions: [actions],
    definitions: new Map([[definitionUrl, definition]]), diagnostics: [],
  } as unknown as ResolvedBundle;
}

const path = `/filing/${vector.keys.orgId}/${vector.keys.period}`;

beforeAll(async () => {
  await initFormspecEngine();
});

async function mount(node: React.ReactNode) {
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  await act(async () => root.render(node));
  return container;
}

it('renders and files the Core subject id through runtime WASM only', async () => {
  const onDefinitionActionResult = vi.fn();
  const container = await mount(<SurfaceApp bundle={bundle()} location={path} onNavigate={() => {}}
    onDefinitionActionResult={onDefinitionActionResult} setDocumentTitle={false} />);
  await vi.waitFor(() => expect(container.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe('2026'));
  await act(async () => { container.querySelector<HTMLButtonElement>('button.formspec-submit')!.click(); });
  expect(onDefinitionActionResult.mock.lastCall?.[0].detail.response.subject)
    .toEqual({ type: vector.type, keys: vector.keys, id: vector.id });
  expect(initFormspecEngineTools).not.toHaveBeenCalled();
  expect(isFormspecEngineToolsInitialized()).toBe(false);
});

it('keys the host draft by the Core subject id through runtime WASM only', async () => {
  const loads: DraftKey[] = [];
  window.location.hash = `#${path}`;
  const container = await mount(<BrowserSurfaceApp bundle={bundle()} adapters={{ mode: 'hash', draftStorage: {
    scope: 'subject-runtime-only',
    port: {
      load: async (key) => { loads.push(key); return { status: 'absent' as const }; },
      save: async () => ({ status: 'saved' as const, revision: '1' }),
      readSummaries: async () => new Map(),
    },
  } }} />);
  await vi.waitFor(() => expect(container.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe('2026'));
  expect(loads.map(key => key.subject)).toEqual([{ type: vector.type, keys: vector.keys, id: vector.id }]);
  expect(initFormspecEngineTools).not.toHaveBeenCalled();
  expect(isFormspecEngineToolsInitialized()).toBe(false);
});

// A delegating renderer may rewrite the render input; the planned subject still names the filing unit.
const forgedId: SurfaceDefinitionFormRenderer = input => renderDefaultDefinitionForm({
  ...input, responseSubject: { ...input.responseSubject!, id: crypto.randomUUID() },
});

it('keys the draft by the planned subject when a renderer supplies another id', async () => {
  const loads: DraftKey[] = [];
  window.location.hash = `#${path}`;
  const container = await mount(<BrowserSurfaceApp bundle={bundle()} adapters={{ mode: 'hash', renderDefinitionForm: forgedId,
    draftStorage: { scope: 'subject-forged-id', port: {
      load: async (key) => { loads.push(key); return { status: 'absent' as const }; },
      save: async () => ({ status: 'saved' as const, revision: '1' }),
      readSummaries: async () => new Map(),
    } } }} />);
  await vi.waitFor(() => expect(container.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe('2026'));
  expect(loads.map(key => key.subject?.id)).toEqual([vector.id]);
});

it('keeps the engine when a renderer supplies another id for the same subject', async () => {
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  const same = bundle();
  const show = () => act(async () => root.render(<SurfaceApp bundle={same} location={path} onNavigate={() => {}}
    renderDefinitionForm={forgedId} setDocumentTitle={false} />));
  await show();
  const name = () => container.querySelector<HTMLInputElement>('input[type="text"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(name(), 'typed answer');
    name().dispatchEvent(new Event('input', { bubbles: true }));
  });
  await show();
  expect(name().value).toBe('typed answer');
});

it('reaches storage for review reads and saves with the Core id through runtime WASM only', async () => {
  const keys: (string | undefined)[] = [];
  const definition = bundle().definitions.get(definitionUrl)!;
  const session = createDraftSession({ scope: 'subject-review-paths', port: {
    load: async (key) => { keys.push(key.subject?.id); return { status: 'absent' as const }; },
    loadFiling: async (key) => { keys.push(key.subject?.id); return { status: 'absent' as const }; },
    save: async () => ({ status: 'saved' as const, revision: '1' }),
    readSummaries: async () => new Map(),
  } });
  const subject = { type: vector.type, keys: vector.keys };
  try {
    expect((await session.readCommitted(definition, subject)).status).toBe('absent');
    expect((await session.readFiling(definition, subject)).status).toBe('absent');
    expect(await session.acknowledgeWarningGroup({
      definition, subject, expectedRevision: '1', expectedBasis: 'basis', code: 'UNANSWERED_QUESTIONS',
    })).toBe('failed');
  } finally {
    session.dispose();
  }
  expect(keys).toEqual([vector.id, vector.id, vector.id]);
  expect(initFormspecEngineTools).not.toHaveBeenCalled();
  expect(isFormspecEngineToolsInitialized()).toBe(false);
});
