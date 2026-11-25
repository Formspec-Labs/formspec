/** @filedesc Retain editable draft sessions across browser history and qualify all access by key. */
import {
  createFormEngine, initFormspecEngine, responseSubjectId,
  type ActionRefFinding, type FormDraftSnapshot, type IFormEngine,
} from '@formspec-org/engine';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { resolvePageSequence, type PageSequenceEntry, type ProgressCounts } from '@formspec-org/layout';
import type {
  BrowserDraftPort, DataSourceSubject, DraftKey, DraftLoadResult, DraftPort, DraftRecord, DraftSaveInput,
  FilingLoadResult, FilingProgressCounts, MatchedFilingObservation,
} from '@formspec-org/surface';
import { definitionResponseRequests, resolveDefinitionReads, responseDeliveries, type DraftDefinitionResponsePort } from './definition-response-reads.js';
import { readSubmitEvaluation, summarizeDraftProgress } from './draft-progress.js';
import type { FormDefinition, FormResponse, ResponseSelector } from '@formspec-org/types';
import {
  createDraftWriter, readCommittedExplanationsAtRevision,
  type CommittedExplanationsReadback, type DraftCheckpointPorts, type DraftNoticeReporter, type DraftWriter,
} from './draft-writer.js';
import type { SurfaceDefinitionFormRenderInput } from './SurfaceSlot.js';

export interface SurfaceDraftStorage {
  port: DraftPort & Partial<DraftDefinitionResponsePort>;
  responses?: ResponseSelector | undefined;
  definitions?: ReadonlyMap<string, FormDefinition> | undefined;
  scope: string;
  author?: { id: string; name?: string };
}

/** Key a draft by Core's filing-unit id; runtime WASM only. */
export async function deriveDraftSubject(subject: DataSourceSubject | undefined): Promise<DraftKey['subject']> {
  if (!subject) return undefined;
  await initFormspecEngine();
  return { ...subject, id: responseSubjectId(subject.type, subject.keys) };
}

export type FiledObservation = Extract<MatchedFilingObservation, { receiptRef: string }>;

type CommittedDraft =
  | { status: 'loaded'; response: FormResponse; pins?: DraftRecord['pins']; revision: string; key: DraftKey }
  | { status: 'initialized' | 'absent' | 'denied' | 'version-mismatch' | 'unavailable' | 'save-failed' };

type CommittedFiling =
  | { status: 'loaded'; response: FormResponse; definitionVersion: string; observation: FiledObservation; key: DraftKey }
  | { status: 'absent' | 'denied' | 'unavailable' };

type DraftOpen =
  | { status: 'ready'; engine: IFormEngine; writer: DraftWriter; filing?: FiledObservation }
  | { status: 'filed'; filing: FiledObservation; response: FormResponse; canRevise: boolean }
  | (Extract<DraftLoadResult, { status: 'version-mismatch' }> & { key: DraftKey })
  | { status: 'pin-unavailable'; instance: string; prerequisiteTitle?: string; requiresAccepted?: boolean }
  | { status: 'denied' | 'unavailable' | 'loading' };

type Entry = {
  consumers: Map<DraftNoticeReporter, (() => void) | undefined>;
  findingListeners: Set<(finding: ActionRefFinding) => void>;
  result: Promise<DraftOpen>;
  seed: Pick<SurfaceDefinitionFormRenderInput, 'initialData' | 'draftSeed'>;
  actions: SurfaceDefinitionFormRenderInput['responseActionsDocument'];
  opened?: DraftOpen;
  autosaveFinding?: ActionRefFinding | undefined;
};

function sessionKey(key: DraftKey, version: string): string {
  return JSON.stringify([key.scope, key.definitionUrl, key.subject?.id ?? null, version]);
}

function progressCounts({ total, filled, toFix, toCheck }: ProgressCounts): FilingProgressCounts {
  return { total, filled, toFix, toCheck };
}

