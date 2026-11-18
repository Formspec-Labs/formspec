/** @filedesc Verify sibling forms read only the committed filtered Response. */
import { initFormspecEngine } from '@formspec-org/engine';
import { responseSourceLoader, type DataSourceLoadRequest } from '@formspec-org/surface';
import type { FormDefinition } from '@formspec-org/types';
import { beforeAll, expect, it, vi } from 'vitest';
import { createMemoryFilingStore } from '../src/browser-draft-port.js';
import { readSessionDraft } from '../src/draft-data-source.js';
import { createDraftSession, deriveDraftSubject } from '../src/draft-session.js';

const definition: FormDefinition = {
  $formspec: '1.0', url: 'https://example.test/upstream', version: '1.0.0', title: 'Upstream', items: [],
  subject: { type: 'urn:test:unit', keys: { year: { dataType: 'integer' } } },
};
const definitions = new Map([[definition.url, definition]]);
const subject = { type: 'urn:test:unit', keys: { year: 2026 } };
const selection = {
  definition: { url: definition.url }, subject: [{ key: 'year', op: 'eq', from: { subject: 'year' } }],
  status: 'current', cardinality: 'latest', pin: 'none',
} as const;
const source = { id: 'upstream', kind: 'definition-response', definitionRef: definition.url,
  runtime: { delivery: 'live' }, responseSelection: selection };
const catalog = { $formspecDataSources: '1.0', id: 'https://example.test/sources', version: '1.0.0', sources: [source] };
const request = {
  descriptor: { catalogRef: catalog.id, sourceRef: source.id, catalog, source },
  context: { subject, params: {} },
  responseSelection: selection,
} as unknown as DataSourceLoadRequest;
beforeAll(async () => { await initFormspecEngine(); });

it('uses the authorized same-unit current Response and its selection evidence', async () => {
  const address = await deriveDraftSubject(subject);
  const scope = 'edition';
  const store = createMemoryFilingStore({ scope, definitions, catalogs: [{ catalogRef: catalog.id, document: request.descriptor.catalog }] });
  const saved = await store.drafts.save({
    key: { scope, definitionUrl: definition.url, subject: address },
    definitionVersion: definition.version, expectedRevision: null, summary: null,
    snapshotJson: JSON.stringify({ data: { visible: 'saved', hidden: 'private' } }),
    responseJson: JSON.stringify({
      $formspecResponse: '1.0', definitionUrl: definition.url, definitionVersion: definition.version,
      status: 'in-progress', authored: '2026-01-01T00:00:00Z', id: 'draft-1',
      subject: address, data: { visible: 'saved' },
    }),
  });
  expect(saved.status).toBe('saved');
  const result = await responseSourceLoader(store.responses)(request);
  expect(result).toMatchObject({
    status: 'loaded', value: { visible: 'saved' }, records: [{ responseId: 'draft-1', definitionVersion: '1.0.0' }], none: false,
  });
  if (result.status === 'loaded') expect(result.value).not.toHaveProperty('hidden');
});

it('reads the filtered Response through the committed draft session', async () => {
  const address = await deriveDraftSubject(subject);
  const scope = 'edition';
  const load = vi.fn(async () => ({
    status: 'loaded' as const,
    draft: {
      revision: 'r1', pins: {},
      snapshotJson: JSON.stringify({ data: { visible: 'saved', hidden: 'private' } }),
      responseJson: JSON.stringify({
        $formspecResponse: '1.0', definitionUrl: definition.url, definitionVersion: definition.version,
        status: 'in-progress', authored: '2026-01-01T00:00:00Z', id: 'draft-1',
        subject: address, data: { visible: 'saved' },
      }),
    },
  }));
  const session = createDraftSession({ scope, port: { load, save: vi.fn(), readSummaries: vi.fn() } });
  const draftSource = { ...request.descriptor.source, runtime: { ...request.descriptor.source.runtime, delivery: 'draft' as const } };
  const result = await readSessionDraft(session, definitions, { ...request, descriptor: { ...request.descriptor, source: draftSource } });
  expect(load).toHaveBeenCalledWith({ scope, definitionUrl: definition.url, subject: address },
    definition.version, expect.any(AbortSignal));
  expect(result).toMatchObject({ status: 'loaded', value: { visible: 'saved' }, recordId: 'draft-1', revision: 'r1' });
  if (result.status === 'loaded') expect(result.value).not.toHaveProperty('hidden');
  session.dispose();
});
