/** @filedesc Explicit revision-checked DraftPort.repinDraft tests (Core §4260). */
import { describe, expect, it } from 'vitest';
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import type { DraftKey } from '@formspec-org/surface';
import { draftPortConformance } from '@formspec-org/surface/draft-port-conformance';
import type { FormDefinition, FormResponse, ResponseSelection, ResponseSelectionDelivery } from '@formspec-org/types';
import { createMemoryFilingStore, previewResponseRecordTools } from '../src/browser-draft-port.js';

const scope = 'repin-scope';
const version = '1.0.0';
const upstreamUrl = 'https://example.test/forms/upstream-baseline';
const consumerUrl = 'https://example.test/forms/consumer-report';

const upstreamDef: FormDefinition = {
  $formspec: '1.0',
  url: upstreamUrl,
  version,
  title: 'Upstream Baseline',
  subject: { type: 'urn:test:unit', keys: { unitId: { dataType: 'string' } } },
  items: [
    { key: 'baseline', type: 'field', dataType: 'integer', label: 'Baseline' },
    { key: 'summary', type: 'field', dataType: 'string', label: 'Summary' },
  ],
};

const selection: ResponseSelection = {
  definition: { url: upstreamUrl },
  subject: [{ key: 'unitId', op: 'eq', from: { subject: 'unitId' } }],
  status: 'completed',
  cardinality: 'latest',
  pin: 'at-open',
};

const consumerDef: FormDefinition = {
  $formspec: '1.0',
  url: consumerUrl,
  version,
  title: 'Consumer Report',
  subject: { type: 'urn:test:unit', keys: { unitId: { dataType: 'string' } } },
  instances: {
    prior: {
      response: selection,
      schema: { baseline: 'integer', summary: 'string' },
    },
  },
  items: [
    {
      key: 'carried',
      type: 'field',
      dataType: 'integer',
      label: 'Carried baseline',
      prePopulate: { instance: 'prior', path: 'baseline' },
    },
    { key: 'note', type: 'field', dataType: 'string', label: 'Unrelated note' },
    { key: 'amount', type: 'field', dataType: 'integer', label: 'Reported amount' },
  ],
  shapes: [
    {
      id: 'warn-delta',
      severity: 'warning',
      code: 'DELTA_EXCEEDS_BASELINE',
      message: 'Amount exceeds carried baseline',
      target: 'amount',
      constraint: "$ <= @instance('prior').baseline",
      explanation: 'explain',
    },
  ],
};

async function makeCompletedUpstream(
  unitId: string,
  responseId: string,
  authored: string,
  data: { baseline: number; summary: string },
) {
  const tools = await previewResponseRecordTools();
  const subject = { type: 'urn:test:unit', keys: { unitId }, id: tools.subjectId('urn:test:unit', { unitId }) };
  const candidate = {
    $formspecResponse: '1.0',
    definitionUrl: upstreamUrl,
    definitionVersion: version,
    id: responseId,
    status: 'completed',
    authored,
    subject,
    data,
  };
  return {
    key: { scope, definitionUrl: upstreamUrl, subject } as DraftKey,
    exactJson: JSON.stringify(candidate, null, 2) + '\n',
    draftJson: JSON.stringify({ ...candidate, status: 'in-progress' }),
  };
}

async function fileUpstream(
  store: ReturnType<typeof createMemoryFilingStore>,
  unitId: string,
  responseId: string,
  authored: string,
  data: { baseline: number; summary: string },
) {
  const built = await makeCompletedUpstream(unitId, responseId, authored, data);
  const saved = await store.drafts.save({
    key: built.key,
    definitionVersion: version,
    expectedRevision: null,
    snapshotJson: JSON.stringify({ definitionUrl: upstreamUrl, definitionVersion: version, data }),
    responseJson: built.draftJson,
    summary: null,
  });
  expect(saved.status).toBe('saved');
  if (saved.status !== 'saved') throw new Error('upstream checkpoint failed');
  const filed = await store.submit(
    { key: built.key, definitionVersion: version, revision: saved.revision, responseJson: built.draftJson },
    built.exactJson,
  );
  expect(filed.status).toBe('filed');
  return built;
}

