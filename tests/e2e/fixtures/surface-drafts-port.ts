/** @filedesc Browser bridge for the shared draft storage suite. */
import { initFormspecEngine, initFormspecEngineTools, responseSubjectId } from '@formspec-org/engine';
import * as browser from '../../../packages/formspec-surface-react/src/index';
import type { FormDefinition, ResponseSelection, ResponseSelectionDelivery } from '@formspec-org/types';
import { draftPortConformance } from '../../../packages/formspec-surface/src/draft-port-conformance';
import { canonicalDraftProgress, type DraftKey } from '../../../packages/formspec-surface/src/draft-port';

export async function runConformance(name: keyof typeof draftPortConformance) {
  let allowed = true;
  const definitionUrl = 'https://example.test/definition';
  const scope = 'scope-a';
  const type = 'urn:test:unit';
  const keys = { year: 2025 };
  const needsPin = name.includes('at-open');
  const listUrl = 'urn:test:list';
  const selection: ResponseSelection = {
    definition: { url: listUrl }, subject: [], status: 'completed', cardinality: 'latest', pin: 'at-open',
    ...(name === 'records an empty at-open pin' && { whenNone: 'empty' }),
  };
  const upstream: FormDefinition = {
    $formspec: '1.0', url: listUrl, version, title: 'List', items: [], subject: { type: listUrl, keys: {} },
  };
  const definition: FormDefinition = {
    $formspec: '1.0', url: definitionUrl, version, title: 'Report', items: [], subject: { type, keys: { year: { dataType: 'integer' } } },
    ...(needsPin && { instances: { list: { response: selection, schema: { answer: 'string' } } } }),
  };
  const store = browser.createBrowserFilingStore({
    scope, definitions: new Map([[definitionUrl, definition], [listUrl, upstream]]),
    databaseName: 'formspec-draft-fixture', authorize: () => allowed,
  });
  await initFormspecEngine();
  await initFormspecEngineTools();
  const key = { definitionUrl, scope, subject: { type, keys, id: responseSubjectId(type, keys) } };
  async function file(id: string, authored: string) {
    const candidate = {
      $formspecResponse: '1.0', definitionUrl: listUrl, definitionVersion: version, status: 'completed', authored,
      id, subject: { type: listUrl, keys: {}, id: responseSubjectId(listUrl, {}) }, data: { answer: id },
    };
    const exactText = JSON.stringify(candidate, null, 2) + '\n';
    const responseJson = JSON.stringify({ ...candidate, status: 'in-progress' });
    const key = { scope, definitionUrl: listUrl, subject: candidate.subject };
    const saved = await store.drafts.save({ key, definitionVersion: version, expectedRevision: null,
      responseJson, snapshotJson: '{}', summary: null });
    if (saved.status !== 'saved') throw new Error('Could not checkpoint upstream fixture');
    const filed = await store.submit({ key, definitionVersion: version, revision: saved.revision, responseJson }, exactText);
    if (filed.status !== 'filed') throw new Error('Could not file upstream fixture: ' + filed.status);
  }
  await draftPortConformance[name]({
    port: store.drafts, deny: () => { allowed = false; }, key,
    otherKeys: [
      { ...key, definitionUrl: definitionUrl + '/other' },
      { ...key, subject: { ...key.subject, id: responseSubjectId(type, { year: 2026 }), keys: { year: 2026 } } },
    ],
    pins: {
      instance: 'list', initialResponseId: 'urn:list:1', newerResponseId: 'urn:list:2',
      addInitial: () => file('urn:list:1', '2026-01-01T00:00:00Z'),
      addNewer: () => file('urn:list:2', '2026-01-02T00:00:00Z'),
      async select(pin?: ResponseSelectionDelivery) {
        return (await store.responses.select([{ key: 'list', scope, kind: 'definition', selection, projection: ['answer'],
          ...(pin && { pin }) }])).get('list')!;
      },
    },
  });
}

const preview = browser.createBrowserFilingStore({ databaseName: 'formspec-draft-preview-fixture', scope: 'edition', definitions: new Map() }).drafts;
const key = { scope: 'edition', definitionUrl: 'https://example.test/browser-draft' };
const version = '1.0.0';
const placement = [{ id: 'main', fields: ['answer'] }];
const query = { key: 'filing', definitionUrl: key.definitionUrl, definitionVersion: version, sections: placement };
let commits = 0;

const unitsDb = 'formspec-minted-units-upgrade';
const unitDefinition: FormDefinition = {
  $formspec: '1.0', url: 'urn:test:unit-form', version, title: 'Filing unit', items: [],
  subject: { type: 'urn:test:filing-unit', keys: { year: { dataType: 'integer' }, unit: { dataType: 'string', minted: true } } },
};
const unitDrafts = browser.createBrowserFilingStore({
  databaseName: unitsDb, scope: key.scope, definitions: new Map([[unitDefinition.url, unitDefinition]]),
}).drafts;

export function seedVersionTwoDraft() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(unitsDb, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      const drafts = db.createObjectStore('editable');
      db.createObjectStore('summaries');
      db.createObjectStore('filings');
      drafts.put({
        definitionVersion: version, revision: 'version-two-draft', snapshotJson: '{}', responseJson: '{}', pinsJson: '{}',
      }, [key.scope, key.definitionUrl, 'respondent', '']);
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
}

export function startUnit(attemptId: string) {
  return unitDrafts.start({
    scope: key.scope, definitionUrl: unitDefinition.url, definitionVersion: version, attemptId,
    subject: { type: unitDefinition.subject!.type, keys: { year: 2025 } },
  });
}

export function loadUnit(subject?: DraftKey['subject']) {
  return unitDrafts.load(subject ? { scope: key.scope, definitionUrl: unitDefinition.url, subject } : key, version);
}

export function watchPreviewCommits() {
  preview.subscribe(() => { commits++; });
}

export function previewCommits() {
  return commits;
}

