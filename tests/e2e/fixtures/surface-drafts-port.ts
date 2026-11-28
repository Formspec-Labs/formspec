/** @filedesc Browser bridge for the shared draft storage suite. */
import { initFormspecEngine, initFormspecEngineTools, responseSubjectId } from '@formspec-org/engine';
import * as browser from '../../../packages/formspec-surface-react/src/index';
import type { FormDefinition, ResponseSelection, ResponseSelectionDelivery } from '@formspec-org/types';
import { canonicalFiniteJson, prepareResponseFiling } from '../../../packages/formspec-surface/src/index';
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
  const originalTransaction = IDBDatabase.prototype.transaction;
  let ownershipReads = 0;
  let pauseNextOpen = false;
  let pausedOnce = false;
  let notifyPaused!: () => void;
  const pausedAfterOwnershipRead = new Promise<void>(resolve => { notifyPaused = resolve; });
  let resumeAfterPause!: () => void;
  const pauseGate = new Promise<void>(resolve => { resumeAfterPause = resolve; });

  IDBDatabase.prototype.transaction = function (...args) {
    const tx = Reflect.apply(originalTransaction, this, args) as IDBTransaction;
    const names = [...tx.objectStoreNames];
    if (this.name === db && tx.mode === 'readonly' &&
        names.length === 3 && names.includes('seeds') && names.includes('editable') && names.includes('filings')) {
      ownershipReads += 1;
      if (ownershipReads === 1 && !pausedOnce) {
        tx.addEventListener('complete', () => { pauseNextOpen = true; }, { once: true });
      }
    }
    return tx;
  };

  indexedDB.open = ((name: string, dbVersion?: number) => {
    if (name === db && pauseNextOpen && !pausedOnce) {
      pauseNextOpen = false;
      pausedOnce = true;
      const proxyReq = {} as IDBOpenDBRequest;
      notifyPaused();
      void pauseGate.then(() => {
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
    IDBDatabase.prototype.transaction = originalTransaction;
  });
  (window as unknown as Record<string, unknown>).__seedRaceControl = {
    resume: async () => {
      resumeAfterPause();
      await finish;
      return { ownershipReads };
    },
  };
  await pausedAfterOwnershipRead;
}

export async function resumePausedSeededStore() {
  const ctrl = (window as unknown as Record<string, { resume(): Promise<{ ownershipReads: number }> }>).__seedRaceControl;
  return await ctrl.resume();
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

export type VersionThreeUpgradeMode =
  | 'valid-filing'
  | 'valid-draft'
  | 'valid-initialized-minted'
  | 'valid-prepared-draft'
  | 'valid-v2-through-v3'
  | 'valid-historical-filing-new-subject'
  | 'valid-implicit-missing-summary'
  | 'valid-start-same-names-new-type'
  | 'valid-start-real-restart'
  | 'plan-extra-field'
  | 'incomplete-filing'
  | 'corrupt-filing'
  | 'changed-answer'
  | 'wrong-hash'
  | 'orphan-with-start'
  | 'wrong-draft-definition'
  | 'wrong-snapshot-url'
  | 'missing-snapshot-data'
  | 'invalid-plan-id'
  | 'start-wrong-definition'
  | 'start-extra-issued-key'
  | 'start-unknown-version'
  | 'start-known-type-change'
  | 'bad-pins'
  | 'missing-revision'
  | 'missing-snapshot'
  | 'negative-count'
  | 'missing-form'
  | 'start-no-version'
  | 'start-no-parents';

export async function upgradeVersionThreeFiling(mode: VersionThreeUpgradeMode) {
  const scope = 'edition-v3';
  const definitionUrl = 'urn:test:v3-plan';
  const otherDefinitionUrl = 'urn:test:v3-unrelated';
  const databaseName = `formspec-v3-upgrade-${mode}`;
  const isMinted = mode === 'valid-initialized-minted'
    || mode === 'valid-start-same-names-new-type'
    || mode === 'valid-start-real-restart'
    || mode === 'orphan-with-start'
    || mode === 'start-wrong-definition'
    || mode === 'start-extra-issued-key'
    || mode === 'start-unknown-version'
    || mode === 'start-known-type-change'
    || mode === 'start-no-version'
    || mode === 'start-no-parents';
  const isImplicit = mode === 'valid-v2-through-v3' || mode === 'valid-implicit-missing-summary';
  const definitionV1: FormDefinition = {
    $formspec: '1.0', url: definitionUrl, version, title: 'V3 Plan', items: [{ key: 'answer', type: 'field', dataType: 'string' }],
    ...(isImplicit ? {} : {
      subject: {
        type: definitionUrl,
        keys: mode === 'start-extra-issued-key'
          ? {
              first_period: { dataType: 'integer' },
              last_period: { dataType: 'integer' },
              unit: { dataType: 'string', minted: true },
              serial: { dataType: 'string', minted: true },
            }
          : isMinted
            ? { first_period: { dataType: 'integer' }, last_period: { dataType: 'integer' }, unit: { dataType: 'string', minted: true } }
            : { first_period: { dataType: 'integer' }, last_period: { dataType: 'integer' } },
      },
    }),
  };
  const currentDefinition: FormDefinition = mode === 'valid-historical-filing-new-subject'
    ? {
        ...definitionV1,
        version: '2.0.0',
        subject: {
          type: definitionUrl,
          keys: { first_period: { dataType: 'integer' }, last_period: { dataType: 'integer' }, region: { dataType: 'string' } },
        },
      }
    : mode === 'valid-start-same-names-new-type'
      ? {
          ...definitionV1,
          version: '2.0.0',
          subject: {
            type: definitionUrl,
            keys: { first_period: { dataType: 'string' }, last_period: { dataType: 'integer' }, unit: { dataType: 'string', minted: true } },
          },
        }
      : mode === 'valid-start-real-restart'
        ? { ...definitionV1, version: '2.0.0' }
        : mode === 'start-extra-issued-key'
          ? {
              ...definitionV1,
              subject: {
                type: definitionUrl,
                keys: { first_period: { dataType: 'integer' }, last_period: { dataType: 'integer' }, unit: { dataType: 'string', minted: true } },
              },
            }
          : mode === 'start-known-type-change'
            ? {
                ...definitionV1,
                subject: {
                  type: 'urn:test:different-subject-type',
                  keys: { first_period: { dataType: 'integer' }, last_period: { dataType: 'integer' }, unit: { dataType: 'string', minted: true } },
                },
              }
            : definitionV1;
  const otherDefinition: FormDefinition = {
    $formspec: '1.0', url: otherDefinitionUrl, version, title: 'Unrelated Plan',
    items: [{ key: 'answer', type: 'field', dataType: 'string' }],
  };
  const tools = await browser.previewResponseRecordTools();
  const keys = mode === 'start-extra-issued-key'
    ? { first_period: 2024, last_period: 2026, unit: 'minted-v3-unit-1', serial: 'extra-serial-1' }
    : isMinted
      ? { first_period: 2024, last_period: 2026, unit: 'minted-v3-unit-1' }
      : { first_period: 2024, last_period: 2026 };
  const subject = isImplicit ? undefined : { type: definitionUrl, keys, id: tools.subjectId(definitionUrl, keys) };
  const filingKey: DraftKey = { scope, definitionUrl, ...(subject ? { subject } : {}) };
  const responseJson = JSON.stringify({
    $formspecResponse: '1.0', definitionUrl, definitionVersion: version, status: 'completed',
    id: 'urn:v3:filed', authored: '2026-01-19T00:00:00Z', ...(subject ? { subject } : {}), data: { answer: 'filed-in-v3' },
  }, null, 2) + '\n';
  const admittedFiling = prepareResponseFiling(
    scope, new Map([[definitionUrl, definitionV1]]), responseJson, 'preview-submit', tools,
  );
  const realHash = admittedFiling.responseHash;
  const draftResponseJson = JSON.stringify({
    $formspecResponse: '1.0', definitionUrl, definitionVersion: version, status: 'in-progress',
    id: 'urn:v3:draft', authored: '2026-01-18T00:00:00Z', ...(subject ? { subject } : {}), data: { answer: 'draft-in-v3' },
  });
  const preparedDraftJson = JSON.stringify({
    $formspecResponse: '1.0', definitionUrl, definitionVersion: version, status: 'completed',
    id: 'urn:v3:prepared', authored: '2026-01-18T00:00:00Z', ...(subject ? { subject } : {}), data: { answer: 'prepared-in-v3' },
  });
  const savedSummary = {
    sections: [],
    progress: {
      status: 'current' as const,
      form: { total: 1, filled: 1, prefilled: 0, missing: 0, missingReadonly: 0, toFix: 0, toCheck: 0, ready: true },
      sections: {},
    },
  };
  const startRequestFor = (url: string, requestFields?: Record<string, unknown>) => canonicalFiniteJson(
    requestFields ?? { definitionUrl: url, version, type: definitionUrl, keys: { first_period: 2024, last_period: 2026 } },
  );

  await new Promise<void>((resolve, reject) => {
    const del = indexedDB.deleteDatabase(databaseName);
    del.onsuccess = () => resolve();
    del.onerror = () => reject(del.error);
  });
  if (mode === 'valid-v2-through-v3') {
    // Seed v2 respondent placeholder, then step through v2 -> v3 retaining it verbatim before v4 opens.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        const editable = db.createObjectStore('editable');
        db.createObjectStore('summaries');
        db.createObjectStore('filings');
        editable.put({
          definitionVersion: version,
          revision: 'version-two-draft',
          snapshotJson: '{}',
          responseJson: '{}',
          pinsJson: '{}',
        }, [scope, definitionUrl, 'respondent', '']);
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 3);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('starts')) request.result.createObjectStore('starts');
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
  } else {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 3);
      request.onupgradeneeded = () => {
        const db = request.result;
        const editable = db.createObjectStore('editable');
        const summaries = db.createObjectStore('summaries');
        const filings = db.createObjectStore('filings');
        const starts = db.createObjectStore('starts');
        const storageKey = subject
          ? [scope, definitionUrl, 'subject', subject.id]
          : [scope, definitionUrl, 'respondent', ''];
        const validEditable = {
          definitionVersion: version,
          revision: 'v3-rev-1',
          snapshotJson: JSON.stringify({ definitionUrl, definitionVersion: version, data: { answer: 'draft-in-v3' } }),
          responseJson: draftResponseJson,
          pinsJson: '{}',
        };
        if (mode === 'valid-filing' || mode === 'valid-historical-filing-new-subject') {
          filings.put({
            key: filingKey,
            definitionVersion: version,
            responseJson,
            responseId: 'urn:v3:filed',
            responseHash: realHash,
            sample: 'preview-submit',
          }, [scope, 'urn:v3:filed']);
        } else if (mode === 'valid-prepared-draft') {
          editable.put({
            ...validEditable,
            revision: 'v3-prepared-1',
            responseJson: preparedDraftJson,
            snapshotJson: JSON.stringify({ definitionUrl, definitionVersion: version, data: { answer: 'prepared-in-v3' } }),
          }, storageKey);
          summaries.put({ definitionVersion: version, summary: null }, storageKey);
        } else if (mode === 'valid-implicit-missing-summary') {
          editable.put(validEditable, storageKey);
        } else if (mode === 'changed-answer') {
          filings.put({
            key: filingKey,
            definitionVersion: version,
            responseJson: responseJson.replace('filed-in-v3', 'tampered-in-v3'),
            responseId: 'urn:v3:filed',
            responseHash: realHash,
            sample: 'preview-submit',
          }, [scope, 'urn:v3:filed']);
        } else if (mode === 'wrong-hash') {
          filings.put({
            key: filingKey,
            definitionVersion: version,
            responseJson,
            responseId: 'urn:v3:filed',
            responseHash: 'sha256:' + 'b'.repeat(64),
            sample: 'preview-submit',
          }, [scope, 'urn:v3:filed']);
        } else if (mode === 'valid-draft') {
          editable.put(validEditable, storageKey);
          summaries.put({ definitionVersion: version, summary: savedSummary }, storageKey);
        } else if (mode === 'valid-initialized-minted' || mode === 'valid-start-same-names-new-type' || mode === 'start-extra-issued-key' || mode === 'start-known-type-change') {
          starts.put({ request: startRequestFor(definitionUrl), subject: subject! }, [scope, 'attempt-1']);
          editable.put({ definitionVersion: version, revision: 'v3-init-1', pinsJson: '{}' }, storageKey);
          summaries.put({ definitionVersion: version, summary: null }, storageKey);
        } else if (mode === 'valid-start-real-restart') {
          starts.put({ request: startRequestFor(definitionUrl), subject: subject! }, [scope, 'attempt-1']);
          editable.put({ definitionVersion: '2.0.0', revision: 'v3-restarted-2', pinsJson: '{}' }, storageKey);
          summaries.put({ definitionVersion: '2.0.0', summary: null }, storageKey);
        } else if (mode === 'start-unknown-version') {
          starts.put({
            request: startRequestFor(definitionUrl, {
              definitionUrl, version: '9.0.0', type: definitionUrl, keys: { first_period: 2024, last_period: 2026 },
            }),
            subject: subject!,
          }, [scope, 'attempt-1']);
          editable.put({ definitionVersion: version, revision: 'v3-init-unknown-ver', pinsJson: '{}' }, storageKey);
          summaries.put({ definitionVersion: version, summary: null }, storageKey);
        } else if (mode === 'wrong-snapshot-url') {
          editable.put({
            ...validEditable,
            snapshotJson: JSON.stringify({ definitionUrl: otherDefinitionUrl, definitionVersion: version, data: { answer: 'draft-in-v3' } }),
          }, storageKey);
          summaries.put({ definitionVersion: version, summary: savedSummary }, storageKey);
        } else if (mode === 'missing-snapshot-data') {
          editable.put({
            ...validEditable,
            snapshotJson: JSON.stringify({ definitionUrl, definitionVersion: version }),
          }, storageKey);
          summaries.put({ definitionVersion: version, summary: savedSummary }, storageKey);
        } else if (mode === 'invalid-plan-id') {
          editable.put(validEditable, storageKey);
          summaries.put({
            definitionVersion: version,
            plans: [{ planId: 'non-digest', progress: savedSummary.progress }],
          }, storageKey);
        } else if (mode === 'plan-extra-field') {
          editable.put(validEditable, storageKey);
          summaries.put({
            definitionVersion: version,
            plans: [{
              planId: 'sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
              progress: { ...savedSummary.progress, reviewLabel: 'ordinary extra metadata' },
            }],
          }, storageKey);
        } else if (mode === 'orphan-with-start') {
          starts.put({ request: startRequestFor(definitionUrl), subject: subject! }, [scope, 'attempt-1']);
          summaries.put({ definitionVersion: version, summary: savedSummary }, storageKey);
        } else if (mode === 'wrong-draft-definition') {
          editable.put({
            definitionVersion: version,
            revision: 'v3-rev-wrong',
            snapshotJson: JSON.stringify({ definitionUrl: 'urn:test:other-plan', definitionVersion: version, data: { answer: 'draft-in-v3' } }),
            responseJson: JSON.stringify({
              $formspecResponse: '1.0', definitionUrl: 'urn:test:other-plan', definitionVersion: version, status: 'in-progress',
              id: 'urn:v3:draft', authored: '2026-01-18T00:00:00Z', subject, data: { answer: 'draft-in-v3' },
            }),
            pinsJson: '{}',
          }, storageKey);
          summaries.put({ definitionVersion: version, summary: savedSummary }, storageKey);
        } else if (mode === 'start-wrong-definition') {
          starts.put({ request: startRequestFor('urn:test:other-plan'), subject: subject! }, [scope, 'attempt-1']);
          editable.put({ definitionVersion: version, revision: 'v3-init-wrong', pinsJson: '{}' }, storageKey);
          summaries.put({ definitionVersion: version, summary: null }, storageKey);
        } else if (mode === 'start-no-version') {
          starts.put({
            request: startRequestFor(definitionUrl, { definitionUrl, type: definitionUrl, keys: { first_period: 2024, last_period: 2026 } }),
            subject: subject!,
          }, [scope, 'attempt-1']);
          editable.put({ definitionVersion: version, revision: 'v3-init-noversion', pinsJson: '{}' }, storageKey);
          summaries.put({ definitionVersion: version, summary: null }, storageKey);
        } else if (mode === 'start-no-parents') {
          starts.put({
            request: startRequestFor(definitionUrl, { definitionUrl, version, type: definitionUrl, keys: {} }),
            subject: subject!,
          }, [scope, 'attempt-1']);
          editable.put({ definitionVersion: version, revision: 'v3-init-noparents', pinsJson: '{}' }, storageKey);
          summaries.put({ definitionVersion: version, summary: null }, storageKey);
        } else if (mode === 'bad-pins') {
          editable.put({ ...validEditable, pinsJson: '{bad' }, storageKey);
          summaries.put({ definitionVersion: version, summary: savedSummary }, storageKey);
        } else if (mode === 'missing-revision') {
          const { revision: _rev, ...noRevision } = validEditable;
          editable.put(noRevision, storageKey);
          summaries.put({ definitionVersion: version, summary: savedSummary }, storageKey);
        } else if (mode === 'missing-snapshot') {
          const { snapshotJson: _snap, ...noSnapshot } = validEditable;
          editable.put(noSnapshot, storageKey);
          summaries.put({ definitionVersion: version, summary: savedSummary }, storageKey);
        } else if (mode === 'negative-count') {
          editable.put(validEditable, storageKey);
          summaries.put({
            definitionVersion: version,
            summary: {
              sections: [],
              progress: { status: 'current', form: { total: -1, filled: 0, toFix: 0, toCheck: 0, ready: false }, sections: {} },
            },
          }, storageKey);
        } else if (mode === 'missing-form') {
          editable.put(validEditable, storageKey);
          summaries.put({
            definitionVersion: version,
            summary: { sections: [], progress: { status: 'current', sections: {} } },
          }, storageKey);
        } else if (mode === 'incomplete-filing') {
          filings.put({
            key: filingKey,
            definitionVersion: version,
            authored: '2026-01-19T00:00:00Z',
            responseId: 'urn:v3:filed',
            responseHash: realHash,
            sample: 'preview-submit',
          }, [scope, 'urn:v3:filed']);
        } else {
          filings.put({ responseJson }, [scope, 'urn:v3:filed']);
        }
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
  }

  const store = browser.createBrowserFilingStore({
    scope,
    databaseName,
    definitions: new Map([[definitionUrl, currentDefinition], [otherDefinitionUrl, otherDefinition]]),
  });
  const reads = await store.drafts.readSummaries([
    {
      key: 'exact',
      definitionUrl,
      definitionVersion: currentDefinition.version,
      ...(subject ? { subject: { type: definitionUrl, keys } } : {}),
      sections: [],
    },
    ...(isImplicit ? [] : [{
      key: 'range',
      definitionUrl,
      definitionVersion: currentDefinition.version,
      sections: [],
      subjectMatch: {
        type: definitionUrl,
        predicates: [
          { key: 'first_period', op: 'le' as const, value: 2025 },
          { key: 'last_period', op: 'ge' as const, value: 2025 },
        ],
      },
    }]),
    { key: 'other', definitionUrl: otherDefinitionUrl, definitionVersion: version, sections: [] },
  ], { previewScope: scope, signal: new AbortController().signal });
  const loaded = await store.drafts.load(filingKey, mode === 'valid-start-real-restart' ? '2.0.0' : version);
  const selection = mode === 'valid-prepared-draft'
    ? await store.responses.select([
        {
          key: 'current', scope, kind: 'definition', projection: ['answer'],
          selection: { definition: { url: definitionUrl }, subject: [], status: 'current', cardinality: 'latest', pin: 'none', whenNone: 'empty' },
        },
        {
          key: 'completed', scope, kind: 'definition', projection: ['answer'],
          selection: { definition: { url: definitionUrl }, subject: [], status: 'completed', cardinality: 'latest', pin: 'none', whenNone: 'empty' },
        },
      ])
    : undefined;
  const dbVersion = await new Promise<number>((resolve, reject) => {
    const req = indexedDB.open(databaseName);
    req.onsuccess = () => { const v = req.result.version; req.result.close(); resolve(v); };
    req.onerror = () => reject(req.error);
  });
  const rawSummaries = mode === 'plan-extra-field' ? await readRawStore(databaseName, 'summaries') : undefined;
  return {
    exact: reads.get('exact'),
    range: reads.get('range'),
    other: reads.get('other'),
    loaded,
    selectedCurrent: selection?.get('current'),
    selectedCompleted: selection?.get('completed'),
    dbVersion,
    responseHash: realHash,
    rawSummaries,
  };
}

export async function upgradeMainFiveStoreV4Database() {
  const scope = 'edition-main-v4';
  const planUrl = 'urn:test:v4-plan';
  const draftUrl = 'urn:test:v4-draft';
  const databaseName = 'formspec-main-five-store-v4-upgrade';
  const planDef: FormDefinition = {
    $formspec: '1.0', url: planUrl, version, title: 'V4 Plan',
    items: [{ key: 'answer', type: 'field', dataType: 'string' }],
    subject: { type: planUrl, keys: { first_period: { dataType: 'integer' }, last_period: { dataType: 'integer' } } },
  };
  const draftDef: FormDefinition = {
    $formspec: '1.0', url: draftUrl, version, title: 'V4 Draft',
    items: [{ key: 'answer', type: 'field', dataType: 'string' }],
    subject: { type: draftUrl, keys: { first_period: { dataType: 'integer' }, last_period: { dataType: 'integer' } } },
  };
  const definitions = new Map([[planUrl, planDef], [draftUrl, draftDef]]);
  const tools = await browser.previewResponseRecordTools();
  const planKeys = { first_period: 2024, last_period: 2026 };
  const planSubject = { type: planUrl, keys: planKeys, id: tools.subjectId(planUrl, planKeys) };
  const planKey: DraftKey = { scope, definitionUrl: planUrl, subject: planSubject };
  const firstFilingJson = JSON.stringify({
    $formspecResponse: '1.0', definitionUrl: planUrl, definitionVersion: version, status: 'completed',
    id: 'urn:main-v4:receipt-1', authored: '2026-01-19T00:00:00Z', subject: planSubject, data: { answer: 'filed-in-main-v4' },
  }, null, 2) + '\n';
  const firstAdmitted = prepareResponseFiling(scope, definitions, firstFilingJson, 'preview-submit', tools);
  const draftKeys = { first_period: 2027, last_period: 2029 };
  const draftSubject = { type: draftUrl, keys: draftKeys, id: tools.subjectId(draftUrl, draftKeys) };
  const draftResponseJson = JSON.stringify({
    $formspecResponse: '1.0', definitionUrl: draftUrl, definitionVersion: version, status: 'in-progress',
    id: 'urn:main-v4:draft-1', authored: '2026-01-20T00:00:00Z', subject: draftSubject, data: { answer: 'draft-in-main-v4' },
  });
  const emptySectionsPlanId = 'sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945';

  await new Promise<void>((resolve, reject) => {
    const del = indexedDB.deleteDatabase(databaseName);
    del.onsuccess = () => resolve();
    del.onerror = () => reject(del.error);
  });
  // Reproduce the exact 5-store version-4 database written by main (d3c2f6c91), without filingSummaries or summaries.subject.
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(databaseName, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      const editable = db.createObjectStore('editable');
      const summaries = db.createObjectStore('summaries');
      const filings = db.createObjectStore('filings');
      db.createObjectStore('starts');
      const seeds = db.createObjectStore('seeds');
      filings.put({
        key: planKey,
        definitionVersion: version,
        responseId: 'urn:main-v4:receipt-1',
        responseHash: firstAdmitted.responseHash,
        responseJson: firstFilingJson,
        authored: '2026-01-19T00:00:00Z',
        sample: 'preview-submit',
      }, [scope, 'urn:main-v4:receipt-1']);
      const draftStorageKey = [scope, draftUrl, 'subject', draftSubject.id];
      editable.put({
        revision: 'main-v4-rev-1',
        definitionVersion: version,
        pinsJson: '{}',
        responseJson: draftResponseJson,
        snapshotJson: JSON.stringify({ definitionUrl: draftUrl, definitionVersion: version, data: { answer: 'draft-in-main-v4' } }),
      }, draftStorageKey);
      summaries.put({
        definitionVersion: version,
        plans: [{
          planId: emptySectionsPlanId,
          progress: {
            status: 'current',
            reviewLabel: 'extra-top',
            form: { total: 1, filled: 1, toFix: 0, toCheck: 0, ready: true, reviewLabel: 'extra-form' },
            sections: { 'first.answer': { total: 1, filled: 1, toFix: 0, toCheck: 0, reviewLabel: 'extra-section' } },
          },
        }],
      }, draftStorageKey);
      seeds.put({ seeded: true }, draftStorageKey);
    };
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => reject(req.error);
  });

  const store = browser.createBrowserFilingStore({ scope, databaseName, definitions });
  const ctx = { previewScope: scope, signal: new AbortController().signal };
  const initialReads = await store.drafts.readSummaries([
    { key: 'exactFiling', definitionUrl: planUrl, definitionVersion: version, subject: { type: planUrl, keys: planKeys }, sections: [] },
    {
      key: 'rangeFiling', definitionUrl: planUrl, definitionVersion: version, sections: [],
      subjectMatch: {
        type: planUrl,
        predicates: [
          { key: 'first_period', op: 'le', value: 2025 },
          { key: 'last_period', op: 'ge', value: 2025 },
        ],
      },
    },
    { key: 'exactDraft', definitionUrl: draftUrl, definitionVersion: version, subject: { type: draftUrl, keys: draftKeys }, sections: [] },
    {
      key: 'rangeDraft', definitionUrl: draftUrl, definitionVersion: version, sections: [],
      subjectMatch: {
        type: draftUrl,
        predicates: [
          { key: 'first_period', op: 'le', value: 2028 },
          { key: 'last_period', op: 'ge', value: 2028 },
        ],
      },
    },
  ], ctx);
  const seedsBeforeSave = await readRawStore(databaseName, 'seeds');
  const rawSummariesBeforeSave = await readRawStore(databaseName, 'summaries');

  // Submit a second filing for the same period plan to prove filingSummaries writes succeed post-upgrade.
  const secondDraftJson = JSON.stringify({
    $formspecResponse: '1.0', definitionUrl: planUrl, definitionVersion: version, status: 'in-progress',
    id: 'urn:main-v4:receipt-2', authored: '2026-02-01T00:00:00Z', subject: planSubject, data: { answer: 'second-filing' },
  });
  const saved = await store.drafts.save({
    key: planKey, expectedRevision: null, definitionVersion: version,
    snapshotJson: JSON.stringify({ definitionUrl: planUrl, definitionVersion: version, data: { answer: 'second-filing' } }),
    responseJson: secondDraftJson, summary: null,
  });
  if (saved.status !== 'saved') throw new Error(`Expected saved second draft, got ${saved.status}`);
  const secondFilingJson = JSON.stringify({
    $formspecResponse: '1.0', definitionUrl: planUrl, definitionVersion: version, status: 'completed',
    id: 'urn:main-v4:receipt-2', authored: '2026-02-01T00:00:00Z', subject: planSubject, data: { answer: 'second-filing' },
  });
  const secondFiling = await store.submit(
    { key: planKey, definitionVersion: version, revision: saved.revision, responseJson: secondDraftJson },
    secondFilingJson,
  );
  const afterReads = await store.drafts.readSummaries([
    { key: 'afterSecond', definitionUrl: planUrl, definitionVersion: version, subject: { type: planUrl, keys: planKeys }, sections: [] },
  ], ctx);

  const meta = await new Promise<{ dbVersion: number; storeNames: string[] }>((resolve, reject) => {
    const req = indexedDB.open(databaseName);
    req.onsuccess = () => {
      const db = req.result;
      const out = { dbVersion: db.version, storeNames: Array.from(db.objectStoreNames) };
      db.close();
      resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
  return {
    dbVersion: meta.dbVersion,
    storeNames: meta.storeNames,
    firstHash: firstAdmitted.responseHash,
    exactFiling: initialReads.get('exactFiling'),
    rangeFiling: initialReads.get('rangeFiling'),
    exactDraft: initialReads.get('exactDraft'),
    rangeDraft: initialReads.get('rangeDraft'),
    rawSummariesBeforeSave,
    seedsCount: seedsBeforeSave.length,
    secondFiling,
    afterSecondFiling: afterReads.get('afterSecond'),
  };
}

export async function upgradeMainSeededMintedDraft(restart: boolean, includeFixture = true) {
  const databaseName = `formspec-main-seeded-minted-${restart}-${includeFixture}-${crypto.randomUUID()}`;
  const scope = 'edition';
  const url = 'urn:synthetic:seed';
  const otherUrl = 'urn:synthetic:other';
  const subjectInput = { type: 'urn:synthetic:unit', keys: { unit: 'fixed-id' } };
  const definition: FormDefinition = {
    $formspec: '1.0', url, version, title: 'Sample',
    items: [{ key: 'x', type: 'field', dataType: 'string' }],
    subject: { type: subjectInput.type, keys: { unit: { dataType: 'string', minted: true } } },
  };
  const otherDef: FormDefinition = {
    $formspec: '1.0', url: otherUrl, version, title: 'Other',
    items: [{ key: 'y', type: 'field', dataType: 'string' }],
  };
  const tools = await browser.previewResponseRecordTools();
  const subject = { ...subjectInput, id: tools.subjectId(subjectInput.type, subjectInput.keys) };
  const draftKey: DraftKey = { scope, definitionUrl: url, subject };
  const storageKey = [scope, url, 'subject', subject.id];

  // Reproduce the exact 5-store v4 database written by main (d3c2f6c91) when a seeded minted draft is saved or restarted.
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(databaseName, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      const editable = db.createObjectStore('editable');
      const summaries = db.createObjectStore('summaries');
      db.createObjectStore('filings');
      db.createObjectStore('starts');
      const seeds = db.createObjectStore('seeds');
      if (restart) {
        editable.put({ revision: 'main-restarted-rev', definitionVersion: version, pinsJson: '{}' }, storageKey);
        summaries.put({ definitionVersion: version, plans: null }, storageKey);
      } else {
        const responseJson = JSON.stringify({
          $formspecResponse: '1.0', id: 'urn:synthetic:sample', definitionUrl: url, definitionVersion: version,
          status: 'in-progress', authored: '2026-01-01T00:00:00Z', subject, data: { x: 'saved' },
        });
        editable.put({
          revision: 'main-seeded-rev',
          definitionVersion: version,
          pinsJson: '{}',
          responseJson,
          snapshotJson: JSON.stringify({ definitionUrl: url, definitionVersion: version, data: { x: 'saved' } }),
        }, storageKey);
        summaries.put({ definitionVersion: version, plans: null }, storageKey);
      }
      seeds.put({ seeded: true }, storageKey);
    };
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => reject(req.error);
  });

  const store = browser.createBrowserFilingStore({
    scope,
    databaseName,
    definitions: new Map([[url, definition], [otherUrl, otherDef]]),
    ...(includeFixture
      ? { fixtures: { drafts: [{ definitionUrl: url, responseId: 'urn:synthetic:sample', data: { x: 'saved' }, subject: subjectInput }] } }
      : {}),
  });
  const loaded = await store.drafts.load(draftKey, version);
  const other = await store.drafts.load({ scope, definitionUrl: otherUrl }, version);
  const summaryReads = await store.drafts.readSummaries([
    { key: 'exact', definitionUrl: url, definitionVersion: version, subject: subjectInput, sections: [] },
    {
      key: 'range', definitionUrl: url, definitionVersion: version, sections: [],
      subjectMatch: { type: subjectInput.type, predicates: [{ key: 'unit', op: 'eq', value: 'fixed-id' }] },
    },
  ], { previewScope: scope, signal: new AbortController().signal });
  const dbVersion = await new Promise<number>((resolve, reject) => {
    const req = indexedDB.open(databaseName);
    req.onsuccess = () => { const v = req.result.version; req.result.close(); resolve(v); };
    req.onerror = () => reject(req.error);
  });
  const seeds = await readRawStore(databaseName, 'seeds');
  return {
    dbVersion,
    loaded: loaded.status,
    other: other.status,
    exact: summaryReads.get('exact'),
    range: summaryReads.get('range'),
    seedsCount: seeds.length,
  };
}

