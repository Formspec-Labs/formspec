/** @filedesc Browser bridge for the shared draft storage suite. */
import { initFormspecEngine, initFormspecEngineTools, responseSubjectId } from '@formspec-org/engine';
import * as browser from '../../../packages/formspec-surface-react/src/index';
import type { FormDefinition, ResponseSelection, ResponseSelectionDelivery } from '@formspec-org/types';
import { draftPortConformance } from '../../../packages/formspec-surface/src/draft-port-conformance';
import type { DraftKey } from '../../../packages/formspec-surface/src/draft-port';

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
