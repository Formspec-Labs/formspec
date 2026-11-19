/** @filedesc Exercise preview filing ports with synthetic Responses and the real Rust selector. */
import { createDraftSession } from '../src/draft-session.js';
import { expect, it, vi } from 'vitest';
import * as engineModule from '@formspec-org/engine';
import { resolvePageSequence } from '@formspec-org/layout';
import { dereferenceBundleExport, prepareDraftFixtures, prepareResponseFiling, responsePairKey, responseSourceLoader, catalogResponseDigest,
  validateSurfacePreviewScenario, type DataSourceLoadRequest, type DataSourceCatalogHandle, type DraftKey } from '@formspec-org/surface';
import type { FormDefinition, ResponseSelection, DefinitionResponseSelectionRequest, SurfaceScenarioProfile } from '@formspec-org/types';
import { previewFilingInvoker } from '../src/preview-filing-invoker.js';
import { createMemoryFilingStore, previewResponseRecordTools } from '../src/browser-draft-port.js';

const scope = 'edition-a';
const version = '1.0.0';
const list = 'urn:test:list';
const plan = 'urn:test:plan';
const report = 'urn:test:report';
const period = { first: 2024, last: 2026 };
const reportingUnit = { year: 2025, member: 'A' };
const definitions = new Map<string, FormDefinition>([
  [list, definition(list, {})],
  [plan, definition(plan, { first: { dataType: 'integer' }, last: { dataType: 'integer' } })],
  [report, definition(report, { year: { dataType: 'integer' }, member: { dataType: 'string' } })],
]);
type Keys = NonNullable<FormDefinition['subject']>['keys'];

function definition(url: string, keys: Keys): FormDefinition {
  return { $formspec: '1.0', url, version, title: url, subject: { type: url, keys }, items: [
    { key: 'answer', type: 'field', dataType: 'string' },
  ] };
}

async function responseText(definitionUrl: string, keys: Record<string, string | number>,
  id: string, answer: string, authored = '2026-01-01T00:00:00Z') {
  const tools = await previewResponseRecordTools();
  return JSON.stringify({
    $formspecResponse: '1.0', definitionUrl, definitionVersion: version, id, status: 'completed', authored,
    subject: { id: tools.subjectId(definitionUrl, keys), type: definitionUrl, keys }, data: { answer },
  }, null, 2) + '\n';
}

async function checkpoint(store: ReturnType<typeof createMemoryFilingStore>, responseJson: string) {
  const completed = JSON.parse(responseJson);
  const key: DraftKey = { scope, definitionUrl: completed.definitionUrl, subject: completed.subject };
  const draftJson = JSON.stringify({ ...completed, status: 'in-progress' });
  const result = await store.drafts.save({
    key, expectedRevision: null, definitionVersion: version, responseJson: draftJson,
    snapshotJson: JSON.stringify({ definitionUrl: completed.definitionUrl, definitionVersion: version, data: completed.data }),
    summary: null,
  });
  expect(result.status).toBe('saved');
  if (result.status !== 'saved') throw new Error('draft was not saved');
  return { key, definitionVersion: version, revision: result.revision, responseJson: draftJson };
}

const request = (url: string, selection: Partial<ResponseSelection> = {}): DefinitionResponseSelectionRequest => ({
  key: url, scope, kind: 'definition', projection: ['answer'],
  selection: { definition: { url }, subject: [], status: 'completed', cardinality: 'latest', pin: 'none', ...selection },
});

it('checks exact completed filing identity and refuses a duplicate or stale Submit', async () => {
  const responseJson = await responseText(report, reportingUnit, 'urn:report:1', 'original');
  const store = createMemoryFilingStore({ scope, definitions });
  const fence = await checkpoint(store, responseJson);
  expect(await store.submit({ ...fence, revision: 'stale' }, responseJson)).toEqual({ status: 'conflict' });
  expect(await store.submit(fence, responseJson)).toEqual({
    status: 'filed', receiptRef: 'urn:report:1', label: 'preview filing; nothing was sent',
  });
  expect(await store.drafts.load(fence.key, version)).toEqual({ status: 'absent' });
  const duplicate = responseJson.replace('"original"', '"changed"');
  const nextFence = await checkpoint(store, duplicate);
  expect(await store.submit(nextFence, duplicate)).toEqual({ status: 'duplicate-response' });
  expect(await store.drafts.load(fence.key, version)).toMatchObject({ status: 'loaded' });
  expect((await store.responses.select([request(report)])).get(report)).toMatchObject({ value: { answer: 'original' } });
  expect((await store.responses.select([{ ...request(report), scope: 'edition-b' }])).get(report))
    .toEqual({ status: 'unavailable' });
});

it('keeps a prepared draft current without qualifying it as a filing', async () => {
  const filed = await responseText(report, reportingUnit, 'urn:report:filed', 'filed', '2025-01-02T00:00:00Z');
  const prepared = await responseText(report, reportingUnit, 'urn:report:open', 'prepared', '2025-01-01T00:00:00Z');
  const store = createMemoryFilingStore({ scope, definitions, fixtures: { filings: [{ responseJson: filed }] } });
  const fence = await checkpoint(store, prepared);
  expect(await store.drafts.save({
    key: fence.key, definitionVersion: version, expectedRevision: fence.revision, responseJson: prepared,
    snapshotJson: JSON.stringify({ definitionUrl: report, definitionVersion: version, data: { answer: 'prepared' } }),
    summary: null,
  })).toMatchObject({ status: 'saved' });

  const results = await store.responses.select([
    { ...request(report, { status: 'current' }), key: 'current' },
    { ...request(report), key: 'completed' },
  ]);
  const current = results.get('current');
  expect(current).toMatchObject({ status: 'available', value: { answer: 'prepared' } });
  if (current?.status !== 'available') throw new Error('prepared draft is unavailable');
  expect(current.records).toEqual([{ responseId: 'urn:report:open', definitionVersion: version }]);
  expect(results.get('completed')).toMatchObject({ status: 'available', value: { answer: 'filed' },
    records: [{ responseId: 'urn:report:filed', responseHash: expect.stringMatching(/^sha256:/) }] });
});

