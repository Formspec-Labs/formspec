/** @filedesc Verify exact dependent filing reads through the native preview draft lifecycle. */
import { expect, it, vi } from 'vitest';
import { prepareResponseFiling, prepareResponseFixtures, responsePairKey, type DraftKey } from '@formspec-org/surface';
import type { FormDefinition, ResponseSelection } from '@formspec-org/types';
import type { ResponseActionsDocument } from '@formspec-org/react';
import { createMemoryFilingStore, previewResponseRecordTools, type OpeningResponseDependency } from '../src/browser-draft-port.js';
import { definitionResponseRequests, responseDeliveries, type DraftDefinitionResponseRead } from '../src/definition-response-reads.js';
import { createDraftSession } from '../src/draft-session.js';
import { previewFilingInvoker } from '../src/preview-filing-invoker.js';

const scope = 'tenant-a';
const version = '1.0.0';
const sourceUrl = 'urn:fixture:source';
const referenceUrl = 'urn:fixture:reference';
const consumerUrl = 'urn:fixture:consumer';
const accepted = 'urn:decision:accepted';
const subjectType = 'urn:fixture:unit';
const subjectDeclaration = { type: subjectType, keys: { unit: { dataType: 'string' as const } } };
const sameUnit: ResponseSelection['subject'] = [{ key: 'unit', op: 'eq', from: { subject: 'unit' } }];

function definition(url: string): FormDefinition {
  return { $formspec: '1.0', url, version, title: url, items: [{ key: 'label', label: 'Label', type: 'field', dataType: 'string' }] };
}

function openingSelection(url: string): ResponseSelection {
  return { definition: { url, compatibleVersions: '^1.0.0' }, subject: [], status: 'completed',
    disposition: accepted, cardinality: 'latest', pin: 'at-open', whenNone: 'empty' };
}

const consumer: FormDefinition = { ...definition(consumerUrl), subject: subjectDeclaration,
  items: [{ key: 'label', label: 'Label', type: 'field', dataType: 'string', prePopulate: { instance: 'exact', path: 'label' } }],
  instances: {
    exact: { response: { ...openingSelection(sourceUrl), subject: sameUnit }, schema: { label: 'string' } },
    reference: { response: openingSelection(referenceUrl), schema: { label: 'string' } },
    other: { response: { ...openingSelection(sourceUrl), subject: sameUnit }, schema: { label: 'string' } },
  },
};
const definitions = new Map<string, FormDefinition>([
  [sourceUrl, { ...definition(sourceUrl), subject: subjectDeclaration }],
  [referenceUrl, definition(referenceUrl)],
  [consumerUrl, consumer],
]);