export function savePreview(expectedRevision: string | null, answer: string) {
  const counts = { total: 1, filled: answer ? 1 : 0, toFix: 0, toCheck: 0 };
  return preview.save({
    key, expectedRevision, definitionVersion: version,
    snapshotJson: JSON.stringify({ definitionUrl: key.definitionUrl, definitionVersion: version, data: { answer } }),
    responseJson: JSON.stringify({
      $formspecResponse: '1.0', definitionUrl: key.definitionUrl, definitionVersion: version,
      status: 'in-progress', authored: '2026-01-01T00:00:00Z', id: 'draft-1', data: { answer },
    }),
    summary: { sections: placement, progress: { status: 'current', form: { ...counts, ready: !!answer }, sections: { main: counts } } },
  });
}

export function loadPreview(definitionVersion: string) {
  return preview.load(key, definitionVersion);
}

export function restartPreview(expectedRevision: string) {
  return preview.restart(key, expectedRevision);
}

export async function readPreviewSummary() {
  const result = await preview.readSummaries([query], { previewScope: key.scope, signal: new AbortController().signal });
  return result.get(query.key)?.draft;
}

export async function fileExactPreview() {
  const scope = 'edition-a';
  const definitionUrl = 'urn:test:report';
  const databaseName = 'formspec-exact-filing';
  const definition: FormDefinition = {
    $formspec: '1.0', url: definitionUrl, version, title: 'Report', items: [],
    subject: { type: definitionUrl, keys: { year: { dataType: 'integer' }, member: { dataType: 'string' } } },
  };
  const store = browser.createBrowserFilingStore({ scope, databaseName, definitions: new Map([[definitionUrl, definition]]) });
  const tools = await browser.previewResponseRecordTools();
  const keys = { year: 2025, member: 'A' };
  const subject = { type: definitionUrl, keys, id: tools.subjectId(definitionUrl, keys) };
  const key = { scope, definitionUrl, subject };
  const candidate = {
    $formspecResponse: '1.0', definitionUrl, definitionVersion: version, status: 'completed',
    id: 'urn:report:exact', authored: '2026-01-19T00:00:00Z', subject, data: {},
  };
  const exactText = JSON.stringify(candidate, null, 2).replace('"data": {}', '"data": { "rate": 1.234567890123456789 }') + '\n';
  const responseJson = JSON.stringify({ ...candidate, status: 'in-progress' });
  const checkpoint = () => store.drafts.save({
    key, definitionVersion: version, expectedRevision: null, responseJson, snapshotJson: '{}', summary: null,
  });
  const first = await checkpoint();
  if (first.status !== 'saved') throw new Error('Could not save exact-text fixture');
  const filing = await store.submit({ key, definitionVersion: version, revision: first.revision, responseJson }, exactText);
  const next = await checkpoint();
  if (next.status !== 'saved') throw new Error('Could not save duplicate-id fixture');
  const duplicate = await store.submit({ key, definitionVersion: version, revision: next.revision, responseJson },
    exactText.replace('1.234567890123456789', '1.234567890123456780'));

  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const stored = await new Promise<{ responseJson: string }>((resolve, reject) => {
      const request = database.transaction('filings').objectStore('filings').get([scope, candidate.id]);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return { filing, duplicate, exactText, storedText: stored.responseJson, draft: await store.drafts.load(key, version) };
  } finally {
    database.close();
  }
}

const seededReviewUrl = 'urn:test:seeded-review';
const seededScope = 'seeded-edition';
const seededKey = { scope: seededScope, definitionUrl: seededReviewUrl };
const seededDefinition: FormDefinition = {
  $formspec: '1.0',
  url: seededReviewUrl,
  version,
  title: 'Seeded Review',
  items: [
    { key: 'first', type: 'group', label: 'First', children: [{ key: 'answer', label: 'Answer', type: 'field', dataType: 'string' }] },
    { key: 'next', type: 'group', label: 'Next', children: [{ key: 'second', label: 'Second', type: 'field', dataType: 'string' }] },
  ],
  binds: [{ path: 'next.second', required: 'true' }],
};
const seededDefinitions = new Map([[seededReviewUrl, seededDefinition]]);
const seededDraftFixture = {
  definitionUrl: seededReviewUrl,
  responseId: 'urn:test:seeded-draft',
  data: { first: { answer: 'Seeded' } },
};
const priorCompletedResponseJson = JSON.stringify({
  $formspecResponse: '1.0',
  definitionUrl: seededReviewUrl,
  definitionVersion: version,
  id: 'urn:test:prior-completed',
  authored: '2025-01-01T00:00:00Z',
  status: 'completed',
  data: { first: { answer: 'Filed answer' }, next: { second: 'Done' } },
});

export async function operateSeededStore({
  db,
  op,
  returned = false,
}: {
  db: string;
  op: 'inspect' | 'save' | 'clear' | 'discard' | 'submit';
  returned?: boolean;
}) {
  await initFormspecEngine();
  await initFormspecEngineTools();
  const tools = await browser.previewResponseRecordTools();
  const store = browser.createBrowserFilingStore({
    databaseName: db,
    scope: seededScope,
    definitions: seededDefinitions,
    fixtures: {
      drafts: [seededDraftFixture],
      filings: [{ responseJson: priorCompletedResponseJson }],
      decisions: returned
        ? [{
            responseId: 'urn:test:prior-completed',
            responseHash: (await import('@formspec-org/surface')).prepareResponseFiling(
              seededScope, seededDefinitions, priorCompletedResponseJson, 'fixture', tools,
            ).responseHash,
            decision: { status: 'decided', disposition: 'urn:review:returned', review: 'returned', comments: ['Revise'] },
          }]
        : [],
    },
  });
  const record = await store.drafts.load(seededKey, version);
  if (op === 'inspect') {
    const summary = (await store.drafts.readSummaries(
      [{
        key: 's',
        definitionUrl: seededReviewUrl,
        definitionVersion: version,
        sections: [{ id: 'first', fields: ['first.answer'] }, { id: 'next', fields: ['next.second'] }],
      }],
      { previewScope: seededScope, signal: new AbortController().signal },
    )).get('s');
    const selections = await store.responses.select(
      (['current', 'completed'] as const).map(status => ({
        kind: 'definition',
        key: status,
        scope: seededScope,
        projection: ['first'],
        selection: { definition: { url: seededReviewUrl }, subject: [], status, cardinality: 'latest', pin: 'none' },
      })),
    );
    const curOutcome = selections.get('current');
    const compOutcome = selections.get('completed');
    return {
      status: record.status,
      data: record.status === 'loaded' ? JSON.parse(record.draft.responseJson).data : null,
      draft: summary?.draft,
      filing: summary?.filing.status,
      current: curOutcome?.status === 'available' ? curOutcome.value : null,
      completed: compOutcome?.status === 'available' ? compOutcome.value : null,
    };
  }
  if (record.status !== 'loaded') throw new Error(`Expected loaded draft, got ${record.status}`);
  if (op === 'discard') return store.drafts.restart(seededKey, record.draft.revision);
  const resp = JSON.parse(record.draft.responseJson);
  const edited = op === 'clear' ? {} : { first: { answer: 'My edit' } };
  if (op === 'save' || op === 'clear') {
    return store.drafts.save({
      key: seededKey,
      expectedRevision: record.draft.revision,
      definitionVersion: version,
      snapshotJson: JSON.stringify({ definitionUrl: seededReviewUrl, definitionVersion: version, data: edited }),
      responseJson: JSON.stringify({ ...resp, data: edited }),
      summary: null,
    });
  }
  return store.submit(
    { key: seededKey, revision: record.draft.revision, definitionVersion: version, responseJson: record.draft.responseJson },
    JSON.stringify({ ...resp, status: 'completed', authored: '2026-01-01T00:00:00Z', data: { first: { answer: 'Seeded' }, next: { second: 'Done' } } }),
  );
}

export async function seedLegacyDatabaseForUpgrade(db: string, legacyVersion: 2 | 3, withSummary = false) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(db, legacyVersion);
    request.onupgradeneeded = () => {
      for (const name of ['editable', 'summaries', 'filings', ...(legacyVersion === 3 ? ['starts'] : [])]) {
        request.result.createObjectStore(name);
      }
      const response = {
        ...JSON.parse(priorCompletedResponseJson),
        id: seededDraftFixture.responseId,
        status: 'in-progress',
        data: { first: { answer: 'Existing edit' } },
      };
      request.transaction!.objectStore('editable').put(
        {
          revision: 'legacy-rev',
          definitionVersion: version,
          pinsJson: '{}',
          responseJson: JSON.stringify(response),
          snapshotJson: JSON.stringify({ definitionUrl: seededReviewUrl, definitionVersion: version, data: response.data }),
        },
        [seededScope, seededReviewUrl, 'respondent', ''],
      );
      // The summary shape written by the v3 adapter: field placements beside the counts.
      if (withSummary) request.transaction!.objectStore('summaries').put({
        definitionVersion: version,
        summary: {
          sections: [{ id: 'first', fields: ['first.answer'] }, { id: 'next', fields: ['next.second'] }],
          progress: {
            status: 'current', form: { total: 2, filled: 1, toFix: 0, toCheck: 0, ready: false },
            sections: { first: { total: 1, filled: 1, toFix: 0, toCheck: 0 }, next: { total: 1, filled: 0, toFix: 0, toCheck: 0 } },
          },
        },
      }, [seededScope, seededReviewUrl, 'respondent', '']);
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
}

export async function inspectSeededSummaryStore(db: string) {
  await operateSeededStore({ db, op: 'inspect' });
  const handle = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(db);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const req = handle.transaction('summaries').objectStore('summaries').getAll();
      req.onsuccess = () => resolve(req.result[0] as Record<string, unknown>);
      req.onerror = () => reject(req.error);
    });
  } finally {
    handle.close();
  }
}