export async function upgradeMainV4VersionPath({
  issued,
  active,
  algorithm,
  restart,
  altered,
  foreign,
  save,
  activeAlgorithm,
  legacyV3Summary,
  editableVersion,
}: {
  issued: string;
  active: string;
  algorithm: NonNullable<FormDefinition['versionAlgorithm']>;
  restart: boolean;
  altered?: string | undefined;
  foreign?: boolean | undefined;
  save?: boolean | undefined;
  activeAlgorithm?: NonNullable<FormDefinition['versionAlgorithm']> | undefined;
  legacyV3Summary?: boolean | undefined;
  editableVersion?: string | undefined;
}) {
  const scope = 'synthetic';
  const databaseName = `formspec-v4-version-${crypto.randomUUID()}`;
  const url = 'urn:versions:plan';
  const otherUrl = 'urn:versions:sibling';
  const makeDef = (ver: string, alg: NonNullable<FormDefinition['versionAlgorithm']> = algorithm): FormDefinition => ({
    $formspec: '1.0', url, version: ver, versionAlgorithm: alg, title: 'Synthetic plan', items: [],
    subject: { type: url, keys: { year: { dataType: 'integer' }, unit: { dataType: 'string', minted: true } } },
  });
  const otherDef: FormDefinition = {
    $formspec: '1.0', url: otherUrl, version: '1.0.0', title: 'Sibling', items: [],
  };
  const tools = await browser.previewResponseRecordTools();
  const mintedKeys = { year: 2025, unit: 'minted-unit-1' };
  const subject = { type: url, keys: mintedKeys, id: tools.subjectId(url, mintedKeys) };
  const draftKey: DraftKey = { scope, definitionUrl: url, subject };
  const storageKey = [scope, url, 'subject', subject.id];
  const storedEditableVersion = editableVersion ?? (restart ? active : issued);
  const startRequestVersion = altered ?? issued;
  const startRequest = canonicalFiniteJson({
    definitionUrl: url,
    version: startRequestVersion,
    type: url,
    keys: { year: 2025 },
  });

  // Reproduce the exact 5-store v4 state written by main (d3c2f6c91) for start(), restart(), save(), or v3->v4 bridge.
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(databaseName, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      const editable = db.createObjectStore('editable');
      const summaries = db.createObjectStore('summaries');
      db.createObjectStore('filings');
      const starts = db.createObjectStore('starts');
      const seeds = db.createObjectStore('seeds');
      starts.put({ request: startRequest, subject }, [scope, 'one']);
      if (save) {
        const responseJson = JSON.stringify({
          $formspecResponse: '1.0', id: 'urn:test:saved', definitionUrl: url, definitionVersion: storedEditableVersion,
          status: 'in-progress', authored: '2026-01-01T00:00:00Z', subject, data: {},
        });
        editable.put({
          revision: 'main-v4-saved-rev',
          definitionVersion: storedEditableVersion,
          pinsJson: '{}',
          responseJson,
          snapshotJson: JSON.stringify({ definitionUrl: url, definitionVersion: storedEditableVersion, data: {} }),
        }, storageKey);
      } else {
        editable.put({ revision: 'main-v4-rev', definitionVersion: storedEditableVersion, pinsJson: '{}' }, storageKey);
      }
      if (legacyV3Summary) {
        summaries.put({ definitionVersion: storedEditableVersion, summary: null }, storageKey);
      } else {
        summaries.put({ definitionVersion: storedEditableVersion, plans: null }, storageKey);
      }
      if (restart || save) seeds.put({ seeded: true }, storageKey);
    };
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => reject(req.error);
  });

  const openScope = foreign ? 'synthetic-neighbor' : scope;
  const activeDef = makeDef(active, activeAlgorithm ?? algorithm);
  const store = browser.createBrowserFilingStore({
    scope: openScope,
    databaseName,
    definitions: new Map([[url, activeDef], [otherUrl, otherDef]]),
  });
  const sibling = await store.drafts.load({ scope: openScope, definitionUrl: otherUrl }, '1.0.0');
  const load = await store.drafts.load(draftKey, active);
  const retry = await store.drafts.start({
    scope, definitionUrl: url, definitionVersion: active, attemptId: 'one',
    subject: { type: url, keys: { year: 2025 } },
  });
  const facts = !foreign
    ? await store.drafts.readSummaries([
        { key: 'exact', definitionUrl: url, definitionVersion: active, subject: { type: url, keys: mintedKeys }, sections: [] },
        {
          key: 'range', definitionUrl: url, definitionVersion: active, sections: [],
          subjectMatch: { type: url, predicates: [{ key: 'year', op: 'eq', value: 2025 }] },
        },
      ], { previewScope: scope, signal: new AbortController().signal })
    : undefined;
  const currentSelect = !foreign
    ? (await store.responses.select([{
        key: 'current',
        kind: 'definition',
        scope,
        selection: { definition: { url }, subject: [], status: 'current', cardinality: 'latest', pin: 'none', whenNone: 'empty' },
      }])).get('current')
    : undefined;
  const quarantinedRestart = !foreign && load.status === 'unavailable'
    ? (await store.drafts.restart(draftKey, save ? 'main-v4-saved-rev' : 'main-v4-rev')).status
    : undefined;
  const dbVersion = await new Promise<number>((resolve, reject) => {
    const req = indexedDB.open(databaseName);
    req.onsuccess = () => { const v = req.result.version; req.result.close(); resolve(v); };
    req.onerror = () => reject(req.error);
  });
  return {
    dbVersion,
    sibling: sibling.status,
    load: load.status,
    retry: retry.status,
    exact: facts?.get('exact'),
    range: facts?.get('range'),
    currentSelect: currentSelect?.status,
    quarantinedRestart,
  };
}