async function fixture(mode: 'valid' | 'wrong-digest' | 'wrong-scope' | 'wrong-version' | 'wrong-reference-version' | 'wrong-subject' |
  'source-denied' | 'target-denied' | 'target-space-denied' | 'target-disposition' | 'unrelated-unresolved' | 'failure',
  { legacy = false } = {}) {
  const tools = await previewResponseRecordTools();
  const filingSubject = (unit: string) => ({ type: subjectType, keys: { unit }, id: tools.subjectId(subjectType, { unit }) });
  const key: DraftKey = { scope, definitionUrl: consumerUrl, subject: filingSubject('a') };
  function filingJson(url: string, name: string, day: number, extensions?: unknown, definitionVersion = version) {
    const unit = name === 'older' && mode === 'wrong-subject' ? 'b' : 'a';
    return JSON.stringify({ $formspecResponse: '1.0', definitionUrl: url, definitionVersion,
      id: `urn:fixture:${name}`, status: 'completed', authored: `2026-01-0${day}T00:00:00Z`,
      data: { label: name, hidden: 'unprojected' }, ...(url === sourceUrl && { subject: filingSubject(unit) }),
      ...(extensions && typeof extensions === 'object' ? { extensions } : {}) });
  }
  const older = filingJson(sourceUrl, 'older', 1, undefined, mode === 'wrong-version' ? '2.0.0' : version);
  const newer = filingJson(sourceUrl, 'newer', 2);
  const { responseId, responseHash, definitionVersion } = prepareResponseFiling(
    mode === 'wrong-scope' ? 'tenant-b' : scope, definitions, older, 'fixture', tools);
  const reference = { responseId, responseHash: mode === 'wrong-digest' ? `sha256:${'a'.repeat(64)}` : responseHash,
    definitionVersion: mode === 'wrong-reference-version' ? '1.9.0' : definitionVersion };
  const source = filingJson(referenceUrl, 'authority', 3, { 'x-linked-filing': reference });
  const filings = mode === 'wrong-scope' ? [newer, source] : [older, newer, source];
  const decisions = filings.flatMap(responseJson => {
    if (responseJson === older && mode === 'target-disposition') return [];
    const record = prepareResponseFiling(scope, definitions, responseJson, 'fixture', tools);
    return [{ responseId: record.responseId, responseHash: record.responseHash,
      decision: responseJson === newer && mode === 'unrelated-unresolved'
        ? { status: 'unavailable' as const }
        : { status: 'decided' as const, review: 'accepted' as const, disposition: accepted, comments: [] } }];
  });
  const referenceReader = vi.fn((record: Parameters<OpeningResponseDependency['reference']>[0]) => {
    if (mode === 'failure') throw new Error('reference extraction failed');
    return record.extensions?.['x-linked-filing'] as ReturnType<OpeningResponseDependency['reference']>;
  });
  let sourceReadable = mode !== 'source-denied';
  const activeConsumer = mode === 'unrelated-unresolved' ? { ...consumer, instances: { ...consumer.instances,
    other: { response: { ...openingSelection(sourceUrl), subject: sameUnit, pin: 'none' as const }, schema: { label: 'string' } },
  } } : consumer;
  const admittedDefinitions = new Map(definitions).set(consumerUrl, activeConsumer);
  const prepared = prepareResponseFixtures(scope, admittedDefinitions, { filings: filings.map(responseJson => ({ responseJson })), decisions }, tools);
  const reviews = new Map(prepared.decisions);
  const sourcePair = responsePairKey(prepareResponseFiling(scope, admittedDefinitions, source, 'fixture', tools));
  const rule = new Map([['exact', { sourceInstance: 'reference', reference: referenceReader }]]);
  const openingResponseDependencies = new Map([[legacy ? 'urn:fixture:other-rule' : consumerUrl, rule]]);
  const store = createMemoryFilingStore({ scope, definitions: admittedDefinitions,
    preparedFixtures: { ...prepared, decisions: reviews }, openingResponseDependencies,
    authorize: (record, relation, request) => {
      if (relation !== 'read') return true;
      if (!sourceReadable && record.definitionUrl === referenceUrl && request === undefined) return false;
      if (mode === 'target-denied' && record.definitionUrl === sourceUrl && request === undefined) return false;
      if (mode === 'target-space-denied' && request?.key === 'exact') return false;
      return true;
    },
  });
  async function scopedRead(expectedRevision: string | null = null, supplied: Partial<DraftDefinitionResponseRead> = {}) {
    return store.drafts.selectDefinitionResponses!({ key, definitionVersion: version, expectedRevision, ...supplied });
  }
  async function select(expectedRevision: string | null = null, supplied: Partial<DraftDefinitionResponseRead> = {}) {
    const read = await scopedRead(expectedRevision, supplied);
    if (read.status !== 'resolved') throw Error(read.status);
    return read.outcomes;
  }
  return { store, referenceReader, reference, key, select, scopedRead, activeConsumer,
    setSourceRead: (available: boolean) => { sourceReadable = available; },
    withdrawSourceAcceptance: () => { reviews.delete(sourcePair); },
    activateDependency: () => { openingResponseDependencies.set(consumerUrl, rule); } };
}