export async function operateMintedSeed(action: 'read' | 'restart') {
  await initFormspecEngine();
  await initFormspecEngineTools();
  const tools = await browser.previewResponseRecordTools();
  const subject = { type: 'urn:test:minted-unit', keys: { unit: 'fixed-id' } };
  const keyed: FormDefinition = {
    ...seededDefinition,
    subject: { type: subject.type, keys: { unit: { dataType: 'string', minted: true } } },
  };
  const store = browser.createBrowserFilingStore({
    scope: seededScope,
    databaseName: 'formspec-seeded-minted',
    definitions: new Map([[seededReviewUrl, keyed]]),
    fixtures: { drafts: [{ ...seededDraftFixture, subject }] },
  });
  const mintedKey = {
    scope: seededScope,
    definitionUrl: seededReviewUrl,
    subject: { ...subject, id: tools.subjectId(subject.type, subject.keys) },
  };
  const loaded = await store.drafts.load(mintedKey, version);
  if (action === 'restart' && loaded.status === 'loaded') {
    return store.drafts.restart(mintedKey, loaded.draft.revision);
  }
  return loaded.status;
}

const secondSeededUrl = 'urn:test:seeded-second';
const secondSeededDefinition: FormDefinition = {
  $formspec: '1.0',
  url: secondSeededUrl,
  version,
  title: 'Second Seeded',
  items: [{ key: 'note', type: 'field', dataType: 'string' }],
};