export function createDraftSession(
  storage: SurfaceDraftStorage, browserPort?: BrowserDraftPort, checkpointPorts?: DraftCheckpointPorts,
) {
  const entries = new Map<string, Entry>();
  const commitEpoch = new Map<string, number>();
  const pendingReviews = new Map<string, Promise<void>>();
  const lifetime = new AbortController();

  async function load(key: DraftKey, version: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const result = await storage.port.load(key, version, signal);
    signal.throwIfAborted();
    return result;
  }

  async function resolveReads(
    definition: FormDefinition, key: DraftKey, pins: DraftRecord['pins'] | undefined,
    expectedRevision: string | null | undefined, signal: AbortSignal,
  ): Promise<{ deliveries: DraftRecord['pins']; scoped?: boolean; missingPrerequisite?: string }> {
    if (expectedRevision !== undefined && storage.port.selectDefinitionResponses) {
      const result = await storage.port.selectDefinitionResponses({ key, definitionVersion: definition.version, expectedRevision }, signal);
      signal.throwIfAborted();
      if (result.status === 'resolved') return { deliveries: responseDeliveries(result.outcomes), scoped: true,
        ...(result.missingPrerequisite && { missingPrerequisite: result.missingPrerequisite }) };
      if (result.status === 'conflict') throw new Error('Draft changed before response instances could be read.');
      if (result.status !== 'unconfigured') return { deliveries: {}, scoped: true };
    }
    return { deliveries: await resolveDefinitionReads(storage.responses, definitionResponseRequests(definition, key, pins), signal) };
  }

  async function loadFilingRecord(key: DraftKey, version: string, signal: AbortSignal): Promise<FilingLoadResult> {
    if (!storage.port.loadFiling) return { status: 'absent' };
    signal.throwIfAborted();
    const result = await storage.port.loadFiling(key, version, signal);
    signal.throwIfAborted();
    return result;
  }

  function release(entry: Entry) {
    if (entry.consumers.size === 0 && entry.opened?.status === 'ready') entry.opened.writer.setMounted(false);
  }

  function disposeEntry(entry: Entry) {
    if (entry.opened?.status === 'ready') {
      entry.opened.writer.dispose();
      entry.opened.engine.dispose();
    }
  }

  return {
    scope: storage.scope,
    port: storage.port,
    definitions: storage.definitions,
    restart: browserPort?.restart,

    acquire(
      key: DraftKey,
      input: SurfaceDefinitionFormRenderInput,
      report: DraftNoticeReporter,
      onReopen?: () => void,
      options?: { allowReviseFiled?: boolean },
    ) {
      const definition = input.plan.definition;
      const id = sessionKey(key, definition.version);
      let entry = entries.get(id);
      const previous = entry?.opened;
      const previousConsumers = entry?.consumers;
      if (entry && previous && (
        (previous.status === 'filed' && options?.allowReviseFiled) ||
        (entry.consumers.size === 0 && (previous.status !== 'ready' || !previous.writer.dirty))
      )) {
        entries.delete(id);
        entry = undefined;
      }
      if (!entry) {
        let pendingReusable = previous?.status === 'ready' ? previous : undefined;
        const disposeReusable = () => {
          if (!pendingReusable) return;
          pendingReusable.writer.dispose();
          pendingReusable.engine.dispose();
          pendingReusable = undefined;
        };
        const consumers = previousConsumers ?? new Map<DraftNoticeReporter, (() => void) | undefined>();
        const findingListeners = new Set<(finding: ActionRefFinding) => void>();
        const created: Entry = {
          consumers,
          findingListeners,
          seed: { initialData: input.initialData, draftSeed: input.draftSeed },
          actions: input.responseActionsDocument,
          result: undefined as unknown as Promise<DraftOpen>,
        };
        const publish = (result: DraftOpen): DraftOpen => {
          created.opened = result;
          if (lifetime.signal.aborted) disposeEntry(created);
          else if (result.status === 'ready') result.writer.setMounted(consumers.size > 0);
          return result;
        };
        const opened = async (): Promise<DraftOpen> => {
          let epoch = commitEpoch.get(id) ?? 0;
          let loaded: DraftLoadResult;
          let draft: DraftRecord | undefined;
          let response: FormResponse | undefined;
          let draftSnapshot: FormDraftSnapshot | undefined;
          let resolutions: Awaited<ReturnType<typeof resolveDefinitionReads>>;
          while (true) {
            try {
              loaded = await load(key, definition.version, lifetime.signal);
            } catch (error) {
              disposeReusable();
              throw error;
            }
            const afterLoadEpoch = commitEpoch.get(id) ?? 0;
            if (afterLoadEpoch !== epoch) {
              epoch = afterLoadEpoch;
              disposeReusable();
              continue;
            }
            draft = loaded.status === 'loaded' ? loaded.draft : undefined;
            if (pendingReusable) {
              if (draft && draft.revision === pendingReusable.writer.revision &&
                  !Object.values(definition.instances ?? {}).some(instance => instance.response)) {
                const reused = pendingReusable;
                pendingReusable = undefined;
                const nextFinding = reused.writer.setActions(created.actions);
                created.autosaveFinding = nextFinding;
                if (nextFinding) {
                  for (const notifyFinding of findingListeners) notifyFinding(nextFinding);
                }
                return publish(reused);
              }
              disposeReusable();
            }
            if (loaded.status === 'version-mismatch') return publish({ ...loaded, key });
            if (loaded.status === 'denied' || loaded.status === 'unavailable') return publish({ status: loaded.status });
            const isMinted = Object.values(definition.subject?.keys ?? {}).some(field => field.minted);
            const filedLookup = await loadFilingRecord(key, definition.version, lifetime.signal).catch(
              (): FilingLoadResult => ({ status: 'absent' }),
            );
            const afterFilingEpoch = commitEpoch.get(id) ?? 0;
            if (afterFilingEpoch !== epoch) {
              epoch = afterFilingEpoch;
              continue;
            }
            const loadedFiling = filedLookup.status === 'loaded' ? filedLookup.filing : undefined;
            const filedResponse = loadedFiling ? parseJsonExact(loadedFiling.responseJson) as FormResponse : undefined;
            const filingObservation = loadedFiling?.observation;

            if (loaded.status === 'absent') {
              if (filedResponse && filingObservation) {
                const terminalStatus =
                  filingObservation.status === 'filed'
                  || filingObservation.status === 'accepted'
                  || filingObservation.status === 'closed-without-acceptance';
                const canInitializeRevision = isMinted && !!browserPort?.initializeRevision
                  && loadedFiling?.definitionVersion === definition.version
                  && (filingObservation.status === 'returned' || filingObservation.status === 'reopened');
                if (canInitializeRevision && browserPort?.initializeRevision
                  && options?.allowReviseFiled && previous?.status === 'filed') {
                  const result = await browserPort.initializeRevision(key, definition.version, previous.filing, lifetime.signal);
                  if (result.status !== 'initialized') {
                    return publish({ status: result.status === 'denied' ? 'denied' : 'unavailable' });
                  }
                  continue;
                }
                if (isMinted || (terminalStatus && !options?.allowReviseFiled)) {
                  return publish({
                    status: 'filed',
                    filing: filingObservation,
                    response: filedResponse,
                    canRevise: canInitializeRevision || (!isMinted && filingObservation.status !== 'closed-without-acceptance'),
                  });
                }
              } else if (isMinted) {
                return publish({ status: 'unavailable' });
              }
            }
            const seed = created.seed;
            if (!draft && !filedResponse && seed.draftSeed) return publish({ status: seed.draftSeed });
            response = draft && parseJsonExact(draft.responseJson) as FormResponse;
            draftSnapshot = draft && parseJsonExact(draft.snapshotJson) as FormDraftSnapshot;
            const pins = loaded.status === 'initialized' ? loaded.pins : draft?.pins;
            const requests = definitionResponseRequests(definition, key, pins);
            const expectedRevision = loaded.status === 'initialized' ? loaded.revision : draft?.revision ?? null;
            const read = await resolveReads(definition, key, pins, expectedRevision, lifetime.signal);
            resolutions = read.deliveries;
            const afterReadsEpoch = commitEpoch.get(id) ?? 0;
            if (afterReadsEpoch !== epoch) {
              epoch = afterReadsEpoch;
              continue;
            }
            if (loaded.status === 'absent' && !filedResponse && (storage.responses || read.scoped)) {
              const missingPin = requests.find(req => req.selection.pin === 'at-open' && !resolutions[req.key]?.pinned);
              if (missingPin || read.missingPrerequisite) {
                const upstreamTitle = missingPin && storage.definitions?.get(missingPin.selection.definition.url)?.title;
                const requiresAccepted = Boolean(missingPin?.selection.disposition?.endsWith(':accepted'));
                return publish({
                  status: 'pin-unavailable',
                  instance: missingPin?.key ?? read.missingPrerequisite!,
                  ...(upstreamTitle ? { prerequisiteTitle: upstreamTitle } : {}),
                  ...(requiresAccepted ? { requiresAccepted: true } : {}),
                });
              }
            }
            const hydrationData = !draftSnapshot
              ? (filedResponse?.data ?? seed.initialData?.data)
              : undefined;
            const savedExplanations = response?.explanations ?? (!draftSnapshot ? filedResponse?.explanations : undefined);
            const engine = createFormEngine(definition, {
              responseInstanceResolutions: resolutions,
              ...(key.subject && { responseSubject: key.subject }),
              ...(draftSnapshot && { draftSnapshot }),
              ...(savedExplanations && { savedExplanations }),
              ...(hydrationData !== undefined && {
                responseData: hydrationData as Parameters<IFormEngine['loadResponseData']>[0],
              }),
            });
            if (engine.hasSubjectRefusal()) {
              engine.dispose();
              return publish({ status: 'unavailable' });
            }
            try {
              const writer = createDraftWriter({
                engine, key, draft, port: storage.port,
                initializedRevision: loaded.status === 'initialized' ? loaded.revision : undefined,
                creationPins: Object.fromEntries(Object.entries(resolutions).filter(([, delivery]) => delivery.pinned)),
                responseId: response?.id ?? input.semanticControlScope?.responseId,
                author: storage.author ?? response?.author,
                locally: browserPort !== undefined,
                sections: resolvePageSequence(definition, {
                  ...(input.componentDocument ? { component: input.componentDocument } : {}),
                  ...(input.grant.themeDocument ? { theme: input.grant.themeDocument } : {}),
                }),
                actions: created.actions,
                invoker: input.responseActionInvoker,
                checkpointPorts,
                waitForReview: () => pendingReviews.get(id),
                report: (notice, options) => { for (const notify of consumers.keys()) notify(notice, options); },
                onActionFinding: (finding) => {
                  created.autosaveFinding = finding;
                  for (const notifyFinding of findingListeners) notifyFinding(finding);
                },
              });
              // Recheck synchronously with zero intervening microtasks before publishing created.opened.
              const beforePublishEpoch = commitEpoch.get(id) ?? 0;
              if (beforePublishEpoch !== epoch) {
                writer.dispose();
                engine.dispose();
                epoch = beforePublishEpoch;
                continue;
              }
              return publish({
                status: 'ready',
                engine,
                writer,
                ...(filingObservation ? { filing: filingObservation } : {}),
              });
            } catch (error) {
              engine.dispose();
              throw error;
            }
          }
        };
        created.result = opened().catch((): DraftOpen => publish({ status: 'unavailable' }));
        entries.set(id, created);
        entry = created;
      }

      const tracked = entry;
      const actionsChanged = tracked.actions !== input.responseActionsDocument;
      tracked.actions = input.responseActionsDocument;
      if (tracked.consumers.size === 0) {
        tracked.seed = { initialData: input.initialData, draftSeed: input.draftSeed };
      }
      tracked.consumers.set(report, onReopen);
      const onActionFinding = input.onActionFinding;
      if (onActionFinding) {
        tracked.findingListeners.add(onActionFinding);
      }
      if (tracked.opened?.status === 'ready') {
        if (actionsChanged) {
          const nextFinding = tracked.opened.writer.setActions(tracked.actions);
          tracked.autosaveFinding = nextFinding;
          if (nextFinding) {
            for (const notifyFinding of tracked.findingListeners) notifyFinding(nextFinding);
          }
        } else if (onActionFinding && tracked.autosaveFinding) {
          onActionFinding(tracked.autosaveFinding);
        }
        tracked.opened.writer.setMounted(true);
      } else if (onActionFinding && tracked.autosaveFinding) {
        onActionFinding(tracked.autosaveFinding);
      }
      return {
        result: tracked.result,
        setActions(nextActions: SurfaceDefinitionFormRenderInput['responseActionsDocument']) {
          if (tracked.actions === nextActions && tracked.opened?.status !== 'ready') {
            return tracked.autosaveFinding;
          }
          tracked.actions = nextActions;
          if (tracked.opened?.status === 'ready') {
            if (tracked.opened.writer.actions === nextActions) {
              return tracked.autosaveFinding;
            }
            const nextFinding = tracked.opened.writer.setActions(nextActions);
            tracked.autosaveFinding = nextFinding;
            return nextFinding;
          }
          return undefined;
        },
        release() {
          tracked.consumers.delete(report);
          if (onActionFinding) tracked.findingListeners.delete(onActionFinding);
          release(tracked);
        },
      };
    },

    async readCommitted(
      definition: { url: string; version: string }, subject: DataSourceSubject | undefined,
      options?: { afterPendingSaves?: boolean; signal?: AbortSignal },
    ): Promise<CommittedDraft> {
      try {
        const signal = options?.signal ? AbortSignal.any([lifetime.signal, options.signal]) : lifetime.signal;
        signal.throwIfAborted();
        const key = { scope: storage.scope, definitionUrl: definition.url, subject: await deriveDraftSubject(subject) };
        if (options?.afterPendingSaves) {
          const id = sessionKey(key, definition.version);
          while (pendingReviews.has(id)) await pendingReviews.get(id);
          const entry = await entries.get(id)?.result;
          if (entry?.status === 'ready' && !await entry.writer.waitForSaves()) return { status: 'save-failed' };
        }
        const result = await load(key, definition.version, signal);
        if (result.status !== 'loaded') return { status: result.status };
        const response = parseJsonExact(result.draft.responseJson) as FormResponse;
        return { status: 'loaded', response, pins: result.draft.pins, revision: result.draft.revision, key };
      } catch {
        return { status: 'unavailable' };
      }
    },

    async readFiling(
      definition: { url: string; version: string }, subject: DataSourceSubject | undefined,
      options?: { signal?: AbortSignal },
    ): Promise<CommittedFiling> {
      try {
        const signal = options?.signal ? AbortSignal.any([lifetime.signal, options.signal]) : lifetime.signal;
        signal.throwIfAborted();
        const key = { scope: storage.scope, definitionUrl: definition.url, subject: await deriveDraftSubject(subject) };
        const result = await loadFilingRecord(key, definition.version, signal);
        if (result.status !== 'loaded') return { status: result.status };
        const response = parseJsonExact(result.filing.responseJson) as FormResponse;
        return {
          status: 'loaded',
          response,
          definitionVersion: result.filing.definitionVersion,
          observation: result.filing.observation,
          key,
        };
      } catch {
        return { status: 'unavailable' };
      }
    },

    async resolveReads(
      definition: FormDefinition,
      key: DraftKey,
      pins: DraftRecord['pins'] | undefined,
      signal?: AbortSignal,
      expectedRevision?: string | null,
    ) {
      const mergedSignal = signal ? AbortSignal.any([lifetime.signal, signal]) : lifetime.signal;
      return (await resolveReads(definition, key, pins, expectedRevision, mergedSignal)).deliveries;
    },

    async acknowledgeWarningGroup({
      definition,
      subject,
      expectedRevision,
      expectedBasis,
      code,
      sections = [],
      report,
    }: {
      definition: FormDefinition;
      subject: DataSourceSubject | undefined;
      expectedRevision: string;
      expectedBasis: string;
      code: string;
      sections?: readonly PageSequenceEntry[] | undefined;
      report?: DraftNoticeReporter | undefined;
    }): Promise<'saved' | 'mismatch' | 'failed'> {
      try {
        lifetime.signal.throwIfAborted();
        if (!expectedBasis) {
          report?.('draftConflict');
          return 'mismatch';
        }
        const key: DraftKey = { scope: storage.scope, definitionUrl: definition.url, subject: await deriveDraftSubject(subject) };
        const id = sessionKey(key, definition.version);
        let releaseReview!: () => void;
        let reviewPromise!: Promise<void>;
        while (true) {
          lifetime.signal.throwIfAborted();
          const priorReview = pendingReviews.get(id);
          if (priorReview) {
            await priorReview;
            continue;
          }
          const existing = entries.get(id);
          if (existing) {
            const opened = await existing.result;
            if (pendingReviews.has(id) || entries.get(id) !== existing) continue;
            if (opened.status === 'ready') {
              const saved = await opened.writer.waitForSaves();
              if (pendingReviews.has(id) || entries.get(id) !== existing) continue;
              if (!saved) {
                report?.('saveFailed');
                return 'failed';
              }
              if (opened.writer.dirty || opened.writer.conflict) {
                // Preserve unsaved edits in the retained writer; never commit unshown changes from review.
                report?.('draftConflict');
                return 'mismatch';
              }
              if (opened.writer.revision !== expectedRevision) {
                if (existing.consumers.size === 0) {
                  entries.delete(id);
                  disposeEntry(existing);
                } else {
                  report?.('draftConflict');
                  return 'mismatch';
                }
              }
            }
          }
          // Reserve this draft's review turn synchronously before loading storage so neither an
          // overlapping review nor a local Save/autosave can race against expectedRevision.
          reviewPromise = new Promise<void>(resolve => { releaseReview = resolve; });
          pendingReviews.set(id, reviewPromise);
          break;
        }
        try {
          const loaded = await load(key, definition.version, lifetime.signal);
          if (loaded.status !== 'loaded') {
            report?.('saveFailed');
            return 'failed';
          }
          if (loaded.draft.revision !== expectedRevision) {
            const stale = entries.get(id);
            if (stale && stale.opened?.status === 'ready' && !stale.opened.writer.dirty && stale.consumers.size === 0) {
              entries.delete(id);
              disposeEntry(stale);
            }
            report?.('draftConflict');
            return 'mismatch';
          }
          const response = parseJsonExact(loaded.draft.responseJson) as FormResponse;
          const rawSnapshot = parseJsonExact(loaded.draft.snapshotJson);
          const draftSnapshot = rawSnapshot && typeof rawSnapshot === 'object' && !Array.isArray(rawSnapshot)
            && 'definitionUrl' in rawSnapshot && 'definitionVersion' in rawSnapshot && 'data' in rawSnapshot
            ? (rawSnapshot as FormDraftSnapshot)
            : undefined;
          const { deliveries: resolutions } = await resolveReads(definition, key, loaded.draft.pins, expectedRevision, lifetime.signal);
          // Save strictly from an isolated engine at expectedRevision so edits typed concurrently on a form consumer
          // are never flushed prematurely or discarded on storage conflict/failure.
          const engine = createFormEngine(definition, {
            responseInstanceResolutions: resolutions,
            loadExternalSources: false,
            ...(key.subject && { responseSubject: key.subject }),
            ...(draftSnapshot
              ? { draftSnapshot }
              : { savedResponseData: response.data as FormDraftSnapshot['data'] }),
            ...(response.explanations && { savedExplanations: response.explanations }),
          });
          try {
            if (engine.hasSubjectRefusal()) {
              report?.('saveFailed');
              return 'failed';
            }
            const baseExplanations = engine.getExplanationEntries();
            if (!engine.acknowledge(code, { expectedBasis })) {
              report?.('draftConflict');
              return 'mismatch';
            }
            const currentExplanations = engine.getExplanationEntries();
            const progress = summarizeDraftProgress(sections, readSubmitEvaluation(engine));
            const placements = sections.map(({ id: sectionId, fields }) => ({
              ...(sectionId === undefined ? {} : { id: sectionId }),
              fields,
            }));
            const resolvedAuthor = storage.author ?? response.author;
            // Preserve all non-edited reviewed Response metadata (displayedLocale, displayedIssuer, id, subject, data)
            // while resetting mutable draft envelope fields to an editable in-progress draft.
            const { validationResults: _validationResults, authoredSignatures: _authoredSignatures, ...preservedResponse } = response;
            const nextResponse: FormResponse = {
              ...preservedResponse,
              status: 'in-progress',
              authored: new Date().toISOString(),
              ...(resolvedAuthor ? { author: resolvedAuthor } : {}),
            };
            const baseSnapshot = draftSnapshot ?? engine.getDraftSnapshot();
            const persistedSnapshot = { ...baseSnapshot, explanations: currentExplanations };
            const saveInput: DraftSaveInput = {
              key,
              definitionVersion: definition.version,
              expectedRevision,
              explanations: currentExplanations,
              snapshotJson: JSON.stringify(persistedSnapshot),
              responseJson: JSON.stringify(nextResponse),
              summary: {
                sections: placements,
                progress: {
                  status: 'current',
                  form: { ...progressCounts(progress.form), ready: progress.form.ready },
                  sections: Object.fromEntries(progress.sections.flatMap(({ id: sectionId, counts: values }) =>
                    sectionId === undefined ? [] : [[sectionId, progressCounts(values)]])),
                },
              },
            };
            const saveResult = await storage.port.save(saveInput);
            if (saveResult.status === 'saved') {
              commitEpoch.set(id, (commitEpoch.get(id) ?? 0) + 1);
              const initialLive = entries.get(id);
              if (initialLive && initialLive.opened?.status === 'ready' && !initialLive.opened.writer.dirty) {
                report?.(browserPort !== undefined ? 'savedLocally' : 'saved');
                // Live writer stayed clean during the review save; evict/reopen it so it reflects the new revision and stamps.
                const reopeners = [...initialLive.consumers.values()];
                entries.delete(id);
                disposeEntry(initialLive);
                for (const reopen of reopeners) reopen?.();
                return 'saved';
              }
              let readback: CommittedExplanationsReadback | undefined;
              if (initialLive && initialLive.opened?.status === 'ready') {
                readback = saveResult.explanations !== undefined
                  ? { status: 'loaded', explanations: saveResult.explanations }
                  : await readCommittedExplanationsAtRevision(
                    storage.port,
                    key,
                    definition.version,
                    saveResult.revision,
                    lifetime.signal,
                  );
              }
              const live = entries.get(id);
              if (live && live.opened?.status === 'ready') {
                if (!live.opened.writer.dirty) {
                  report?.(browserPort !== undefined ? 'savedLocally' : 'saved');
                  const reopeners = [...live.consumers.values()];
                  entries.delete(id);
                  disposeEntry(live);
                  for (const reopen of reopeners) reopen?.();
                } else if (readback?.status === 'loaded') {
                  report?.(browserPort !== undefined ? 'savedLocally' : 'saved');
                  // 3-way merge committed revision and server-stamped explanations against the reviewed baseline
                  // so concurrent edits/deletions stay intact and save cleanly on the next flush.
                  live.opened.writer.applyCommittedReview(
                    expectedRevision,
                    saveResult.revision,
                    baseExplanations,
                    readback.explanations,
                  );
                } else if (readback?.status === 'unavailable') {
                  report?.(browserPort !== undefined ? 'savedLocally' : 'saved');
                  // Storage durably committed the review, but stamp readback failed transiently;
                  // require revision-matched readback on the dirty writer before its next write.
                  live.opened.writer.deferCommittedReview(
                    expectedRevision,
                    saveResult.revision,
                    baseExplanations,
                    currentExplanations,
                  );
                } else if (readback?.status === 'superseded') {
                  // Another session already advanced storage past our committed review revision;
                  // lock the dirty writer in conflict and retain our reviewed baseline for Keep recovery.
                  const surfaced = live.opened.writer.supersedeCommittedReview(
                    expectedRevision,
                    saveResult.revision,
                    baseExplanations,
                    currentExplanations,
                  );
                  if (!surfaced || (report && !live.consumers.has(report))) {
                    report?.('draftConflict');
                  }
                } else {
                  report?.(browserPort !== undefined ? 'savedLocally' : 'saved');
                }
              } else {
                report?.(browserPort !== undefined ? 'savedLocally' : 'saved');
              }
              return 'saved';
            }
            const conflicted = saveResult.status === 'conflict' || saveResult.status === 'pin-unavailable';
            report?.(conflicted ? 'draftConflict' : 'saveFailed');
            if (conflicted) {
              const live = entries.get(id);
              if (live && live.opened?.status === 'ready' && !live.opened.writer.dirty && live.consumers.size === 0) {
                entries.delete(id);
                disposeEntry(live);
              }
              return 'mismatch';
            }
            return 'failed';
          } finally {
            engine.dispose();
          }
        } finally {
          if (pendingReviews.get(id) === reviewPromise) pendingReviews.delete(id);
          releaseReview();
        }
      } catch {
        report?.('saveFailed');
        return 'failed';
      }
    },

    async leave() {
      const results = await Promise.all([...entries.values()].filter(entry => entry.consumers.size > 0).map(async entry => {
        const opened = await entry.result;
        return opened.status !== 'ready' || await opened.writer.leave();
      }));
      return results.every(Boolean);
    },

    discardForReopen(writer: DraftWriter) {
      for (const [id, entry] of entries) {
        if (entry.opened?.status === 'ready' && entry.opened.writer === writer) {
          entries.delete(id);
          disposeEntry(entry);
          for (const reopen of entry.consumers.values()) reopen?.();
          break;
        }
      }
    },

    writerFor(key: DraftKey, version: string) {
      const opened = entries.get(sessionKey(key, version))?.opened;
      return opened?.status === 'ready' ? opened.writer : undefined;
    },

    syncActions(writer: DraftWriter, actions: SurfaceDefinitionFormRenderInput['responseActionsDocument']) {
      for (const entry of entries.values()) {
        if (entry.opened?.status === 'ready' && entry.opened.writer === writer) {
          if (entry.actions === actions && writer.actions === actions) {
            return entry.autosaveFinding;
          }
          entry.actions = actions;
          const nextFinding = writer.setActions(actions);
          entry.autosaveFinding = nextFinding;
          return nextFinding;
        }
      }
      return writer.actions === actions ? writer.autosaveFinding : writer.setActions(actions);
    },

    dispose() {
      lifetime.abort();
      for (const entry of entries.values()) disposeEntry(entry);
      entries.clear();
    },
  };
}

export type DraftSession = ReturnType<typeof createDraftSession>;