it('joins decisions by the exact hash and treats missing prior-year reports as an authorized empty result', async () => {
  const tools = await previewResponseRecordTools();
  const planJson = await responseText(plan, period, 'urn:plan:1', 'approved plan');
  const reportJson = await responseText(report, reportingUnit, 'urn:report:1', 'filed report');
  const planRecord = prepareResponseFiling(scope, definitions, planJson, 'fixture', tools);
  const reportRecord = prepareResponseFiling(scope, definitions, reportJson, 'fixture', tools);
  const fixtures: Pick<SurfaceScenarioProfile, 'filings' | 'decisions'> = {
    filings: [{ responseJson: planJson }, { responseJson: reportJson }],
    decisions: [
      { responseId: planRecord.responseId, responseHash: planRecord.responseHash,
        decision: { status: 'decided', review: 'accepted', disposition: 'urn:decision:accepted', comments: ['Reviewed'] } },
      { responseId: reportRecord.responseId, responseHash: reportRecord.responseHash, decision: { status: 'unavailable' } },
    ],
  };
  const store = createMemoryFilingStore({ scope, definitions, fixtures });
  const results = await store.responses.select([
    { ...request(plan, { disposition: 'urn:decision:accepted', subject: [
      { key: 'first', op: 'le', from: { subject: 'year' } },
      { key: 'last', op: 'ge', from: { subject: 'year' } },
    ] }), consumerSubject: reportingUnit },
    { ...request(report, { whenNone: 'empty', subject: [
      { key: 'year', op: 'eq', from: { subject: 'year' }, offset: -1 },
      { key: 'member', op: 'eq', from: { subject: 'member' } },
    ] }), consumerSubject: reportingUnit },
  ]);
  expect(results.get(plan)).toMatchObject({ status: 'available', value: { answer: 'approved plan' } });
  expect(results.get(report)).toMatchObject({ status: 'available', none: true, records: [] });
  const read = await store.responses.read([planRecord]);
  expect(read.get(responsePairKey(planRecord))).toMatchObject({ status: 'decided', comments: ['Reviewed'] });
  const queries = [{ key: report, definitionUrl: report, definitionVersion: version,
    subject: { type: report, keys: reportingUnit }, sections: [] }];
  const input = { previewScope: scope, signal: new AbortController().signal };
  expect((await store.drafts.readSummaries(queries, input)).get(report)).toEqual({
    draft: { status: 'absent' },
    filing: { status: 'filed', receiptRef: reportRecord.responseId, responseHash: reportRecord.responseHash,
      review: 'unavailable', comments: [], sample: 'fixture' },
  });
  const denied = createMemoryFilingStore({ scope, definitions, fixtures, authorize: () => false });
  const broken = createMemoryFilingStore({ scope, definitions, fixtures, authorize: () => { throw new Error('unavailable'); } });
  expect(await denied.responses.select([request(plan)])).toEqual(await broken.responses.select([request(plan)]));
  expect(await denied.drafts.readSummaries(queries, input)).toEqual(await broken.drafts.readSummaries(queries, input));

  const bundle = dereferenceBundleExport({
    manifest: { $formspecBundle: '2.4', id: 'urn:preview', definitions: [{ url: plan }], surfaces: [{ url: 'urn:surface' }] },
    documents: { [plan]: definitions.get(plan),
      'urn:surface': { $formspecSurface: '0.4', id: 'surface', entry: 'home', routes: [{ id: 'home', path: '/', slots: [] }] } },
  });
  const scenario = {
    $formspecSurfaceScenario: '0.1', initialPath: '/', version, defaultProfile: 'default',
    actions: { default: { status: 'complete' } },
    profiles: { default: { authorization: { default: 'authorized' }, sources: [],
      filings: fixtures.filings!.slice(0, 1), decisions: fixtures.decisions!.slice(0, 1) } },
  };
  expect((await validateSurfacePreviewScenario({ scenario, bundle, responseTools: tools })).valid).toBe(true);
  scenario.profiles.default.decisions[0]!.responseHash = 'sha256:' + '0'.repeat(64);
  expect(await validateSurfacePreviewScenario({ scenario, bundle, responseTools: tools })).toMatchObject({
    valid: false, diagnostics: [{ code: 'SURFACE-SCENARIO-FILING-FIXTURE' }],
  });
});

it('delivers a filed singleton using the catalog identity and refuses a mismatched digest', async () => {
  const selection = request(list).selection;
  const source = {
    id: 'response:list', kind: 'definition-response', runtime: { delivery: 'provider' }, responseSelection: selection,
    schema: { type: 'object', properties: { answer: { type: 'string' } } },
  } as DataSourceCatalogHandle['document']['sources'][number];
  const catalog = { $formspecDataSources: '1.0', id: 'urn:catalog', version, sources: [source] } as const;
  const store = createMemoryFilingStore({ scope, definitions, catalogs: [{ catalogRef: catalog.id, document: catalog }] });
  const text = await responseText(list, {}, 'urn:list:1', 'one member');
  const fence = await checkpoint(store, text);
  expect((await store.submit(fence, text)).status).toBe('filed');
  const descriptor = { catalogRef: catalog.id, sourceRef: source.id, source, catalog };
  const input = { descriptor, responseSelection: selection, context: { params: {} } } as DataSourceLoadRequest;
  expect(await responseSourceLoader(store.responses)(input)).toMatchObject({ status: 'loaded',
    catalogRef: catalog.id, sourceRef: source.id, value: { answer: 'one member' },
    records: [{ responseId: 'urn:list:1' }], none: false });
  const stale = { ...input, descriptor: { ...descriptor, catalog: { ...catalog, version: '2.0.0' } } };
  expect(await responseSourceLoader(store.responses)(stale)).toMatchObject({ status: 'unavailable' });
  const digest = await catalogResponseDigest(catalog);
  expect(await store.responses.select([{
    key: 'wrong-source', kind: 'catalog', catalogRef: catalog.id, sourceRef: 'response:missing', catalogDigest: digest,
  }])).toEqual(new Map([['wrong-source', { status: 'unavailable' }]]));
});