export async function startSeededStorePausingBeforeSecondOpen(db: string) {
  await initFormspecEngine();
  await initFormspecEngineTools();
  const originalOpen = indexedDB.open.bind(indexedDB);
  let openCount = 0;
  let notifyPaused!: () => void;
  const pausedBeforeSecondOpen = new Promise<void>(resolve => { notifyPaused = resolve; });
  let resumeSecondOpen!: () => void;
  const secondOpenGate = new Promise<void>(resolve => { resumeSecondOpen = resolve; });

  indexedDB.open = ((name: string, dbVersion?: number) => {
    if (name === db) {
      openCount += 1;
      if (openCount === 2) {
        const proxyReq = {} as IDBOpenDBRequest;
        notifyPaused();
        void secondOpenGate.then(() => {
          const realReq = dbVersion === undefined ? originalOpen(name) : originalOpen(name, dbVersion);
          realReq.onupgradeneeded = event => {
            Object.defineProperty(proxyReq, 'result', { value: realReq.result, configurable: true });
            Object.defineProperty(proxyReq, 'transaction', { value: realReq.transaction, configurable: true });
            proxyReq.onupgradeneeded?.(event);
          };
          realReq.onsuccess = event => {
            Object.defineProperty(proxyReq, 'result', { value: realReq.result, configurable: true });
            proxyReq.onsuccess?.(event);
          };
          realReq.onerror = event => {
            Object.defineProperty(proxyReq, 'error', { value: realReq.error, configurable: true });
            proxyReq.onerror?.(event);
          };
        });
        return proxyReq;
      }
    }
    return dbVersion === undefined ? originalOpen(name) : originalOpen(name, dbVersion);
  }) as typeof indexedDB.open;

  const store = browser.createBrowserFilingStore({
    databaseName: db,
    scope: seededScope,
    definitions: new Map([[seededReviewUrl, seededDefinition], [secondSeededUrl, secondSeededDefinition]]),
    fixtures: {
      drafts: [
        seededDraftFixture,
        { definitionUrl: secondSeededUrl, data: { note: 'Second' } },
      ],
    },
  });
  const finish = store.ready().finally(() => {
    indexedDB.open = originalOpen;
  });
  (window as unknown as Record<string, unknown>).__seedRaceControl = {
    resume: async () => {
      resumeSecondOpen();
      await finish;
    },
  };
  await pausedBeforeSecondOpen;
}

export async function resumePausedSeededStore() {
  const ctrl = (window as unknown as Record<string, { resume(): Promise<void> }>).__seedRaceControl;
  await ctrl.resume();
}

export async function discardUnseededStore(db: string) {
  await initFormspecEngine();
  await initFormspecEngineTools();
  const unseeded = browser.createBrowserFilingStore({
    databaseName: db,
    scope: seededScope,
    definitions: seededDefinitions,
  });
  const loaded = await unseeded.drafts.load(seededKey, version);
  if (loaded.status !== 'loaded') throw new Error(`Expected loaded row in unseeded store, got ${loaded.status}`);
  return unseeded.drafts.restart(seededKey, loaded.draft.revision);
}

export async function initializeRejectedOrCorrectedProfile(db: string, corrected: boolean) {
  await initFormspecEngine();
  await initFormspecEngineTools();
  const dependentUrl = 'urn:test:dependent-seed';
  const dependentDef: FormDefinition = {
    $formspec: '1.0',
    url: dependentUrl,
    version,
    title: 'Dependent',
    items: [{ key: 'note', type: 'field', dataType: 'string' }],
    instances: {
      prior: {
        schema: { first: 'object' },
        response: {
          definition: { url: seededReviewUrl },
          subject: [],
          status: 'completed',
          cardinality: 'latest',
          pin: 'at-open',
        },
      },
    },
  };
  const store = browser.createBrowserFilingStore({
    databaseName: db,
    scope: seededScope,
    definitions: new Map([[seededReviewUrl, seededDefinition], [dependentUrl, dependentDef]]),
    fixtures: {
      ...(corrected ? { filings: [{ responseJson: priorCompletedResponseJson }] } : {}),
      drafts: [
        {
          definitionUrl: seededReviewUrl,
          responseId: 'urn:test:first-profile-seed',
          data: { first: { answer: corrected ? 'corrected' : 'rejected profile' } },
        },
        {
          definitionUrl: dependentUrl,
          responseId: 'urn:test:dependent-profile-seed',
          data: { note: 'Depends on completed filing' },
        },
      ],
    },
  });
  if (!corrected) {
    try {
      await store.ready();
      return 'unexpectedly-succeeded';
    } catch {
      return 'rejected';
    }
  }
  await store.ready();
  const loaded = await store.drafts.load(seededKey, version);
  if (loaded.status !== 'loaded') throw new Error(`Expected loaded corrected draft, got ${loaded.status}`);
  return (JSON.parse(loaded.draft.responseJson) as { data: { first: { answer: string } } }).data.first.answer;
}