it('creates, resumes, and submits a native pin to the referenced filing while unrelated reads select latest', async () => {
  const { store, referenceReader, reference, key, select, scopedRead } = await fixture('valid');
  const selected = await select(null, structuredClone({ key, definitionVersion: version, expectedRevision: null }));
  expect(selected.get('exact')).toMatchObject({ status: 'available', pinned: true,
    records: [reference], value: { label: 'older' } });
  expect(selected.get('exact')).not.toMatchObject({ value: { hidden: 'unprojected' } });
  expect(selected.get('other')).toMatchObject({ value: { label: 'newer' } });
  expect(await scopedRead(null, { key: { ...key, scope: 'tenant-b' } })).toEqual({ status: 'unavailable' });
  expect(await scopedRead(null, { definitionVersion: '2.0.0' })).toEqual({ status: 'unavailable' });
  expect(await scopedRead(null, { key: { ...key, subject: { ...key.subject!, keys: { unit: 'b' } } } })).toEqual({ status: 'unavailable' });
  expect((await store.responses.select(definitionResponseRequests({ ...consumer, url: 'urn:fixture:other-consumer' }, key)))
    .get('exact')).toMatchObject({ value: { label: 'newer' } });

  const actions: ResponseActionsDocument = { $formspecResponseActions: '1.0', version,
    targetDefinition: { url: consumerUrl }, actions: [{ id: 'file', label: { literal: 'File' }, intent: 'submit',
      effects: [{ type: 'hostEvent', eventName: 'filed' }] }] };
  const input = { plan: { definition: consumer }, grant: {}, responseActionsDocument: actions,
    semanticControlScope: { responseId: 'urn:fixture:consumer-draft' }, responseActionInvoker: previewFilingInvoker(store.submit),
  } as unknown as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
  const open = () => createDraftSession({ scope, port: store.drafts, responses: store.responses });
  const first = open();
  try {
    const draft = await first.acquire(key, input, () => {}).result;
    if (draft.status !== 'ready') throw new Error(draft.status);
    expect(draft.engine.getResponse().data).toEqual({ label: 'older' });
    expect(await draft.writer.flush(true)).toBe(true);
  } finally {
    first.dispose();
  }
  const recorded = await store.drafts.load(key, version);
  if (recorded.status !== 'loaded') throw new Error(recorded.status);
  expect(recorded.draft.pins.exact).toMatchObject({ records: [reference] });

  const calls = referenceReader.mock.calls.length;
  expect(await scopedRead(null)).toEqual({ status: 'conflict' });
  expect(await scopedRead('stale-revision')).toEqual({ status: 'conflict' });
  const normal = await select(recorded.draft.revision);
  expect(normal.get('exact')).toMatchObject({ value: { label: 'older' } });
  expect(normal.get('exact')).not.toHaveProperty('newer');
  expect(referenceReader.mock.calls.length).toBe(calls + 1);
  const resumed = open();
  try {
    const draft = await resumed.acquire(key, input, () => {}).result;
    if (draft.status !== 'ready') throw new Error(draft.status);
    const outcome = await draft.writer.invoke({ document: actions, actionRef: 'file', ports: {
      submit: ({ profile }) => draft.engine.getResponseSnapshot({ profile }), dispatchHostEvent: () => {},
    } });
    expect(outcome.status).toBe('completed');
    expect(outcome.detail?.response.resolvedInstances).toContainEqual(expect.objectContaining({ instance: 'exact', records: [
      expect.objectContaining(reference),
    ], pinned: true }));
    expect(await store.drafts.loadFiling!(key, version)).toMatchObject({ status: 'loaded' });
  } finally {
    resumed.dispose();
  }
});

it.each(['wrong-digest', 'wrong-scope', 'wrong-version', 'wrong-reference-version', 'wrong-subject', 'source-denied', 'target-denied', 'target-space-denied',
  'target-disposition', 'failure'] as const)('refuses opening with %s without a replacement or empty pin', async mode => {
  const { store, referenceReader, key, select } = await fixture(mode);
  const selected = await select();
  expect(selected.get('exact')).toEqual({ status: 'unavailable' });
  if (mode === 'source-denied' || mode === 'target-space-denied') expect(referenceReader).not.toHaveBeenCalled();
  expect(await store.drafts.save({ key, definitionVersion: version, expectedRevision: null, summary: null,
    snapshotJson: '{}', responseJson: '{}' })).toEqual({ status: 'pin-unavailable', instance: 'exact' });
  expect(await store.drafts.load(key, version)).toEqual({ status: 'absent' });
});

