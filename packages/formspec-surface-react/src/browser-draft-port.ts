/** @filedesc Preview drafts, immutable filings and review fixtures over one scoped store. */
import { createFormEngine, deepEqual, initFormspecEngine, initFormspecEngineTools, isValidResponseAuthored, responseSubjectId, selectResponses, type FormDraftSnapshot } from '@formspec-org/engine';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { resolvePageSequence, summarizeFormProgress, type PageSequenceEntry } from '@formspec-org/layout';
import {
  canonicalDraftProgress, canonicalFiniteJson, prepareResponseFiling, prepareResponseFixtures, responseDraftKey, responsePairKey, responseSelectionRecord,
  catalogResponseDigest, catalogResponseProjection, catalogResponseSelection, resolveDataSourceDescriptor, selectFilingStatus,
  type BrowserDraftPort, type CurrentDraftProgress, type DraftStartInput, type DraftStartResult, type DataSourceCatalogHandle, type DraftKey, type DraftRecord, type DraftSaveInput, type DraftSectionPlacement,
  type FilingStatusObservation, type PreparedDraftFixture, type ResponseFiling, type ResponseFixtures, type ResponseRecordTools,
} from '@formspec-org/surface';
import type { DispositionAuthority, EvaluatedFormState, FormDefinition, FormResponse, ResponseSelection, ResponseSelectionContext, ResponseSelectionDelivery, ResponseSelectionRecord, ResponseSelectionRequest, ResponseSelector } from '@formspec-org/types';
import { definitionResponseRequests } from './definition-response-reads.js';
import type { SurfaceDraftFence } from './draft-writer.js';

type StoredDraft = Omit<DraftRecord, 'pins'> & {
  definitionVersion: string;
  pinsJson: string;
};
type InitializedDraft = Pick<StoredDraft, 'definitionVersion' | 'revision' | 'pinsJson'>;
type StartAttempt = { request: string; subject: NonNullable<DraftKey['subject']> };
type StoredPlanSummary = {
  planId: string;
  progress: CurrentDraftProgress;
};
type StoredSummary = {
  definitionVersion: string;
  plans: readonly StoredPlanSummary[] | null;
};
type SeedMarker = { seeded: true };
type Stores = { editable: StoredDraft | InitializedDraft; starts: StartAttempt; summaries: StoredSummary; filings: ResponseFiling; seeds: SeedMarker };
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
  /** Admitted Definition/Theme/Component section plans precomputed at fixture initialization. */
  sectionPlans?: ((definition: FormDefinition) => readonly (readonly PageSequenceEntry[])[]) | undefined;
  /**
   * A selection check authorizes the requested subject space before lookup,
   * including when it contains no records. Other checks use the filing key.
   */
  /** Delegate the existing open check to the host with the supplied parents. */
  authorizeOpen?: (input: Readonly<DraftStartInput>) => boolean | Promise<boolean>;
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
  ready(): Promise<void>;
}

export async function previewResponseRecordTools(): Promise<ResponseRecordTools> {
  await initFormspecEngine();
  await initFormspecEngineTools();
  return {
    parseResponse: text => parseJsonExact(text) as FormResponse,
    subjectId: responseSubjectId,
    selectResponses,
    isValidAuthored: isValidResponseAuthored,
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
    return entries.flatMap(({ id, value }) => {
      if (!('responseJson' in value)) return [];
      const response = tools.parseResponse(value.responseJson);
      const key = responseDraftKey(scope, response, definition, tools);
      if (response.definitionUrl !== definition.url || JSON.stringify(id) !== JSON.stringify(storageKey(key))) {
        throw new Error('Stored draft does not match its filing unit.');
      }
      return { key, input: responseSelectionRecord(key, value.responseJson, 'open-draft'), responseId: response.id ?? '' };
    });
  } catch {
    return undefined;
  }
}

function sectionPlan(sections: readonly DraftSectionPlacement[]): string {
  return JSON.stringify(sections.map(({ id, fields }) => [id ?? null, fields]));
}