it('refuses a completed filing with duplicate JSON members before the native hash is recorded', async () => {
  const valid = await responseText(report, reportingUnit, 'urn:report:duplicate-json', 'valid answer');
  const store = createMemoryFilingStore({ scope, definitions });
  const fence = await checkpoint(store, valid);
  const ambiguous = valid.replace('"answer": "valid answer"', '"answer": "first", "answer": "valid answer"');
  expect(await store.submit(fence, ambiguous)).toEqual({ status: 'invalid-response' });
  expect((await store.drafts.load(fence.key, version)).status).toBe('loaded');
});

it('checks authorization on the selected filing unit without refusing unrelated exact reads', async () => {
  const [own, other] = await Promise.all([
    responseText(report, reportingUnit, 'urn:report:a', 'A report'),
    responseText(report, { ...reportingUnit, member: 'B' }, 'urn:report:b', 'B report'),
  ]);
  const store = createMemoryFilingStore({
    scope, definitions, fixtures: { filings: [{ responseJson: own }, { responseJson: other }] },
    authorize: (key, _relation, selection) =>
      (key.subject?.keys.member ?? selection?.consumerSubject?.member) !== 'B',
  });
  const exact = request(report, { whenNone: 'empty', subject: [
    { key: 'year', op: 'eq', from: { subject: 'year' } },
    { key: 'member', op: 'eq', from: { subject: 'member' } },
  ] });
  const checked = await store.responses.select([
    { ...exact, key: 'own', consumerSubject: reportingUnit },
    { ...exact, key: 'other', consumerSubject: { ...reportingUnit, member: 'B' } },
    { ...request(report, { cardinality: 'latest-per-subject' }), key: 'all' },
  ]);
  expect(checked.get('own')).toMatchObject({ status: 'available', value: { answer: 'A report' } });
  expect(checked.get('other')).toEqual({ status: 'unavailable' });
  expect(checked.get('all')).toEqual({ status: 'unavailable' });
  const empty = createMemoryFilingStore({
    scope, definitions, fixtures: { filings: [{ responseJson: own }] },
    authorize: (key, _relation, selection) =>
      (key.subject?.keys.member ?? selection?.consumerSubject?.member) !== 'B',
  });
  const refused = { ...exact, key: 'other', consumerSubject: { ...reportingUnit, member: 'B' } };
  expect((await empty.responses.select([refused])).get('other')).toEqual(checked.get('other'));
});

it('checks review availability for filings that match the requested subject', async () => {
  const tools = await previewResponseRecordTools();
  const [own, other] = await Promise.all([
    responseText(report, reportingUnit, 'urn:report:a', 'A report'),
    responseText(report, { ...reportingUnit, member: 'B' }, 'urn:report:b', 'B report'),
  ]);
  const ownRecord = prepareResponseFiling(scope, definitions, own, 'fixture', tools);
  const otherRecord = prepareResponseFiling(scope, definitions, other, 'fixture', tools);
  const store = createMemoryFilingStore({ scope, definitions, fixtures: {
    filings: [{ responseJson: own }, { responseJson: other }],
    decisions: [
      { responseId: ownRecord.responseId, responseHash: ownRecord.responseHash,
        decision: { status: 'decided', disposition: 'urn:review:accepted', review: 'accepted', comments: [] } },
      { responseId: otherRecord.responseId, responseHash: otherRecord.responseHash, decision: { status: 'unavailable' } },
    ],
  } });
  const exact = request(report, { disposition: 'urn:review:accepted', whenNone: 'empty', subject: [
    { key: 'year', op: 'eq', from: { subject: 'year' } },
    { key: 'member', op: 'eq', from: { subject: 'member' } },
  ] });
  const results = await store.responses.select([
    { ...exact, key: 'own', consumerSubject: reportingUnit },
    { ...exact, key: 'other', consumerSubject: { ...reportingUnit, member: 'B' } },
  ]);
  expect(results.get('own')).toMatchObject({ status: 'available', value: { answer: 'A report' } });
  expect(results.get('other')).toEqual({ status: 'unavailable' });
});

it('returns the preview filing label and receipt to the Submit caller', async () => {
  const text = await responseText(list, {}, 'urn:list:caller', 'one member');
  const store = createMemoryFilingStore({ scope, definitions });
  const draftFence = await checkpoint(store, text);
  const invoke = previewFilingInvoker(store.submit);
  const result = await invoke({
    document: { $formspecResponseActions: '1.0', version, targetDefinition: { url: list },
      actions: [{ id: 'submit', intent: 'submit' }] },
    actionRef: 'submit',
    ports: { submit: () => ({ response: JSON.parse(text), validationReport: { valid: true, results: [], counts: {} } }) },
    draftFence,
  } as Parameters<typeof invoke>[0]);
  expect(result).toMatchObject({
    status: 'completed',
    detail: { previewFiling: { receiptRef: 'urn:list:caller', label: 'preview filing; nothing was sent' } },
  });
});

it('returns an authorized empty result for a disposition-filtered Definition with no filings', async () => {
  const store = createMemoryFilingStore({ scope, definitions });
  const filtered = request(list, { disposition: 'urn:review:accepted', whenNone: 'empty' });
  expect((await store.responses.select([filtered])).get(list))
    .toMatchObject({ status: 'available', none: true, records: [] });
});