export type SeededEdgeMode =
  | 'range-unresolved'
  | 'two'
  | 'no-marker'
  | 'no-marker-fixture'
  | 'bad-marker'
  | 'bad-address'
  | 'edition-return'
  | 'edition-return-filing';

export async function upgradeMainSeededEdgeCase(mode: SeededEdgeMode) {
  const scope = 'synthetic';
  const databaseName = `formspec-seeded-edge-${mode}-${crypto.randomUUID()}`;
  const url = 'urn:review:plan';
  const otherUrl = 'urn:review:other';
  const makeSubjectInput = (unit: string) => ({ type: url, keys: { year: 2025, unit } });
  const planDef: FormDefinition = {
    $formspec: '1.0', url, version, title: 'Synthetic plan',
    items: [{ key: 'x', type: 'field', dataType: 'string' }],
    subject: { type: url, keys: { year: { dataType: 'integer' }, unit: { dataType: 'string', minted: true } } },
  };
  const otherDef: FormDefinition = {
    $formspec: '1.0', url: otherUrl, version, title: 'Sibling',
    items: [{ key: 'answer', type: 'field', dataType: 'string' }],
  };
  const definitions = new Map([[url, planDef], [otherUrl, otherDef]]);
  const tools = await browser.previewResponseRecordTools();
  const firstInput = makeSubjectInput('first');
  const firstSubject = { ...firstInput, id: tools.subjectId(firstInput.type, firstInput.keys) };
  const firstKey: DraftKey = { scope, definitionUrl: url, subject: firstSubject };
  const firstStorageKey = [scope, url, 'subject', firstSubject.id];
  const secondInput = makeSubjectInput('second');
  const secondSubject = { ...secondInput, id: tools.subjectId(secondInput.type, secondInput.keys) };
  const secondStorageKey = [scope, url, 'subject', secondSubject.id];
  const firstRevision = 'main-v4-restarted-rev-1';
  const firstFilingJson = JSON.stringify({
    $formspecResponse: '1.0', id: 'urn:synthetic:first', definitionUrl: url, definitionVersion: version,
    status: 'completed', authored: '2026-01-01T00:00:00Z', subject: firstSubject, data: { x: 'saved' },
  });

  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(databaseName, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      const editable = db.createObjectStore('editable');
      const summaries = db.createObjectStore('summaries');
      db.createObjectStore('filings');
      db.createObjectStore('starts');
      const seeds = db.createObjectStore('seeds');
      const targetStorageKey = mode === 'bad-address' ? [scope, url, 'subject', ''] : firstStorageKey;
      editable.put({ revision: firstRevision, definitionVersion: version, pinsJson: '{}' }, targetStorageKey);
      summaries.put({ definitionVersion: version, plans: null }, targetStorageKey);
      if (mode === 'bad-marker') {
        seeds.put({ seeded: false }, targetStorageKey);
      } else if (mode !== 'no-marker' && mode !== 'no-marker-fixture') {
        seeds.put({ seeded: true }, targetStorageKey);
      }
      if (mode === 'two') {
        const secondResp = JSON.stringify({
          $formspecResponse: '1.0', id: 'urn:synthetic:second', definitionUrl: url, definitionVersion: version,
          status: 'in-progress', authored: '2026-01-02T00:00:00Z', subject: secondSubject, data: { x: 'second' },
        });
        editable.put({
          revision: 'main-v4-second-rev', definitionVersion: version, pinsJson: '{}',
          responseJson: secondResp,
          snapshotJson: JSON.stringify({ definitionUrl: url, definitionVersion: version, data: { x: 'second' } }),
        }, secondStorageKey);
        summaries.put({ definitionVersion: version, plans: null }, secondStorageKey);
        seeds.put({ seeded: true }, secondStorageKey);
      }
    };
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => reject(req.error);
  });

  if (mode === 'edition-return' || mode === 'edition-return-filing') {
    const siblingEdition = browser.createBrowserFilingStore({ scope: 'neighbor', databaseName, definitions });
    const sibCheck = await siblingEdition.drafts.load({ scope: 'neighbor', definitionUrl: otherUrl }, version);
    if (sibCheck.status !== 'absent') throw new Error(`Expected neighbor absent, got ${sibCheck.status}`);
  }

  const fixtures = mode === 'no-marker-fixture' || mode === 'edition-return'
    ? { drafts: [{ definitionUrl: url, responseId: 'urn:synthetic:first', data: { x: 'saved' }, subject: firstInput }] }
    : mode === 'edition-return-filing'
      ? { filings: [{ responseJson: firstFilingJson }] }
      : undefined;

  const store = browser.createBrowserFilingStore({ scope, databaseName, definitions, ...(fixtures ? { fixtures } : {}) });
  const sibling = await store.drafts.load({ scope, definitionUrl: otherUrl }, version);
  const load = await store.drafts.load(firstKey, version);
  const facts = await store.drafts.readSummaries([
    { key: 'exact', definitionUrl: url, definitionVersion: version, subject: firstInput, sections: [] },
    {
      key: 'range', definitionUrl: url, definitionVersion: version, sections: [],
      subjectMatch: { type: url, predicates: [{ key: 'year', op: 'eq', value: 2025 }] },
    },
  ], { previewScope: scope, signal: new AbortController().signal });
  const dbMeta = await new Promise<{ version: number; editable?: Record<string, unknown>; summary?: Record<string, unknown>; seed?: unknown }>((resolve, reject) => {
    const req = indexedDB.open(databaseName);
    req.onsuccess = async () => {
      const db = req.result;
      try {
        const readKey = mode === 'bad-address' ? [scope, url, 'subject', ''] : firstStorageKey;
        const tx = db.transaction(['editable', 'summaries', 'seeds']);
        const getOne = (name: string) => new Promise<unknown>((res, rej) => {
          const r = tx.objectStore(name).get(readKey);
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        const [ed, sum, sd] = await Promise.all([getOne('editable'), getOne('summaries'), getOne('seeds')]);
        resolve({ version: db.version, editable: ed as Record<string, unknown>, summary: sum as Record<string, unknown>, seed: sd });
      } finally {
        db.close();
      }
    };
    req.onerror = () => reject(req.error);
  });
  return {
    originalRevision: firstRevision,
    dbVersion: dbMeta.version,
    editable: dbMeta.editable,
    summary: dbMeta.summary,
    seed: dbMeta.seed,
    sibling: sibling.status,
    load: load.status,
    exact: facts.get('exact'),
    range: facts.get('range'),
  };
}

export async function coldDirectBrowserRead() {
  const scope = 'edition-cold-browser';
  const definitionUrl = 'urn:test:cold-plan';
  const databaseName = 'formspec-cold-direct-browser';
  const period = { start_year: 2024, end_year: 2026 };
  const subjectId = 'a39ce4358f5efbd713b748be196fb4978d0763a8f638a5df846c2d5295c15876';
  const sentinel = 'cold-browser-secret';
  const definition: FormDefinition = {
    $formspec: '1.0', url: definitionUrl, version, title: 'Cold Plan',
    items: [{ key: 'answer', type: 'field', dataType: 'string' }],
    subject: { type: definitionUrl, keys: { start_year: { dataType: 'integer' }, end_year: { dataType: 'integer' } } },
  };
  const responseJson = JSON.stringify({
    $formspecResponse: '1.0', definitionUrl, definitionVersion: version, status: 'completed',
    id: 'urn:cold:browser-direct', authored: '2026-01-01T00:00:00Z',
    subject: { id: subjectId, type: definitionUrl, keys: period },
    data: { answer: sentinel },
  }, null, 2) + '\n';
  await new Promise<void>((resolve, reject) => {
    const del = indexedDB.deleteDatabase(databaseName);
    del.onsuccess = () => resolve();
    del.onerror = () => reject(del.error);
  });
  const getAllStores: string[] = [];
  const origGetAll = IDBObjectStore.prototype.getAll;
  IDBObjectStore.prototype.getAll = function (...args) {
    if (this.transaction.db.name === databaseName) {
      getAllStores.push(this.name);
    }
    return origGetAll.apply(this, args);
  };
  let phase: 'construct' | 'read' = 'construct';
  let rawJsonParseDuringRead = 0;
  const origJsonParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    if (phase === 'read' && typeof text === 'string' && text.includes(sentinel)) {
      rawJsonParseDuringRead += 1;
    }
    return origJsonParse.call(this, text, reviver);
  };
  try {
    const store = browser.createBrowserFilingStore({
      scope, databaseName, definitions: new Map([[definitionUrl, definition]]),
      fixtures: { filings: [{ responseJson }] },
    });
    phase = 'read';
    const observations = await store.drafts.readSummaries([{
      key: 'range', definitionUrl, definitionVersion: version, sections: [],
      subjectMatch: {
        type: definitionUrl,
        predicates: [
          { key: 'start_year', op: 'le', value: 2025 },
          { key: 'end_year', op: 'ge', value: 2025 },
        ],
      },
    }], { previewScope: scope, signal: new AbortController().signal });
    return { observation: observations.get('range'), getAllStores, rawJsonParseDuringRead };
  } finally {
    IDBObjectStore.prototype.getAll = origGetAll;
    JSON.parse = origJsonParse;
  }
}