it('keeps ordinary structural and partial batches on native latest', async () => {
  const { store, key, select } = await fixture('valid');
  const requests = definitionResponseRequests(consumer, key).map(request => ({ ...request }));
  const results = await store.responses.select(requests);
  expect(results.get('exact')).toMatchObject({ value: { label: 'newer' } });
  expect((await store.responses.select(requests.filter(request => request.key !== 'reference'))).get('exact'))
    .toMatchObject({ value: { label: 'newer' } });
  expect((await select()).get('exact')).toMatchObject({ value: { label: 'older' } });
});

it('rejects a partial caller-supplied creation pair', async () => {
  const { store, key, select } = await fixture('valid');
  const pins = responseDeliveries(await select());
  const result = await store.drafts.save({ key, definitionVersion: version, expectedRevision: null,
    creationPins: { exact: pins.exact!, other: pins.other! }, snapshotJson: '{}', responseJson: '{}', summary: null });
  expect(result).toEqual({ status: 'pin-unavailable', instance: 'reference' });
  expect(await store.drafts.load(key, version)).toEqual({ status: 'absent' });
});

it('does not save the opening pair after losing the reference during first save', async () => {
  const { store, referenceReader, key, select } = await fixture('valid');
  const creationPins = responseDeliveries(await select());
  expect(Object.keys(creationPins)).toEqual(['exact', 'reference', 'other']);
  referenceReader.mockReturnValue(undefined);
  expect(await store.drafts.save({ key, definitionVersion: version, expectedRevision: null, creationPins,
    snapshotJson: '{}', responseJson: '{}', summary: null })).toEqual({ status: 'pin-unavailable', instance: 'exact' });
  expect(await store.drafts.load(key, version)).toEqual({ status: 'absent' });
});

it('reopens a complete exact pair when a different filing has an unresolved disposition', async () => {
  const { store, reference, key, activeConsumer, select } = await fixture('unrelated-unresolved');
  const opened = await select();
  expect(opened.get('other')).toEqual({ status: 'unavailable' });
  const input = { plan: { definition: activeConsumer }, grant: {} } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
  const session = createDraftSession({ scope, port: store.drafts, responses: store.responses });
  try {
    const ready = await session.acquire(key, input, () => {}).result;
    if (ready.status !== 'ready') throw new Error(ready.status);
    expect(await ready.writer.flush(true)).toBe(true);
    const saved = await store.drafts.load(key, version);
    if (saved.status !== 'loaded') throw new Error(saved.status);
    const resumed = await select(saved.draft.revision);
    expect(resumed.get('exact')).toMatchObject({ status: 'available', records: [reference] });
    expect(resumed.get('exact')).not.toHaveProperty('newer');
    expect(resumed.get('other')).toEqual({ status: 'unavailable' });
  } finally {
    session.dispose();
  }
});

it('saves edits to an existing draft without certifying a prerequisite that became unavailable before reopening', async () => {
  const { store, key, setSourceRead, select } = await fixture('valid');
  const actions: ResponseActionsDocument = {
    $formspecResponseActions: '1.0', version, targetDefinition: { url: consumerUrl },
    actions: [{ id: 'file', label: { literal: 'File' }, intent: 'submit', effects: [{ type: 'hostEvent', eventName: 'filed' }] }],
  };
  const input = { plan: { definition: consumer }, grant: {}, responseActionsDocument: actions,
    semanticControlScope: { responseId: 'urn:fixture:draft-before-loss' }, responseActionInvoker: previewFilingInvoker(store.submit),
  } as unknown as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
  const open = () => createDraftSession({ scope, port: store.drafts, responses: store.responses });
  const first = open();
  try {
    const ready = await first.acquire(key, input, () => {}).result;
    if (ready.status !== 'ready') throw new Error(ready.status);
    expect(await ready.writer.flush(true)).toBe(true);
  } finally {
    first.dispose();
  }
  const original = await store.drafts.load(key, version);
  if (original.status !== 'loaded') throw new Error(original.status);
  setSourceRead(false);
  const selected = await select(original.draft.revision);
  expect(selected.get('reference')).toEqual({ status: 'unavailable' });
  const second = open();
  try {
    const ready = await second.acquire(key, input, () => {}).result;
    if (ready.status !== 'ready') throw new Error(ready.status);
    ready.engine.setValue('label', 'edited after source loss');
    expect(await ready.writer.flush(true)).toBe(true);
    const saved = await store.drafts.load(key, version);
    if (saved.status !== 'loaded') throw new Error(saved.status);
    expect(JSON.parse(saved.draft.snapshotJson).data.label).toBe('edited after source loss');
    expect(saved.draft.pins).toEqual(original.draft.pins);
    const result = await ready.writer.invoke({ document: actions, actionRef: 'file', ports: {
      submit: ({ profile }) => ready.engine.getResponseSnapshot({ profile }), dispatchHostEvent: () => {},
    } }).catch((error: unknown) => error);
    if (result instanceof Error) expect(result.message).toMatch(/(?:exact|reference).*unavailable/i);
    else expect(result).toMatchObject({ status: 'blocked' });
    expect((await store.drafts.loadFiling!(key, version)).status).toBe('absent');
  } finally {
    second.dispose();
  }
});