it('hydrates current and accepted reads before creation and reopens with the recorded pin', async () => {
  const consumer: FormDefinition = { ...definition('urn:consumer', {}), instances: {
    roster: { response: { ...request(list).selection, pin: 'at-open' }, schema: { answer: 'string' } },
    accepted: { response: { ...request(list).selection, disposition: 'urn:accepted' }, schema: { answer: 'string' } },
    sibling: { response: { ...request(report).selection, status: 'current' }, schema: { answer: 'string' } },
  }, items: [
    { key: 'rosterAnswer', type: 'field', dataType: 'string', prePopulate: { instance: 'roster', path: 'answer' } },
    { key: 'acceptedAnswer', type: 'field', dataType: 'string', prePopulate: { instance: 'accepted', path: 'answer' } },
    { key: 'siblingAnswer', type: 'field', dataType: 'string', prePopulate: { instance: 'sibling', path: 'answer' } },
  ] };
  const tools = await previewResponseRecordTools();
  const other = { ...consumer, url: 'urn:other-consumer' };
  const all = new Map(definitions).set(consumer.url, consumer).set(other.url, other);
  const first = await responseText(list, {}, 'urn:list:first', 'first');
  const newer = await responseText(list, {}, 'urn:list:newer', 'newer', '2026-02-01T00:00:00Z');
  const store = createMemoryFilingStore({ scope, definitions: all, fixtures: {
    filings: [{ responseJson: first }],
    decisions: [first].map(text => {
      const { responseId, responseHash } = prepareResponseFiling(scope, all, text, 'fixture', tools);
      return { responseId, responseHash, decision: { status: 'decided', review: 'accepted', disposition: 'urn:accepted', comments: [] } };
    }),
  } });
  await checkpoint(store, await responseText(report, reportingUnit, 'urn:sibling', 'editing'));
  const key = { definitionUrl: consumer.url, scope, subject: { type: consumer.url, keys: {}, id: tools.subjectId(consumer.url, {}) } };
  const input = { plan: { definition: consumer }, grant: {} } as Parameters<ReturnType<typeof createDraftSession>['acquire']>[1];
  const deliveries = await store.responses.select(Object.entries(consumer.instances!).map(([key, { response }]) => ({
    kind: 'definition', scope, key, selection: response!, consumerSubject: {}, projection: ['answer'],
  })));
  const server = createDraftSession({ scope, port: store.drafts, responses: {
    select: async () => new Map(JSON.parse(JSON.stringify([...deliveries]))),
  } });
  const session = createDraftSession({ scope, port: store.drafts, responses: store.responses });
  try {
    const firstOpen = session.acquire(key, input, () => {});
    const opened = await firstOpen.result;
    if (opened.status !== 'ready') throw Error(opened.status);
    expect(opened.engine.getResponse().data).toMatchObject({ rosterAnswer: 'first', acceptedAnswer: 'first', siblingAnswer: 'editing' });
    const hosted = await server.acquire(key, input, () => {}).result;
    if (hosted.status !== 'ready') throw Error(hosted.status);
    expect(hosted.engine.getResponse().data).toEqual(opened.engine.getResponse().data);
    expect(await opened.writer.flush(true)).toBe(true);
    firstOpen.release();
    const fence = await checkpoint(store, newer);
    expect((await store.submit(fence, newer)).status).toBe('filed');
    const stored = await store.drafts.load(key, version);
    if (stored.status !== 'loaded') throw Error(stored.status);
    const staleSave = await store.drafts.save({
      key: { ...key, definitionUrl: other.url }, definitionVersion: version,
      creationPins: stored.draft.pins,
      expectedRevision: null, snapshotJson: '{}', responseJson: '{}', summary: null,
    });
    expect(staleSave).toEqual({ status: 'pin-unavailable', instance: 'roster' });
    const resumed = await session.acquire(key, input, () => {}).result;
    if (resumed.status !== 'ready') throw Error(resumed.status);
    expect(resumed.engine.getResponse({ profile: 'on-submit' }).resolvedInstances).toEqual(expect.arrayContaining([
      expect.objectContaining({ instance: 'roster', pinned: true, records: [expect.objectContaining({ responseId: 'urn:list:first' })] }),
      expect.objectContaining({ instance: 'sibling', pinned: false }),
    ]));
  } finally {
    server.dispose();
    session.dispose();
  }
});

