/** @filedesc Preview drafts, immutable filings and review fixtures over one scoped store. */
import {
  attachVerifiedJsonToken,
  createFormEngine,
  deepEqual,
  initFormspecEngine,
  initFormspecEngineTools,
  isStamped,
  isValidResponseAuthored,
  matchesEntry,
  parseVerifiedJsonObject,
  responseSubjectId,
  sameAnswer,
  selectResponses,
  type DraftExplanation,
  type FormDraftSnapshot,
} from '@formspec-org/engine';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { resolvePageSequence, type PageSequenceEntry } from '@formspec-org/layout';
import {
  canonicalDraftProgress, canonicalFiniteJson, matchesFilingSubjectPredicates, prepareResponseFiling, prepareResponseFixtures, responseDraftKey, responsePairKey, responseSelectionRecord,
  catalogResponseDigest, catalogResponseProjection, catalogResponseSelection, resolveDataSourceDescriptor, selectFilingStatus, selectFilingSummaryStatus, toResponseFilingSummary,
  type BrowserDraftPort, type CurrentDraftProgress, type DraftStartInput, type DraftStartResult, type DataSourceCatalogHandle, type DraftKey, type DraftRecord, type DraftSaveInput, type DraftSectionPlacement,
  type FilingLoadResult, type FilingStatusObservation, type MatchedFilingDraftObservation, type MatchedFilingObservation, type PreparedDraftFixture, type PreparedResponseFixtures,
  type ResponseFiling, type ResponseFilingSummary, type ResponseFixtures, type ResponseRecordTools,
} from '@formspec-org/surface';
import type { DispositionAuthority, EvaluatedFormState, Explanation, FormDefinition, FormResponse, ResponseSelection, ResponseSelectionContext, ResponseSelectionDelivery, ResponseSelectionOutcome, ResponseSelectionRecord, ResponseSelectionRequest, ResponseSelector } from '@formspec-org/types';
import { definitionResponseRequests } from './definition-response-reads.js';
import { summarizeDraftProgress } from './draft-progress.js';
import type { SurfaceDraftFence } from './draft-writer.js';

type StoredDraft = Omit<DraftRecord, 'pins'> & {
  definitionVersion: string;
  pinsJson: string;
  unverifiedStartHistory?: true;
};
type InitializedDraft = Pick<StoredDraft, 'definitionVersion' | 'revision' | 'pinsJson' | 'unverifiedStartHistory'> & {
  subject?: NonNullable<DraftKey['subject']>;
};
type StartAttempt = { request: string; subject: NonNullable<DraftKey['subject']> };
type StoredPlanSummary = {
  planId: string;
  progress: CurrentDraftProgress;
};
type StoredSummary = {
  definitionVersion: string;
  plans: readonly StoredPlanSummary[] | null;
  subject?: NonNullable<DraftKey['subject']>;
  unverifiedStartHistory?: true;
};
type SeedMarker = { seeded: true };
type Stores = {
  editable: StoredDraft | InitializedDraft;
  starts: StartAttempt;
  summaries: StoredSummary;
  filings: ResponseFiling;
  seeds: SeedMarker;
  filingSummaries: ResponseFilingSummary;
};
type StoreName = keyof Stores;
type StoredEntry<S extends StoreName> = { id: string[]; value: Stores[S] };

interface Transaction {
  get<S extends StoreName>(store: S, key: string[]): Promise<Stores[S] | undefined>;
  list<S extends StoreName>(store: S, scope: string): Promise<StoredEntry<S>[]>;
  put<S extends Exclude<StoreName, 'filings' | 'filingSummaries'>>(store: S, key: string[], value: Stores[S]): void;
  addFiling(key: string[], value: ResponseFiling): void;
  delete(store: Exclude<StoreName, 'filings' | 'filingSummaries'>, key: string[]): void;
}
type RunTransaction = <T>(stores: StoreName[], mode: IDBTransactionMode, work: (tx: Transaction) => Promise<T>) => Promise<T>;

export interface PreviewFilingStoreOptions {
  scope: string;
  definitions: ReadonlyMap<string, FormDefinition>;
  fixtures?: ResponseFixtures;
  /** Pre-validated fixture metadata from scenario admission; avoids re-reading raw fixture payloads. */
  preparedFixtures?: PreparedResponseFixtures;
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

type StagedDraftEntry = StoredEntry<'editable'> & {
  candidateIndex?: number;
};

type SelectionCandidate = {
  key: DraftKey;
  input: ResponseSelectionRecord;
  responseId: string;
  responseHash?: string;
  candidateIndex?: number;
};

function draftCandidates(
  entries: readonly StagedDraftEntry[], scope: string, definition: FormDefinition, tools: ResponseRecordTools,
): SelectionCandidate[] | undefined {
  try {
    return entries.flatMap(({ id, value, candidateIndex }) => {
      if (value.unverifiedStartHistory || !('responseJson' in value)) return [];
      const response = tools.parseResponse(value.responseJson);
      const key = responseDraftKey(scope, response, definition, tools);
      if (response.definitionUrl !== definition.url || JSON.stringify(id) !== JSON.stringify(storageKey(key))) {
        throw new Error('Stored draft does not match its filing unit.');
      }
      return {
        key,
        input: responseSelectionRecord(key, value.responseJson, 'open-draft'),
        responseId: response.id ?? '',
        ...(candidateIndex === undefined ? {} : { candidateIndex }),
      };
    });
  } catch {
    return undefined;
  }
}

function parseSectionPlacements(value: unknown): DraftSectionPlacement[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const placements: DraftSectionPlacement[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return undefined;
    const { id, fields } = entry as Record<string, unknown>;
    if (id !== undefined && typeof id !== 'string') return undefined;
    if (!Array.isArray(fields) || !fields.every((field): field is string => typeof field === 'string')) return undefined;
    placements.push(id === undefined ? { fields: [...fields] } : { id, fields: [...fields] });
  }
  return placements;
}

function declaredSectionIds(sections: readonly DraftSectionPlacement[]): ReadonlySet<string> {
  return new Set(sections.flatMap(({ id }) => (id === undefined ? [] : [id])));
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
  const summarized = summarizeDraftProgress(sections as readonly PageSequenceEntry[], evaluated);
  const allowed = new Set(sections.flatMap(({ id }) => (id === undefined ? [] : [id])));
  return canonicalDraftProgress({
    status: 'current',
    form: summarized.form,
    sections: Object.fromEntries(summarized.sections.flatMap(({ id, counts }) => id === undefined ? [] : [[id, counts]])),
  }, allowed);
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

function stampDraftExplanations(
  incoming: readonly DraftExplanation[],
  previousResponseJson: string | undefined,
  currentResponseJson: string,
): { responseJson: string; explanations: Explanation[] } {
  for (let i = 0; i < incoming.length; i++) {
    for (let j = 0; j < i; j++) {
      if (matchesEntry(incoming[j]!, incoming[i]!)) {
        throw new Error('Duplicate warning explanation identity.');
      }
    }
  }
  const currentResponse = parseJsonExact(currentResponseJson) as FormResponse;
  const previousExplanations: Explanation[] = previousResponseJson
    ? ((parseJsonExact(previousResponseJson) as FormResponse).explanations ?? [])
    : [];
  const defaultAuthor = currentResponse.author ?? { id: 'local-preview' };
  const recordedNow = new Date().toISOString();
  const stamped: Explanation[] = incoming.map(entry => {
    const prior = previousExplanations.find(prev => isStamped(prev) && sameAnswer(entry, prev));
    const author = prior ? prior.author : defaultAuthor;
    const recorded = prior ? prior.recorded : recordedNow;
    if ('group' in entry) {
      return {
        group: true,
        code: entry.code,
        ...(entry.partyRef !== undefined ? { partyRef: entry.partyRef } : {}),
        paths: [...entry.paths] as [string, ...string[]],
        basis: entry.basis,
        author,
        recorded,
      };
    }
    return {
      shapeId: entry.shapeId,
      path: entry.path,
      basis: entry.basis,
      ...(entry.text !== undefined ? { text: entry.text } : {}),
      author,
      recorded,
    };
  });
  const { explanations: _omit, ...rest } = currentResponse;
  const nextResponse: FormResponse = stamped.length > 0 ? { ...rest, explanations: stamped } : rest;
  return { responseJson: JSON.stringify(nextResponse), explanations: stamped };
}

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SUBJECT_ID_HEX = /^[0-9a-f]{64}$/u;

function isValidDraftStorageKey(key: unknown): key is [string, string, 'subject' | 'respondent', string] {
  if (!Array.isArray(key) || key.length !== 4 || !key.every((part): part is string => typeof part === 'string')) {
    return false;
  }
  if (key[0]!.length === 0 || key[1]!.length === 0) return false;
  if (key[2] === 'subject') return SUBJECT_ID_HEX.test(key[3]!);
  if (key[2] === 'respondent') return key[3] === '';
  return false;
}

function isValidSubjectRecord(
  value: unknown,
  expectedId?: string,
): value is NonNullable<DraftKey['subject']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.type !== 'string' || record.type.length === 0) return false;
  if (typeof record.id !== 'string' || record.id.length === 0) return false;
  if (expectedId !== undefined && record.id !== expectedId) return false;
  if (!record.keys || typeof record.keys !== 'object' || Array.isArray(record.keys)) return false;
  return Object.values(record.keys as Record<string, unknown>).every(
    keyValue => typeof keyValue === 'string' || (typeof keyValue === 'number' && Number.isSafeInteger(keyValue)),
  );
}

function inferredUpstreamSubject(
  subject: NonNullable<DraftKey['subject']>,
): NonNullable<FormDefinition['subject']> {
  return {
    type: subject.type,
    keys: Object.fromEntries(
      Object.entries(subject.keys).map(([name, keyValue]) => [
        name,
        { dataType: typeof keyValue === 'number' ? 'integer' as const : 'string' as const },
      ]),
    ),
  };
}

