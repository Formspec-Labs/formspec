/** @filedesc A store creates independent units from one set of parents and resumes both. */
import { act } from 'react';
import { dereferenceBundleExport } from '@formspec-org/surface';
import { BrowserSurfaceApp } from '../src/BrowserSurfaceApp.js';
import { render } from './render.js';
import { expect, it, vi } from 'vitest';
import { createMemoryFilingStore } from '../src/browser-draft-port.js';
import type { FormDefinition } from '@formspec-org/types';
import { checkMintedDraftStart } from '../../formspec-surface/src/draft-port-conformance.js';

const definition: FormDefinition = {
  $formspec: '1.0', url: 'urn:test:project', version: '1.0', title: 'Project', items: [{ key: 'answer', type: 'field', dataType: 'string', label: 'Project name' }],
  subject: { type: 'urn:test:unit', keys: { year: { dataType: 'integer' }, unit: { dataType: 'string', minted: true } } },
};
const definitions = new Map([[definition.url, definition]]);
const input = { scope: 'demo', definitionUrl: definition.url, definitionVersion: definition.version,
  subject: { type: definition.subject!.type, keys: { year: 2025 } } };

it('creates once per attempt, resumes untouched units and preserves the first edited revision', async () => {
  await checkMintedDraftStart(createMemoryFilingStore({ scope: input.scope, definitions }).drafts, input);
});

it('refuses supplied minted keys, incomplete parents, wrong scope and a refused open', async () => {
  const store = createMemoryFilingStore({ scope: input.scope, definitions }).drafts;
  for (const subject of [{ ...input.subject, keys: { year: 2025, unit: 'caller-value' } },
    { ...input.subject, keys: {} }, { ...input.subject, keys: { year: '2025' } }]) {
    expect((await store.start({ ...input, subject, attemptId: 'one' })).status).toBe('invalid-subject');
  }
  expect((await store.start({ ...input, scope: 'elsewhere', attemptId: 'two' })).status).toBe('denied');
  const restricted = createMemoryFilingStore({ scope: input.scope, definitions, authorize: () => false, authorizeOpen: () => false });
  expect((await restricted.drafts.start({ ...input, attemptId: 'three' })).status).toBe('denied');
});