it('seeds in-progress drafts into DraftPort with evaluated progress, current reads, and correction coexistence', async () => {
  const tools = await previewResponseRecordTools();
  const detailedReport: FormDefinition = {
    $formspec: '1.0',
    url: report,
    version,
    title: 'Annual Report',
    subject: { type: report, keys: { year: { dataType: 'integer' }, member: { dataType: 'string' } } },
    items: [
      {
        key: 'overview',
        type: 'group',
        label: 'Overview',
        children: [
          { key: 'summary', type: 'field', dataType: 'string', label: 'Summary' },
          { key: 'total', type: 'field', dataType: 'integer', label: 'Total' },
        ],
      },
    ],
    binds: [
      { path: 'overview.summary', required: 'true' },
      { path: 'overview.total', required: 'true' },
    ],
  };
  const implicitForm: FormDefinition = {
    $formspec: '1.0',
    url: 'urn:test:implicit',
    version,
    title: 'Implicit Form',
    items: [
      { key: 'note', type: 'field', dataType: 'string', label: 'Note' },
    ],
    binds: [{ path: 'note', required: 'true' }],
  };
  const seededDefs = new Map<string, FormDefinition>([
    [report, detailedReport],
    [implicitForm.url, implicitForm],
  ]);

  const priorFiledJson = JSON.stringify({
    $formspecResponse: '1.0',
    definitionUrl: report,
    definitionVersion: version,
    id: 'urn:report:prior-filed',
    status: 'completed',
    authored: '2026-01-01T00:00:00Z',
    subject: { id: tools.subjectId(report, reportingUnit), type: report, keys: reportingUnit },
    data: { overview: { summary: 'Prior filing', total: 10 } },
  });
  const priorRecord = prepareResponseFiling(scope, seededDefs, priorFiledJson, 'fixture', tools);

  const store = createMemoryFilingStore({
    scope,
    definitions: seededDefs,
    sectionPlans: def => def.url === report
      ? [
          resolvePageSequence(def),
          [
            { id: 'part-a', title: 'Part A', fields: ['overview.summary'], groups: ['overview'], fieldTemplates: ['overview.summary'], items: [] },
            { id: 'part-b', title: 'Part B', fields: ['overview.total'], groups: ['overview'], fieldTemplates: ['overview.total'], items: [] },
          ],
        ]
      : [resolvePageSequence(def)],
    fixtures: {
      filings: [{ responseJson: priorFiledJson }],
      decisions: [{
        responseId: priorRecord.responseId,
        responseHash: priorRecord.responseHash,
        decision: { status: 'decided', review: 'returned', disposition: 'urn:decision:returned', comments: ['Fix totals'] },
      }],
      drafts: [
        {
          definitionUrl: report,
          subject: { type: report, keys: reportingUnit },
          data: { overview: { summary: 'Updated summary' } },
          responseId: 'urn:report:correction-draft',
          authored: '2026-02-01T00:00:00Z',
        },
        {
          definitionUrl: implicitForm.url,
          data: { note: 'All done' },
        },
      ],
    },
  });

  // 1. DraftPort.load hydrates the seeded in-progress draft directly.
  const reportKey: DraftKey = {
    scope,
    definitionUrl: report,
    subject: { type: report, keys: reportingUnit, id: tools.subjectId(report, reportingUnit) },
  };
  const loaded = await store.drafts.load(reportKey, version);
  expect(loaded.status).toBe('loaded');
  if (loaded.status !== 'loaded') throw new Error('expected loaded draft');
  expect(JSON.parse(loaded.draft.snapshotJson)).toMatchObject({
    definitionUrl: report,
    definitionVersion: version,
    data: { overview: { summary: 'Updated summary' } },
  });
  expect(JSON.parse(loaded.draft.responseJson)).toMatchObject({
    $formspecResponse: '1.0',
    id: 'urn:report:correction-draft',
    status: 'in-progress',
    authored: '2026-02-01T00:00:00Z',
    data: { overview: { summary: 'Updated summary' } },
  });

  // 2. readSummaries reports In Progress (ready: false) alongside Returned filing state,
  //    and Ready (ready: true) for the complete implicit draft.
  const summaries = await store.drafts.readSummaries([
    {
      key: 'report-row',
      definitionUrl: report,
      definitionVersion: version,
      subject: { type: report, keys: reportingUnit },
      sections: [{ id: 'overview', fields: ['overview.summary', 'overview.total'] }],
    },
    {
      key: 'implicit-row',
      definitionUrl: implicitForm.url,
      definitionVersion: version,
      sections: [{ fields: ['note'] }],
    },
    {
      key: 'stale-section-plan-row',
      definitionUrl: implicitForm.url,
      definitionVersion: version,
      sections: [{ id: 'unadmitted-section', fields: ['note'] }],
    },
  ], { previewScope: scope, signal: new AbortController().signal });

  expect(summaries.get('report-row')).toEqual({
    draft: {
      status: 'current',
      form: { total: 2, filled: 1, toFix: 0, toCheck: 0, ready: false },
      sections: { overview: { total: 2, filled: 1, toFix: 0, toCheck: 0 } },
    },
    filing: {
      status: 'returned',
      receiptRef: 'urn:report:prior-filed',
      responseHash: priorRecord.responseHash,
      review: 'available',
      comments: ['Fix totals'],
      sample: 'fixture',
    },
  });
  expect(summaries.get('implicit-row')).toMatchObject({
    draft: {
      status: 'current',
      form: { total: 1, filled: 1, toFix: 0, toCheck: 0, ready: true },
    },
    filing: { status: 'none' },
  });
  expect(summaries.get('stale-section-plan-row')?.draft).toEqual({ status: 'stale' });

  // 2b. Custom section layouts (e.g. from a Component or Theme) re-project seeded progress cleanly instead of returning stale.
  const customSectionSummaries = await store.drafts.readSummaries([
    {
      key: 'custom-report-row',
      definitionUrl: report,
      definitionVersion: version,
      subject: { type: report, keys: reportingUnit },
      sections: [
        { id: 'part-a', fields: ['overview.summary'] },
        { id: 'part-b', fields: ['overview.total'] },
      ],
    },
  ], { previewScope: scope, signal: new AbortController().signal });
  expect(customSectionSummaries.get('custom-report-row')?.draft).toEqual({
    status: 'current',
    form: { total: 2, filled: 1, toFix: 0, toCheck: 0, ready: false },
    sections: {
      'part-a': { total: 1, filled: 1, toFix: 0, toCheck: 0 },
      'part-b': { total: 1, filled: 0, toFix: 0, toCheck: 0 },
    },
  });

  // 2c. Scenario validator accepts a correction draft alongside a completed filing, and rejects responseId collision with filings.
  const bundle = dereferenceBundleExport({
    manifest: {
      $formspecBundle: '2.4',
      id: 'urn:preview:draft-coexist',
      definitions: [{ url: report }],
      surfaces: [{ url: 'urn:surface' }],
    },
    documents: {
      [report]: detailedReport,
      'urn:surface': { $formspecSurface: '0.4', id: 'surface', entry: 'home', routes: [{ id: 'home', path: '/', slots: [] }] },
    },
  });
  const coexistenceScenario = {
    $formspecSurfaceScenario: '0.1',
    version,
    initialPath: '/',
    defaultProfile: 'default',
    actions: { default: { status: 'complete' } },
    profiles: {
      default: {
        authorization: { default: 'authorized' },
        sources: [],
        filings: [{ responseJson: priorFiledJson }],
        drafts: [{
          definitionUrl: report,
          subject: { type: report, keys: reportingUnit },
          data: { overview: { summary: 'Correction draft' } },
          responseId: 'urn:report:correction-draft',
        }],
      },
    },
  };
  expect((await validateSurfacePreviewScenario({ scenario: coexistenceScenario, bundle, responseTools: tools })).valid).toBe(true);
  coexistenceScenario.profiles.default.drafts[0]!.responseId = 'urn:report:prior-filed';
  expect(await validateSurfacePreviewScenario({ scenario: coexistenceScenario, bundle, responseTools: tools })).toMatchObject({
    valid: false,
    diagnostics: [expect.objectContaining({
      code: 'SURFACE-SCENARIO-DRAFT-FIXTURE',
      path: '$.profiles.default.drafts[0].responseId',
    })],
  });

  // 3. responses.select with status: 'current' observes the seeded draft immediately.
  const selected = await store.responses.select([{
    key: 'current-report',
    kind: 'definition',
    scope,
    projection: ['overview'],
    selection: { definition: { url: report }, subject: [], status: 'current', cardinality: 'latest', pin: 'none' },
  }]);
  expect(selected.get('current-report')).toMatchObject({
    status: 'available',
    value: { overview: { summary: 'Updated summary' } },
  });

  // 4. Editing/saving and then submitting the seeded draft works and clears it cleanly.
  const completedJson = JSON.stringify({
    ...JSON.parse(loaded.draft.responseJson),
    status: 'completed',
    data: { overview: { summary: 'Updated summary', total: 42 } },
  });
  const saved = await store.drafts.save({
    key: reportKey,
    expectedRevision: loaded.draft.revision,
    definitionVersion: version,
    snapshotJson: JSON.stringify({ definitionUrl: report, definitionVersion: version, data: { overview: { summary: 'Updated summary', total: 42 } } }),
    responseJson: JSON.stringify({ ...JSON.parse(loaded.draft.responseJson), data: { overview: { summary: 'Updated summary', total: 42 } } }),
    summary: null,
  });
  expect(saved.status).toBe('saved');
  if (saved.status !== 'saved') throw new Error('expected save');
  const reloaded = await store.drafts.load(reportKey, version);
  if (reloaded.status !== 'loaded') throw new Error('expected reloaded draft');
  const submitted = await store.submit({
    key: reportKey,
    definitionVersion: version,
    revision: reloaded.draft.revision,
    responseJson: reloaded.draft.responseJson,
  }, completedJson);
  expect(submitted.status).toBe('filed');
  expect(await store.drafts.load(reportKey, version)).toEqual({ status: 'absent' });
});