describe('DraftPort explicit revision-checked repinDraft (Core §4260)', () => {
  it('passes shared draftPortConformance explicit re-pin fixture', async () => {
    await initFormspecEngine();
    const tools = await previewResponseRecordTools();
    let allowed = true;
    const defUrl = 'https://example.test/definition';
    const listUrl = 'urn:test:list';
    const listSelection: ResponseSelection = {
      definition: { url: listUrl },
      subject: [],
      status: 'completed',
      cardinality: 'latest',
      pin: 'at-open',
    };
    const listDef: FormDefinition = {
      $formspec: '1.0',
      url: listUrl,
      version,
      title: 'List',
      subject: { type: listUrl, keys: {} },
      items: [{ key: 'answer', type: 'field', dataType: 'string' }],
    };
    const reportDef: FormDefinition = {
      $formspec: '1.0',
      url: defUrl,
      version,
      title: 'Report',
      subject: { type: 'urn:test:unit', keys: { year: { dataType: 'integer' } } },
      instances: { list: { response: listSelection, schema: { answer: 'string' } } },
      items: [
        { key: 'carried', type: 'field', dataType: 'string' },
        { key: 'note', type: 'field', dataType: 'string' },
      ],
    };
    const store = createMemoryFilingStore({
      scope: 'scope-a',
      definitions: new Map([[defUrl, reportDef], [listUrl, listDef]]),
      authorize: () => allowed,
    });
    const key: DraftKey = {
      scope: 'scope-a',
      definitionUrl: defUrl,
      subject: { type: 'urn:test:unit', keys: { year: 2025 }, id: tools.subjectId('urn:test:unit', { year: 2025 }) },
    };
    async function fileList(id: string, authored: string) {
      const subject = { type: listUrl, keys: {}, id: tools.subjectId(listUrl, {}) };
      const cand = {
        $formspecResponse: '1.0',
        definitionUrl: listUrl,
        definitionVersion: version,
        id,
        status: 'completed',
        authored,
        subject,
        data: { answer: id },
      };
      const exact = JSON.stringify(cand, null, 2) + '\n';
      const draftJson = JSON.stringify({ ...cand, status: 'in-progress' });
      const listKey = { scope: 'scope-a', definitionUrl: listUrl, subject };
      const saved = await store.drafts.save({
        key: listKey, definitionVersion: version, expectedRevision: null,
        snapshotJson: JSON.stringify({ definitionUrl: listUrl, definitionVersion: version, data: cand.data }),
        responseJson: draftJson, summary: null,
      });
      if (saved.status !== 'saved') throw new Error('save failed');
      const filed = await store.submit({ key: listKey, definitionVersion: version, revision: saved.revision, responseJson: draftJson }, exact);
      if (filed.status !== 'filed') throw new Error('submit failed');
    }

    await draftPortConformance['explicitly re-pins an at-open filing against its expected revision']({
      port: store.drafts,
      deny: () => { allowed = false; },
      key,
      pins: {
        instance: 'list',
        initialResponseId: 'urn:list:1',
        newerResponseId: 'urn:list:2',
        addInitial: () => fileList('urn:list:1', '2026-01-01T00:00:00Z'),
        addNewer: () => fileList('urn:list:2', '2026-01-02T00:00:00Z'),
        async select(pin?: ResponseSelectionDelivery) {
          return (await store.responses.select([{
            key: 'list', scope: 'scope-a', kind: 'definition', selection: listSelection, projection: ['answer'],
            ...(pin && { pin }),
          }])).get('list')!;
        },
      },
    });
  });

  it('derives refillFields from Definition prePopulate, rechecks explanation basis, refuses signed/completed drafts, and keeps prior filings byte-identical', async () => {
    await initFormspecEngine();
    const tools = await previewResponseRecordTools();
    const store = createMemoryFilingStore({
      scope,
      definitions: new Map([[upstreamUrl, upstreamDef], [consumerUrl, consumerDef]]),
    });

    const firstFiling = await fileUpstream(store, 'u-1', 'urn:up:1', '2026-01-01T00:00:00Z', { baseline: 100, summary: 'v1' });
    const subject = { type: 'urn:test:unit', keys: { unitId: 'u-1' }, id: tools.subjectId('urn:test:unit', { unitId: 'u-1' }) };
    const consumerKey: DraftKey = { scope, definitionUrl: consumerUrl, subject };

    const initialSelection = (await store.responses.select([{
      key: 'prior', scope, kind: 'definition', selection, consumerSubject: subject.keys, projection: ['baseline', 'summary'],
    }])).get('prior')!;
    expect(initialSelection.status).toBe('available');
    if (initialSelection.status !== 'available') throw new Error('expected available');
    const { status: _s, newer: _n, ...initialPin } = initialSelection;

    // Create consumer draft using FormEngine with an explained warning (amount 150 > baseline 100).
    const engine = createFormEngine(consumerDef, {
      responseSubject: subject,
      responseInstanceResolutions: { prior: initialPin },
    });
    expect(engine.signals.carried.value).toBe(100);
    engine.setValue('note', 'Keep my unrelated narrative');
    engine.setValue('amount', 150);
    engine.setExplanation('warn-delta', 'amount', { text: 'Explained against baseline 100' });
    const draftSave = await store.drafts.save({
      key: consumerKey,
      definitionVersion: version,
      expectedRevision: null,
      creationPins: { prior: initialPin },
      explanations: engine.getExplanationEntries(),
      snapshotJson: JSON.stringify(engine.getDraftSnapshot()),
      responseJson: JSON.stringify(engine.getResponse({ id: 'urn:cons:1', profile: 'off' })),
      summary: null,
    });
    engine.dispose();
    expect(draftSave.status).toBe('saved');
    if (draftSave.status !== 'saved') throw new Error('save failed');

    // File newer upstream with baseline 120.
    const secondFiling = await fileUpstream(store, 'u-1', 'urn:up:2', '2026-02-01T00:00:00Z', { baseline: 120, summary: 'v2' });

    // Re-pin without explicit refillValues: carried must derive from prePopulate (120),
    // note must stay intact, and explanation basis against old baseline 100 must be rechecked (now stale)!
    const repinned = await store.drafts.repinDraft!({
      key: consumerKey,
      definitionVersion: version,
      expectedRevision: draftSave.revision,
      instances: [{ instance: 'prior', priorValueDigest: initialPin.valueDigest, priorRecords: initialPin.records }],
      refillFields: ['carried'],
    });
    expect(repinned.status).toBe('repinned');
    if (repinned.status !== 'repinned') throw new Error('repin failed');

    expect(repinned.draft.pins.prior?.records[0]?.responseId).toBe('urn:up:2');
    const snap = JSON.parse(repinned.draft.snapshotJson) as { data: Record<string, unknown> };
    const resp = JSON.parse(repinned.draft.responseJson) as FormResponse;
    expect(snap.data.carried).toBe(120);
    expect(snap.data.note).toBe('Keep my unrelated narrative');
    expect(snap.data.amount).toBe(150);
    expect(resp.data.carried).toBe(120);
    expect(resp.data.note).toBe('Keep my unrelated narrative');

    // Reopen FormEngine with repinned draft: warning explanation basis must no longer be accepted!
    const reopened = createFormEngine(consumerDef, {
      responseSubject: subject,
      responseInstanceResolutions: repinned.draft.pins,
      draftSnapshot: JSON.parse(repinned.draft.snapshotJson),
      savedExplanations: resp.explanations,
    });
    const submitEval = reopened.getSubmitEvaluation!();
    expect(submitEval.evaluated.report.valid).toBe(false);
    expect(submitEval.evaluated.report.results.some(r => r.code === 'EXPLANATION_REQUIRED' || r.code === 'EXPLANATION_STALE')).toBe(true);
    reopened.dispose();

    // Verify prior upstream filings remained byte-identical!
    const loadedFiling = await store.drafts.loadFiling!(secondFiling.key, version);
    expect(loadedFiling.status).toBe('loaded');
    if (loadedFiling.status === 'loaded') {
      expect(loadedFiling.filing.responseJson).toBe(secondFiling.exactJson);
    }
    const firstCheck = await store.responses.select([{
      key: 'prior', scope, kind: 'definition', selection, consumerSubject: subject.keys, projection: ['baseline', 'summary'],
      pin: initialPin,
    }]);
    expect(firstCheck.get('prior')).toMatchObject({
      status: 'available',
      value: { baseline: 100, summary: 'v1' },
      records: [{ responseId: 'urn:up:1' }],
    });
    expect(firstFiling.exactJson).toContain('"baseline": 100');

    // Refuse re-pin on a signed draft!
    const signedResp = {
      ...resp,
      authoredSignatures: [{ id: 'sig-1', role: 'signer', format: 'cose', value: 'AAAA' }],
    };
    const signedSave = await store.drafts.save({
      key: consumerKey,
      definitionVersion: version,
      expectedRevision: repinned.draft.revision,
      snapshotJson: repinned.draft.snapshotJson,
      responseJson: JSON.stringify(signedResp),
      summary: null,
    });
    expect(signedSave.status).toBe('saved');
    if (signedSave.status !== 'saved') throw new Error('signed save failed');

    const refusedSigned = await store.drafts.repinDraft!({
      key: consumerKey,
      definitionVersion: version,
      expectedRevision: signedSave.revision,
      instances: [{ instance: 'prior', priorValueDigest: repinned.draft.pins.prior!.valueDigest }],
    });
    expect(refusedSigned.status).toBe('conflict');
  });
});