it('opens two new units on their own URLs and resumes both through browser navigation', async () => {
  const store = createMemoryFilingStore({ scope: input.scope, definitions });
  const load = vi.spyOn(store.drafts, 'load');
  const start = vi.spyOn(store.drafts, 'start');
  const beforeLeave = vi.fn(() => true).mockReturnValueOnce(false);
  const surface = 'urn:test:surface';
  const bundle = dereferenceBundleExport({
    manifest: { $formspecBundle: '2.4', id: 'urn:test:app', entrySurface: surface,
      definitions: [{ url: definition.url }], surfaces: [{ url: surface }] },
    documents: { [definition.url]: definition, [surface]: {
      $formspecSurface: '0.4', id: 'projects', entry: 'list', routes: [
        { id: 'list', path: '/list/{year}', params: [{ name: 'year', type: 'string' }], slots: [
          { id: 'start', slotType: 'draft-start', binding: { label: 'Create project', routeRef: 'project', slotRef: 'form' } },
        ] },
        { id: 'project', path: '/edit/{year}/{unit}', params: [{ name: 'year', type: 'string' }, { name: 'unit', type: 'string' }], slots: [
          { id: 'form', slotType: 'definition-form', binding: { definitionRef: definition.url, subjectKeys: { year: 'year', unit: 'unit' } } },
        ] },
      ],
    } },
  });
  const original = window.location.href;
  function visit(path: string) {
    act(() => {
      window.history.replaceState(null, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  }
  try {
    visit('/list/2025');
    const host = render(<BrowserSurfaceApp beforeLeave={beforeLeave} bundle={bundle} draftStorage={{ scope: input.scope, port: store.drafts }} />);
    const addresses = [];
    for (let i = 0; i < 2; ++i) {
      await vi.waitFor(() => expect([...host.querySelectorAll('button')].some(node => node.textContent === 'Create project')).toBe(true));
      const button = [...host.querySelectorAll('button')].find(node => node.textContent === 'Create project')!;
      if (i === 0) {
        await act(async () => { button.click(); });
        await vi.waitFor(() => expect(beforeLeave).toHaveBeenCalledOnce());
        expect(window.location.pathname).toBe('/list/2025');
      }
      await act(async () => { button.click(); button.click(); });
      if (i === 0) {
        expect(start).toHaveBeenCalledTimes(2);
        expect(start.mock.calls[0][0].attemptId).toBe(start.mock.calls[1][0].attemptId);
      }
      await vi.waitFor(() => expect(window.location.pathname).toMatch(/^\/edit\/2025\/[^/]+$/));
      await vi.waitFor(() => expect(host.querySelector('[data-name="answer"] input')).not.toBeNull());
      // Save an answer through the port, then revisit through the real editor and read its rendered value.
      const key = load.mock.lastCall![0];
      const initial = await store.drafts.load(key, definition.version);
      if (initial.status !== 'initialized') throw new Error('expected untouched unit');
      const data = { answer: `Project ${i}` };
      const saved = await store.drafts.save({ key, definitionVersion: definition.version, expectedRevision: initial.revision, summary: null,
        snapshotJson: JSON.stringify({ definitionUrl: definition.url, definitionVersion: definition.version, data }),
        responseJson: JSON.stringify({ $formspecResponse: '1.0', id: `urn:test:project:${i}`, status: 'in-progress',
          authored: '2026-01-01T00:00:00Z', definitionUrl: definition.url, definitionVersion: definition.version, subject: key.subject, data }),
      });
      expect(saved.status).toBe('saved');
      addresses.push(window.location.pathname);
      visit('/list/2025');
    }
    expect(new Set(addresses).size).toBe(2);
    for (const [i, path] of addresses.entries()) {
      load.mockClear();
      visit(path);
      await vi.waitFor(() => expect(load).toHaveBeenCalledWith(expect.objectContaining({
        subject: expect.objectContaining({ keys: { year: 2025, unit: path.split('/').at(-1) } }),
      }), definition.version, expect.any(AbortSignal)));
      await vi.waitFor(() => expect(host.querySelector<HTMLInputElement>('[data-name="answer"] input')?.value).toBe(`Project ${i}`));
    }
  } finally {
    visit(original);
  }
});

it('keeps a minted address on confirmed restart after a Definition version change', async () => {
  const versions = new Map(definitions);
  const store = createMemoryFilingStore({ scope: input.scope, definitions: versions }).drafts;
  const result = await store.start({ ...input, attemptId: 'start' });
  expect(result.status).toBe('started');
  if (result.status !== 'started') throw new Error('start failed');
  const key = { scope: input.scope, definitionUrl: definition.url, subject: result.subject };
  versions.set(definition.url, { ...definition, version: '2.0' });
  const mismatch = await store.load(key, '2.0');
  expect(mismatch.status).toBe('version-mismatch');
  if (mismatch.status !== 'version-mismatch') throw new Error('missing version pin');
  expect(await store.restart(key, mismatch.revision)).toEqual({ status: 'discarded' });
  expect(await store.load(key, '2.0')).toMatchObject({ status: 'initialized' });
});

it('refuses a missing required pin, then records a valid empty pin at explicit creation', async () => {
  const versions = new Map(definitions);
  const previous = { ...definition, url: 'urn:test:previous' };
  versions.set(previous.url, previous);
  const source = { definition: { url: previous.url }, subject: [], status: 'completed', cardinality: 'latest', pin: 'at-open' } as const;
  const withPin = (whenNone: 'empty' | 'unavailable'): FormDefinition => ({ ...definition,
    instances: { previous: { schema: { value: 'string' }, response: { ...source, subject: [], whenNone } } },
  });
  versions.set(definition.url, withPin('unavailable'));
  const store = createMemoryFilingStore({ scope: input.scope, definitions: versions }).drafts;
  const command = { ...input, attemptId: 'with-pin' };
  expect(await store.start(command)).toEqual({ status: 'pin-unavailable', instance: 'previous' });
  versions.set(definition.url, withPin('empty'));
  const created = await store.start(command);
  expect(created.status).toBe('started');
  if (created.status !== 'started') throw new Error('start failed');
  const opened = await store.load({ ...input, subject: created.subject }, definition.version);
  expect(opened).toMatchObject({ status: 'initialized', pins: { previous: { none: true, pinned: true, records: [] } } });
  expect(await store.start({ ...command, subject: { ...input.subject, keys: { year: 2026 } } })).toEqual({ status: 'conflict' });
});
