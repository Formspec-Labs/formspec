/** @filedesc Preview drafts, immutable filings and review fixtures over one scoped store. */
import { initFormspecEngine, initFormspecEngineTools, responseSubjectId, selectResponses } from '@formspec-org/engine';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import {
  prepareResponseFiling, prepareResponseFixtures, responseDraftKey, responsePairKey, responseSelectionRecord,
  catalogResponseDigest, catalogResponseProjection, catalogResponseSelection, resolveDataSourceDescriptor, selectFilingStatus,
  type BrowserDraftPort, type DataSourceCatalogHandle, type DraftKey, type DraftRecord, type DraftSaveInput, type DraftSectionPlacement,
  type FilingStatusObservation, type ResponseFiling, type ResponseFixtures, type ResponseRecordTools,
} from '@formspec-org/surface';
import type { DispositionAuthority, FormDefinition, FormResponse, ResponseSelection, ResponseSelectionContext, ResponseSelectionRecord, ResponseSelectionRequest, ResponseSelector } from '@formspec-org/types';
import type { SurfaceDraftFence } from './draft-writer.js';

type StoredDraft = Omit<DraftRecord, 'pins'> & {
  definitionVersion: string;
  pinsJson: string;
};
type StoredSummary = { definitionVersion: string; summary: DraftSaveInput['summary'] };
type Stores = { editable: StoredDraft; summaries: StoredSummary; filings: ResponseFiling };
type StoreName = keyof Stores;
type StoredEntry<S extends StoreName> = { id: string[]; value: Stores[S] };

interface Transaction {
  get<S extends StoreName>(store: S, key: string[]): Promise<Stores[S] | undefined>;
  list<S extends StoreName>(store: S, scope: string): Promise<StoredEntry<S>[]>;
  put<S extends Exclude<StoreName, 'filings'>>(store: S, key: string[], value: Stores[S]): void;
  addFiling(key: string[], value: ResponseFiling): void;
  delete(store: Exclude<StoreName, 'filings'>, key: string[]): void;
}
type RunTransaction = <T>(stores: StoreName[], mode: IDBTransactionMode, work: (tx: Transaction) => Promise<T>) => Promise<T>;

export interface PreviewFilingStoreOptions {
  scope: string;
  definitions: ReadonlyMap<string, FormDefinition>;
  fixtures?: ResponseFixtures;
  catalogs?: readonly DataSourceCatalogHandle[] | undefined;
  /**
   * A selection check authorizes the requested subject space before lookup,
   * including when it contains no records. Other checks use the filing key.
   */
  authorize?: (key: DraftKey, relation: 'read' | 'resume' | 'send', selection?: ResponseSelectionRequest) => boolean | Promise<boolean>;
}
export interface BrowserFilingStoreOptions extends PreviewFilingStoreOptions {
  databaseName?: string;
}
export type PreviewFilingSubmitResult =
  | { status: 'filed'; receiptRef: string; label: 'preview filing; nothing was sent' }
  | { status: 'denied' | 'unavailable' | 'conflict' | 'invalid-response' | 'duplicate-response' };

export interface PreviewFilingStore {
  drafts: BrowserDraftPort;
  responses: ResponseSelector & DispositionAuthority;
  submit(fence: Readonly<SurfaceDraftFence>, responseJson: string): Promise<PreviewFilingSubmitResult>;
}

export async function previewResponseRecordTools(): Promise<ResponseRecordTools> {
  await initFormspecEngine();
  await initFormspecEngineTools();
  return {
    parseResponse: text => parseJsonExact(text) as FormResponse,
    subjectId: responseSubjectId,
    selectResponses,
  };
}

function storageKey(key: DraftKey): string[] {
  return [key.scope, key.definitionUrl, key.subject ? 'subject' : 'respondent', key.subject?.id ?? ''];
}

function sameKey(left: DraftKey, right: DraftKey): boolean {
  return left.scope === right.scope && left.definitionUrl === right.definitionUrl && left.subject?.id === right.subject?.id;
}

function groupBy<T>(values: readonly T[], keyOf: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    const group = groups.get(key);
    if (group) group.push(value);
    else groups.set(key, [value]);
  }
  return groups;
}

