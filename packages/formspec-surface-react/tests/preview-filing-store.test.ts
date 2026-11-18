/** @filedesc Exercise preview filing ports with synthetic Responses and the real Rust selector. */
import { expect, it } from 'vitest';
import { dereferenceBundleExport, prepareResponseFiling, responsePairKey, responseSourceLoader, catalogResponseDigest,
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