export async function readRawStore(db: string, store: 'seeds' | 'summaries' | 'editable' | 'filings') {
  const handle = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(db);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    if (!handle.objectStoreNames.contains(store)) return [];
    return await new Promise<unknown[]>((resolve, reject) => {
      const req = handle.transaction(store).objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    handle.close();
  }
}

export async function saveEnrichedSummary(db: string) {
  await initFormspecEngine();
  await initFormspecEngineTools();
  const store = browser.createBrowserFilingStore({ databaseName: db, scope: seededScope, definitions: seededDefinitions });
  await store.ready();
  const enriched = { total: 1, filled: 0, toFix: 1, toCheck: 0, fieldPath: 'first.answer', message: 'Validation message' };
  const saved = await store.drafts.save({
    key: seededKey, expectedRevision: null, definitionVersion: version,
    snapshotJson: JSON.stringify({ definitionUrl: seededReviewUrl, definitionVersion: version, data: {} }),
    responseJson: JSON.stringify({ ...JSON.parse(priorCompletedResponseJson), id: 'urn:test:enriched', status: 'in-progress', data: {} }),
    summary: {
      sections: [{ id: 'main', fields: ['first.answer'] }],
      progress: { status: 'current', form: { ...enriched, ready: false }, sections: { main: enriched } },
    } as never,
  });
  return { saved: saved.status, rows: await readRawStore(db, 'summaries') };
}

const upstreamUrl = 'urn:test:seed-upstream';
const dependentUrl = 'urn:test:seed-dependent';
const upstreamDefinition: FormDefinition = {
  $formspec: '1.0', url: upstreamUrl, version, title: 'Upstream', items: [{ key: 'answer', type: 'field', dataType: 'string' }],
};
const dependentDefinition: FormDefinition = {
  $formspec: '1.0', url: dependentUrl, version, title: 'Dependent', items: [{ key: 'note', type: 'field', dataType: 'string' }],
  instances: {
    upstream: {
      schema: { answer: 'string' },
      response: { definition: { url: upstreamUrl }, subject: [], status: 'current', cardinality: 'latest', pin: 'at-open' },
    },
  },
};

/** Save the upstream row through the public port while the dependent seed's counts are hashed. */
export async function concurrentUpstreamSaveDuringSeed(db: string) {
  await initFormspecEngine();
  await initFormspecEngineTools();
  const definitions = new Map([[upstreamUrl, upstreamDefinition], [dependentUrl, dependentDefinition]]);
  const competitor = browser.createBrowserFilingStore({ databaseName: db, scope: seededScope, definitions });
  await competitor.ready();
  const subtle = crypto.subtle;
  const digest = subtle.digest.bind(subtle);
  let calls = 0;
  let saved: string | undefined;
  subtle.digest = (async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
    calls += 1;
    if (calls === 2 && saved === undefined) {
      saved = 'pending';
      const result = await competitor.drafts.save({
        key: { scope: seededScope, definitionUrl: upstreamUrl }, expectedRevision: null, definitionVersion: version,
        snapshotJson: JSON.stringify({ definitionUrl: upstreamUrl, definitionVersion: version, data: { answer: 'Actual user edit' } }),
        responseJson: JSON.stringify({
          $formspecResponse: '1.0', definitionUrl: upstreamUrl, definitionVersion: version, id: 'user-a',
          status: 'in-progress', authored: '2026-01-01T00:00:00Z', data: { answer: 'Actual user edit' },
        }),
        summary: null,
      });
      saved = result.status;
    }
    return digest(algorithm, data);
  }) as typeof subtle.digest;
  try {
    const store = browser.createBrowserFilingStore({
      databaseName: db, scope: seededScope, definitions,
      fixtures: {
        drafts: [
          { definitionUrl: upstreamUrl, responseId: 'candidate-a', data: { answer: 'Candidate only' } },
          { definitionUrl: dependentUrl, responseId: 'dependent', data: { note: 'Depends on upstream' } },
        ],
      },
    });
    await store.ready();
    const parent = await store.drafts.load({ scope: seededScope, definitionUrl: upstreamUrl }, version);
    const child = await store.drafts.load({ scope: seededScope, definitionUrl: dependentUrl }, version);
    if (parent.status !== 'loaded' || child.status !== 'loaded') throw new Error(`Expected loaded rows, got ${parent.status}/${child.status}`);
    return {
      saved,
      parentId: JSON.parse(parent.draft.responseJson).id as string,
      parent: JSON.parse(parent.draft.responseJson).data,
      pin: child.draft.pins.upstream?.value,
      selectedIds: child.draft.pins.upstream?.records.map(record => record.responseId),
      seeds: (await readRawStore(db, 'seeds')).length,
    };
  } finally {
    subtle.digest = digest;
  }
}

/** Finding 1a: a parent created and discarded during preparation must never be pinned by a dependent seed. */
export async function transientParentDuringSeed(db: string) {
  await initFormspecEngine();
  await initFormspecEngineTools();
  const helperUrl = 'urn:test:transient-helper';
  const parentUrl = 'urn:test:transient-parent';
  const childUrl = 'urn:test:transient-child';
  const helperDef: FormDefinition = {
    $formspec: '1.0', url: helperUrl, version, title: 'Helper', items: [{ key: 'tag', type: 'field', dataType: 'string' }],
  };
  const parentDef: FormDefinition = {
    $formspec: '1.0', url: parentUrl, version, title: 'Parent', items: [{ key: 'answer', type: 'field', dataType: 'string' }],
  };
  const childDef: FormDefinition = {
    $formspec: '1.0', url: childUrl, version, title: 'Child', items: [{ key: 'note', type: 'field', dataType: 'string' }],
    instances: {
      helper: {
        schema: { tag: 'string' },
        response: { definition: { url: helperUrl }, subject: [], status: 'completed', cardinality: 'latest', pin: 'none' },
      },
      parent: {
        schema: { answer: 'string' },
        response: { definition: { url: parentUrl }, subject: [], status: 'current', cardinality: 'latest', pin: 'at-open', whenNone: 'empty' },
        fallback: null,
      },
    },
  };
  const definitions = new Map([[helperUrl, helperDef], [parentUrl, parentDef], [childUrl, childDef]]);
  const helperFilingJson = JSON.stringify({
    $formspecResponse: '1.0', definitionUrl: helperUrl, definitionVersion: version, id: 'urn:test:transient-helper-filing',
    status: 'completed', authored: '2026-01-01T00:00:00Z', data: { tag: 'ok' },
  });
  const parentKey: DraftKey = { scope: seededScope, definitionUrl: parentUrl };
  const childKey: DraftKey = { scope: seededScope, definitionUrl: childUrl };
  const competitor = browser.createBrowserFilingStore({ databaseName: db, scope: seededScope, definitions });
  await competitor.ready();

  // Pre-seed the parent seed marker so save+discard leaves the exact same initial and final fingerprint.
  const preSave = await competitor.drafts.save({
    key: parentKey, expectedRevision: null, definitionVersion: version,
    snapshotJson: JSON.stringify({ definitionUrl: parentUrl, definitionVersion: version, data: { answer: 'pre' } }),
    responseJson: JSON.stringify({
      $formspecResponse: '1.0', definitionUrl: parentUrl, definitionVersion: version, id: 'pre-parent',
      status: 'in-progress', authored: '2026-01-01T00:00:00Z', data: { answer: 'pre' },
    }),
    summary: null,
  });
  if (preSave.status !== 'saved') throw new Error(`Expected preSave saved, got ${preSave.status}`);
  const preDiscard = await competitor.drafts.restart(parentKey, preSave.revision);
  if (preDiscard.status !== 'discarded') throw new Error(`Expected preDiscard discarded, got ${preDiscard.status}`);

  let savedStatus: string | undefined;
  let savedRevision: string | undefined;
  let discardedStatus: string | undefined;
  let childAfterDiscard: string | undefined;

  const seeder = browser.createBrowserFilingStore({
    databaseName: db, scope: seededScope, definitions,
    fixtures: {
      filings: [{ responseJson: helperFilingJson }],
      drafts: [{ definitionUrl: childUrl, responseId: 'urn:test:transient-child-draft', data: { note: 'Child' } }],
    },
    authorize: async (key, relation, selection) => {
      // Save transient parent during preparation admission (after observeSeedState, before any unfixed intermediate read).
      if (relation === 'read' && selection !== undefined && key.definitionUrl === parentUrl && savedStatus === undefined) {
        savedStatus = 'pending';
        const res = await competitor.drafts.save({
          key: parentKey, expectedRevision: null, definitionVersion: version,
          snapshotJson: JSON.stringify({ definitionUrl: parentUrl, definitionVersion: version, data: { answer: 'transient' } }),
          responseJson: JSON.stringify({
            $formspecResponse: '1.0', definitionUrl: parentUrl, definitionVersion: version, id: 'transient',
            status: 'in-progress', authored: '2026-02-01T00:00:00Z', data: { answer: 'transient' },
          }),
          summary: null,
        });
        savedStatus = res.status;
        if (res.status === 'saved') savedRevision = res.revision;
      }
      // Discard transient parent during record-level authorization (after any unfixed intermediate read, before commit).
      if (relation === 'read' && selection === undefined && key.definitionUrl === helperUrl && savedRevision !== undefined && discardedStatus === undefined) {
        discardedStatus = 'pending';
        const res = await competitor.drafts.restart(parentKey, savedRevision);
        discardedStatus = res.status;
        childAfterDiscard = (await competitor.drafts.load(childKey, version)).status;
      }
      return true;
    },
  });
  await seeder.ready();
  const parent = await competitor.drafts.load(parentKey, version);
  const child = await competitor.drafts.load(childKey, version);
  return {
    saved: savedStatus,
    discarded: discardedStatus,
    childAfterDiscard,
    parent: parent.status,
    child: child.status,
    pin: child.status === 'loaded' ? child.draft.pins.parent : undefined,
  };
}