it('checks Sign and the preview invoker after a source is lost in an already-open draft', async () => {
  const { store, key, setSourceRead, select, referenceReader, withdrawSourceAcceptance } = await fixture('valid');
  const actions: ResponseActionsDocument = { $formspecResponseActions: '1.0', version, targetDefinition: { url: consumerUrl },
    actions: [{ id: 'file', intent: 'submit', effects: [{ type: 'hostEvent', eventName: 'filed' }] }] };
  const invoker = previewFilingInvoker(store.submit);
  const input = { plan: { definition: consumer }, grant: {}, responseActionsDocument: actions,
    semanticControlScope: { responseId: 'urn:fixture:already-open' }, responseActionInvoker: invoker,
  } as unknown as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
  const session = createDraftSession({ scope, port: store.drafts, responses: store.responses });
  try {
    const ready = await session.acquire(key, input, () => {}).result;
    if (ready.status !== 'ready') throw new Error(ready.status);
    expect(await ready.writer.flush(true)).toBe(true);
    setSourceRead(false);
    ready.engine.setValue('label', 'edited while source is unavailable');
    expect(await ready.writer.flush(true)).toBe(true);
    const saved = await store.drafts.load(key, version);
    if (saved.status !== 'loaded') throw new Error(saved.status);
    const signing = vi.fn(async () => ({}));
    await expect(ready.writer.runFenced('sign', signing)).rejects.toThrow(/unavailable/i);
    expect(signing).not.toHaveBeenCalled();
    const invocation = { document: actions, actionRef: 'file', ports: {
      submit: ({ profile }) => ready.engine.getResponseSnapshot({ profile }),
      dispatchHostEvent: () => {},
    } } satisfies Parameters<typeof invoker>[0];
    await expect(ready.writer.invoke(invocation)).rejects.toThrow(/unavailable/i);
    const fence = { key, definitionVersion: version, revision: saved.draft.revision, responseJson: saved.draft.responseJson };
    expect(await invoker({ ...invocation, draftFence: fence })).toMatchObject({ status: 'failed', failureReason: /unavailable/ });
    expect(await store.drafts.loadFiling!(key, version)).toEqual({ status: 'absent' });
    setSourceRead(true);
    const revalidated = await select(saved.draft.revision);
    const originalReference = revalidated.get('exact');
    const replacement = revalidated.get('other');
    if (originalReference?.status !== 'available' || replacement?.status !== 'available') throw Error('Fixture unavailable.');
    const original = originalReference.records[0]!;
    const different = replacement.records[0]!;
    if (!original.responseHash || !different.responseHash) throw Error('Fixture lacks a digest.');
    referenceReader.mockReturnValue({ ...different, responseHash: different.responseHash });
    expect((await select(saved.draft.revision)).get('exact')).toEqual({ status: 'unavailable' });
    expect(await invoker({ ...invocation, draftFence: fence })).toMatchObject({ status: 'failed', failureReason: /unavailable/ });
    referenceReader.mockReturnValue({ ...original, responseHash: original.responseHash });
    expect(await invoker({ ...invocation, draftFence: fence, ports: { ...invocation.ports, submit(options) {
      const detail = invocation.ports.submit(options);
      if (!detail) throw Error('Fixture could not produce a response.');
      return { ...detail, response: { ...detail.response, resolvedInstances: detail.response.resolvedInstances?.map(entry =>
        entry.instance === 'exact' ? { ...entry, valueDigest: 'sha256:' + '0'.repeat(64) } : entry) ?? [] } };
    } } })).toMatchObject({ status: 'failed', failureReason: /invalid-response/ });
    expect((await store.drafts.loadFiling!(key, version)).status).toBe('absent');
    withdrawSourceAcceptance();
    expect(await invoker({ ...invocation, draftFence: fence })).toMatchObject({ status: 'failed', failureReason: /unavailable/ });
    expect((await store.drafts.loadFiling!(key, version)).status).toBe('absent');
  } finally {
    session.dispose();
  }
});

