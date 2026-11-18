/** @filedesc Verify sibling forms read only the committed filtered Response. */
import { initFormspecEngine } from '@formspec-org/engine';
import type { DataSourceLoadRequest } from '@formspec-org/surface';
import type { FormDefinition } from '@formspec-org/types';
import { beforeAll, expect, it, vi } from 'vitest';
import * as reads from '../src/draft-data-source.js';
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
const request = {
  descriptor: {
    catalogRef: 'https://example.test/sources', sourceRef: 'upstream',
    source: { id: 'upstream', kind: 'definition-response', runtime: { delivery: 'live' }, responseSelection: selection },
  },
  context: { subject, params: {} },
  responseSelection: selection,
} as unknown as DataSourceLoadRequest;
beforeAll(async () => { await initFormspecEngine(); });

it('uses the authorized same-unit current Response and its selection evidence', async () => {
  const address = await deriveDraftSubject(subject);
  const load = vi.fn(async () => ({
    status: 'loaded' as const,
    draft: {
      revision: 'r1',
      snapshotJson: JSON.stringify({ data: { visible: 'saved', hidden: 'private' } }),
      responseJson: JSON.stringify({
        $formspecResponse: '1.0', definitionUrl: definition.url, definitionVersion: definition.version,
        status: 'in-progress', authored: '2026-01-01T00:00:00Z', id: 'draft-1',
        subject: address, data: { visible: 'saved' },
      }),
    },
  }));
  const session = createDraftSession({
    scope: 'edition', port: { load, save: vi.fn(), readSummaries: vi.fn() },
  });
  const baseline = vi.fn(() => ({ status: 'unavailable' as const, reason: 'baseline' }));
  const result = await reads.readCurrentDraft(session, definitions, request, baseline);
  // The shared committed read can now cancel when its session ends.
  expect(load).toHaveBeenCalledWith({ scope: 'edition', definitionUrl: definition.url, subject: address },
    definition.version, expect.any(AbortSignal));
  expect(result).toMatchObject({
    status: 'loaded', value: { visible: 'saved' }, records: [{ responseId: 'draft-1', definitionVersion: '1.0.0' }], none: false,
  });
  if (result.status === 'loaded') expect(result.value).not.toHaveProperty('hidden');
  expect(baseline).not.toHaveBeenCalled();
  session.dispose();
});