export type QuarantineHistoryMode =
  | 'integer-untouched'
  | 'integer-restarted'
  | 'integer-restarted-historical'
  | 'owned-fixture-marker'
  | 'restart'
  | 'restart-save'
  | 'bridge-ready';

export async function upgradeMainV4QuarantineScope(mode: QuarantineHistoryMode) {
  const scope = 'review9';
  const databaseName = `formspec-r9-quarantine-${mode}-${crypto.randomUUID()}`;
  const planUrl = 'urn:r9:plan';
  const siblingUrl = 'urn:r9:sibling';
  const subjectType = 'urn:r9:period';
  const planDef: FormDefinition = {
    $formspec: '1.0', url: planUrl, version: '2.0.0', versionAlgorithm: 'semver', title: 'Plan',
    items: [{ key: 'x', type: 'field', dataType: 'string' }],
    subject: { type: subjectType, keys: { year: { dataType: 'integer' }, unit: { dataType: 'string', minted: true } } },
  };
  const siblingDef: FormDefinition = {
    $formspec: '1.0', url: siblingUrl, version: '1.0.0', versionAlgorithm: 'semver', title: 'Sibling',
    items: [{ key: 'x', type: 'field', dataType: 'string' }],
  };
  const definitions = new Map([[planUrl, planDef], [siblingUrl, siblingDef]]);
  const tools = await browser.previewResponseRecordTools();
  const unit1Keys = { year: 2025, unit: 'unit-one' };
  const unit1 = { type: subjectType, keys: unit1Keys, id: tools.subjectId(subjectType, unit1Keys) };
  const unit1Key: DraftKey = { scope, definitionUrl: planUrl, subject: unit1 };
  const unit1RowKey = [scope, planUrl, 'subject', unit1.id];
  const unit2Keys = { year: 2026, unit: 'unit-healthy' };
  const unit2 = { type: subjectType, keys: unit2Keys, id: tools.subjectId(subjectType, unit2Keys) };
  const unit2RowKey = [scope, planUrl, 'subject', unit2.id];
  const siblingRowKey = [scope, siblingUrl, 'respondent', ''];
  const siblingKey: DraftKey = { scope, definitionUrl: siblingUrl };

  const startPin = mode.startsWith('integer') ? '009' : '1.0.0';
  const editablePin = mode === 'integer-untouched' ? '009' : mode === 'integer-restarted-historical' ? '010' : '2.0.0';
  const originalRev = 'r9-unit1-rev';
  const hasSeedMarker = mode !== 'integer-untouched' && mode !== 'bridge-ready';
  const hasResponse = mode === 'restart-save';
  const unit1ResponseJson = JSON.stringify({
    $formspecResponse: '1.0', id: 'urn:r9:own', definitionUrl: planUrl, definitionVersion: editablePin,
    authored: '2026-01-01T00:00:00Z', status: 'in-progress', subject: unit1, data: { x: 'own' },
  });
  const unit2ResponseJson = JSON.stringify({
    $formspecResponse: '1.0', id: 'urn:r9:healthy', definitionUrl: planUrl, definitionVersion: '2.0.0',
    authored: '2026-01-01T00:00:00Z', status: 'in-progress', subject: unit2, data: { x: 'healthy' },
  });
  const siblingResponseJson = JSON.stringify({
    $formspecResponse: '1.0', id: 'urn:r9:sib', definitionUrl: siblingUrl, definitionVersion: '1.0.0',
    authored: '2026-01-01T00:00:00Z', status: 'in-progress', data: { x: 'kept' },
  });
  const priorFilingJson = JSON.stringify({
    $formspecResponse: '1.0', id: 'urn:r9:prior-receipt', definitionUrl: planUrl, definitionVersion: '2.0.0',
    authored: '2026-01-01T00:00:00Z', status: 'completed', subject: unit1, data: { x: 'filed' },
  });

  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(databaseName, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      const editable = db.createObjectStore('editable');
      const summaries = db.createObjectStore('summaries');
      db.createObjectStore('filings');
      const starts = db.createObjectStore('starts');
      const seeds = db.createObjectStore('seeds');
      starts.put({
        request: canonicalFiniteJson({ definitionUrl: planUrl, version: startPin, type: subjectType, keys: { year: 2025 } }),
        subject: unit1,
      }, [scope, 'first']);
      if (hasResponse) {
        editable.put({
          revision: originalRev, definitionVersion: editablePin, pinsJson: '{}',
          responseJson: unit1ResponseJson,
          snapshotJson: JSON.stringify({ definitionUrl: planUrl, definitionVersion: editablePin, data: { x: 'own' } }),
        }, unit1RowKey);
      } else {
        editable.put({ revision: originalRev, definitionVersion: editablePin, pinsJson: '{}' }, unit1RowKey);
      }
      summaries.put({ definitionVersion: editablePin, plans: null }, unit1RowKey);
      if (hasSeedMarker) seeds.put({ seeded: true }, unit1RowKey);

      // Healthy second unit on the SAME Definition.
      starts.put({
        request: canonicalFiniteJson({ definitionUrl: planUrl, version: '2.0.0', type: subjectType, keys: { year: 2026 } }),
        subject: unit2,
      }, [scope, 'second']);
      editable.put({
        revision: 'r9-unit2-rev', definitionVersion: '2.0.0', pinsJson: '{}',
        responseJson: unit2ResponseJson,
        snapshotJson: JSON.stringify({ definitionUrl: planUrl, definitionVersion: '2.0.0', data: { x: 'healthy' } }),
      }, unit2RowKey);
      summaries.put({ definitionVersion: '2.0.0', plans: null }, unit2RowKey);
      seeds.put({ seeded: true }, unit2RowKey);

      // Saved sibling on an unrelated Definition.
      editable.put({
        revision: 'r9-sib-rev', definitionVersion: '1.0.0', pinsJson: '{}',
        responseJson: siblingResponseJson,
        snapshotJson: JSON.stringify({ definitionUrl: siblingUrl, definitionVersion: '1.0.0', data: { x: 'kept' } }),
      }, siblingRowKey);
      summaries.put({ definitionVersion: '1.0.0', plans: null }, siblingRowKey);
      seeds.put({ seeded: true }, siblingRowKey);
    };
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => reject(req.error);
  });

  const store = browser.createBrowserFilingStore({
    scope,
    databaseName,
    definitions,
    fixtures: { filings: [{ responseJson: priorFilingJson }] },
  });
  const sibling = await store.drafts.load(siblingKey, '1.0.0');
  const load = await store.drafts.load(unit1Key, '2.0.0');
  const retry = await store.drafts.start({
    scope, definitionUrl: planUrl, definitionVersion: '2.0.0', attemptId: 'first',
    subject: { type: subjectType, keys: { year: 2025 } },
  });
  const facts = await store.drafts.readSummaries([
    { key: 'exact', definitionUrl: planUrl, definitionVersion: '2.0.0', subject: { type: subjectType, keys: unit1Keys }, sections: [] },
    {
      key: 'badRange', definitionUrl: planUrl, definitionVersion: '2.0.0', sections: [],
      subjectMatch: { type: subjectType, predicates: [{ key: 'year', op: 'eq', value: 2025 }] },
    },
    {
      key: 'goodRange', definitionUrl: planUrl, definitionVersion: '2.0.0', sections: [],
      subjectMatch: { type: subjectType, predicates: [{ key: 'year', op: 'eq', value: 2026 }] },
    },
  ], { previewScope: scope, signal: new AbortController().signal });
  const selectReq = (key: string, consumerSubject: Record<string, string | number>, status: 'current' | 'completed') => ({
    key, kind: 'definition' as const, scope, consumerSubject, projection: ['x'],
    selection: {
      definition: { url: planUrl },
      subject: [{ key: 'unit', op: 'eq' as const, from: { subject: 'unit' } }],
      status, cardinality: 'latest' as const, pin: 'none' as const, whenNone: 'empty' as const,
    },
  });
  const selected = await store.responses.select([
    selectReq('healthy', unit2Keys, 'current'),
    selectReq('ownCurrent', unit1Keys, 'current'),
    selectReq('ownCompleted', unit1Keys, 'completed'),
  ]);
  const openingResponseJson = JSON.stringify({
    $formspecResponse: '1.0', id: 'urn:r9:own', definitionUrl: planUrl, definitionVersion: '2.0.0',
    authored: '2026-01-01T00:00:00Z', status: 'in-progress', subject: unit1, data: { x: 'own' },
  });
  const saveAttempt = load.status === 'unavailable'
    ? (await store.drafts.save({
        key: unit1Key, expectedRevision: originalRev, definitionVersion: '2.0.0',
        responseJson: openingResponseJson,
        snapshotJson: JSON.stringify({ definitionUrl: planUrl, definitionVersion: '2.0.0', data: { x: 'own' } }),
        summary: null,
      })).status
    : undefined;
  const restartAttempt = load.status === 'unavailable'
    ? (await store.drafts.restart(unit1Key, originalRev)).status
    : undefined;
  const submitAttempt = load.status === 'unavailable'
    ? (await store.submit(
        { key: unit1Key, definitionVersion: '2.0.0', revision: originalRev, responseJson: openingResponseJson },
        priorFilingJson,
      )).status
    : undefined;
  const dbMeta = await new Promise<{ version: number; editable?: Record<string, unknown>; summary?: Record<string, unknown> }>((resolve, reject) => {
    const req = indexedDB.open(databaseName);
    req.onsuccess = async () => {
      const db = req.result;
      try {
        const tx = db.transaction(['editable', 'summaries']);
        const getOne = (name: string) => new Promise<unknown>((res, rej) => {
          const r = tx.objectStore(name).get(unit1RowKey);
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        const [ed, sum] = await Promise.all([getOne('editable'), getOne('summaries')]);
        resolve({ version: db.version, editable: ed as Record<string, unknown>, summary: sum as Record<string, unknown> });
      } finally {
        db.close();
      }
    };
    req.onerror = () => reject(req.error);
  });
  return {
    version: dbMeta.version,
    revisionRetained: dbMeta.editable?.revision === originalRev,
    flags: [dbMeta.editable?.unverifiedStartHistory, dbMeta.summary?.unverifiedStartHistory],
    siblingAnswer: sibling.status === 'loaded' ? (JSON.parse(sibling.draft.responseJson) as { data: { x: string } }).data.x : null,
    load: load.status,
    retry: retry.status,
    save: saveAttempt,
    restart: restartAttempt,
    submit: submitAttempt,
    exact: facts.get('exact'),
    range: facts.get('badRange'),
    goodRange: facts.get('goodRange')?.subjectMatch,
    healthySelection: selected.get('healthy'),
    ownCurrent: selected.get('ownCurrent')?.status,
    ownCompleted: selected.get('ownCompleted'),
  };
}

export async function upgradeMainUnresolvedTypeChange(mode: 'compatible' | 'historical-type-change') {
  const scope = 'review9-range';
  const databaseName = `formspec-r9-range-${mode}-${crypto.randomUUID()}`;
  const sourceUrl = 'urn:r9:source';
  const targetUrl = 'urn:r9:target';
  const unrelatedUrl = 'urn:r9:unrelated';
  const sharedType = 'urn:r9:period';
  const makeDef = (url: string, ver: string, subjectType: string): FormDefinition => ({
    $formspec: '1.0', url, version: ver, versionAlgorithm: 'semver', title: url,
    items: [{ key: 'x', type: 'field', dataType: 'string' }],
    subject: { type: subjectType, keys: { year: { dataType: 'integer' }, unit: { dataType: 'string', minted: true } } },
  });
  const tools = await browser.previewResponseRecordTools();
  const unit1 = { type: sharedType, keys: { year: 2025, unit: 'first' }, id: tools.subjectId(sharedType, { year: 2025, unit: 'first' }) };
  const unit2 = { type: sharedType, keys: { year: 2025, unit: 'second' }, id: tools.subjectId(sharedType, { year: 2025, unit: 'second' }) };
  const unit1RowKey = [scope, sourceUrl, 'subject', unit1.id];
  const unit2RowKey = [scope, targetUrl, 'subject', unit2.id];

  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(databaseName, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      const editable = db.createObjectStore('editable');
      const summaries = db.createObjectStore('summaries');
      db.createObjectStore('filings');
      const starts = db.createObjectStore('starts');
      const seeds = db.createObjectStore('seeds');
      // Unit 1: restarted v4 seeded draft on source@1.0.0 with no stored subject keys.
      editable.put({ revision: 'r9-unres-1', definitionVersion: '1.0.0', pinsJson: '{}' }, unit1RowKey);
      summaries.put({ definitionVersion: '1.0.0', plans: null }, unit1RowKey);
      seeds.put({ seeded: true }, unit1RowKey);
      // Unit 2: started v4 draft on target@1.0.0 sharing the same subject type and year=2025.
      starts.put({
        request: canonicalFiniteJson({ definitionUrl: targetUrl, version: '1.0.0', type: sharedType, keys: { year: 2025 } }),
        subject: unit2,
      }, [scope, 'second']);
      editable.put({ revision: 'r9-unres-2', definitionVersion: '1.0.0', pinsJson: '{}' }, unit2RowKey);
      summaries.put({ definitionVersion: '1.0.0', plans: null }, unit2RowKey);
    };
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => reject(req.error);
  });

  const openSource = mode === 'historical-type-change'
    ? makeDef(sourceUrl, '2.0.0', 'urn:r9:new-type')
    : makeDef(sourceUrl, '1.0.0', sharedType);
  const targetDef = makeDef(targetUrl, '1.0.0', sharedType);
  const unrelatedDef = makeDef(unrelatedUrl, '1.0.0', 'urn:r9:other-type');
  const store = browser.createBrowserFilingStore({
    scope,
    databaseName,
    definitions: new Map([[sourceUrl, openSource], [targetUrl, targetDef], [unrelatedUrl, unrelatedDef]]),
  });
  const facts = await store.drafts.readSummaries([
    {
      key: 'target', definitionUrl: targetUrl, definitionVersion: '1.0.0', sections: [],
      subjectMatch: { type: sharedType, predicates: [{ key: 'year', op: 'eq', value: 2025 }] },
    },
    {
      key: 'unrelated', definitionUrl: unrelatedUrl, definitionVersion: '1.0.0', sections: [],
      subjectMatch: { type: 'urn:r9:other-type', predicates: [{ key: 'year', op: 'eq', value: 2025 }] },
    },
  ], { previewScope: scope, signal: new AbortController().signal });
  const dbVersion = await new Promise<number>((resolve, reject) => {
    const req = indexedDB.open(databaseName);
    req.onsuccess = () => { const v = req.result.version; req.result.close(); resolve(v); };
    req.onerror = () => reject(req.error);
  });
  return {
    version: dbVersion,
    range: facts.get('target'),
    unrelated: facts.get('unrelated'),
  };
}