it('blocks Sign, direct Submit, and the preview invoker for a preactivation draft with a mismatched pair', async () => {
  const { store, key, select, activateDependency } = await fixture('valid', { legacy: true });
  const actions: ResponseActionsDocument = { $formspecResponseActions: '1.0', version, targetDefinition: { url: consumerUrl },
    actions: [{ id: 'file', intent: 'submit', effects: [{ type: 'hostEvent', eventName: 'filed' }] }] };
  const invoker = previewFilingInvoker(store.submit);
  const input = { plan: { definition: consumer }, grant: {}, responseActionsDocument: actions,
    semanticControlScope: { responseId: 'urn:fixture:legacy-mismatch' }, responseActionInvoker: invoker,
  } as unknown as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
  const open = () => createDraftSession({ scope, port: store.drafts, responses: store.responses });
  const baseline = open();
  const resumed = open();
  try {
    const earlier = await baseline.acquire(key, input, () => {}).result;
    if (earlier.status !== 'ready') throw Error(earlier.status);
    expect(earlier.engine.getResponse().data).toEqual({ label: 'newer' });
    earlier.engine.setValue('label', 'kept from the earlier draft');
    expect(await earlier.writer.flush(true)).toBe(true);
    const committed = await store.drafts.load(key, version);
    if (committed.status !== 'loaded') throw Error(committed.status);
    expect(committed.draft.pins.exact?.records).toMatchObject([{ responseId: 'urn:fixture:newer' }]);
    const captured = earlier.engine.getResponseSnapshot({ profile: 'on-submit' });
    expect(captured?.response.resolvedInstances).toEqual(expect.arrayContaining([expect.objectContaining({ instance: 'exact',
      records: expect.arrayContaining([expect.objectContaining({ responseId: 'urn:fixture:newer' })]),
    })]));
    const candidate = JSON.stringify({ ...captured!.response, id: JSON.parse(committed.draft.responseJson).id });
    expect(prepareResponseFiling(scope, definitions, candidate, 'preview-submit', await previewResponseRecordTools()).key).toEqual(key);
    activateDependency();
    const fence = { key, definitionVersion: version, revision: committed.draft.revision, responseJson: committed.draft.responseJson };
    expect(await store.submit(fence, candidate)).toEqual({ status: 'unavailable' });
    expect(await invoker({ document: actions, actionRef: 'file', draftFence: fence, ports: {
      submit: () => captured, dispatchHostEvent: () => {},
    } })).toMatchObject({ status: 'failed', failureReason: /unavailable/ });
    expect((await store.drafts.loadFiling!(key, version)).status).toBe('absent');
    expect((await select(fence.revision)).get('exact')).toEqual({ status: 'unavailable' });

    const ready = await resumed.acquire(key, input, () => {}).result;
    if (ready.status !== 'ready') throw Error(ready.status);
    expect(ready.engine.getResponse().data).toEqual({ label: 'kept from the earlier draft' });
    ready.engine.setValue('label', 'edited with the original pair preserved');
    expect(await ready.writer.flush(true)).toBe(true);
    const operation = vi.fn(async () => ({}));
    await expect(ready.writer.runFenced('sign', operation)).rejects.toThrow(/unavailable/i);
    expect(operation).not.toHaveBeenCalled();
    const saved = await store.drafts.load(key, version);
    if (saved.status !== 'loaded') throw Error(saved.status);
    expect(saved.draft.pins).toEqual(committed.draft.pins);
    expect(JSON.parse(saved.draft.snapshotJson).data.label).toBe('edited with the original pair preserved');
  } finally {
    baseline.dispose();
    resumed.dispose();
  }
});