function createFilingStore(
  options: PreviewFilingStoreOptions, transaction: RunTransaction,
  subscribe: BrowserDraftPort['subscribe'], committed: () => void,
  storageAvailable: () => boolean = () => true,
): PreviewFilingStore {
  const { scope, definitions, catalogs = [] } = options;
  let preparedFromInput: PreparedResponseFixtures | undefined = options.preparedFixtures;
  const fixtureSnapshot: ResponseFixtures | undefined = preparedFromInput ? undefined : options.fixtures && {
    ...(options.fixtures.filings ? { filings: options.fixtures.filings.map(({ responseJson }) => ({ responseJson })) } : {}),
    ...(options.fixtures.decisions ? { decisions: structuredClone(options.fixtures.decisions) } : {}),
    ...(options.fixtures.drafts ? { drafts: structuredClone(options.fixtures.drafts) } : {}),
  };
  const hasSeededDrafts = Boolean(preparedFromInput?.drafts?.length || fixtureSnapshot?.drafts?.length);
  const parsedFilings = new Map<string, FormResponse>();
  const parsedTokens = new Map<string, object>();
  let fixtureParseError: unknown;
  let hasFixtureParseError = false;
  if (!preparedFromInput && fixtureSnapshot?.filings?.length) {
    for (const { responseJson } of fixtureSnapshot.filings) {
      if (parsedFilings.has(responseJson)) continue;
      try {
        const { value, token } = parseVerifiedJsonObject(responseJson);
        parsedFilings.set(responseJson, value as unknown as FormResponse);
        parsedTokens.set(responseJson, token);
      } catch (error) {
        hasFixtureParseError = true;
        fixtureParseError = error;
        break;
      }
    }
  }
  const parseFixtureResponse = (text: string): FormResponse => {
    if (hasFixtureParseError) throw fixtureParseError;
    if (parsedFilings.has(text)) return parsedFilings.get(text)!;
    return parseJsonExact(text) as FormResponse;
  };
  const withVerifiedTokens = (select: typeof selectResponses): typeof selectResponses =>
    (records, selection, context) => select(
      records.map(record => {
        if (record.responseJson === undefined) return record;
        const token = parsedTokens.get(record.responseJson);
        return token === undefined ? record : attachVerifiedJsonToken(record, token);
      }),
      selection,
      context,
    );
  if (
    !preparedFromInput && !hasFixtureParseError && fixtureSnapshot
    && (fixtureSnapshot.filings?.length || fixtureSnapshot.decisions?.length || fixtureSnapshot.drafts?.length)
  ) {
    try {
      preparedFromInput = prepareResponseFixtures(scope, definitions, fixtureSnapshot, {
        parseResponse: parseFixtureResponse,
        subjectId: responseSubjectId,
        selectResponses: withVerifiedTokens(selectResponses),
        isValidAuthored: isValidResponseAuthored,
      });
      parsedFilings.clear();
      parsedTokens.clear();
    } catch {
      // WASM tools may not be initialized yet or fixtures may be invalid; retain parsed responses for async loadFixtures().
    }
  }
  let fixturesPromise: ReturnType<typeof loadFixtures> | undefined;
  let seedPromise: Promise<Awaited<ReturnType<typeof loadFixtures>>> | undefined;
  let seedRejected = false;
  let readyObservedFailure = false;
  async function loadFixtures() {
    try {
      const tools = await previewResponseRecordTools();
      const fixtures = preparedFromInput ?? prepareResponseFixtures(scope, definitions, fixtureSnapshot ?? {}, {
        ...tools,
        parseResponse: parseFixtureResponse,
        selectResponses: withVerifiedTokens(tools.selectResponses),
      });
      return { ...fixtures, tools };
    } finally {
      parsedFilings.clear();
      parsedTokens.clear();
    }
  }
  const fixturesReady = () => fixturesPromise ??= loadFixtures().catch(error => {
    fixturesPromise = undefined;
    throw error;
  });
  type FixtureBase = Awaited<ReturnType<typeof loadFixtures>>;
  type StagedSeed = { fixture: PreparedDraftFixture; id: string[]; editable: StoredDraft; summary: StoredSummary };
  type SeedSnapshot = { editable: readonly StoredEntry<'editable'>[]; filings: readonly StoredEntry<'filings'>[] };
  type SeedState = SeedSnapshot & { fingerprint: string; seeded: Set<string>; owned: Set<string> };
  const rowKey = (id: readonly string[]) => JSON.stringify(id);

  // Everything a seeding decision or a staged opening pin can depend on in this scope.
  async function observeSeedState(tx: Transaction, fixtures: readonly PreparedDraftFixture[]): Promise<SeedState> {
    const [editable, filings, seeds] = await Promise.all([
      tx.list('editable', scope), tx.list('filings', scope), tx.list('seeds', scope),
    ]);
    const fingerprint = JSON.stringify([
      editable.map(({ id, value }) => [rowKey(id), value.revision]).sort(),
      filings.map(({ id, value }) => [rowKey(id), value.responseHash]).sort(),
      seeds.map(({ id }) => rowKey(id)).sort(),
    ]);
    const editableIds = new Set(editable.map(({ id }) => rowKey(id)));
    const seeded = new Set(seeds.map(({ id }) => rowKey(id)));
    const owned = new Set<string>();
    for (const fixture of fixtures) {
      const id = rowKey(storageKey(fixture.key));
      if (editableIds.has(id) || filings.some(({ value }) => sameKey(value.key, fixture.key))) owned.add(id);
    }
    return { fingerprint, seeded, owned, editable, filings };
  }

  // Order candidates by the winners of their `current` selections over the single observed
  // snapshot (stored drafts, stored and fixture filings, and every candidate). Winning input
  // positions identify candidate rows directly, so stored rows can never create a candidate edge.
  async function orderCandidates(
    base: FixtureBase,
    candidates: readonly PreparedDraftFixture[],
    observed: SeedSnapshot,
  ) {
    const count = candidates.length;
    const synthetic: StagedDraftEntry[] = candidates.map((fixture, candidateIndex) => ({
      id: storageKey(fixture.key),
      candidateIndex,
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
    const { winningCandidates } = requests.length
      ? await selectWithFixturesInternal(base, requests, { snapshot: observed, stagedDrafts: synthetic, trackCandidates: true })
      : { winningCandidates: new Map<string, readonly number[]>() };
    const inDegree = new Array<number>(count).fill(0);
    const dependents = Array.from({ length: count }, () => new Set<number>());
    requests.forEach((request, position) => {
      const winners = winningCandidates.get(request.key);
      if (!winners?.length) return;
      const consumer = consumers[position]!;
      for (const upstream of winners) {
        if (dependents[upstream]!.has(consumer)) continue;
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

  // Build every candidate's rows in memory against one observed snapshot. Any refusal throws
  // before anything is written.
  async function prepareSeeds(
    base: FixtureBase,
    candidates: readonly PreparedDraftFixture[],
    observed: SeedSnapshot,
  ): Promise<StagedSeed[]> {
    for (const fixture of candidates) {
      const fixtureKey = rowKey(storageKey(fixture.key));
      const collidingFiling = observed.filings.some(({ value }) =>
        value.responseId === fixture.responseId && !sameKey(value.key, fixture.key));
      const collidingDraft = !collidingFiling && observed.editable.some(({ id, value }) => {
        if (rowKey(id) === fixtureKey || !('responseJson' in value)) return false;
        try {
          return base.tools.parseResponse(value.responseJson).id === fixture.responseId;
        } catch {
          return false;
        }
      });
      if (collidingFiling || collidingDraft) {
        throw new Error(
          `Seeded draft for "${fixture.key.definitionUrl}" conflicts with persisted Response ID "${fixture.responseId}".`,
        );
      }
    }
    const staged: StagedSeed[] = [];
    for (const fixture of await orderCandidates(base, candidates, observed)) {
      const definition = definitions.get(fixture.key.definitionUrl);
      if (!definition) continue;
      const requests = definitionResponseRequests(definition, fixture.key);
      const resolutions: Record<string, ResponseSelectionDelivery> = {};
      const pins = Object.create(null) as Record<string, DraftRecord['pins'][string]>;
      if (requests.length > 0) {
        const outcomes = await selectWithFixtures(base, requests, {
          snapshot: observed,
          stagedDrafts: staged.map(entry => ({ id: entry.id, value: entry.editable })),
        });
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
        summary: {
          definitionVersion: fixture.definitionVersion,
          plans: await buildSectionSummaries(definition, evaluated, options.sectionPlans),
          ...(fixture.key.subject ? { subject: structuredClone(fixture.key.subject) } : {}),
        },
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
      if (base.drafts.every(fixture => observed.seeded.has(rowKey(storageKey(fixture.key))))) return;
      const candidates = base.drafts.filter(fixture => {
        const id = rowKey(storageKey(fixture.key));
        return !observed.seeded.has(id) && !everOwned.has(id);
      });
      let staged: StagedSeed[];
      try {
        staged = await prepareSeeds(base, candidates, observed);
      } catch (error) {
        let current: SeedState;
        try {
          current = await transaction(['seeds', 'editable', 'filings'], 'readonly', tx => observeSeedState(tx, base.drafts));
        } catch {
          throw error;
        }
        current.owned.forEach(id => everOwned.add(id));
        if (current.fingerprint !== observed.fingerprint) continue;
        throw error;
      }
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
      if (outcome === 'committed') {
        if (staged.length > 0) committed();
        return;
      }
    }
    throw new Error('Seeded drafts could not commit because the preview store kept changing.');
  }

  // Convert legacy (v3) summary rows directly from their committed counts and placements into
  // hashed counts-only plans without re-evaluating the draft, so unpinned upstream relevance and
  // unavailable states are preserved and raw field placements are dropped.
  async function rebuildLegacySummaries() {
    if (!storageAvailable()) return;
    const legacy = await transaction(['summaries', 'editable'], 'readonly', async tx => {
      const rows = (await tx.list('summaries', scope)).filter(({ value }) => !Object.hasOwn(value, 'plans'));
      return Promise.all(rows.map(async ({ id, value }) => ({
        id,
        row: value as unknown,
        draft: await tx.get('editable', id),
      })));
    });
    if (!legacy.length) return;
    const rebuilt = await Promise.all(legacy.map(async ({ id, row, draft }) => {
      if (!draft) return { id, revision: undefined, summary: undefined };
      const record = typeof row === 'object' && row !== null ? row as Record<string, unknown> : undefined;
      const definitionVersion = typeof record?.definitionVersion === 'string'
        ? record.definitionVersion
        : draft.definitionVersion;
      let plans: StoredSummary['plans'] = null;
      const oldSummary = record?.summary;
      if (typeof oldSummary === 'object' && oldSummary !== null) {
        const placements = parseSectionPlacements((oldSummary as Record<string, unknown>).sections);
        if (placements) {
          const progress = canonicalDraftProgress(
            (oldSummary as Record<string, unknown>).progress,
            declaredSectionIds(placements),
          );
          if (progress) plans = [{ planId: await sectionPlanId(placements), progress }];
        }
      }
      const rawSubject = record?.subject;
      const subject = id[2] === 'subject' && isValidSubjectRecord(rawSubject, id[3])
        ? structuredClone(rawSubject)
        : undefined;
      const unverifiedStartHistory = record?.unverifiedStartHistory === true || draft.unverifiedStartHistory === true;
      return {
        id,
        revision: draft.revision,
        summary: {
          definitionVersion,
          plans,
          ...(subject ? { subject } : {}),
          ...(unverifiedStartHistory ? { unverifiedStartHistory: true as const } : {}),
        },
      };
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

  // Recover subject metadata on a restarted v4 seeded draft that was previously upgraded to v5
  // by a sibling edition before the owner fixture returned, using point reads only so cold
  // summary reads never scan `editable` or `filings`.
  async function recoverSubjectlessRows(base: FixtureBase) {
    if (!storageAvailable()) return;
    const fixtureSubjects = new Map<string, { id: string[]; subject: NonNullable<DraftKey['subject']> }>();
    const addCandidate = (key: DraftKey) => {
      if (key.scope !== scope || !key.subject) return;
      try {
        if (base.tools.subjectId(key.subject.type, key.subject.keys) !== key.subject.id) return;
      } catch {
        return;
      }
      const id = storageKey(key);
      fixtureSubjects.set(rowKey(id), { id, subject: key.subject });
    };
    for (const draft of base.drafts) addCandidate(draft.key);
    for (const filing of base.filingSummaries) addCandidate(filing.key);
    if (fixtureSubjects.size === 0) return;

    const candidates = [...fixtureSubjects.values()];
    const needingRecovery = await transaction(['summaries', 'seeds'], 'readonly', async tx => {
      const checks = await Promise.all(candidates.map(async candidate => {
        const [summary, seed] = await Promise.all([
          tx.get('summaries', candidate.id),
          tx.get('seeds', candidate.id),
        ]);
        return summary !== undefined && summary.subject === undefined && seed?.seeded === true
          ? candidate
          : undefined;
      }));
      return checks.filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
    });
    if (needingRecovery.length === 0) return;

    const recoveredAny = await transaction(['seeds', 'editable', 'summaries'], 'readwrite', async tx => {
      let updated = false;
      for (const { id, subject } of needingRecovery) {
        const [seed, draft, summary] = await Promise.all([
          tx.get('seeds', id),
          tx.get('editable', id),
          tx.get('summaries', id),
        ]);
        if (
          seed?.seeded !== true
          || !draft || 'responseJson' in draft || draft.subject !== undefined || draft.unverifiedStartHistory
          || !summary || !Object.hasOwn(summary, 'plans') || summary.subject !== undefined
          || summary.plans !== null || summary.unverifiedStartHistory
          || summary.definitionVersion !== draft.definitionVersion
        ) {
          continue;
        }
        tx.put('editable', id, { ...draft, subject: structuredClone(subject) });
        tx.put('summaries', id, { ...summary, subject: structuredClone(subject) });
        updated = true;
      }
      return updated;
    });
    if (recoveredAny) committed();
  }

  function startInitialize() {
    seedRejected = false;
    readyObservedFailure = false;
    const attempt = fixturesReady().then(async base => {
      // Complete any fallible legacy summary conversion and subjectless seeded-row recovery
      // before committing new seeds and notifying open tabs.
      await rebuildLegacySummaries();
      await recoverSubjectlessRows(base);
      await seedDrafts(base);
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

  type SelectWithFixturesOptions = {
    signal?: AbortSignal | undefined;
    stagedDrafts?: readonly StagedDraftEntry[] | undefined;
    snapshot?: SeedSnapshot | undefined;
    trackCandidates?: boolean | undefined;
  };

  async function selectWithFixturesInternal(
    base: Awaited<ReturnType<typeof loadFixtures>>,
    requests: readonly ResponseSelectionRequest[],
    selectOptions: SelectWithFixturesOptions = {},
  ): Promise<{
    outcomes: Map<string, ResponseSelectionOutcome>;
    winningCandidates: Map<string, readonly number[]>;
  }> {
    const { signal, stagedDrafts, snapshot, trackCandidates } = selectOptions;
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
      const stored = snapshot
        ? { filed: snapshot.filings, summaries: [] as readonly StoredEntry<'summaries'>[], drafts: readDrafts ? snapshot.editable : [] }
        : admitted.some(Boolean)
          ? await transaction(readDrafts ? ['editable', 'summaries', 'filings'] : ['summaries', 'filings'], 'readonly', async tx => {
            const [filed, summaries, drafts] = await Promise.all([
              tx.list('filings', scope),
              tx.list('summaries', scope),
              readDrafts ? tx.list('editable', scope) : Promise.resolve([]),
            ]);
            return { filed, summaries, drafts };
          })
          : { filed: [], summaries: [], drafts: [] };
      type QuarantinedGroup = { opaque: boolean; probes: ResponseSelectionRecord[] };
      const quarantinedByDefinition = new Map<string, QuarantinedGroup>();
      const recordQuarantinedUnit = (
        id: readonly string[],
        subject: NonNullable<DraftKey['subject']> | undefined,
        invalidSubject = false,
      ) => {
        const defUrl = id[1];
        if (typeof defUrl !== 'string') return;
        const definition = definitions.get(defUrl);
        if (!definition) return;
        const group = quarantinedByDefinition.get(defUrl) ?? { opaque: false, probes: [] };
        quarantinedByDefinition.set(defUrl, group);
        if (invalidSubject) {
          group.opaque = true;
          return;
        }
        if (id[2] === 'subject') {
          if (
            !subject
            || !isValidSubjectRecord(subject, id[3])
            || !definition.subject
            || subject.type !== definition.subject.type
          ) {
            group.opaque = true;
            return;
          }
          try {
            if (tools.subjectId(subject.type, subject.keys) !== subject.id) {
              group.opaque = true;
              return;
            }
          } catch {
            group.opaque = true;
            return;
          }
          const probeKey: DraftKey = { scope, definitionUrl: defUrl, subject };
          const probeJson = JSON.stringify({
            $formspecResponse: '1.0',
            id: `urn:formspec:quarantined:${group.probes.length}`,
            definitionUrl: defUrl,
            definitionVersion: definition.version,
            status: 'completed',
            authored: '2026-01-01T00:00:00Z',
            subject,
            data: {},
          });
          group.probes.push(responseSelectionRecord(probeKey, probeJson, 'filing'));
        } else {
          if (definition.subject) {
            group.opaque = true;
            return;
          }
          const probeKey: DraftKey = { scope, definitionUrl: defUrl };
          const probeJson = JSON.stringify({
            $formspecResponse: '1.0',
            id: `urn:formspec:quarantined:${group.probes.length}`,
            definitionUrl: defUrl,
            definitionVersion: definition.version,
            status: 'completed',
            authored: '2026-01-01T00:00:00Z',
            data: {},
          });
          group.probes.push(responseSelectionRecord(probeKey, probeJson, 'filing'));
        }
      };
      if (snapshot) {
        for (const { id, value } of snapshot.editable) {
          if (!value.unverifiedStartHistory) continue;
          if (id[2] === 'subject') {
            let subject: NonNullable<DraftKey['subject']> | undefined;
            let invalidSubject = false;
            if ('responseJson' in value) {
              try {
                const parsed = tools.parseResponse(value.responseJson);
                subject = parsed.subject && isValidSubjectRecord(parsed.subject, id[3]) ? parsed.subject : undefined;
                if (!subject) invalidSubject = true;
              } catch {
                invalidSubject = true;
              }
            } else {
              subject = value.subject;
            }
            recordQuarantinedUnit(id, subject, invalidSubject);
          } else {
            recordQuarantinedUnit(id, undefined);
          }
        }
      } else {
        for (const { id, value } of stored.summaries) {
          if (!value.unverifiedStartHistory) continue;
          recordQuarantinedUnit(id, value.subject);
        }
      }
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
      const mergedDrafts: readonly StagedDraftEntry[] = stagedDrafts?.length
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
      const winningCandidates = new Map<string, readonly number[]>();
      const results = await Promise.all(admitted.map(async (entry, index) => {
        const key = requests[index]!.key;
        if (!entry) return [key, unavailable] as const;
        const { definition, selection, context } = entry;
        const quarantined = quarantinedByDefinition.get(definition.url);
        if (quarantined) {
          if (quarantined.opaque) return [key, unavailable] as const;
          if (quarantined.probes.length > 0) {
            try {
              const { pin: _pin, fallback: _fallback, ...unpinned } = context;
              const possible = tools.selectResponses(
                quarantined.probes,
                {
                  definition: { url: selection.definition.url },
                  subject: selection.subject,
                  status: 'completed',
                  cardinality: 'latest-per-subject',
                  pin: 'none',
                  whenNone: 'empty',
                },
                { ...unpinned, projection: [] },
              );
              if (possible.status !== 'available' || !possible.none) return [key, unavailable] as const;
            } catch {
              return [key, unavailable] as const;
            }
          }
        }
        const filed = filedByDefinition.get(definition.url);
        const current = selection.status === 'current' ? draftsByDefinition.get(definition.url) : [];
        if (!current) return [key, unavailable] as const;
        try {
          const candidates: readonly SelectionCandidate[] = [...current, ...(filed?.completed ?? [])];
          if (selection.disposition && filed?.unresolved.length) {
            const { pin: _pin, ...unpinned } = context;
            const { disposition: _disposition, ...unfiltered } = selection;
            const possible = tools.selectResponses(
              filed.unresolved, { ...unfiltered, pin: 'none', whenNone: 'empty' }, { ...unpinned, projection: [] },
            );
            if (possible.status !== 'available' || !possible.none) return [key, unavailable] as const;
          }
          const outcome = tools.selectResponses(candidates.map(candidate => candidate.input), selection, {
            ...context,
            ...(selection.disposition && { dispositions: filed?.dispositions ?? [] }),
            ...(trackCandidates && { includeInputPositions: true }),
          });
          if (outcome.status !== 'available') return [key, outcome] as const;
          const { inputPositions, ...publicOutcome } = outcome;
          const selectedCandidates = inputPositions
            ? inputPositions.flatMap(pos => (candidates[pos] ? [candidates[pos]!] : []))
            : (() => {
                const selected = new Set(publicOutcome.records.map(responsePairKey));
                if (publicOutcome.newer) selected.add(responsePairKey(publicOutcome.newer));
                return candidates.filter(candidate => selected.has(responsePairKey(candidate)));
              })();
          const allowed = await Promise.all(selectedCandidates.map(record => canRead(record.key)));
          if (allowed.includes(false)) return [key, unavailable] as const;
          if (trackCandidates && inputPositions) {
            winningCandidates.set(
              key,
              inputPositions.flatMap(pos => {
                const candidateIndex = candidates[pos]?.candidateIndex;
                return candidateIndex === undefined ? [] : [candidateIndex];
              }),
            );
          }
          return [key, publicOutcome] as const;
        } catch {
          return [key, unavailable] as const;
        }
      }));
      signal?.throwIfAborted();
      return { outcomes: new Map<string, ResponseSelectionOutcome>(results), winningCandidates };
    } catch {
      signal?.throwIfAborted();
      return {
        outcomes: new Map(requests.map(request => [request.key, unavailable])),
        winningCandidates: new Map(),
      };
    }
  }

  async function selectWithFixtures(
    base: Awaited<ReturnType<typeof loadFixtures>>,
    requests: readonly ResponseSelectionRequest[],
    selectOptions: SelectWithFixturesOptions = {},
  ) {
    return (await selectWithFixturesInternal(base, requests, selectOptions)).outcomes;
  }

  const responses: PreviewFilingStore['responses'] = {
    async read(pairs, signal) {
      signal?.throwIfAborted();
      try {
        const { filings, decisions } = await settledReady();
        const fixtures = new Map(filings.map(filing => [responsePairKey(filing), filing]));
        const { stored, quarantined } = await transaction(['filings', 'summaries'], 'readonly', async tx => {
          const storedFilings = await Promise.all(pairs.map(pair => tx.get('filings', [scope, pair.responseId])));
          const summaries = await Promise.all(pairs.map((pair, index) => {
            const candidate = storedFilings[index];
            const filing = candidate?.responseHash === pair.responseHash ? candidate : fixtures.get(responsePairKey(pair));
            return filing ? tx.get('summaries', storageKey(filing.key)) : undefined;
          }));
          return {
            stored: storedFilings,
            quarantined: summaries.map(summary => summary?.unverifiedStartHistory === true),
          };
        });
        const entries = await Promise.all(pairs.map(async (pair, index) => {
          const key = responsePairKey(pair);
          const candidate = stored[index];
          const filing = candidate?.responseHash === pair.responseHash ? candidate : fixtures.get(key);
          const refused = quarantined[index] || (filing ? !await authorized(filing.key, 'read') : options.authorize !== undefined);
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
        return await selectWithFixtures(base, requests, { signal });
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
          const draft = await tx.get('editable', storageKey({ scope, definitionUrl: input.definitionUrl, subject: prior.subject }));
          if (draft?.unverifiedStartHistory) return { status: 'unavailable' };
          if (prior.request !== request) return { status: 'conflict' };
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
          const existing = await tx.get('editable', id);
          if (existing?.unverifiedStartHistory) return { status: 'unavailable' };
          if (existing) return { status: 'conflict' };
          tx.put('starts', attempt, { request, subject });
          tx.put('editable', id, { definitionVersion: input.definitionVersion, revision: crypto.randomUUID(), pinsJson: JSON.stringify(pins), subject });
          tx.put('summaries', id, { definitionVersion: input.definitionVersion, plans: null, subject });
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
        if (stored.unverifiedStartHistory) return { status: 'unavailable' };
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

    async loadFiling(key, _definitionVersion, signal): Promise<FilingLoadResult> {
      try {
        signal?.throwIfAborted();
        if (!await authorized(key, 'read')) return { status: 'denied' };
        signal?.throwIfAborted();
        const definition = definitions.get(key.definitionUrl);
        if (!definition) return { status: 'absent' };
        const initialized = await settledReady();
        signal?.throwIfAborted();
        const storedFilings = await transaction(['filings'], 'readonly', tx => tx.list('filings', scope));
        signal?.throwIfAborted();
        const candidates = [...storedFilings.map(({ value }) => value), ...initialized.filings]
          .filter(record => sameKey(record.key, key));
        if (candidates.length === 0) return { status: 'absent' };
        const observed = selectFilingStatus(key, definition, candidates, initialized.decisions, initialized.tools);
        if (!('receiptRef' in observed)) {
          return observed.status === 'none' ? { status: 'absent' } : { status: 'unavailable' };
        }
        const chosen = candidates.find(record =>
          record.responseId === observed.receiptRef && record.responseHash === observed.responseHash);
        if (!chosen) return { status: 'unavailable' };
        return {
          status: 'loaded',
          filing: {
            responseJson: chosen.responseJson,
            definitionVersion: chosen.definitionVersion,
            observation: observed,
          },
        };
      } catch {
        signal?.throwIfAborted();
        return { status: 'unavailable' };
      }
    },

    async save({ key, expectedRevision, creationPins, definitionVersion, snapshotJson, responseJson, explanations, summary }) {
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
        // Only closed DraftProgressSummary counts for declared section placements are durable;
        // caller-attached members and off-plan section keys are dropped.
        const placements = summary ? parseSectionPlacements(summary.sections) : undefined;
        const progress = summary && placements
          ? canonicalDraftProgress(summary.progress, declaredSectionIds(placements))
          : undefined;
        const plans: StoredSummary['plans'] = placements && progress
          ? [{ planId: await sectionPlanId(placements), progress }]
          : null;
        let summarySubject: NonNullable<DraftKey['subject']> | undefined;
        if (missingPin === undefined && definition?.subject) {
          const { tools } = await settledReady();
          const declaredFields = Object.entries(definition.subject.keys);
          const candidateKeys = key.subject?.keys;
          if (!key.subject || !candidateKeys || key.subject.type !== definition.subject.type
              || Object.keys(candidateKeys).length !== declaredFields.length
              || !declaredFields.every(([name, field]) => Object.hasOwn(candidateKeys, name)
                  && (field.dataType === 'integer' ? Number.isSafeInteger(candidateKeys[name]) : typeof candidateKeys[name] === 'string'))
              || tools.subjectId(key.subject.type, candidateKeys) !== key.subject.id) {
            return { status: 'conflict' };
          }
          summarySubject = { type: key.subject.type, keys: structuredClone(candidateKeys), id: key.subject.id };
        }
        const result = await transaction(['editable', 'summaries', 'seeds'], 'readwrite', async tx => {
          const previous = await tx.get('editable', id);
          if (previous?.unverifiedStartHistory) return { status: 'unavailable' } as const;
          if ((previous?.revision ?? null) !== expectedRevision ||
              (previous && previous.definitionVersion !== definitionVersion)) return { status: 'conflict' } as const;
          if (missingPin !== undefined) return { status: 'pin-unavailable', instance: missingPin } as const;
          const responseExplanations = explanations === undefined
            ? (() => {
                const parsed = parseJsonExact(responseJson);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'explanations' in parsed) {
                  const raw = (parsed as { explanations?: unknown }).explanations;
                  if (raw !== undefined) {
                    if (!Array.isArray(raw)) throw new Error('Response explanations must be an array.');
                    return raw as DraftExplanation[];
                  }
                }
                return undefined;
              })()
            : undefined;
          const incomingExplanations = explanations ?? responseExplanations;
          const stamped = incomingExplanations !== undefined
            ? stampDraftExplanations(
                incomingExplanations,
                previous && 'responseJson' in previous ? previous.responseJson : undefined,
                responseJson,
              )
            : undefined;
          const revision = crypto.randomUUID();
          const pinsJson = previous ? previous.pinsJson : JSON.stringify(pins);
          tx.put('editable', id, {
            revision,
            definitionVersion,
            snapshotJson,
            responseJson: stamped ? stamped.responseJson : responseJson,
            pinsJson,
          });
          tx.put('summaries', id, { definitionVersion, plans, ...(summarySubject ? { subject: summarySubject } : {}) });
          tx.put('seeds', id, { seeded: true });
          return stamped
            ? { status: 'saved', revision, explanations: stamped.explanations } as const
            : { status: 'saved', revision } as const;
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
        const restartedSubject = opening && key.subject
          ? { type: key.subject.type, keys: structuredClone(key.subject.keys), id: (await settledReady()).tools.subjectId(key.subject.type, key.subject.keys) }
          : undefined;
        if (restartedSubject && restartedSubject.id !== key.subject?.id) return { status: 'conflict' };
        const result = await transaction(['editable', 'summaries', 'seeds'], 'readwrite', async tx => {
          const prior = await tx.get('editable', id);
          if (prior?.unverifiedStartHistory) return { status: 'unavailable' } as const;
          if (!prior || prior.revision !== expectedRevision) return { status: 'conflict' } as const;
          tx.put('seeds', id, { seeded: true });
          if (opening && definition) {
            // Discard the old answers but retain the store-issued address on the current version.
            tx.put('editable', id, {
              revision: crypto.randomUUID(),
              definitionVersion: definition.version,
              pinsJson: JSON.stringify(opening.pins),
              ...(restartedSubject ? { subject: restartedSubject } : {}),
            });
            tx.put('summaries', id, {
              definitionVersion: definition.version,
              plans: null,
              ...(restartedSubject ? { subject: restartedSubject } : {}),
            });
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
        const targetScope = previewScope ?? scope;
        const initialized = await settledReady();
        const exactQueries = queries.filter(query => !query.subjectMatch);
        const matchQueries = targetScope === scope ? queries.filter(query => query.subjectMatch !== undefined) : [];
        const [prepared, preparedMatch] = await Promise.all([
          Promise.all(exactQueries.map(async query => {
            const subject = query.subject && { ...query.subject, id: initialized.tools.subjectId(query.subject.type, query.subject.keys) };
            const key: DraftKey = { scope: targetScope, definitionUrl: query.definitionUrl, subject };
            const [read, resume, targetPlanId] = await Promise.all([
              authorized(key, 'read'),
              authorized(key, 'resume'),
              sectionPlanId(query.sections),
            ]);
            return { query, key, read, resume, targetPlanId };
          })),
          Promise.all(matchQueries.map(async query => {
            const definition = definitions.get(query.definitionUrl);
            if (!definition?.subject || definition.subject.type !== query.subjectMatch!.type) return undefined;
            const spaceKey: DraftKey = { scope: targetScope, definitionUrl: definition.url };
            const [spaceRead, spaceResume, targetPlanId] = await Promise.all([
              authorized(spaceKey, 'read'),
              authorized(spaceKey, 'resume'),
              sectionPlanId(query.sections),
            ]);
            if (!spaceRead || !spaceResume) return undefined;
            return { query, definition, targetPlanId };
          })),
        ]);
        signal.throwIfAborted();
        const visible = prepared.filter(({ read, resume }) => read || resume);
        const admittedMatch = preparedMatch.filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
        const needMatchStore = admittedMatch.length > 0;
        const needFilingSummaries = needMatchStore || visible.some(({ read }) => read);
        const data = (visible.length > 0 || needMatchStore) ? await transaction(
          needFilingSummaries ? ['summaries', 'filingSummaries'] : ['summaries'],
          'readonly',
          async tx => {
            const [summaries, allSummaries, filingSummaries] = await Promise.all([
              Promise.all(visible.map(({ key }) => tx.get('summaries', storageKey(key)))),
              needMatchStore ? tx.list('summaries', scope) : [],
              needFilingSummaries ? tx.list('filingSummaries', scope) : [],
            ]);
            return {
              summaries,
              allSummaries,
              filingSummaries: [...filingSummaries.map(({ value }) => value), ...initialized.filingSummaries],
            };
          },
        ) : { summaries: [], allSummaries: [], filingSummaries: [] };
        const filingsByKey = groupBy(data.filingSummaries, record => JSON.stringify(storageKey(record.key)));

        function buildObservation(
          query: (typeof queries)[number],
          key: DraftKey,
          stored: StoredSummary | undefined,
          read: boolean,
          resume: boolean,
          targetPlanId: string,
        ): { draft: MatchedFilingDraftObservation; filing: MatchedFilingObservation } {
          if (stored?.unverifiedStartHistory) {
            return { draft: { status: 'unavailable' }, filing: { status: 'unavailable' } };
          }
          let draft: MatchedFilingDraftObservation = { status: 'unavailable' };
          let filing: MatchedFilingObservation = { status: 'unavailable' };
          if (resume) {
            if (!stored) {
              draft = { status: 'absent' };
            } else if (stored.definitionVersion !== query.definitionVersion) {
              draft = { status: 'stale' };
            } else if (!stored.plans || stored.plans.length === 0) {
              draft = { status: 'unavailable' };
            } else {
              const matched = stored.plans.find(candidate => candidate.planId === targetPlanId);
              const progress = matched
                ? canonicalDraftProgress(matched.progress, declaredSectionIds(query.sections))
                : undefined;
              draft = matched ? (progress ?? { status: 'unavailable' }) : { status: 'stale' };
            }
          }
          const definition = definitions.get(key.definitionUrl);
          if (read && definition) {
            const observedFiling = selectFilingSummaryStatus(
              key, definition, filingsByKey.get(JSON.stringify(storageKey(key))) ?? [], initialized.decisions, initialized.tools,
            );
            filing = observedFiling.status === 'denied' ? { status: 'unavailable' } : observedFiling;
          }
          return { draft, filing };
        }

        visible.forEach(({ query, key, read, resume, targetPlanId }, index) => {
          result.set(query.key, buildObservation(query, key, data.summaries[index], read, resume, targetPlanId));
        });

        if (needMatchStore) {
          const summariesByKey = new Map(data.allSummaries.map(entry => [JSON.stringify(entry.id), entry.value]));
          type EvidenceRecord = { key: DraftKey; relation: 'read' | 'resume' };
          type SubjectEntry = { subject: NonNullable<DraftKey['subject']>; evidence: EvidenceRecord[]; unverified: boolean };
          const unresolvedRows: Array<{ definitionUrl: string; definitionVersion: string }> = [];
          let allUnits: Map<string, SubjectEntry> | undefined;
          try {
            allUnits = new Map<string, SubjectEntry>();
            for (const { id, value } of data.allSummaries) {
              const definitionUrl = id[1];
              if (typeof definitionUrl !== 'string') continue;
              if (id[2] === 'subject' && !value.subject) {
                // Retain the unresolved row's Definition version so range discovery never excludes
                // a historical row using a later Definition edition's changed subject type.
                unresolvedRows.push({ definitionUrl, definitionVersion: value.definitionVersion });
                continue;
              }
              const subject = value.subject;
              if (!subject) continue;
              const expectedId = initialized.tools.subjectId(subject.type, subject.keys);
              const candidateKey: DraftKey = { scope, definitionUrl, subject };
              if (expectedId !== subject.id || JSON.stringify(id) !== JSON.stringify(storageKey(candidateKey))) {
                throw new Error('Stored summary metadata does not match its filing unit.');
              }
              const bucket = allUnits.get(subject.id) ?? { subject, evidence: [], unverified: false };
              bucket.evidence.push({ key: candidateKey, relation: 'resume' });
              if (value.unverifiedStartHistory) bucket.unverified = true;
              allUnits.set(subject.id, bucket);
            }
            for (const filing of data.filingSummaries) {
              const subject = filing.key.subject;
              if (!subject) continue;
              if (initialized.tools.subjectId(subject.type, subject.keys) !== subject.id) {
                throw new Error('Stored filing summary metadata does not match its filing unit.');
              }
              const bucket = allUnits.get(subject.id) ?? { subject, evidence: [], unverified: false };
              bucket.evidence.push({ key: filing.key, relation: 'read' });
              allUnits.set(subject.id, bucket);
            }
          } catch {
            allUnits = undefined;
          }

          if (allUnits) {
            await Promise.all(admittedMatch.map(async ({ query, definition, targetPlanId }) => {
              const match = query.subjectMatch!;
              const hasPotentialUnresolved = unresolvedRows.some(({ definitionUrl: defUrl, definitionVersion: defVersion }) => {
                if (defUrl === definition.url) return true;
                const otherDef = definitions.get(defUrl);
                if (!otherDef || otherDef.version !== defVersion) return true;
                return !otherDef.subject || otherDef.subject.type === match.type;
              });
              if (hasPotentialUnresolved) return;
              const matching = [...allUnits.values()].filter(({ subject }) =>
                matchesFilingSubjectPredicates(definition, subject, match));
              if (matching.length === 0) {
                result.set(query.key, {
                  subjectMatch: 'none',
                  draft: { status: 'absent' },
                  filing: { status: 'none' },
                });
                return;
              }
              const checked = await Promise.all(matching.map(async ({ subject, evidence, unverified }) => {
                const unitKey: DraftKey = { scope: targetScope, definitionUrl: definition.url, subject };
                const [evidenceAllowed, unitRead, unitResume] = await Promise.all([
                  Promise.all(evidence.map(item => authorized(item.key, item.relation))),
                  authorized(unitKey, 'read'),
                  authorized(unitKey, 'resume'),
                ]);
                return {
                  unitKey,
                  unverified,
                  allowed: !evidenceAllowed.includes(false) && unitRead && unitResume,
                };
              }));
              if (checked.some(candidate => !candidate.allowed || candidate.unverified)) return;
              if (checked.length > 1) {
                result.set(query.key, {
                  subjectMatch: 'ambiguous',
                  draft: { status: 'unavailable' },
                  filing: { status: 'unavailable' },
                });
                return;
              }
              const { unitKey } = checked[0]!;
              const stored = summariesByKey.get(JSON.stringify(storageKey(unitKey)));
              if (stored?.unverifiedStartHistory) return;
              const observation = buildObservation(query, unitKey, stored, true, true, targetPlanId);
              result.set(query.key, {
                draft: observation.draft,
                filing: observation.filing,
                subject: { type: unitKey.subject!.type, keys: structuredClone(unitKey.subject!.keys) },
                subjectMatch: 'matched',
              });
            }));
          }
        }
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
        const result = await transaction<PreviewFilingSubmitResult>(['editable', 'summaries', 'filings', 'filingSummaries', 'seeds'], 'readwrite', async tx => {
          const previous = await tx.get('editable', id);
          if (previous?.unverifiedStartHistory) return { status: 'unavailable' };
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
    const deliver = () => {
      try {
        listener();
      } catch {
        // Isolate subscriber errors from readiness, writes, and sibling listeners.
      }
    };
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

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

const STRICT_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/u;
const DATE_VERSION = /^(\d{4})\.(\d{2})\.(\d{2})$/u;
const INTEGER_VERSION = /^\d+$/u;
const NUMERIC_IDENT = /^(?:0|[1-9]\d*)$/u;

function isValidCalendarDateVersion(value: string): boolean {
  const match = DATE_VERSION.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  return day <= daysInMonth;
}

function isValidVersionForAlgorithm(
  value: string,
  algorithm: FormDefinition['versionAlgorithm'] = 'semver',
): boolean {
  if (algorithm === 'date') return isValidCalendarDateVersion(value);
  if (algorithm === 'integer') return INTEGER_VERSION.test(value);
  if (algorithm === 'natural') return value.length > 0;
  return STRICT_SEMVER.test(value);
}

function compareStrictSemver(left: string, right: string): number | undefined {
  const a = STRICT_SEMVER.exec(left);
  const b = STRICT_SEMVER.exec(right);
  if (!a || !b) return undefined;
  for (const idx of [1, 2, 3] as const) {
    const av = BigInt(a[idx]!);
    const bv = BigInt(b[idx]!);
    if (av !== bv) return av < bv ? -1 : 1;
  }
  const ap = a[4];
  const bp = b[4];
  if (ap === bp) return 0;
  if (ap === undefined) return 1;
  if (bp === undefined) return -1;
  const aParts = ap.split('.');
  const bParts = bp.split('.');
  const len = Math.min(aParts.length, bParts.length);
  for (let i = 0; i < len; i += 1) {
    const ai = aParts[i]!;
    const bi = bParts[i]!;
    if (ai === bi) continue;
    const aNum = NUMERIC_IDENT.test(ai);
    const bNum = NUMERIC_IDENT.test(bi);
    if (aNum && bNum) return BigInt(ai) < BigInt(bi) ? -1 : 1;
    if (aNum !== bNum) return aNum ? -1 : 1;
    return ai < bi ? -1 : 1;
  }
  return aParts.length < bParts.length ? -1 : aParts.length > bParts.length ? 1 : 0;
}

function isStrictlyEarlierVersion(
  older: string,
  newer: string,
  algorithm: FormDefinition['versionAlgorithm'] = 'semver',
): boolean {
  if (algorithm === 'date') {
    return isValidCalendarDateVersion(older) && isValidCalendarDateVersion(newer) && older < newer;
  }
  if (algorithm === 'integer') {
    return INTEGER_VERSION.test(older) && INTEGER_VERSION.test(newer) && BigInt(older) < BigInt(newer);
  }
  if (algorithm === 'natural') {
    return false;
  }
  const cmp = compareStrictSemver(older, newer);
  return cmp !== undefined && cmp < 0;
}

function collectFixtureSubjects(
  options: PreviewFilingStoreOptions,
  tools: ResponseRecordTools,
): Map<string, NonNullable<DraftKey['subject']>> {
  const subjects = new Map<string, NonNullable<DraftKey['subject']>>();
  const record = (definitionUrl: string, subject: NonNullable<DraftKey['subject']>) => {
    try {
      if (tools.subjectId(subject.type, subject.keys) !== subject.id) return;
      subjects.set(
        JSON.stringify([options.scope, definitionUrl, 'subject', subject.id]),
        structuredClone(subject),
      );
    } catch {
      // Ignore unresolvable fixture subject metadata.
    }
  };
  for (const draft of options.preparedFixtures?.drafts ?? []) {
    if (draft.key.scope === options.scope && draft.key.subject) {
      record(draft.key.definitionUrl, draft.key.subject);
    }
  }
  for (const filing of options.preparedFixtures?.filings ?? []) {
    if (filing.key.scope === options.scope && filing.key.subject) {
      record(filing.key.definitionUrl, filing.key.subject);
    }
  }
  for (const draft of options.fixtures?.drafts ?? []) {
    if (!draft.subject || typeof draft.definitionUrl !== 'string') continue;
    const { type, keys } = draft.subject;
    if (
      typeof type !== 'string' || type.length === 0
      || !isPlainJsonObject(keys)
      || !Object.values(keys).every(v => typeof v === 'string' || (typeof v === 'number' && Number.isSafeInteger(v)))
    ) {
      continue;
    }
    try {
      const id = tools.subjectId(type, keys as Record<string, string | number>);
      record(draft.definitionUrl, { type, keys: keys as Record<string, string | number>, id });
    } catch {
      // Ignore malformed fixture subject.
    }
  }
  for (const filing of options.fixtures?.filings ?? []) {
    if (typeof filing.responseJson !== 'string') continue;
    try {
      const parsed = parseJsonExact(filing.responseJson);
      if (!isPlainJsonObject(parsed) || typeof parsed.definitionUrl !== 'string') continue;
      if (isValidSubjectRecord(parsed.subject)) {
        record(parsed.definitionUrl, parsed.subject);
      }
    } catch {
      // Ignore malformed fixture response JSON.
    }
  }
  return subjects;
}

function matchesDeclaredMintedSubject(
  subject: NonNullable<DraftKey['subject']>,
  declaration: NonNullable<FormDefinition['subject']>,
  suppliedParents?: Record<string, unknown>,
): boolean {
  if (subject.type !== declaration.type) return false;
  const declaredEntries = Object.entries(declaration.keys);
  if (Object.keys(subject.keys).length !== declaredEntries.length) return false;
  const parents = declaredEntries.filter(([, field]) => !field.minted);
  const minted = declaredEntries.filter(([, field]) => field.minted);
  if (minted.length === 0) return false;
  if (suppliedParents !== undefined) {
    if (Object.keys(suppliedParents).length !== parents.length) return false;
    return parents.every(([name, field]) =>
      Object.hasOwn(suppliedParents, name)
      && (field.dataType === 'integer'
        ? Number.isSafeInteger(suppliedParents[name])
        : typeof suppliedParents[name] === 'string'))
      && minted.every(([name, field]) =>
        !Object.hasOwn(suppliedParents, name)
        && Object.hasOwn(subject.keys, name)
        && (field.dataType === 'integer'
          ? Number.isSafeInteger(subject.keys[name])
          : typeof subject.keys[name] === 'string'));
  }
  return declaredEntries.every(([name, field]) =>
    Object.hasOwn(subject.keys, name)
    && (field.dataType === 'integer'
      ? Number.isSafeInteger(subject.keys[name])
      : typeof subject.keys[name] === 'string'));
}

function upgradeLegacyStores(
  upgradeTx: IDBTransaction,
  oldVersion: number,
  tools: ResponseRecordTools,
  options: PreviewFilingStoreOptions,
): void {
  const { scope, definitions } = options;
  const seedsStore = upgradeTx.objectStore('seeds');
  const filingsStore = upgradeTx.objectStore('filings');
  const filingSummaryStore = upgradeTx.objectStore('filingSummaries');
  const startsStore = upgradeTx.objectStore('starts');
  const editableStore = upgradeTx.objectStore('editable');
  const summariesStore = upgradeTx.objectStore('summaries');

  const abort = () => {
    try { upgradeTx.abort(); } catch { /* Already aborted. */ }
  };

  const subjectIdMatches = (subject: NonNullable<DraftKey['subject']>, expectedId: string): boolean => {
    try {
      return tools.subjectId(subject.type, subject.keys) === expectedId;
    } catch {
      return false;
    }
  };

  const fixtureSubjectsByDraftKey = collectFixtureSubjects(options, tools);
  const seededKeys = new Set<string>();
  const legacySummaryKeys = new Set<string>();
  const filingSubjectByDraftKey = new Map<string, NonNullable<DraftKey['subject']>>();
  const startByDraftKey = new Map<string, { subject: NonNullable<DraftKey['subject']>; versions: string[] }>();
  const editableByKey = new Map<string, {
    key: IDBValidKey;
    definitionVersion: string;
    subject?: NonNullable<DraftKey['subject']>;
    hasResponse: boolean;
    unrecoveredSeededSubject?: boolean;
    unverifiedStartHistory?: boolean;
  }>();
  const seenSummaryKeys = new Set<string>();

  type StartHistoryOutcome = 'clean' | 'quarantine' | 'abort';

  function isEarlierOrNaturalActive(
    versions: readonly string[],
    editableVersion: string,
    knownDefinition: FormDefinition | undefined,
  ): boolean {
    if (!knownDefinition) return true;
    if (knownDefinition.versionAlgorithm === 'natural') {
      return editableVersion === knownDefinition.version;
    }
    return versions.every(v => v === editableVersion || isStrictlyEarlierVersion(v, editableVersion, knownDefinition.versionAlgorithm));
  }

  function classifyStartHistory(
    serializedKey: string,
    startEntry: { subject: NonNullable<DraftKey['subject']>; versions: string[] },
    editableVersion: string,
    subject: NonNullable<DraftKey['subject']>,
    knownDefinition: FormDefinition | undefined,
  ): StartHistoryOutcome {
    const hasMismatch = startEntry.versions.some(v => v !== editableVersion);
    if (!hasMismatch) return 'clean';
    if (knownDefinition && knownDefinition.version === editableVersion) {
      if (
        !isValidVersionForAlgorithm(editableVersion, knownDefinition.versionAlgorithm)
        || !knownDefinition.subject
        || !matchesDeclaredMintedSubject(subject, knownDefinition.subject)
      ) {
        return 'abort';
      }
    }
    if (oldVersion < 4) {
      if (!knownDefinition) return 'clean';
      if (
        isValidVersionForAlgorithm(editableVersion, knownDefinition.versionAlgorithm)
        && startEntry.versions.every(v => isValidVersionForAlgorithm(v, knownDefinition.versionAlgorithm))
      ) {
        return isEarlierOrNaturalActive(startEntry.versions, editableVersion, knownDefinition) ? 'clean' : 'abort';
      }
      // Historical pin's issuing algorithm was omitted by legacy storage: quarantine the unit
      // rather than rolling back healthy siblings.
      return 'quarantine';
    }
    // A v3 -> v4 bridge row whose legacy `{ summary }` shape has not yet been converted to `{ plans }`
    // and carries no v4 seed marker is distinguishable from an untouched v4 start.
    if (
      legacySummaryKeys.has(serializedKey)
      && !seededKeys.has(serializedKey)
      && (
        !knownDefinition
        || (
          isValidVersionForAlgorithm(editableVersion, knownDefinition.versionAlgorithm)
          && startEntry.versions.every(v => isValidVersionForAlgorithm(v, knownDefinition.versionAlgorithm))
          && isEarlierOrNaturalActive(startEntry.versions, editableVersion, knownDefinition)
        )
      )
    ) {
      return 'clean';
    }
    // In v4, neither `{ seeded: true }` + empty editable (also written by returning fixtures for
    // existing user-owned drafts without restart) nor `{ plans: null }` nor saved editables can
    // distinguish a genuine restart from an altered start attempt, and v4 omitted each historical
    // pin's issuing versionAlgorithm: upgrade cleanly and quarantine the affected unit while
    // preserving all records and healthy sibling forms.
    return 'quarantine';
  }

  function backfillSummaries() {
    const cursorRequest = summariesStore.openCursor();
    cursorRequest.onerror = abort;
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        for (const [serializedKey, entry] of editableByKey) {
          if (seenSummaryKeys.has(serializedKey)) continue;
          summariesStore.put({
            definitionVersion: entry.definitionVersion,
            plans: null,
            ...(entry.subject ? { subject: structuredClone(entry.subject) } : {}),
            ...(entry.unverifiedStartHistory ? { unverifiedStartHistory: true as const } : {}),
          }, entry.key);
        }
        return;
      }
      const key = cursor.key;
      const value = cursor.value as (Partial<StoredSummary> & { summary?: DraftSaveInput['summary'] }) | undefined;
      if (
        !isValidDraftStorageKey(key)
        || !value || typeof value !== 'object' || Array.isArray(value)
        || Object.hasOwn(value, 'unverifiedStartHistory')
        || typeof value.definitionVersion !== 'string' || value.definitionVersion.length === 0
      ) {
        abort();
        return;
      }
      const serializedKey = JSON.stringify(key);
      seenSummaryKeys.add(serializedKey);
      const editable = editableByKey.get(serializedKey);
      const hasPlansProp = Object.hasOwn(value, 'plans');
      let normalizedPlans: StoredPlanSummary[] | null | undefined;
      if (hasPlansProp) {
        if (value.plans === null) {
          normalizedPlans = null;
        } else {
          if (!Array.isArray(value.plans)) {
            abort();
            return;
          }
          normalizedPlans = [];
          for (const entry of value.plans) {
            if (
              !isPlainJsonObject(entry)
              || typeof entry.planId !== 'string'
              || !SHA256_DIGEST.test(entry.planId)
            ) {
              abort();
              return;
            }
            const progress = canonicalDraftProgress(entry.progress);
            if (!progress) {
              abort();
              return;
            }
            normalizedPlans.push({ planId: entry.planId, progress });
          }
        }
      } else {
        if (!Object.hasOwn(value, 'summary')) {
          abort();
          return;
        }
        if (value.summary !== null) {
          if (!value.summary || typeof value.summary !== 'object' || Array.isArray(value.summary)) {
            abort();
            return;
          }
          const rawSummary = value.summary as Record<string, unknown>;
          const placements = parseSectionPlacements(rawSummary.sections);
          if (
            !placements
            || canonicalDraftProgress(rawSummary.progress) === undefined
            || canonicalDraftProgress(rawSummary.progress, declaredSectionIds(placements)) === undefined
          ) {
            abort();
            return;
          }
        }
      }
      const hasProgress = hasPlansProp ? normalizedPlans !== null : value.summary !== null;
      if (
        !editable
        || editable.definitionVersion !== value.definitionVersion
        || (hasProgress && !editable.hasResponse)
      ) {
        abort();
        return;
      }
      let expectedSubject: NonNullable<DraftKey['subject']> | undefined;
      if (key[2] === 'subject') {
        const subjectId = key[3];
        expectedSubject = editable.subject;
        if (!expectedSubject) {
          if (!editable.unrecoveredSeededSubject || value.subject !== undefined) {
            abort();
            return;
          }
        } else if (value.subject !== undefined) {
          if (
            !isValidSubjectRecord(value.subject, subjectId)
            || value.subject.type !== expectedSubject.type
            || !deepEqual(value.subject.keys, expectedSubject.keys)
            || !subjectIdMatches(value.subject, subjectId)
          ) {
            abort();
            return;
          }
        }
      } else if (value.subject !== undefined) {
        abort();
        return;
      }
      if (hasPlansProp) {
        const canonicalSummary: StoredSummary = {
          definitionVersion: value.definitionVersion,
          plans: normalizedPlans ?? null,
          ...(expectedSubject ? { subject: structuredClone(expectedSubject) } : {}),
          ...(editable.unverifiedStartHistory ? { unverifiedStartHistory: true as const } : {}),
        };
        if (!deepEqual(value, canonicalSummary)) {
          summariesStore.put(canonicalSummary, key);
        }
      } else if (
        (expectedSubject && value.subject === undefined)
        || (editable.unverifiedStartHistory && !value.unverifiedStartHistory)
      ) {
        summariesStore.put({
          ...value,
          ...(expectedSubject && value.subject === undefined ? { subject: structuredClone(expectedSubject) } : {}),
          ...(editable.unverifiedStartHistory ? { unverifiedStartHistory: true as const } : {}),
        }, key);
      }
      cursor.continue();
    };
  }

  function loadEditable() {
    const cursorRequest = editableStore.openCursor();
    cursorRequest.onerror = abort;
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        backfillSummaries();
        return;
      }
      const key = cursor.key;
      const value = cursor.value as (Partial<StoredDraft> & Partial<InitializedDraft>) | undefined;
      if (
        !isValidDraftStorageKey(key)
        || !value || typeof value !== 'object' || Array.isArray(value)
        || Object.hasOwn(value, 'unverifiedStartHistory')
        || typeof value.definitionVersion !== 'string' || value.definitionVersion.length === 0
        || typeof value.revision !== 'string' || value.revision.length === 0
        || typeof value.pinsJson !== 'string' || value.pinsJson.length === 0
      ) {
        abort();
        return;
      }
      let parsedPins: unknown;
      try {
        parsedPins = parseJsonExact(value.pinsJson);
      } catch {
        abort();
        return;
      }
      if (!isPlainJsonObject(parsedPins)) {
        abort();
        return;
      }
      const serializedKey = JSON.stringify(key);
      const definitionUrl = key[1];
      const editableVersion = value.definitionVersion;
      const knownDefinition = key[0] === scope ? definitions.get(definitionUrl) : undefined;
      const startEntry = startByDraftKey.get(serializedKey);
      if (
        knownDefinition
        && editableVersion === knownDefinition.version
        && !isValidVersionForAlgorithm(editableVersion, knownDefinition.versionAlgorithm)
      ) {
        abort();
        return;
      }
      const hasResponse = 'responseJson' in value;

      if (hasResponse) {
        if (
          typeof value.responseJson !== 'string' || value.responseJson.length === 0
          || typeof value.snapshotJson !== 'string' || value.snapshotJson.length === 0
        ) {
          abort();
          return;
        }
        let parsedSnapshot: unknown;
        try {
          parsedSnapshot = parseJsonExact(value.snapshotJson);
        } catch {
          abort();
          return;
        }
        if (!isPlainJsonObject(parsedSnapshot)) {
          abort();
          return;
        }
        // Preserve the documented legacy v2 respondent placeholder across v2 -> v5 and v2 -> v3 -> v5 upgrades.
        if (key[2] === 'respondent' && value.responseJson === '{}') {
          editableByKey.set(serializedKey, {
            key,
            definitionVersion: value.definitionVersion,
            hasResponse: true,
          });
          cursor.continue();
          return;
        }
        // Validate ordinary saved snapshots against FormEngine.assertDraftSnapshot requirements.
        if (
          parsedSnapshot.definitionUrl !== definitionUrl
          || parsedSnapshot.definitionVersion !== value.definitionVersion
          || !isPlainJsonObject(parsedSnapshot.data)
        ) {
          abort();
          return;
        }
        let parsedRaw: unknown;
        try {
          parsedRaw = parseJsonExact(value.responseJson);
        } catch {
          abort();
          return;
        }
        if (!isPlainJsonObject(parsedRaw)) {
          abort();
          return;
        }
        const parsed = parsedRaw as Partial<FormResponse>;
        if (
          parsed.$formspecResponse !== '1.0'
          || parsed.definitionUrl !== definitionUrl
          || parsed.definitionVersion !== value.definitionVersion
          || (parsed.status !== 'in-progress' && parsed.status !== 'completed' && parsed.status !== 'stopped')
        ) {
          abort();
          return;
        }
        if (key[2] === 'subject') {
          const subjectId = key[3];
          if (
            !isValidSubjectRecord(parsed.subject, subjectId)
            || !subjectIdMatches(parsed.subject, subjectId)
          ) {
            abort();
            return;
          }
          if (
            value.subject !== undefined && (
              !isValidSubjectRecord(value.subject, subjectId)
              || value.subject.type !== parsed.subject.type
              || !deepEqual(value.subject.keys, parsed.subject.keys)
            )
          ) {
            abort();
            return;
          }
          let quarantined = false;
          if (startEntry) {
            if (
              startEntry.subject.type !== parsed.subject.type
              || !deepEqual(startEntry.subject.keys, parsed.subject.keys)
            ) {
              abort();
              return;
            }
            const historyStatus = classifyStartHistory(
              serializedKey, startEntry, editableVersion, parsed.subject, knownDefinition,
            );
            if (historyStatus === 'abort') {
              abort();
              return;
            }
            if (historyStatus === 'quarantine') quarantined = true;
          }
          if (quarantined && !value.unverifiedStartHistory) {
            editableStore.put({ ...value, unverifiedStartHistory: true as const }, key);
          }
          editableByKey.set(serializedKey, {
            key,
            definitionVersion: value.definitionVersion,
            subject: parsed.subject,
            hasResponse: true,
            ...(quarantined ? { unverifiedStartHistory: true } : {}),
          });
        } else {
          if (parsed.subject?.keys !== undefined) {
            abort();
            return;
          }
          editableByKey.set(serializedKey, {
            key,
            definitionVersion: value.definitionVersion,
            hasResponse: true,
          });
        }
      } else if (key[2] === 'subject') {
        const subjectId = key[3];
        let recovered: NonNullable<DraftKey['subject']> | undefined;
        if (value.subject !== undefined) {
          if (!isValidSubjectRecord(value.subject, subjectId) || !subjectIdMatches(value.subject, subjectId)) {
            abort();
            return;
          }
          recovered = value.subject;
        } else if (startEntry) {
          recovered = startEntry.subject;
        } else if (oldVersion >= 4 && seededKeys.has(serializedKey)) {
          // Only a restarted v4 seeded draft carrying its original `{ seeded: true }` marker
          // may recover its subject from fixtures/filings or remain unresolved across upgrade.
          recovered = fixtureSubjectsByDraftKey.get(serializedKey)
            ?? filingSubjectByDraftKey.get(serializedKey);
        } else {
          abort();
          return;
        }
        if (!recovered) {
          editableByKey.set(serializedKey, {
            key,
            definitionVersion: value.definitionVersion,
            hasResponse: false,
            unrecoveredSeededSubject: true,
          });
          cursor.continue();
          return;
        }
        let quarantined = false;
        if (startEntry) {
          if (
            startEntry.subject.type !== recovered.type
            || !deepEqual(startEntry.subject.keys, recovered.keys)
          ) {
            abort();
            return;
          }
          const historyStatus = classifyStartHistory(
            serializedKey, startEntry, editableVersion, recovered, knownDefinition,
          );
          if (historyStatus === 'abort') {
            abort();
            return;
          }
          if (historyStatus === 'quarantine') quarantined = true;
        }
        if (value.subject === undefined || (quarantined && !value.unverifiedStartHistory)) {
          editableStore.put({
            ...value,
            subject: structuredClone(recovered),
            ...(quarantined ? { unverifiedStartHistory: true as const } : {}),
          }, key);
        }
        editableByKey.set(serializedKey, {
          key,
          definitionVersion: value.definitionVersion,
          subject: recovered,
          hasResponse: false,
          ...(quarantined ? { unverifiedStartHistory: true } : {}),
        });
      } else {
        editableByKey.set(serializedKey, {
          key,
          definitionVersion: value.definitionVersion,
          hasResponse: false,
        });
      }
      cursor.continue();
    };
  }

  function scanLegacySummaries() {
    const cursorRequest = summariesStore.openCursor();
    cursorRequest.onerror = abort;
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        loadEditable();
        return;
      }
      const key = cursor.key;
      const value = cursor.value as Record<string, unknown> | undefined;
      if (
        isValidDraftStorageKey(key)
        && value && typeof value === 'object' && !Array.isArray(value)
        && !Object.hasOwn(value, 'plans')
        && Object.hasOwn(value, 'summary')
      ) {
        legacySummaryKeys.add(JSON.stringify(key));
      }
      cursor.continue();
    };
  }

  function loadStarts() {
    const cursorRequest = startsStore.openCursor();
    cursorRequest.onerror = abort;
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        scanLegacySummaries();
        return;
      }
      const key = cursor.key;
      const value = cursor.value as Partial<StartAttempt> | undefined;
      if (
        !Array.isArray(key) || key.length !== 2
        || typeof key[0] !== 'string' || key[0].length === 0
        || typeof key[1] !== 'string' || key[1].length === 0
        || !value || typeof value !== 'object' || Array.isArray(value)
        || typeof value.request !== 'string' || value.request.length === 0
        || !isValidSubjectRecord(value.subject)
        || !subjectIdMatches(value.subject, value.subject.id)
      ) {
        abort();
        return;
      }
      let parsedRequest: unknown;
      try {
        parsedRequest = parseJsonExact(value.request);
      } catch {
        abort();
        return;
      }
      if (!isPlainJsonObject(parsedRequest)) {
        abort();
        return;
      }
      const record = parsedRequest;
      const recordKeys = Object.keys(record);
      if (
        recordKeys.length !== 4
        || typeof record.definitionUrl !== 'string' || record.definitionUrl.length === 0
        || typeof record.version !== 'string' || record.version.length === 0
        || record.type !== value.subject.type
        || !isPlainJsonObject(record.keys)
      ) {
        abort();
        return;
      }
      const suppliedKeys = record.keys;
      for (const [parentKey, parentValue] of Object.entries(suppliedKeys)) {
        if (
          (typeof parentValue !== 'string' && !(typeof parentValue === 'number' && Number.isSafeInteger(parentValue)))
          || !Object.hasOwn(value.subject.keys, parentKey)
          || value.subject.keys[parentKey] !== parentValue
        ) {
          abort();
          return;
        }
      }
      if (Object.keys(suppliedKeys).length >= Object.keys(value.subject.keys).length) {
        abort();
        return;
      }
      if (
        value.request !== canonicalFiniteJson({
          definitionUrl: record.definitionUrl,
          version: record.version,
          type: record.type,
          keys: suppliedKeys as Record<string, string | number>,
        })
      ) {
        abort();
        return;
      }
      const startSubject = value.subject;
      const knownDefinition = key[0] === scope ? definitions.get(record.definitionUrl) : undefined;
      if (knownDefinition && knownDefinition.version === record.version) {
        if (
          !isValidVersionForAlgorithm(record.version, knownDefinition.versionAlgorithm)
          || !knownDefinition.subject
          || !matchesDeclaredMintedSubject(startSubject, knownDefinition.subject, suppliedKeys)
        ) {
          abort();
          return;
        }
      }
      const draftStorageKey = JSON.stringify([key[0], record.definitionUrl, 'subject', value.subject.id]);
      const prior = startByDraftKey.get(draftStorageKey);
      if (prior) {
        if (prior.subject.type !== value.subject.type || !deepEqual(prior.subject.keys, value.subject.keys)) {
          abort();
          return;
        }
        prior.versions.push(record.version);
      } else {
        startByDraftKey.set(draftStorageKey, { subject: value.subject, versions: [record.version] });
      }
      cursor.continue();
    };
  }

  function loadFilings() {
    const filingsCursor = filingsStore.openCursor();
    filingsCursor.onerror = abort;
    filingsCursor.onsuccess = () => {
      const cursor = filingsCursor.result;
      if (!cursor) {
        loadStarts();
        return;
      }
      const key = cursor.key;
      const value = cursor.value as Partial<ResponseFiling> | undefined;
      if (
        !Array.isArray(key) || key.length !== 2
        || typeof key[0] !== 'string' || key[0].length === 0
        || typeof key[1] !== 'string' || key[1].length === 0
        || !value || typeof value !== 'object'
        || !value.key || typeof value.key.scope !== 'string' || value.key.scope.length === 0
        || typeof value.key.definitionUrl !== 'string' || value.key.definitionUrl.length === 0
        || value.key.scope !== key[0]
        || typeof value.definitionVersion !== 'string' || value.definitionVersion.length === 0
        || typeof value.responseId !== 'string' || value.responseId !== key[1]
        || typeof value.responseHash !== 'string' || !SHA256_DIGEST.test(value.responseHash)
        || typeof value.responseJson !== 'string' || value.responseJson.length === 0
        || (value.sample !== 'preview-submit' && value.sample !== 'fixture')
      ) {
        abort();
        return;
      }
      let parsedRaw: unknown;
      try {
        parsedRaw = parseJsonExact(value.responseJson);
      } catch {
        abort();
        return;
      }
      if (!isPlainJsonObject(parsedRaw)) {
        abort();
        return;
      }
      const parsed = parsedRaw as Partial<FormResponse>;
      if (
        parsed.$formspecResponse !== '1.0'
        || parsed.status !== 'completed'
        || parsed.id !== value.responseId
        || parsed.definitionUrl !== value.key.definitionUrl
        || parsed.definitionVersion !== value.definitionVersion
        || typeof parsed.authored !== 'string' || parsed.authored.length === 0
        || (value.authored !== undefined && value.authored !== parsed.authored)
      ) {
        abort();
        return;
      }
      if (value.key.subject !== undefined) {
        if (
          !isValidSubjectRecord(value.key.subject)
          || !isValidSubjectRecord(parsed.subject, value.key.subject.id)
          || parsed.subject.type !== value.key.subject.type
          || !deepEqual(parsed.subject.keys, value.key.subject.keys)
          || !subjectIdMatches(parsed.subject, value.key.subject.id)
        ) {
          abort();
          return;
        }
      } else if (parsed.subject?.keys !== undefined) {
        abort();
        return;
      }
      const knownDefinition = value.key.scope === scope ? definitions.get(value.key.definitionUrl) : undefined;
      // Use the current Definition's subject declaration only when it matches the filing's recorded version;
      // historical filings written under an older Definition version verify against their stored subject identity.
      const upstreamSubject = knownDefinition && knownDefinition.version === value.definitionVersion
        ? knownDefinition.subject ?? null
        : value.key.subject
          ? inferredUpstreamSubject(value.key.subject)
          : null;
      let selected: ReturnType<ResponseRecordTools['selectResponses']>;
      try {
        selected = tools.selectResponses(
          [responseSelectionRecord(value.key, value.responseJson, 'filing')],
          {
            definition: { url: value.key.definitionUrl },
            status: 'completed',
            cardinality: 'latest',
            subject: [],
            pin: 'none',
          },
          {
            scope: value.key.scope,
            authorized: true,
            source: 'catalog',
            upstreamSubject,
            projection: [],
          },
        );
      } catch {
        abort();
        return;
      }
      const verifiedHash = selected.status === 'available' && selected.records.length === 1
        ? selected.records[0]?.responseHash
        : undefined;
      if (!verifiedHash || verifiedHash !== value.responseHash) {
        abort();
        return;
      }
      if (value.key.subject) {
        filingSubjectByDraftKey.set(
          JSON.stringify([value.key.scope, value.key.definitionUrl, 'subject', value.key.subject.id]),
          structuredClone(value.key.subject),
        );
      }
      const summary: ResponseFilingSummary = {
        key: structuredClone(value.key),
        definitionVersion: value.definitionVersion,
        responseId: value.responseId,
        responseHash: value.responseHash,
        authored: parsed.authored,
        sample: value.sample,
      };
      filingSummaryStore.put(summary, key);
      cursor.continue();
    };
  }

  const seedsCursor = seedsStore.openCursor();
  seedsCursor.onerror = abort;
  seedsCursor.onsuccess = () => {
    const cursor = seedsCursor.result;
    if (!cursor) {
      loadFilings();
      return;
    }
    const key = cursor.key;
    const value = cursor.value as Partial<SeedMarker> | undefined;
    if (
      !isValidDraftStorageKey(key)
      || !isPlainJsonObject(value)
      || Object.keys(value).length !== 1
      || value.seeded !== true
    ) {
      abort();
      return;
    }
    seededKeys.add(JSON.stringify(key));
    cursor.continue();
  };
}

  const transaction: RunTransaction = async (stores, mode, work) => {
    const tools = await previewResponseRecordTools();
    const request = indexedDB.open(databaseName, 5);
    request.onupgradeneeded = event => {
      const db = request.result;
      for (const store of ['editable', 'summaries', 'filings', 'starts', 'seeds', 'filingSummaries']) {
        if (event.oldVersion >= 2 && db.objectStoreNames.contains(store)) continue;
        if (db.objectStoreNames.contains(store)) db.deleteObjectStore(store);
        db.createObjectStore(store);
      }
      if (event.oldVersion >= 2 && event.oldVersion < 5 && request.transaction) {
        upgradeLegacyStores(request.transaction, event.oldVersion, tools, options);
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
        addFiling: (key, value) => {
          tx.objectStore('filings').add(value, key);
          tx.objectStore('filingSummaries').add(toResponseFilingSummary(value), key);
        },
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
  let entries: Entries = { editable: [], summaries: [], filings: [], starts: [], seeds: [], filingSummaries: [] };
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
          data.filingSummaries.push(structuredClone({ id, value: toResponseFilingSummary(value) }));
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
  }, () => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // Isolate subscriber errors from readiness, writes, and sibling listeners.
      }
    }
  });
}