/** Finding 1b: recheck scope on an apparent at-open pin refusal when a concurrent filing commits during preparation. */
export async function concurrentFilingDuringPinRefusal(db: string) {
  await initFormspecEngine();
  await initFormspecEngineTools();
  const helperUrl = 'urn:recheck:helper';
  const parentUrl = 'urn:recheck:parent';
  const childUrl = 'urn:recheck:child';
  const helperDef: FormDefinition = {
    $formspec: '1.0', url: helperUrl, version, title: 'Helper', items: [{ key: 'tag', type: 'field', dataType: 'string' }],
  };
  const parentDef: FormDefinition = {
    $formspec: '1.0', url: parentUrl, version, title: 'Parent', items: [{ key: 'answer', type: 'field', dataType: 'string' }],
  };
  const childDef: FormDefinition = {
    $formspec: '1.0', url: childUrl, version, title: 'Child', items: [{ key: 'note', type: 'field', dataType: 'string' }],
    instances: {
      helper: {
        schema: { tag: 'string' },
        response: { definition: { url: helperUrl }, subject: [], status: 'completed', cardinality: 'latest', pin: 'none' },
      },
      parent: {
        schema: { answer: 'string' },
        response: { definition: { url: parentUrl }, subject: [], status: 'completed', cardinality: 'latest', pin: 'at-open' },
      },
    },
  };
  const definitions = new Map([[helperUrl, helperDef], [parentUrl, parentDef], [childUrl, childDef]]);
  const helperFilingJson = JSON.stringify({
    $formspecResponse: '1.0', definitionUrl: helperUrl, definitionVersion: version, id: 'urn:recheck:helper-filing',
    status: 'completed', authored: '2026-01-01T00:00:00Z', data: { tag: 'ok' },
  });
  const parentKey: DraftKey = { scope: seededScope, definitionUrl: parentUrl };
  const childKey: DraftKey = { scope: seededScope, definitionUrl: childUrl };

  const competitor = browser.createBrowserFilingStore({ databaseName: db, scope: seededScope, definitions });
  await competitor.ready();
  const parentDraftResponse = JSON.stringify({
    $formspecResponse: '1.0', definitionUrl: parentUrl, definitionVersion: version, id: 'urn:recheck:parent-filing',
    status: 'in-progress', authored: '2026-02-01T00:00:00Z', data: { answer: 'user' },
  });
  const parentCompletedResponse = JSON.stringify({
    $formspecResponse: '1.0', definitionUrl: parentUrl, definitionVersion: version, id: 'urn:recheck:parent-filing',
    status: 'completed', authored: '2026-02-01T00:00:00Z', data: { answer: 'user' },
  });
  const savedParent = await competitor.drafts.save({
    key: parentKey, expectedRevision: null, definitionVersion: version,
    snapshotJson: JSON.stringify({ definitionUrl: parentUrl, definitionVersion: version, data: { answer: 'user' } }),
    responseJson: parentDraftResponse,
    summary: null,
  });
  if (savedParent.status !== 'saved') throw new Error(`Expected parent saved, got ${savedParent.status}`);

  let concurrent: string | undefined;
  const seeder = browser.createBrowserFilingStore({
    databaseName: db, scope: seededScope, definitions,
    fixtures: {
      filings: [{ responseJson: helperFilingJson }],
      drafts: [{ definitionUrl: childUrl, responseId: 'urn:recheck:child-draft', data: { note: 'Child' } }],
    },
    authorize: async (key, relation, selection) => {
      // Submit the parent filing during record-level auth for helper (after the initial snapshot/read saw no parent filing).
      if (relation === 'read' && selection === undefined && key.definitionUrl === helperUrl && concurrent === undefined) {
        concurrent = 'pending';
        const res = await competitor.submit(
          { key: parentKey, definitionVersion: version, revision: savedParent.revision, responseJson: parentDraftResponse },
          parentCompletedResponse,
        );
        concurrent = res.status;
      }
      return true;
    },
  });
  let first = 'opened';
  try {
    await seeder.ready();
  } catch (error) {
    first = String(error);
  }
  const loaded = await seeder.drafts.load(childKey, version);
  return {
    concurrent,
    first,
    pin: loaded.status === 'loaded' ? loaded.draft.pins.parent?.value : undefined,
  };
}