async function sectionPlanId(sections: readonly DraftSectionPlacement[]): Promise<string> {
  const bytes = new TextEncoder().encode(sectionPlan(sections));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'sha256:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function unavailableStatus(): FilingStatusObservation {
  return { draft: { status: 'unavailable' }, filing: { status: 'unavailable' } };
}

function progressForSections(
  sections: readonly Pick<PageSequenceEntry, 'id' | 'fields' | 'groups'>[],
  evaluated: EvaluatedFormState,
): CurrentDraftProgress | undefined {
  const summarized = summarizeFormProgress(sections as readonly PageSequenceEntry[], evaluated);
  return canonicalDraftProgress({
    status: 'current',
    form: summarized.form,
    sections: Object.fromEntries(summarized.sections.flatMap(({ id, counts }) => id === undefined ? [] : [[id, counts]])),
  });
}

async function buildSectionSummaries(
  definition: FormDefinition,
  evaluated: EvaluatedFormState,
  sectionPlans?: (definition: FormDefinition) => readonly (readonly PageSequenceEntry[])[],
): Promise<StoredPlanSummary[]> {
  const candidates = sectionPlans ? [...sectionPlans(definition)] : [];
  if (candidates.length === 0) candidates.push(resolvePageSequence(definition));
  const seen = new Set<string>();
  const out: StoredPlanSummary[] = [];
  for (const sequence of candidates) {
    const placements = sequence.map(({ id: sectionId, fields }) => ({
      ...(sectionId === undefined ? {} : { id: sectionId }),
      fields,
    }));
    const rawKey = sectionPlan(placements);
    if (seen.has(rawKey)) continue;
    seen.add(rawKey);
    const progress = progressForSections(sequence, evaluated);
    if (progress) out.push({ planId: await sectionPlanId(placements), progress });
  }
  return out;
}

