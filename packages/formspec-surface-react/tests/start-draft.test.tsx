/** @filedesc A store creates independent units from one set of parents and resumes both. */
import { expect, it } from 'vitest';
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