type SelectionCandidate = {
  key: DraftKey;
  input: ResponseSelectionRecord;
  responseId: string;
  responseHash?: string;
};

function draftCandidates(
  entries: readonly StoredEntry<'editable'>[], scope: string, definition: FormDefinition, tools: ResponseRecordTools,
): SelectionCandidate[] | undefined {
  try {
    return entries.map(({ id, value }) => {
      const response = tools.parseResponse(value.responseJson);
      const key = responseDraftKey(scope, response, definition, tools);
      if (response.definitionUrl !== definition.url || JSON.stringify(id) !== JSON.stringify(storageKey(key))) {
        throw new Error('Stored draft does not match its filing unit.');
      }
      return { key, input: responseSelectionRecord(key, value.responseJson), responseId: response.id ?? '' };
    });
  } catch {
    return undefined;
  }
}

function sectionPlan(sections: readonly DraftSectionPlacement[]): string {
  return JSON.stringify(sections.map(({ id, fields }) => [id ?? null, fields]));
}

function unavailableStatus(): FilingStatusObservation {
  return { draft: { status: 'unavailable' }, filing: { status: 'unavailable' } };
}

function createFilingStore(
  options: PreviewFilingStoreOptions, transaction: RunTransaction,
  subscribe: BrowserDraftPort['subscribe'], committed: () => void,
): PreviewFilingStore {
  const { scope, definitions, catalogs = [] } = options;
  let initialized: ReturnType<typeof initialize> | undefined;
  async function initialize() {
    const tools = await previewResponseRecordTools();
    const fixtures = prepareResponseFixtures(scope, definitions, options.fixtures ?? {}, tools);
    return { ...fixtures, tools };
  }
  const ready = () => initialized ??= initialize();
  const authorized = async (
    key: DraftKey, relation: 'read' | 'resume' | 'send', selection?: ResponseSelectionRequest,
  ) => key.scope === scope && (options.authorize === undefined || await options.authorize(key, relation, selection));

  const responses: PreviewFilingStore['responses'] = {
    async read(pairs, signal) {
      signal?.throwIfAborted();
      try {
        const { filings, decisions } = await ready();
        const stored = await transaction(['filings'], 'readonly', tx =>
          Promise.all(pairs.map(pair => tx.get('filings', [scope, pair.responseId]))));
        const fixtures = new Map(filings.map(filing => [responsePairKey(filing), filing]));
        const entries = await Promise.all(pairs.map(async (pair, index) => {
          const key = responsePairKey(pair);
          const candidate = stored[index];
          const filing = candidate?.responseHash === pair.responseHash ? candidate : fixtures.get(key);
          const refused = filing ? !await authorized(filing.key, 'read') : options.authorize !== undefined;
          const decision = refused ? { status: 'unavailable' as const }
            : decisions.get(key) ?? { status: 'none' as const };
          return [key, structuredClone(decision)] as const;
        }));
        signal?.throwIfAborted();
        return new Map(entries);
      } catch {
        signal?.throwIfAborted();
        return new Map(pairs.map(pair => [responsePairKey(pair), { status: 'unavailable' }]));
      }
    },

    async select(requests, signal) {
      const unavailable = { status: 'unavailable' } as const;
      signal?.throwIfAborted();
      try {
        const { tools, filings, decisions } = await ready();
        const digests = new Map<DataSourceCatalogHandle['document'], Promise<string>>();
        const admitted = await Promise.all(requests.map(async request => {
          try {
            if (request.kind === 'definition' && request.scope !== scope) return;
            let selection: ResponseSelection | undefined;
            let projection: readonly string[] | undefined;
            if (request.kind === 'catalog') {
              const descriptor = resolveDataSourceDescriptor(catalogs, request);
              if (!descriptor) return;
              let digest = digests.get(descriptor.catalog);
              if (!digest) {
                digest = catalogResponseDigest(descriptor.catalog);
                digests.set(descriptor.catalog, digest);
              }
              if (await digest !== request.catalogDigest) return;
              selection = catalogResponseSelection(descriptor.source);
              if (selection) projection = catalogResponseProjection(descriptor.source.schema, selection.cardinality);
            } else {
              selection = request.selection;
              projection = request.projection;
            }
            if (!selection || selection.mapping) return; // Mapping evidence requires fs-fea7.
            const definition = definitions.get(selection.definition.url);
            if (!definition || !await authorized({ scope, definitionUrl: definition.url }, 'read', request)) return;
            const context: ResponseSelectionContext = {
              scope, authorized: true, source: request.kind, upstreamSubject: definition.subject ?? null,
              ...(request.consumerSubject && { consumerSubject: request.consumerSubject }),
              ...(request.kind === 'catalog' && request.routeParams && { routeParams: request.routeParams }),
              ...(projection && { projection }), ...(request.pin && { pin: request.pin }),
              ...(request.kind === 'definition' && request.fallback !== undefined && { fallback: request.fallback }),
            };
            return { request, definition, selection, context };
          } catch {
            return;
          }
        }));
        signal?.throwIfAborted();
        const currentDefinitions = new Map(admitted.flatMap(entry =>
          entry?.selection.status === 'current' ? [[entry.definition.url, entry.definition] as const] : []));
        const readDrafts = currentDefinitions.size > 0;
        const stored = admitted.some(Boolean)
          ? await transaction(readDrafts ? ['editable', 'filings'] : ['filings'], 'readonly', async tx => {
            const [filed, drafts] = await Promise.all([
              tx.list('filings', scope), readDrafts ? tx.list('editable', scope) : Promise.resolve([]),
            ]);
            return { filed, drafts };
          })
          : { filed: [], drafts: [] };
        const filingGroups = groupBy([...stored.filed.map(({ value }) => value), ...filings],
          record => record.key.definitionUrl);
        const filedByDefinition = new Map([...filingGroups].map(([url, records]) => {
          const dispositions: NonNullable<ResponseSelectionContext['dispositions']>[number][] = [];
          const unresolved: ResponseSelectionRecord[] = [];
          const completed = records.map(({ key, responseJson, responseId, responseHash }) => {
            const input = responseSelectionRecord(key, responseJson);
            const decision = decisions.get(responsePairKey({ responseId, responseHash }));
            if (decision?.status === 'decided') dispositions.push({ responseId, responseHash, value: decision.disposition });
            if (decision?.status === 'unavailable') unresolved.push(input);
            return { key, responseId, responseHash, input };
          });
          return [url, { completed, dispositions, unresolved }] as const;
        }));
        const draftGroups = groupBy(stored.drafts, ({ id }) => id[1]!);
        const draftsByDefinition = new Map([...currentDefinitions].map(([url, definition]) =>
          [url, draftCandidates(draftGroups.get(url) ?? [], scope, definition, tools)]));
        const authorizedRecords = new Map<string, Promise<boolean>>();
        const canRead = (record: DraftKey) => {
          const key = JSON.stringify(storageKey(record));
          let allowed = authorizedRecords.get(key);
          if (allowed === undefined) {
            allowed = authorized(record, 'read');
            authorizedRecords.set(key, allowed);
          }
          return allowed;
        };
        const results = await Promise.all(admitted.map(async (entry, index) => {
          const key = requests[index]!.key;
          if (!entry) return [key, unavailable] as const;
          const { definition, selection, context } = entry;
          const filed = filedByDefinition.get(definition.url);
          const current = selection.status === 'current' ? draftsByDefinition.get(definition.url) : [];
          if (!current) return [key, unavailable] as const;
          try {
            const candidates = [...current, ...(filed?.completed ?? [])];
            if (selection.disposition && filed?.unresolved.length) {
              const { pin: _pin, ...unpinned } = context;
              const { disposition: _disposition, ...unfiltered } = selection;
              const possible = tools.selectResponses(
                filed.unresolved, { ...unfiltered, pin: 'none', whenNone: 'empty' }, { ...unpinned, projection: [] },
              );
              if (possible.status !== 'available' || !possible.none) return [key, unavailable] as const;
            }
            const outcome = tools.selectResponses(candidates.map(candidate => candidate.input), selection, {
              ...context, ...(selection.disposition && { dispositions: filed?.dispositions ?? [] }),
            });
            if (outcome.status !== 'available') return [key, outcome] as const;
            const selected = new Set(outcome.records.map(responsePairKey));
            if (outcome.newer) selected.add(responsePairKey(outcome.newer));
            const allowed = await Promise.all(candidates.filter(candidate => selected.has(responsePairKey(candidate)))
              .map(record => canRead(record.key)));
            return [key, allowed.includes(false) ? unavailable : outcome] as const;
          } catch {
            return [key, unavailable] as const;
          }
        }));
        signal?.throwIfAborted();
        return new Map(results);
      } catch {
        signal?.throwIfAborted();
        return new Map(requests.map(request => [request.key, unavailable]));
      }
    },
  };

  const drafts: BrowserDraftPort = {
    subscribe,
    async load(key, definitionVersion, signal) {
      try {
        signal?.throwIfAborted();
        if (!await authorized(key, 'resume')) return { status: 'denied' };
        signal?.throwIfAborted();
        const stored = await transaction(['editable'], 'readonly', tx => tx.get('editable', storageKey(key)));
        signal?.throwIfAborted();
        if (!stored) return { status: 'absent' };
        if (stored.definitionVersion !== definitionVersion) {
          return { status: 'version-mismatch', storedVersion: stored.definitionVersion, revision: stored.revision };
        }
        const { revision, snapshotJson, responseJson, pinsJson } = stored;
        const pins = parseJsonExact(pinsJson) as DraftRecord['pins'];
        return { status: 'loaded', draft: { revision, snapshotJson, responseJson, pins } };
      } catch {
        signal?.throwIfAborted();
        return { status: 'unavailable' };
      }
    },

    async save({ key, expectedRevision, definitionVersion, snapshotJson, responseJson, summary }) {
      try {
        if (!await authorized(key, 'resume')) return { status: 'denied' };
        const id = storageKey(key);
        const definition = definitions.get(key.definitionUrl);
        const requests: ResponseSelectionRequest[] = expectedRevision === null
          ? Object.entries(definition?.instances ?? {}).flatMap(([instance, { response, schema, data }]) =>
            response?.pin === 'at-open' ? [{
              key: instance, scope, kind: 'definition' as const, selection: response,
              ...(key.subject && { consumerSubject: key.subject.keys }),
              ...(schema && { projection: Object.keys(schema) }), ...(data !== undefined && { fallback: data }),
            }] : [])
          : [];
        const selections = requests.length ? await responses.select(requests) : undefined;
        const pins = Object.create(null) as Record<string, DraftRecord['pins'][string]>;
        let missingPin: string | undefined;
        for (const { key: instance } of requests) {
          const outcome = selections?.get(instance);
          if (outcome?.status !== 'available' || !outcome.pinned) {
            missingPin = instance;
            break;
          }
          const { status: _status, newer: _newer, ...delivery } = outcome;
          pins[instance] = delivery;
        }
        const result = await transaction(['editable', 'summaries'], 'readwrite', async tx => {
          const previous = await tx.get('editable', id);
          if ((previous?.revision ?? null) !== expectedRevision ||
              (previous && previous.definitionVersion !== definitionVersion)) return { status: 'conflict' } as const;
          if (missingPin !== undefined) return { status: 'pin-unavailable', instance: missingPin } as const;
          const revision = crypto.randomUUID();
          const pinsJson = previous ? previous.pinsJson : JSON.stringify(pins);
          tx.put('editable', id, { revision, definitionVersion, snapshotJson, responseJson, pinsJson });
          tx.put('summaries', id, { definitionVersion, summary });
          return { status: 'saved', revision } as const;
        });
        if (result.status === 'saved') committed();
        return result;
      } catch {
        return { status: 'unavailable' };
      }
    },

    async restart(key, expectedRevision) {
      try {
        if (!await authorized(key, 'resume')) return { status: 'denied' };
        const id = storageKey(key);
        const result = await transaction(['editable', 'summaries'], 'readwrite', async tx => {
          if ((await tx.get('editable', id))?.revision !== expectedRevision) return { status: 'conflict' } as const;
          tx.delete('editable', id);
          tx.delete('summaries', id);
          return { status: 'discarded' } as const;
        });
        if (result.status === 'discarded') committed();
        return result;
      } catch {
        return { status: 'unavailable' };
      }
    },

    async readSummaries(queries, { previewScope, signal }) {
      signal.throwIfAborted();
      const result = new Map<string, FilingStatusObservation>();
      try {
        const initialized = await ready();
        const prepared = await Promise.all(queries.map(async query => {
          const subject = query.subject && { ...query.subject, id: initialized.tools.subjectId(query.subject.type, query.subject.keys) };
          const key: DraftKey = { scope: previewScope ?? scope, definitionUrl: query.definitionUrl, subject };
          const [read, resume] = await Promise.all([authorized(key, 'read'), authorized(key, 'resume')]);
          return { query, key, read, resume };
        }));
        signal.throwIfAborted();
        const visible = prepared.filter(({ read, resume }) => read || resume);
        const data = visible.length > 0 ? await transaction(
          ['summaries', 'filings'], 'readonly', async tx => {
            const [summaries, filings] = await Promise.all([
              Promise.all(visible.map(({ key, resume }) => resume ? tx.get('summaries', storageKey(key)) : undefined)),
              visible.some(({ read }) => read) ? tx.list('filings', scope) : [],
            ]);
            return { summaries, filings: [...filings.map(({ value }) => value), ...initialized.filings] };
          }) : { summaries: [], filings: [] };
        const filingsByKey = groupBy(data.filings, record => JSON.stringify(storageKey(record.key)));
        visible.forEach(({ query, key, read, resume }, index) => {
          const stored = data.summaries[index];
          const observation = unavailableStatus();
          if (resume) {
            observation.draft = stored
              ? stored.definitionVersion !== query.definitionVersion ||
                (stored.summary && sectionPlan(stored.summary.sections) !== sectionPlan(query.sections))
                ? { status: 'stale' }
                : stored.summary?.progress ?? { status: 'unavailable' }
              : { status: 'absent' };
          }
          const definition = definitions.get(key.definitionUrl);
          if (read && definition) {
            observation.filing = selectFilingStatus(key, definition,
              filingsByKey.get(JSON.stringify(storageKey(key))) ?? [], initialized.decisions, initialized.tools);
          }
          result.set(query.key, observation);
        });
      } catch {
        result.clear();
      }
      signal.throwIfAborted();
      return new Map(queries.map(query => [query.key, result.get(query.key) ?? unavailableStatus()]));
    },
  };

  return {
    drafts, responses,
    async submit(fence, responseJson) {
      const { key, definitionVersion } = fence;
      try {
        if (!await authorized(key, 'send')) return { status: 'denied' };
        const { tools, filings } = await ready();
        let filing: ResponseFiling;
        try {
          filing = prepareResponseFiling(scope, definitions, responseJson, 'preview-submit', tools);
          if (!sameKey(filing.key, key) || filing.definitionVersion !== definitionVersion) return { status: 'invalid-response' };
        } catch {
          return { status: 'invalid-response' };
        }
        const id = storageKey(key);
        const filingId = [scope, filing.responseId];
        const result = await transaction<PreviewFilingSubmitResult>(['editable', 'summaries', 'filings'], 'readwrite', async tx => {
          const previous = await tx.get('editable', id);
          if (!previous || previous.revision !== fence.revision || previous.definitionVersion !== definitionVersion ||
              previous.responseJson !== fence.responseJson) return { status: 'conflict' };
          const draft = tools.parseResponse(previous.responseJson);
          const definition = definitions.get(key.definitionUrl)!;
          if (draft.id !== filing.responseId || draft.definitionUrl !== definition.url ||
              !sameKey(responseDraftKey(scope, draft, definition, tools), key)) return { status: 'invalid-response' };
          if (filings.some(record => record.responseId === filing.responseId) || await tx.get('filings', filingId)) {
            return { status: 'duplicate-response' };
          }
          tx.addFiling(filingId, filing);
          tx.delete('editable', id);
          tx.delete('summaries', id);
          return { status: 'filed', receiptRef: filing.responseId, label: 'preview filing; nothing was sent' };
        });
        if (result.status === 'filed') committed();
        return result;
      } catch {
        return { status: 'unavailable' };
      }
    },
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createBrowserFilingStore(options: BrowserFilingStoreOptions): PreviewFilingStore {
  const databaseName = options.databaseName ?? 'formspec-surface-drafts';
  const commits = new EventTarget();
  const channelName = `formspec-drafts:${databaseName}:${options.scope}`;
  let channel: BroadcastChannel | undefined;
  let subscribers = 0;

  function openChannel() {
    try {
      return typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(channelName);
    } catch {
      return undefined;
    }
  }

  const notify = () => { commits.dispatchEvent(new Event('commit')); };
  const subscribe: BrowserDraftPort['subscribe'] = listener => {
    const deliver = () => listener();
    commits.addEventListener('commit', deliver);
    if (subscribers++ === 0) {
      channel = openChannel();
      channel?.addEventListener('message', notify);
    }
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      commits.removeEventListener('commit', deliver);
      if (--subscribers === 0) {
        channel?.close();
        channel = undefined;
      }
    };
  };

  function committed() {
    notify();
    const sender = channel ?? openChannel();
    try {
      sender?.postMessage('commit');
    } catch {
      // The save already committed. Overview entry still reloads counts.
    } finally {
      if (sender !== channel) sender?.close();
    }
  }

  const transaction: RunTransaction = async (stores, mode, work) => {
    const request = indexedDB.open(databaseName, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ['editable', 'summaries', 'filings']) {
        if (db.objectStoreNames.contains(store)) db.deleteObjectStore(store);
        db.createObjectStore(store);
      }
    };
    const db = await requestResult(request);
    try {
      const tx = db.transaction(stores, mode);
      const finished = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('Preview filing transaction aborted'));
      });
      const transaction: Transaction = {
        get: (store, key) => requestResult(tx.objectStore(store).get(key)),
        async list(store, scope) {
          const objectStore = tx.objectStore(store);
          const range = IDBKeyRange.bound([scope], [scope, []]);
          const [keys, values] = await Promise.all([
            requestResult(objectStore.getAllKeys(range)), requestResult(objectStore.getAll(range)),
          ]);
          return values.map((value, index) => ({ id: keys[index] as string[], value }));
        },
        put: (store, key, value) => { tx.objectStore(store).put(value, key); },
        addFiling: (key, value) => { tx.objectStore('filings').add(value, key); },
        delete: (store, key) => { tx.objectStore(store).delete(key); },
      };
      const result = work(transaction).catch(error => {
        try { tx.abort(); } catch { /* The transaction already ended. */ }
        throw error;
      });
      const [value] = await Promise.all([result, finished]);
      return value;
    } finally {
      db.close();
    }
  };

  return createFilingStore(options, transaction, subscribe, committed);
}