/** Finding 2: v3 upgrade converts committed counts without FormEngine, preserving unpinned upstream relevance. */
export async function v3UpgradeUnpinnedUpstream(db: string) {
  await initFormspecEngine();
  await initFormspecEngineTools();
  const parentUrl = 'urn:v3:parent';
  const childUrl = 'urn:v3:child';
  const parentDef: FormDefinition = {
    $formspec: '1.0', url: parentUrl, version, title: 'Parent', items: [{ key: 'flag', type: 'field', dataType: 'string' }],
  };
  const childDef: FormDefinition = {
    $formspec: '1.0', url: childUrl, version, title: 'Child',
    items: [{ key: 'detail', type: 'field', dataType: 'string', label: 'Detail' }],
    instances: {
      parent: {
        schema: { flag: 'string' },
        response: { definition: { url: parentUrl }, subject: [], status: 'completed', cardinality: 'latest', pin: 'none' },
      },
    },
    binds: [{ path: 'detail', relevant: "instance('parent')/flag = 'yes'", required: 'true' }],
  };
  const definitions = new Map([[parentUrl, parentDef], [childUrl, childDef]]);
  const parentFiling = JSON.stringify({
    $formspecResponse: '1.0', definitionUrl: parentUrl, definitionVersion: version, id: 'urn:v3:parent-filing',
    status: 'completed', authored: '2026-01-01T00:00:00Z', data: { flag: 'yes' },
  });
  const committedProgress = {
    status: 'current' as const,
    form: { total: 1, filled: 0, toFix: 0, toCheck: 0, ready: false },
    sections: {},
  };
  const sections = [{ fields: ['detail'] }];

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(db, 3);
    request.onupgradeneeded = () => {
      for (const name of ['editable', 'summaries', 'filings', 'starts']) {
        request.result.createObjectStore(name);
      }
      const key = [seededScope, childUrl, 'respondent', ''];
      request.transaction!.objectStore('editable').put({
        revision: 'v3-unpinned-rev',
        definitionVersion: version,
        pinsJson: '{}',
        responseJson: JSON.stringify({
          $formspecResponse: '1.0', definitionUrl: childUrl, definitionVersion: version, id: 'urn:v3:child-draft',
          status: 'in-progress', authored: '2026-01-02T00:00:00Z', data: {},
        }),
        snapshotJson: JSON.stringify({ definitionUrl: childUrl, definitionVersion: version, data: {} }),
      }, key);
      request.transaction!.objectStore('summaries').put({
        definitionVersion: version,
        summary: { sections, progress: committedProgress },
      }, key);
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });

  const store = browser.createBrowserFilingStore({
    databaseName: db, scope: seededScope, definitions,
    fixtures: { filings: [{ responseJson: parentFiling }] },
  });
  await store.ready();
  const observed = await store.drafts.readSummaries(
    [{ key: 'child', definitionUrl: childUrl, definitionVersion: version, sections }],
    { previewScope: seededScope, signal: new AbortController().signal },
  );
  return {
    before: committedProgress,
    after: observed.get('child')?.draft,
    rows: await readRawStore(db, 'summaries'),
  };
}

/** Finding 3: refused browser storage opens a preview with no draft fixtures while rejecting profiles with drafts. */
export async function blockedStoragePreviewEdition() {
  const surfaceUrl = 'https://example.test/blocked-surface';
  const defUrl = 'https://example.test/blocked-def';
  const source = {
    manifest: {
      $formspecBundle: '2.4' as const,
      id: 'https://example.test/blocked-app',
      title: 'Blocked Storage',
      surfaces: [{ url: surfaceUrl }],
      entrySurface: surfaceUrl,
      definitions: [{ url: defUrl, version }],
    },
    documents: {
      [surfaceUrl]: {
        $formspecSurface: '0.4',
        id: 'app',
        entry: 'start',
        routes: [{
          id: 'start',
          path: '/',
          title: 'Start',
          routeClass: 'intake',
          slots: [{ id: 'form', slotType: 'definition-form', binding: { definitionRef: defUrl } }],
        }],
      },
      [defUrl]: {
        $formspec: '1.0',
        url: defUrl,
        version,
        title: 'Only Form',
        status: 'active',
        items: [{ key: 'answer', type: 'field', dataType: 'string', label: 'Answer' }],
      },
    },
  };
  const originalOpen = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function blockedOpen() {
    const error = new DOMException('Storage disabled by user settings', 'SecurityError');
    const req = new EventTarget() as IDBOpenDBRequest;
    Object.defineProperty(req, 'error', { value: error });
    queueMicrotask(() => {
      req.onerror?.call(req, new Event('error'));
    });
    return req;
  };
  try {
    let unseededResult: { result: string; draft?: string };
    try {
      const edition = await browser.createSurfacePreviewEdition({ scope: 'blocked-no-drafts', source });
      const summary = await edition.adapters.draftStorage!.port.readSummaries(
        [{ key: 'only', definitionUrl: defUrl, definitionVersion: version, sections: [{ fields: ['answer'] }] }],
        { previewScope: 'blocked-no-drafts', signal: new AbortController().signal },
      );
      unseededResult = { result: 'opened', draft: summary.get('only')?.draft.status };
    } catch (error) {
      unseededResult = { result: String(error) };
    }

    let seededResult = 'opened';
    try {
      await browser.createSurfacePreviewEdition({
        scope: 'blocked-with-drafts',
        source,
        scenario: {
          $formspecSurfaceScenario: '0.1',
          version,
          initialPath: '/',
          defaultProfile: 'seeded',
          profiles: {
            seeded: {
              authorization: { default: 'authorized' },
              sources: [],
              drafts: [{ definitionUrl: defUrl, data: { answer: 'Seeded' } }],
            },
          },
          actions: { default: { status: 'complete' } },
        },
      });
    } catch (error) {
      seededResult = String(error);
    }
    return { unseeded: unseededResult, seeded: seededResult };
  } finally {
    IDBFactory.prototype.open = originalOpen;
  }
}