function createFilingStore(
  options: PreviewFilingStoreOptions, transaction: RunTransaction,
  subscribe: BrowserDraftPort['subscribe'], committed: () => void,
  storageAvailable: () => boolean = () => true,
): PreviewFilingStore {
  const { scope, definitions, catalogs = [] } = options;
  const hasSeededDrafts = Boolean(options.fixtures?.drafts?.length);
  let fixturesPromise: ReturnType<typeof loadFixtures> | undefined;
  let seedPromise: Promise<Awaited<ReturnType<typeof loadFixtures>>> | undefined;
  let seedRejected = false;
  let readyObservedFailure = false;
  async function loadFixtures() {
    const tools = await previewResponseRecordTools();
    const fixtures = prepareResponseFixtures(scope, definitions, options.fixtures ?? {}, tools);
    return { ...fixtures, tools };
  }
  const fixturesReady = () => fixturesPromise ??= loadFixtures().catch(error => {
    fixturesPromise = undefined;
    throw error;
  });
  type FixtureBase = Awaited<ReturnType<typeof loadFixtures>>;
  type StagedSeed = { fixture: PreparedDraftFixture; id: string[]; editable: StoredDraft; summary: StoredSummary };
  type SeedState = { fingerprint: string; seeded: Set<string>; owned: Set<string> };
  const rowKey = (id: readonly string[]) => JSON.stringify(id);

  // Everything a seeding decision or a staged opening pin can depend on in this scope.
  async function observeSeedState(tx: Transaction, fixtures: readonly PreparedDraftFixture[]): Promise<SeedState> {
    const [editable, filings, seeds] = await Promise.all([
      tx.list('editable', scope), tx.list('filings', scope), tx.list('seeds', scope),
    ]);
    const fingerprint = JSON.stringify([
      editable.map(({ id, value }) => [rowKey(id), value.revision]).sort(),
      filings.map(({ id }) => rowKey(id)).sort(),
      seeds.map(({ id }) => rowKey(id)).sort(),
    ]);
    const editableIds = new Set(editable.map(({ id }) => rowKey(id)));
    const seeded = new Set(seeds.map(({ id }) => rowKey(id)));
    const owned = new Set<string>();
    for (const fixture of fixtures) {
      const id = rowKey(storageKey(fixture.key));
      if (editableIds.has(id) || filings.some(({ value }) =>
        sameKey(value.key, fixture.key) || value.responseId === fixture.responseId)) owned.add(id);
    }
    return { fingerprint, seeded, owned };
  }

  // Order candidates by the winners of their `current` selections over the same records used at
  // opening (stored drafts, stored and fixture filings, and every candidate). Only a candidate
  // winner adds an edge, so a self-pin or mutual pin is a cycle and a completed winner is not.
  async function orderCandidates(base: FixtureBase, candidates: readonly PreparedDraftFixture[]) {
    const count = candidates.length;
    const indexById = new Map(candidates.map((fixture, index) => [fixture.responseId, index]));
    const synthetic: StoredEntry<'editable'>[] = candidates.map(fixture => ({
      id: storageKey(fixture.key),
      value: {
        revision: 'candidate', definitionVersion: fixture.definitionVersion, pinsJson: '{}', snapshotJson: '{}',
        responseJson: JSON.stringify({
          $formspecResponse: '1.0', definitionUrl: fixture.key.definitionUrl, definitionVersion: fixture.definitionVersion,
          id: fixture.responseId, authored: fixture.authored, status: 'in-progress', data: fixture.data,
          ...(fixture.key.subject && { subject: fixture.key.subject }),
        }),
      },
    }));
    const requests: ResponseSelectionRequest[] = [];
    const consumers: number[] = [];
    candidates.forEach((fixture, index) => {
      const definition = definitions.get(fixture.key.definitionUrl);
      if (!definition) return;
      for (const request of definitionResponseRequests(definition, fixture.key)) {
        if (request.selection.status !== 'current') continue;
        requests.push({ ...request, key: JSON.stringify([index, request.key]),
          selection: { ...request.selection, pin: 'none', whenNone: 'empty' } });
        consumers.push(index);
      }
    });
    const outcomes = requests.length ? await selectWithFixtures(base, requests, undefined, synthetic) : new Map();
    const inDegree = new Array<number>(count).fill(0);
    const dependents = Array.from({ length: count }, () => new Set<number>());
    requests.forEach((request, position) => {
      const outcome = outcomes.get(request.key);
      if (outcome?.status !== 'available') return;
      const consumer = consumers[position]!;
      for (const { responseId } of outcome.records) {
        const upstream = indexById.get(responseId);
        if (upstream === undefined || dependents[upstream]!.has(consumer)) continue;
        dependents[upstream]!.add(consumer);
        inDegree[consumer]! += 1;
      }
    });
    const ordered: PreparedDraftFixture[] = [];
    const visited = new Array<boolean>(count).fill(false);
    while (ordered.length < count) {
      const next = inDegree.findIndex((degree, index) => !visited[index] && degree === 0);
      if (next === -1) throw new Error('Seeded drafts contain a cyclic Response instance dependency.');
      visited[next] = true;
      ordered.push(candidates[next]!);
      for (const consumer of dependents[next]!) inDegree[consumer]! -= 1;
    }
    return ordered;
  }

  // Build every candidate's rows in memory. Any refusal throws before anything is written.
  async function prepareSeeds(base: FixtureBase, candidates: readonly PreparedDraftFixture[]): Promise<StagedSeed[]> {
    const staged: StagedSeed[] = [];
    for (const fixture of await orderCandidates(base, candidates)) {
      const definition = definitions.get(fixture.key.definitionUrl);
      if (!definition) continue;
      const requests = definitionResponseRequests(definition, fixture.key);
      const resolutions: Record<string, ResponseSelectionDelivery> = {};
      const pins = Object.create(null) as Record<string, DraftRecord['pins'][string]>;
      if (requests.length > 0) {
        const outcomes = await selectWithFixtures(base, requests, undefined,
          staged.map(entry => ({ id: entry.id, value: entry.editable })));
        for (const { key: instance, selection } of requests) {
          const outcome = outcomes.get(instance);
          if (selection.pin === 'at-open' && (outcome?.status !== 'available' || !outcome.pinned)) {
            throw new Error(`Seeded draft for "${definition.url}" requires unavailable at-open instance "${instance}".`);
          }
          if (outcome?.status === 'available') {
            const { status: _status, newer: _newer, ...delivery } = outcome;
            resolutions[instance] = delivery;
            if (delivery.pinned) pins[instance] = delivery;
          }
        }
      }
      const engine = createFormEngine(definition, {
        responseInstanceResolutions: resolutions,
        ...(fixture.key.subject && { responseSubject: fixture.key.subject }),
        draftSnapshot: {
          definitionUrl: definition.url,
          definitionVersion: fixture.definitionVersion,
          data: fixture.data as FormDraftSnapshot['data'],
        },
      });
      let snapshotJson: string;
      let responseJson: string;
      let evaluated: EvaluatedFormState;
      try {
        snapshotJson = JSON.stringify(engine.getDraftSnapshot());
        responseJson = JSON.stringify({ ...engine.getResponse({ id: fixture.responseId, profile: 'off' }), authored: fixture.authored });
        evaluated = engine.getEvaluatedFormState({ profile: 'on-submit' });
      } finally {
        engine.dispose();
      }
      staged.push({
        fixture,
        id: storageKey(fixture.key),
        editable: { revision: crypto.randomUUID(), definitionVersion: fixture.definitionVersion, snapshotJson, responseJson, pinsJson: JSON.stringify(pins) },
        summary: { definitionVersion: fixture.definitionVersion, plans: await buildSectionSummaries(definition, evaluated, options.sectionPlans) },
      });
    }
    return staged;
  }

  const SEED_ATTEMPTS = 5;
  async function seedDrafts(base: FixtureBase) {
    if (!base.drafts.length) return;
    // A row observed as user-owned stays owned for this initialization even if it is
    // discarded concurrently: it receives a marker and is never seeded over.
    const everOwned = new Set<string>();
    for (let attempt = 0; attempt < SEED_ATTEMPTS; attempt += 1) {
      const observed = await transaction(['seeds', 'editable', 'filings'], 'readonly', tx => observeSeedState(tx, base.drafts));
      observed.owned.forEach(id => everOwned.add(id));
      const candidates = base.drafts.filter(fixture => {
        const id = rowKey(storageKey(fixture.key));
        return !observed.seeded.has(id) && !everOwned.has(id);
      });
      const staged = await prepareSeeds(base, candidates);
      const outcome = await transaction(['seeds', 'editable', 'summaries', 'filings'], 'readwrite', async tx => {
        const current = await observeSeedState(tx, base.drafts);
        if (current.fingerprint !== observed.fingerprint) return 'changed' as const;
        for (const fixture of base.drafts) {
          const id = storageKey(fixture.key);
          if (!current.seeded.has(rowKey(id)) && everOwned.has(rowKey(id))) tx.put('seeds', id, { seeded: true });
        }
        for (const entry of staged) {
          tx.put('seeds', entry.id, { seeded: true });
          tx.put('editable', entry.id, entry.editable);
          tx.put('summaries', entry.id, entry.summary);
        }
        return 'committed' as const;
      });
      if (outcome === 'committed') return;
    }
    throw new Error('Seeded drafts could not commit because the preview store kept changing.');
  }

  // Rebuild counts for summaries written before counts-only plans (or with no plans field) from
  // their committed draft, so upgraded rows keep available counts and no field placements.
  async function rebuildLegacySummaries() {
    if (!storageAvailable()) return;
    const legacy = await transaction(['summaries', 'editable'], 'readonly', async tx => {
      const rows = (await tx.list('summaries', scope)).filter(({ value }) => !Object.hasOwn(value, 'plans'));
      return Promise.all(rows.map(async ({ id }) => ({ id, draft: await tx.get('editable', id) })));
    });
    if (!legacy.length) return;
    const rebuilt = await Promise.all(legacy.map(async ({ id, draft }) => {
      if (!draft) return { id, revision: undefined, summary: undefined };
      const plans = await (async (): Promise<StoredSummary['plans']> => {
        const definition = definitions.get(id[1]!);
        if (!('responseJson' in draft) || !definition || definition.version !== draft.definitionVersion) return null;
        try {
          const response = parseJsonExact(draft.responseJson) as FormResponse;
          const engine = createFormEngine(definition, {
            responseInstanceResolutions: parseJsonExact(draft.pinsJson) as Record<string, ResponseSelectionDelivery>,
            ...(response.subject?.keys && { responseSubject: response.subject }),
            draftSnapshot: parseJsonExact(draft.snapshotJson) as FormDraftSnapshot,
          });
          let evaluated: EvaluatedFormState;
          try {
            evaluated = engine.getEvaluatedFormState({ profile: 'on-submit' });
          } finally {
            engine.dispose();
          }
          return await buildSectionSummaries(definition, evaluated, options.sectionPlans);
        } catch {
          return null;
        }
      })();
      return { id, revision: draft.revision, summary: { definitionVersion: draft.definitionVersion, plans } };
    }));
    await transaction(['summaries', 'editable'], 'readwrite', async tx => {
      for (const { id, revision, summary } of rebuilt) {
        const [row, draft] = await Promise.all([tx.get('summaries', id), tx.get('editable', id)]);
        if (!row || Object.hasOwn(row, 'plans') || draft?.revision !== revision) continue;
        if (summary) tx.put('summaries', id, summary);
        else tx.delete('summaries', id);
      }
    });
  }

  function startInitialize() {
    seedRejected = false;
    readyObservedFailure = false;
    const attempt = fixturesReady().then(async base => {
      await seedDrafts(base);
      await rebuildLegacySummaries();
      return base;
    }).catch(error => {
      seedRejected = true;
      throw error;
    });
    seedPromise = attempt;
    return attempt;
  }
  // Explicit initialization owns retries; every other caller awaits the same attempt.
  const settledReady = () => seedPromise ?? startInitialize();
  if (hasSeededDrafts || storageAvailable()) {
    void startInitialize().catch(() => undefined);
  }
  const authorized = async (
    key: DraftKey, relation: 'read' | 'resume' | 'send', selection?: ResponseSelectionRequest,
  ) => key.scope === scope && (options.authorize === undefined || await options.authorize(key, relation, selection));

  async function selectWithFixtures(
    base: Awaited<ReturnType<typeof loadFixtures>>,
    requests: readonly ResponseSelectionRequest[],
    signal?: AbortSignal,
    stagedDrafts?: readonly StoredEntry<'editable'>[],
  ) {
    const unavailable = { status: 'unavailable' } as const;
    signal?.throwIfAborted();
    try {
      const { tools, filings, decisions } = base;
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
          const input = responseSelectionRecord(key, responseJson, 'filing');
          const decision = decisions.get(responsePairKey({ responseId, responseHash }));
          if (decision?.status === 'decided') dispositions.push({ responseId, responseHash, value: decision.disposition });
          if (decision?.status === 'unavailable') unresolved.push(input);
          return { key, responseId, responseHash, input };
        });
        return [url, { completed, dispositions, unresolved }] as const;
      }));
      const storedDraftIds = new Set(stored.drafts.map(({ id }) => JSON.stringify(id)));
      const mergedDrafts = stagedDrafts?.length
        ? [...stored.drafts, ...stagedDrafts.filter(({ id }) => !storedDraftIds.has(JSON.stringify(id)))]
        : stored.drafts;
      const draftGroups = groupBy(mergedDrafts, ({ id }) => id[1]!);
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
  }

  const responses: PreviewFilingStore['responses'] = {
    async read(pairs, signal) {
      signal?.throwIfAborted();
      try {
        const { filings, decisions } = await settledReady();
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
      signal?.throwIfAborted();
      try {
        const base = await settledReady();
        return await selectWithFixtures(base, requests, signal);
      } catch {
        signal?.throwIfAborted();
        return new Map(requests.map(request => [request.key, { status: 'unavailable' as const }]));
      }
    },
  };

  async function openingPins(
    key: DraftKey, definition: FormDefinition | undefined, observed?: { pins: DraftRecord['pins'] | undefined },
  ) {
    const requests = definition
      ? definitionResponseRequests(definition, key).filter(request => request.selection.pin === 'at-open')
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
      if (observed && (!observed.pins || !Object.hasOwn(observed.pins, instance) || !deepEqual(observed.pins[instance], delivery))) {
        missingPin = instance;
        break;
      }
      pins[instance] = delivery;
    }
    return { pins, missingPin };
  }

  const drafts: BrowserDraftPort = {
    subscribe,
    async start(suppliedInput) {
      try {
        const input = structuredClone(suppliedInput);
        if (input.scope !== scope) return { status: 'denied' };
        if (options.authorize && !options.authorizeOpen) return { status: 'unavailable' };
        if (options.authorizeOpen && !await options.authorizeOpen(structuredClone(input))) return { status: 'denied' };
        const definition = definitions.get(input.definitionUrl);
        const declaration = definition?.subject;
        if (!input.attemptId || !declaration || definition?.version !== input.definitionVersion ||
          declaration.type !== input.subject.type) return { status: 'invalid-subject' };
        const fields = Object.entries(declaration.keys);
        const minted = fields.filter(([, field]) => field.minted);
        const parents = fields.filter(([, field]) => !field.minted);
        const supplied = input.subject.keys;
        if (!minted.length || Object.keys(supplied).length !== parents.length ||
          !parents.every(([name, field]) => Object.hasOwn(supplied, name) &&
            (field.dataType === 'integer' ? Number.isSafeInteger(supplied[name]) : typeof supplied[name] === 'string'))) {
          return { status: 'invalid-subject' };
        }
        const attempt = [scope, input.attemptId];
        const request = canonicalFiniteJson({ definitionUrl: input.definitionUrl, version: input.definitionVersion,
          type: declaration.type, keys: supplied });
        async function recover(tx: Transaction): Promise<DraftStartResult | undefined> {
          const prior = await tx.get('starts', attempt);
          if (!prior) return;
          if (prior.request !== request) return { status: 'conflict' };
          const draft = await tx.get('editable', storageKey({ scope, definitionUrl: input.definitionUrl, subject: prior.subject }));
          return draft?.definitionVersion === input.definitionVersion
            ? { status: 'started', subject: prior.subject } : { status: 'conflict' };
        }
        const prior = await transaction(['starts', 'editable'], 'readonly', recover);
        if (prior) return prior;
        const keys = { ...supplied, ...Object.fromEntries(minted.map(([name]) => [name, crypto.randomUUID()])) };
        const { tools } = await settledReady();
        const subject = { type: declaration.type, keys, id: tools.subjectId(declaration.type, keys) };
        const key = { scope, definitionUrl: input.definitionUrl, subject };
        const { pins, missingPin } = await openingPins(key, definition);
        const result = await transaction<DraftStartResult>(['starts', 'editable', 'summaries'], 'readwrite', async tx => {
          const winner = await recover(tx);
          if (winner) return winner;
          if (missingPin) return { status: 'pin-unavailable', instance: missingPin };
          const id = storageKey(key);
          if (await tx.get('editable', id)) return { status: 'conflict' };
          tx.put('starts', attempt, { request, subject });
          tx.put('editable', id, { definitionVersion: input.definitionVersion, revision: crypto.randomUUID(), pinsJson: JSON.stringify(pins) });
          tx.put('summaries', id, { definitionVersion: input.definitionVersion, plans: null });
          return { status: 'started', subject };
        });
        if (result.status === 'started') committed();
        return result;
      } catch {
        return { status: 'unavailable' };
      }
    },
    async load(key, definitionVersion, signal) {
      try {
        signal?.throwIfAborted();
        if (!await authorized(key, 'resume')) return { status: 'denied' };
        signal?.throwIfAborted();
        if (hasSeededDrafts) await settledReady();
        signal?.throwIfAborted();
        const stored = await transaction(['editable'], 'readonly', tx => tx.get('editable', storageKey(key)));
        signal?.throwIfAborted();
        if (!stored) return { status: 'absent' };
        if (stored.definitionVersion !== definitionVersion) {
          return { status: 'version-mismatch', storedVersion: stored.definitionVersion, revision: stored.revision };
        }
        const pins = parseJsonExact(stored.pinsJson) as DraftRecord['pins'];
        if (!('responseJson' in stored)) return { status: 'initialized', revision: stored.revision, pins };
        const { revision, snapshotJson, responseJson } = stored;
        return { status: 'loaded', draft: { revision, snapshotJson, responseJson, pins } };
      } catch {
        signal?.throwIfAborted();
        return { status: 'unavailable' };
      }
    },

    async save({ key, expectedRevision, creationPins, definitionVersion, snapshotJson, responseJson, summary }) {
      try {
        if (!await authorized(key, 'resume')) return { status: 'denied' };
        if (hasSeededDrafts) await settledReady();
        const id = storageKey(key);
        const definition = definitions.get(key.definitionUrl);
        const minted = Object.values(definition?.subject?.keys ?? {}).some(field => field.minted);
        if (minted) {
          if (expectedRevision === null || !definition) return { status: 'conflict' };
          const { tools } = await settledReady();
          const response = tools.parseResponse(responseJson);
          if (response.definitionUrl !== definition.url || response.definitionVersion !== definitionVersion ||
            !key.subject || tools.subjectId(key.subject.type, key.subject.keys) !== key.subject.id) return { status: 'conflict' };
          const responseKey = responseDraftKey(scope, response, definition, tools);
          if (!sameKey(responseKey, key)) return { status: 'conflict' };
        }
        const { pins, missingPin } = expectedRevision === null
          ? await openingPins(key, definition, { pins: creationPins }) : { pins: {}, missingPin: undefined };
        // Only the closed DraftProgressSummary counts are durable; caller-attached members are dropped.
        const progress = summary ? canonicalDraftProgress(summary.progress) : undefined;
        const plans: StoredSummary['plans'] = summary && progress
          ? [{ planId: await sectionPlanId(summary.sections), progress }]
          : null;
        const result = await transaction(['editable', 'summaries', 'seeds'], 'readwrite', async tx => {
          const previous = await tx.get('editable', id);
          if ((previous?.revision ?? null) !== expectedRevision ||
              (previous && previous.definitionVersion !== definitionVersion)) return { status: 'conflict' } as const;
          if (missingPin !== undefined) return { status: 'pin-unavailable', instance: missingPin } as const;
          const revision = crypto.randomUUID();
          const pinsJson = previous ? previous.pinsJson : JSON.stringify(pins);
          tx.put('editable', id, { revision, definitionVersion, snapshotJson, responseJson, pinsJson });
          tx.put('summaries', id, { definitionVersion, plans });
          tx.put('seeds', id, { seeded: true });
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
        if (hasSeededDrafts) await settledReady();
        const id = storageKey(key);
        const definition = definitions.get(key.definitionUrl);
        const minted = Object.values(definition?.subject?.keys ?? {}).some(field => field.minted);
        const opening = minted && definition ? await openingPins(key, definition) : undefined;
        if (opening?.missingPin) return { status: 'unavailable' };
        const result = await transaction(['editable', 'summaries', 'seeds'], 'readwrite', async tx => {
          const prior = await tx.get('editable', id);
          if (!prior || prior.revision !== expectedRevision) return { status: 'conflict' } as const;
          tx.put('seeds', id, { seeded: true });
          if (opening && definition) {
            // Discard the old answers but retain the store-issued address on the current version.
            tx.put('editable', id, { revision: crypto.randomUUID(), definitionVersion: definition.version, pinsJson: JSON.stringify(opening.pins) });
            tx.put('summaries', id, { definitionVersion: definition.version, plans: null });
          } else {
            tx.delete('editable', id);
            tx.delete('summaries', id);
          }
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
        const initialized = await settledReady();
        const prepared = await Promise.all(queries.map(async query => {
          const subject = query.subject && { ...query.subject, id: initialized.tools.subjectId(query.subject.type, query.subject.keys) };
          const key: DraftKey = { scope: previewScope ?? scope, definitionUrl: query.definitionUrl, subject };
          const [read, resume, targetPlanId] = await Promise.all([
            authorized(key, 'read'),
            authorized(key, 'resume'),
            sectionPlanId(query.sections),
          ]);
          return { query, key, read, resume, targetPlanId };
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
        visible.forEach(({ query, key, read, resume, targetPlanId }, index) => {
          const stored = data.summaries[index];
          const observation = unavailableStatus();
          if (resume) {
            if (!stored) {
              observation.draft = { status: 'absent' };
            } else if (stored.definitionVersion !== query.definitionVersion) {
              observation.draft = { status: 'stale' };
            } else if (!stored.plans || stored.plans.length === 0) {
              observation.draft = { status: 'unavailable' };
            } else {
              const matched = stored.plans.find(candidate => candidate.planId === targetPlanId);
              observation.draft = matched ? matched.progress : { status: 'stale' };
            }
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
    async ready() {
      if (!seedPromise || (seedRejected && readyObservedFailure)) {
        startInitialize();
      }
      try {
        await seedPromise;
      } catch (error) {
        readyObservedFailure = true;
        throw error;
      }
    },
    async submit(fence, responseJson) {
      const { key, definitionVersion } = fence;
      try {
        if (!await authorized(key, 'send')) return { status: 'denied' };
        const { tools, filings } = await settledReady();
        let filing: ResponseFiling;
        try {
          filing = prepareResponseFiling(scope, definitions, responseJson, 'preview-submit', tools);
          if (!sameKey(filing.key, key) || filing.definitionVersion !== definitionVersion) return { status: 'invalid-response' };
        } catch {
          return { status: 'invalid-response' };
        }
        const id = storageKey(key);
        const filingId = [scope, filing.responseId];
        const result = await transaction<PreviewFilingSubmitResult>(['editable', 'summaries', 'filings', 'seeds'], 'readwrite', async tx => {
          const previous = await tx.get('editable', id);
          if (!previous || !('responseJson' in previous) || previous.revision !== fence.revision || previous.definitionVersion !== definitionVersion ||
              previous.responseJson !== fence.responseJson) return { status: 'conflict' };
          const draft = tools.parseResponse(previous.responseJson);
          const definition = definitions.get(key.definitionUrl)!;
          if (draft.id !== filing.responseId || draft.definitionUrl !== definition.url ||
              !sameKey(responseDraftKey(scope, draft, definition, tools), key)) return { status: 'invalid-response' };
          if (filings.some(record => record.responseId === filing.responseId) || await tx.get('filings', filingId)) {
            return { status: 'duplicate-response' };
          }
          tx.addFiling(filingId, filing);
          tx.put('seeds', id, { seeded: true });
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
    const request = indexedDB.open(databaseName, 4);
    request.onupgradeneeded = event => {
      const db = request.result;
      for (const store of ['editable', 'summaries', 'filings', 'starts', 'seeds']) {
        if (event.oldVersion >= 2 && db.objectStoreNames.contains(store)) continue;
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

  return createFilingStore(options, transaction, subscribe, committed, () => typeof indexedDB !== 'undefined');
}

export function createMemoryFilingStore(options: PreviewFilingStoreOptions): PreviewFilingStore {
  type Entries = { [S in StoreName]: StoredEntry<S>[] };
  let entries: Entries = { editable: [], summaries: [], filings: [], starts: [], seeds: [] };
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