export function createMemoryFilingStore(options: PreviewFilingStoreOptions): PreviewFilingStore {
  type Entries = { [S in StoreName]: StoredEntry<S>[] };
  let entries: Entries = { editable: [], summaries: [], filings: [] };
  let pending: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  const transaction: RunTransaction = (_stores, mode, work) => {
    const result = pending.then(async () => {
      const data = mode === 'readwrite' ? structuredClone(entries) : entries;
      const matches = (left: string[], right: string[]) =>
        left.length === right.length && left.every((part, index) => part === right[index]);
      const transaction: Transaction = {
        get: async (store, key) => structuredClone(data[store].find(entry => matches(entry.id, key))?.value),
        list: async (store, scope) => structuredClone(data[store].filter(entry => entry.id[0] === scope)),
        put: (store, id, value) => {
          const rows = data[store];
          const position = rows.findIndex(entry => matches(entry.id, id));
          const entry = structuredClone({ id, value });
          if (position === -1) rows.push(entry);
          else rows[position] = entry;
        },
        addFiling: (id, value) => {
          if (data.filings.some(entry => matches(entry.id, id))) throw new Error('The Response already exists.');
          data.filings.push(structuredClone({ id, value }));
        },
        delete: (store, key) => {
          const rows = data[store];
          const position = rows.findIndex(entry => matches(entry.id, key));
          if (position !== -1) rows.splice(position, 1);
        },
      };
      const value = await work(transaction);
      if (mode === 'readwrite') entries = data;
      return value;
    });
    pending = result.catch(() => undefined);
    return result;
  };
  return createFilingStore(options, transaction, listener => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => { for (const listener of listeners) listener(); });
}