/** Finding 4: stored parent sharing explicit responseId with a child fixture must never report a false self-cycle. */
export async function storedParentSharedResponseId(db: string) {
  await initFormspecEngine();
  await initFormspecEngineTools();
  const parentUrl = 'urn:shared-id:parent';
  const childUrl = 'urn:shared-id:child';
  const parentDef: FormDefinition = {
    $formspec: '1.0', url: parentUrl, version, title: 'Parent', items: [{ key: 'answer', type: 'field', dataType: 'string' }],
  };
  const childDef: FormDefinition = {
    $formspec: '1.0', url: childUrl, version, title: 'Child', items: [{ key: 'note', type: 'field', dataType: 'string' }],
    instances: {
      parent: {
        schema: { answer: 'string' },
        response: { definition: { url: parentUrl }, subject: [], status: 'current', cardinality: 'latest', pin: 'at-open' },
      },
    },
  };
  const definitions = new Map([[parentUrl, parentDef], [childUrl, childDef]]);
  const parentStore = browser.createBrowserFilingStore({ databaseName: db, scope: seededScope, definitions });
  await parentStore.ready();
  const saved = await parentStore.drafts.save({
    key: { scope: seededScope, definitionUrl: parentUrl },
    expectedRevision: null,
    definitionVersion: version,
    snapshotJson: JSON.stringify({ definitionUrl: parentUrl, definitionVersion: version, data: { answer: 'Stored parent' } }),
    responseJson: JSON.stringify({
      $formspecResponse: '1.0', definitionUrl: parentUrl, definitionVersion: version, id: 'shared-id',
      status: 'in-progress', authored: '2026-01-01T00:00:00Z', data: { answer: 'Stored parent' },
    }),
    summary: null,
  });
  if (saved.status !== 'saved') throw new Error(`Expected parent saved, got ${saved.status}`);
  const winner = (await parentStore.responses.select([{
    key: 'parent', kind: 'definition', scope: seededScope, projection: ['answer'],
    selection: { definition: { url: parentUrl }, subject: [], status: 'current', cardinality: 'latest', pin: 'at-open' },
  }])).get('parent');

  const collidingStore = browser.createBrowserFilingStore({
    databaseName: db, scope: seededScope, definitions,
    fixtures: {
      drafts: [{ definitionUrl: childUrl, responseId: 'shared-id', data: { note: 'Child' } }],
    },
  });
  let collisionResult = 'opened';
  try {
    await collidingStore.ready();
  } catch (error) {
    collisionResult = String(error);
  }
  const seedsAfterCollision = (await readRawStore(db, 'seeds')).length;

  const uniqueStore = browser.createBrowserFilingStore({
    databaseName: db, scope: seededScope, definitions,
    fixtures: {
      drafts: [{ definitionUrl: childUrl, responseId: 'child-unique-id', data: { note: 'Child' } }],
    },
  });
  await uniqueStore.ready();
  const loadedChild = await uniqueStore.drafts.load({ scope: seededScope, definitionUrl: childUrl }, version);
  return {
    winner,
    collisionResult,
    seedsAfterCollision,
    uniqueChildPin: loadedChild.status === 'loaded' ? loadedChild.draft.pins.parent?.value : undefined,
  };
}

/** Finding 5 + __proto__: off-plan section keys are stripped from IndexedDB and readSummaries, while canonicalDraftProgress keeps own keys. */
export async function saveOffPlanSectionKey(db: string) {
  await initFormspecEngine();
  await initFormspecEngineTools();
  const store = browser.createBrowserFilingStore({ databaseName: db, scope: seededScope, definitions: seededDefinitions });
  await store.ready();
  const sections = [{ id: 'main', fields: ['first.answer'] }];
  const saved = await store.drafts.save({
    key: seededKey, expectedRevision: null, definitionVersion: version,
    snapshotJson: JSON.stringify({ definitionUrl: seededReviewUrl, definitionVersion: version, data: {} }),
    responseJson: JSON.stringify({ ...JSON.parse(priorCompletedResponseJson), id: 'urn:test:off-plan', status: 'in-progress', data: {} }),
    summary: {
      sections,
      progress: {
        status: 'current',
        form: { total: 1, filled: 0, toFix: null, toCheck: null, ready: null },
        sections: {
          main: { total: 1, filled: 0, toFix: null, toCheck: null },
          'first.answer': { total: 1, filled: 0, toFix: null, toCheck: null },
        },
      },
    },
  });
  const read = (await store.drafts.readSummaries(
    [{ key: 'seeded', definitionUrl: seededReviewUrl, definitionVersion: version, sections }],
    { previewScope: seededScope, signal: new AbortController().signal },
  )).get('seeded')?.draft;
  const protoCopied = canonicalDraftProgress({
    status: 'current',
    form: { total: 2, filled: 1, toFix: null, toCheck: null, ready: null },
    sections: Object.fromEntries([
      ['__proto__', { total: 1, filled: 0, toFix: null, toCheck: null }],
      ['normal', { total: 1, filled: 1, toFix: 0, toCheck: 0 }],
    ]),
  });
  return {
    saved: saved.status,
    read,
    rows: await readRawStore(db, 'summaries'),
    protoForm: protoCopied?.form,
    protoSections: Object.keys(protoCopied?.sections ?? {}),
  };
}