export async function upgradePlantedQuarantineFlag(
  dbVer: 2 | 3 | 4,
  targetStore: 'clean' | 'editable' | 'summaries',
  flagValue: boolean | null,
) {
  const scope = 'review9-flag';
  const databaseName = `formspec-r9-flag-${dbVer}-${targetStore}-${crypto.randomUUID()}`;
  const planUrl = 'urn:r9:flag-plan';
  const siblingUrl = 'urn:r9:flag-sibling';
  const planDef: FormDefinition = { $formspec: '1.0', url: planUrl, version: '2.0.0', title: 'Plan', items: [] };
  const siblingDef: FormDefinition = { $formspec: '1.0', url: siblingUrl, version: '1.0.0', title: 'Sibling', items: [] };
  const rowKey = [scope, planUrl, 'respondent', ''];
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(databaseName, dbVer);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of ['editable', 'summaries', ...(dbVer >= 3 ? ['filings', 'starts'] : []), ...(dbVer === 4 ? ['seeds'] : [])]) {
        db.createObjectStore(s);
      }
      const tx = req.transaction!;
      tx.objectStore('editable').put({
        revision: 'kept', definitionVersion: '2.0.0', pinsJson: '{}',
        ...(targetStore === 'editable' ? { unverifiedStartHistory: flagValue } : {}),
      }, rowKey);
      tx.objectStore('summaries').put({
        definitionVersion: '2.0.0',
        ...(dbVer === 4 ? { plans: null } : { summary: null }),
        ...(targetStore === 'summaries' ? { unverifiedStartHistory: flagValue } : {}),
      }, rowKey);
    };
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => reject(req.error);
  });
  const store = browser.createBrowserFilingStore({
    scope, databaseName, definitions: new Map([[planUrl, planDef], [siblingUrl, siblingDef]]),
  });
  const sibling = await store.drafts.load({ scope, definitionUrl: siblingUrl }, '1.0.0');
  const afterVersion = await new Promise<number>((resolve, reject) => {
    const req = indexedDB.open(databaseName);
    req.onsuccess = () => { const v = req.result.version; req.result.close(); resolve(v); };
    req.onerror = () => reject(req.error);
  });
  return { version: afterVersion, sibling: sibling.status };
}