it('enforces opening pins, resolves sibling draft order deterministically, unifies default IDs, and never boots FormEngine in readSummaries', async () => {
  const tools = await previewResponseRecordTools();
  const upUrl = 'urn:fixture:upstream';
  const downUrl = 'urn:fixture:downstream';
  const reqPinUrl = 'urn:fixture:required-pin';
  const upstreamDef: FormDefinition = {
    $formspec: '1.0',
    url: upUrl,
    version,
    title: 'Upstream',
    items: [{ key: 'answer', type: 'field', dataType: 'string', label: 'Answer' }],
  };
  const downstreamDef: FormDefinition = {
    ...upstreamDef,
    url: downUrl,
    instances: {
      lookup: {
        response: { definition: { url: upUrl }, subject: [], status: 'current', cardinality: 'latest', pin: 'at-open', whenNone: 'empty' },
        schema: { answer: 'string' },
      },
    },
  };
  const requiredPinDef: FormDefinition = {
    ...upstreamDef,
    url: reqPinUrl,
    instances: {
      lookup: {
        response: { definition: { url: upUrl }, subject: [], status: 'completed', cardinality: 'latest', pin: 'at-open' },
        schema: { answer: 'string' },
      },
    },
  };

  // 1. Missing required at-open upstream filing refuses seeding.
  const missingPinStore = createMemoryFilingStore({
    scope,
    definitions: new Map([[upUrl, upstreamDef], [reqPinUrl, requiredPinDef]]),
    fixtures: { drafts: [{ definitionUrl: reqPinUrl, data: { answer: 'blocked' } }] },
  });
  expect((await missingPinStore.drafts.load({ scope, definitionUrl: reqPinUrl }, version)).status).not.toBe('loaded');

  // 2. Sibling at-open pins resolve identically regardless of drafts[] array order.
  async function loadPinned(order: string[]) {
    const orderedStore = createMemoryFilingStore({
      scope: 'order-scope',
      definitions: new Map([[upUrl, upstreamDef], [downUrl, downstreamDef]]),
      fixtures: { drafts: order.map(url => ({ definitionUrl: url, data: { answer: url } })) },
    });
    const row = await orderedStore.drafts.load({ scope: 'order-scope', definitionUrl: downUrl }, version);
    if (row.status !== 'loaded') throw new Error(`Expected loaded row, got ${row.status}`);
    return row.draft.pins.lookup;
  }
  const forwardPin = await loadPinned([upUrl, downUrl]);
  const reversePin = await loadPinned([downUrl, upUrl]);
  expect(forwardPin?.value).toEqual({ answer: upUrl });
  expect(reversePin).toEqual(forwardPin);

  // 3. Default Response ID derivation agrees between scenario admission and store preparation across scopes.
  const derivedId = prepareDraftFixtures('custom-edition-scope', new Map([[upUrl, upstreamDef]]), [
    { definitionUrl: upUrl, data: {} },
  ], tools)[0]!.responseId;
  const idCollisionBundle = dereferenceBundleExport({
    manifest: { $formspecBundle: '2.4', id: 'urn:id-check', definitions: [{ url: upUrl }, { url: downUrl }], surfaces: [{ url: 'urn:s' }] },
    documents: {
      [upUrl]: upstreamDef,
      [downUrl]: upstreamDef,
      'urn:s': { $formspecSurface: '0.4', id: 's', entry: 'home', routes: [{ id: 'home', path: '/', slots: [] }] },
    },
  });
  const collisionValidation = await validateSurfacePreviewScenario({
    bundle: idCollisionBundle,
    scope: 'custom-edition-scope',
    responseTools: tools,
    scenario: {
      $formspecSurfaceScenario: '0.1',
      version,
      initialPath: '/',
      defaultProfile: 'author',
      actions: { default: { status: 'complete' } },
      profiles: {
        author: {
          authorization: { default: 'authorized' },
          sources: [],
          drafts: [
            { definitionUrl: upUrl, data: {} },
            { definitionUrl: downUrl, data: {}, responseId: derivedId },
          ],
        },
      },
    },
  });
  expect(collisionValidation.valid).toBe(false);

  // 4. After store fixture initialization, readSummaries never calls createFormEngine.
  const readyStore = createMemoryFilingStore({
    scope: 'summary-no-engine',
    definitions: new Map([[upUrl, upstreamDef]]),
    fixtures: { drafts: [{ definitionUrl: upUrl, data: { answer: 'ready' } }] },
  });
  await readyStore.ready();
  const spy = vi.spyOn(engineModule, 'createFormEngine');
  try {
    const res = await readyStore.drafts.readSummaries(
      [{ key: 'up', definitionUrl: upUrl, definitionVersion: version, sections: [{ fields: ['answer'] }] }],
      { previewScope: 'summary-no-engine', signal: new AbortController().signal },
    );
    expect(res.get('up')?.draft.status).toBe('current');
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});

it('rejects self-cycles, allows mutual completed-only pins, aborts rejected profiles atomically, and never boots engines on failed-init summary reads', async () => {
  const aUrl = 'urn:test:cycle-a';
  const bUrl = 'urn:test:cycle-b';
  const selfCycleDef: FormDefinition = {
    $formspec: '1.0',
    url: aUrl,
    version,
    title: 'Self Cycle',
    items: [{ key: 'answer', type: 'field', dataType: 'string' }],
    instances: {
      selfRef: {
        schema: { answer: 'string' },
        response: {
          definition: { url: aUrl },
          subject: [],
          status: 'current',
          cardinality: 'latest',
          pin: 'at-open',
          whenNone: 'empty',
        },
      },
    },
  };
  const selfCycleStore = createMemoryFilingStore({
    scope: 'self-cycle',
    definitions: new Map([[aUrl, selfCycleDef]]),
    fixtures: { drafts: [{ definitionUrl: aUrl, data: { answer: 'loop' } }] },
  });
  await expect(selfCycleStore.ready()).rejects.toThrow(/cycl/i);

  // Two correction drafts reading already-completed filings must NOT be classified as cyclic.
  const completedReader = (selfUrl: string, otherUrl: string): FormDefinition => ({
    $formspec: '1.0',
    url: selfUrl,
    version,
    title: selfUrl,
    items: [{ key: 'answer', type: 'field', dataType: 'string' }],
    instances: {
      priorOther: {
        schema: { answer: 'string' },
        response: {
          definition: { url: otherUrl },
          subject: [],
          status: 'completed',
          cardinality: 'latest',
          pin: 'at-open',
        },
      },
    },
  });
  const defA = completedReader(aUrl, bUrl);
  const defB = completedReader(bUrl, aUrl);
  const mutualCompletedStore = createMemoryFilingStore({
    scope: 'mutual-completed',
    definitions: new Map([[aUrl, defA], [bUrl, defB]]),
    fixtures: {
      filings: [
        { responseJson: JSON.stringify({ $formspecResponse: '1.0', id: 'filed-a', definitionUrl: aUrl, definitionVersion: version, status: 'completed', authored: '2026-01-01T00:00:00Z', data: { answer: 'Filed A' } }) },
        { responseJson: JSON.stringify({ $formspecResponse: '1.0', id: 'filed-b', definitionUrl: bUrl, definitionVersion: version, status: 'completed', authored: '2026-01-01T00:00:00Z', data: { answer: 'Filed B' } }) },
      ],
      drafts: [
        { definitionUrl: aUrl, data: { answer: 'Correction A' } },
        { definitionUrl: bUrl, data: { answer: 'Correction B' } },
      ],
    },
  });
  await expect(mutualCompletedStore.ready()).resolves.toBeUndefined();
  const loadedA = await mutualCompletedStore.drafts.load({ scope: 'mutual-completed', definitionUrl: aUrl }, version);
  const loadedB = await mutualCompletedStore.drafts.load({ scope: 'mutual-completed', definitionUrl: bUrl }, version);
  expect(loadedA.status).toBe('loaded');
  expect(loadedB.status).toBe('loaded');
  if (loadedA.status === 'loaded' && loadedB.status === 'loaded') {
    expect(loadedA.draft.pins.priorOther?.value).toEqual({ answer: 'Filed B' });
    expect(loadedB.draft.pins.priorOther?.value).toEqual({ answer: 'Filed A' });
  }

  // Failed initialization must not retry seeding or boot FormEngine during readSummaries.
  const firstDef: FormDefinition = {
    $formspec: '1.0',
    url: 'urn:review:read-retry',
    version,
    title: 'Retry',
    items: [{ key: 'answer', type: 'field', dataType: 'string' }],
  };
  const missingUpstreamDef = completedReader(bUrl, aUrl);
  const failedInitStore = createMemoryFilingStore({
    scope: 'failed-init-scope',
    definitions: new Map([[firstDef.url, firstDef], [bUrl, missingUpstreamDef]]),
    fixtures: {
      drafts: [
        { definitionUrl: firstDef.url, data: { answer: 'Rejected profile' } },
        { definitionUrl: bUrl, data: { answer: 'Missing upstream' } },
      ],
    },
  });
  await expect(failedInitStore.ready()).rejects.toThrow(/at-open/);

  const spy = vi.spyOn(engineModule, 'createFormEngine');
  try {
    const res = await failedInitStore.drafts.readSummaries(
      [{ key: 'q', definitionUrl: firstDef.url, definitionVersion: version, sections: [{ fields: ['answer'] }] }],
      { previewScope: 'failed-init-scope', signal: new AbortController().signal },
    );
    expect(res.get('q')?.draft.status).toBe('unavailable');
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }

  // Serialized money amount remains a canonical JSON string in stored Response JSON.
  const moneyDef: FormDefinition = {
    $formspec: '1.0',
    url: 'urn:test:money-string',
    version,
    title: 'Money',
    items: [{ key: 'fee', type: 'field', dataType: 'money' }],
  };
  const moneyStore = createMemoryFilingStore({
    scope: 'money-scope',
    definitions: new Map([[moneyDef.url, moneyDef]]),
    fixtures: {
      drafts: [{ definitionUrl: moneyDef.url, data: { fee: { amount: '42.5', currency: 'USD' } } }],
    },
  });
  const moneyRow = await moneyStore.drafts.load({ scope: 'money-scope', definitionUrl: moneyDef.url }, version);
  expect(moneyRow.status).toBe('loaded');
  if (moneyRow.status === 'loaded') {
    expect(JSON.parse(moneyRow.draft.responseJson).data.fee.amount).toBe('42.5');
  }
});

it('orders seeded drafts by the opening winner across subjects, so a completed later filing is not a self-cycle', async () => {
  const tools = await previewResponseRecordTools();
  const url = 'urn:test:cross-year';
  const crossYear: FormDefinition = {
    $formspec: '1.0', url, version, title: 'Cross year',
    subject: { type: url, keys: { year: { dataType: 'integer' } } },
    items: [{ key: 'answer', type: 'field', dataType: 'string' }],
    instances: {
      prior: {
        schema: { answer: 'string' },
        response: { definition: { url }, subject: [], status: 'current', cardinality: 'latest', pin: 'at-open' },
      },
    },
  };
  const filed2026 = JSON.stringify({
    $formspecResponse: '1.0', definitionUrl: url, definitionVersion: version, id: 'urn:test:2026', status: 'completed',
    authored: '2026-06-01T00:00:00Z', subject: { type: url, keys: { year: 2026 }, id: tools.subjectId(url, { year: 2026 }) },
    data: { answer: '2026' },
  });
  const store = createMemoryFilingStore({
    scope: 'cross-year',
    definitions: new Map([[url, crossYear]]),
    fixtures: {
      filings: [{ responseJson: filed2026 }],
      drafts: [{ definitionUrl: url, responseId: 'urn:test:2025-draft', subject: { type: url, keys: { year: 2025 } }, data: { answer: '2025' } }],
    },
  });
  await expect(store.ready()).resolves.toBeUndefined();
  const row = await store.drafts.load(
    { scope: 'cross-year', definitionUrl: url, subject: { type: url, keys: { year: 2025 }, id: tools.subjectId(url, { year: 2025 }) } },
    version,
  );
  expect(row.status).toBe('loaded');
  if (row.status === 'loaded') expect(row.draft.pins.prior?.value).toEqual({ answer: '2026' });
});

it('persists only the closed DraftProgressSummary counts from a save, whatever the caller attaches', async () => {
  const url = 'urn:test:enriched-save';
  const definition: FormDefinition = {
    $formspec: '1.0', url, version, title: 'Enriched', items: [{ key: 'answer', type: 'field', dataType: 'string' }],
  };
  const store = createMemoryFilingStore({ scope: 'enriched', definitions: new Map([[url, definition]]) });
  await store.ready();
  const key: DraftKey = { scope: 'enriched', definitionUrl: url };
  const sections = [{ id: 'main', fields: ['answer'] }];
  const enriched = { total: 1, filled: 0, toFix: 1, toCheck: 0, fieldPath: 'answer', message: 'Validation message' };
  const save = (progress: unknown, expectedRevision: string | null) => store.drafts.save({
    key, expectedRevision, definitionVersion: version,
    snapshotJson: JSON.stringify({ definitionUrl: url, definitionVersion: version, data: {} }),
    responseJson: JSON.stringify({ $formspecResponse: '1.0', definitionUrl: url, definitionVersion: version, id: 'r', status: 'in-progress', authored: '2026-01-01T00:00:00Z', data: {} }),
    summary: { sections, progress } as never,
  });
  const read = async () => (await store.drafts.readSummaries(
    [{ key: 'q', definitionUrl: url, definitionVersion: version, sections }],
    { previewScope: 'enriched', signal: new AbortController().signal },
  )).get('q')?.draft;

  const first = await save({ status: 'current', form: { ...enriched, ready: false, answers: { answer: 'x' } }, sections: { main: enriched } }, null);
  expect(first.status).toBe('saved');
  expect(await read()).toEqual({
    status: 'current',
    form: { total: 1, filled: 0, toFix: 1, toCheck: 0, ready: false },
    sections: { main: { total: 1, filled: 0, toFix: 1, toCheck: 0 } },
  });

  // A value the closed schema cannot represent stores no counts rather than a partial copy.
  if (first.status !== 'saved') throw new Error('first save failed');
  expect((await save({ status: 'current', form: { total: -1, filled: 0, toFix: 0, toCheck: 0, ready: false }, sections: {} }, first.revision)).status)
    .toBe('saved');
  expect(await read()).toEqual({ status: 'unavailable' });
});
