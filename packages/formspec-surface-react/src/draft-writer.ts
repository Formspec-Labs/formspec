/** @filedesc Serialize checkpoints and fence filing actions against one editable form revision. */
import {
  deepEqual, invokeResponseActionAsync, planResponseActionEffects, preactReactiveRuntime,
  resolveAutosaveResponseAction, resolveResponseAction, resolveResponseActionValidationTuple,
  ResponseActionsPreconditionCatalog,
  type ActionRefFinding, type FormDraftSnapshot, type IFormEngine, type ResponseAction, type ResponseActionAsyncInvocationPorts,
  type ResponseActionEffectDispatchContext, type ResponseActionInvocationPorts, type ResponseActionInvocationResult,
} from '@formspec-org/engine';
import {
  type PageSequenceEntry, type ProgressCounts,
} from '@formspec-org/layout';
import { summarizeDraftProgress } from './draft-progress.js';
import { filingAction, type DraftFencedAction, type DraftKey, type DraftPort, type DraftRecord, type DraftSaveInput, type FilingProgressCounts } from '@formspec-org/surface';
export type { DraftFencedAction } from '@formspec-org/surface';
import type {
  ResponseActionInvokerInput, ResponseActionInvokerResult, ResponseActionsDocument, SubmitResult,
} from '@formspec-org/react';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import type { EffectRequest, FormResponse } from '@formspec-org/types';
import type { SurfaceSaveNotice } from './SurfaceSlot.js';

export type DraftNoticeReporter = (notice: SurfaceSaveNotice, options?: { focusConflict?: boolean }) => void;

export interface DraftWriterOptions {
  engine: IFormEngine;
  key: DraftKey;
  port: DraftPort;
  initializedRevision?: string | undefined;
  draft?: DraftRecord | undefined;
  creationPins?: DraftRecord['pins'];
  sections: readonly PageSequenceEntry[];
  actions?: ResponseActionsDocument | undefined;
  author?: { id: string; name?: string } | undefined;
  locally?: boolean | undefined;
  debounceMs?: number | undefined;
  report?: DraftNoticeReporter | undefined;
  onActionFinding?: ((finding: ActionRefFinding) => void) | undefined;
  invoker?: DraftActionInvoker | undefined;
  checkpointPorts?: DraftCheckpointPorts | undefined;
  responseId?: string | undefined;
  /** Wait for an in-flight session review save for this draft key before sending a local checkpoint. */
  waitForReview?: (() => Promise<void> | undefined) | undefined;
}

/** Pass the expected revision through to the durable Prepare, Sign or Submit operation. */
export interface SurfaceDraftFence {
  key: DraftKey;
  definitionVersion: string;
  revision: string;
  responseJson: string;
}

export type DraftActionInvokerResult<T> = ResponseActionInvokerResult<T> & {
  /** The revision committed by the operation when it advances the draft. */
  committedDraftRevision?: string;
};

export type DraftActionInvoker = (
  input: ResponseActionInvokerInput<SubmitResult> & { draftFence?: Readonly<SurfaceDraftFence> },
) => DraftActionInvokerResult<SubmitResult> | Promise<DraftActionInvokerResult<SubmitResult>>;

/** Supply host preconditions and non-save effects for checkpoint invocations. */
export type DraftCheckpointPorts = (
  input: ResponseActionInvokerInput<SubmitResult>,
) => ResponseActionAsyncInvocationPorts<SubmitResult>;

type DraftActionPorts = Omit<ResponseActionInvocationPorts<SubmitResult>, 'dispatchEffect'> & {
  dispatchEffect?: (
    effect: EffectRequest, detail: SubmitResult, action: ResponseAction,
    context: ResponseActionEffectDispatchContext & { draftFence?: Readonly<SurfaceDraftFence> },
  ) => ReturnType<NonNullable<ResponseActionInvocationPorts<SubmitResult>['dispatchEffect']>>;
};
type DraftActionInput = Omit<ResponseActionInvokerInput<SubmitResult>, 'ports'> & { ports: DraftActionPorts };

export function usesDraftCheckpoint(action: ResponseAction): boolean {
  try {
    return resolveResponseActionValidationTuple(action).persistence === 'draft-checkpoint';
  } catch {
    return false; // The action dispatcher reports its invalid tuple on invocation.
  }
}

type SavedExplanation = NonNullable<FormResponse['explanations']>[number];

export type CommittedExplanationsReadback =
  | { status: 'loaded'; explanations: readonly SavedExplanation[] }
  | { status: 'superseded' }
  | { status: 'unavailable' };

/** Read back stamped explanations from storage when a port returns a revision-only save reply. */
export async function readCommittedExplanationsAtRevision(
  port: DraftPort,
  key: DraftKey,
  definitionVersion: string,
  revision: string,
  signal?: AbortSignal,
): Promise<CommittedExplanationsReadback> {
  try {
    signal?.throwIfAborted();
    const reloaded = await port.load(key, definitionVersion, signal);
    signal?.throwIfAborted();
    if (reloaded.status === 'loaded') {
      if (reloaded.draft.revision !== revision) return { status: 'superseded' };
      const reloadedResponse = parseJsonExact(reloaded.draft.responseJson) as FormResponse;
      return { status: 'loaded', explanations: reloadedResponse.explanations ?? [] };
    }
    if (reloaded.status === 'absent' || reloaded.status === 'version-mismatch' || reloaded.status === 'initialized') {
      return { status: 'superseded' };
    }
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

function counts({ total, filled, toFix, toCheck }: ProgressCounts): FilingProgressCounts {
  return { total, filled, toFix, toCheck };
}

interface EffectiveAutosavePolicySnapshot {
  action: ResponseAction;
  referencedRequests: ReadonlyArray<readonly [string, unknown[]]>;
}

function captureEffectiveAutosavePolicy(
  document: ResponseActionsDocument | undefined,
  action: ResponseAction | undefined,
): EffectiveAutosavePolicySnapshot | null {
  if (!action) return null;
  const runtime = (document as unknown as { 'x-formspec-runtime'?: unknown } | undefined)?.['x-formspec-runtime'];
  const requests = runtime && typeof runtime === 'object' && !Array.isArray(runtime)
    && Array.isArray((runtime as { requests?: unknown }).requests)
    ? ((runtime as { requests: unknown[] }).requests)
    : [];
  const seen = new Set<string>();
  const referencedRequests: Array<readonly [string, unknown[]]> = [];
  for (const effect of action.effects ?? []) {
    if (effect.type !== 'serviceRequest') continue;
    const ref = effect.requestRef;
    if (typeof ref !== 'string' || seen.has(ref)) continue;
    seen.add(ref);
    const matches = requests
      .filter((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate) && (candidate as { id?: unknown }).id === ref)
      .map((candidate) => structuredClone(candidate));
    referencedRequests.push([ref, matches]);
  }
  return {
    action: structuredClone(action),
    referencedRequests,
  };
}

export function createDraftWriter(options: DraftWriterOptions) {
  const { engine, key, port, report } = options;
  const definitionVersion = engine.definition.version;
  const placements = options.sections.map(({ id, fields }) => ({
    ...(id === undefined ? {} : { id }), fields,
  }));
  let currentActions = options.actions;
  let authoredAutosave: ResponseAction | undefined;
  let autosaveFinding: ActionRefFinding | undefined;
  let responseId = options.responseId ?? `urn:uuid:${crypto.randomUUID()}`;
  let committed: Pick<DraftRecord, 'revision'> | undefined = options.draft;
  let author = options.author;
  let snapshot = engine.getDraftSnapshot();
  let explanations = engine.getExplanationEntries();
  let edit = 0;
  let savedEdit = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<boolean> | undefined;
  const checkpoints = new Set<Promise<boolean>>();
  let autosaving: Promise<boolean> | undefined;
  let fence: Promise<unknown> | undefined;
  let preparedEdit: number | undefined;
  let signedEdit: number | undefined;
  let filingBaselineEdit = 0;
  let conflicted = false;
  let failureNotice: SurfaceSaveNotice = 'saveFailed';
  let active = true;
  let mounted = true;

  function clearTimer() {
    clearTimeout(timer);
    timer = undefined;
  }

  function schedule() {
    clearTimer();
    if (!active || !mounted || !authoredAutosave || fence || conflicted || edit === savedEdit) return;
    timer = setTimeout(() => {
      timer = undefined;
      void saveAutomatically();
    }, options.debounceMs ?? 400);
  }

  function reconcileActions(nextActions: ResponseActionsDocument | undefined): ActionRefFinding | undefined {
    currentActions = nextActions;
    const resolution = resolveAutosaveResponseAction(currentActions, engine.definition);
    authoredAutosave = resolution.action ?? undefined;
    autosaveFinding = resolution.finding ?? undefined;
    if (!authoredAutosave) {
      clearTimer();
    } else {
      schedule();
    }
    return autosaveFinding;
  }

  const initialFinding = reconcileActions(options.actions);
  if (initialFinding) {
    options.onActionFinding?.(initialFinding);
  }

  function pendingAutomaticFiling(): boolean {
    if (edit === filingBaselineEdit) return false;
    const kind = filingAction(currentActions, authoredAutosave);
    if (kind === 'prepare') return preparedEdit !== edit;
    if (kind === 'sign') return signedEdit !== edit;
    return false;
  }

  function saveAutomatically(): Promise<boolean> {
    if (autosaving) return autosaving;
    if (!authoredAutosave || !active || conflicted) return Promise.resolve(false);
    autosaving = (async () => {
      let lastSucceeded = true;
      while (active && !conflicted && authoredAutosave && (edit !== savedEdit || !committed || pendingAutomaticFiling())) {
        const actionToRun: ResponseAction = authoredAutosave;
        const documentToRun: ResponseActionsDocument | undefined = currentActions;
        const attemptPolicy = captureEffectiveAutosavePolicy(documentToRun, actionToRun);
        const attemptEdit = edit;
        clearTimer();
        let result: ResponseActionInvocationResult<SubmitResult> | undefined;
        try {
          result = await invoke({
            document: documentToRun,
            actionRef: actionToRun.id,
            ports: { submit: captureActionResponse, dispatchHostEvent: () => {} },
          }, { automatic: true });
        } catch {
          result = undefined;
        }
        lastSucceeded = Boolean(
          result && result.detail !== null && (result.status === 'completed' || result.status === 'deferred'),
        );
        if (!lastSucceeded) {
          if (
            edit === attemptEdit
            && currentActions === documentToRun
            && authoredAutosave === actionToRun
            && deepEqual(captureEffectiveAutosavePolicy(currentActions, authoredAutosave), attemptPolicy)
          ) {
            if (!result && !conflicted) report?.('saveFailed');
            return false;
          }
          continue;
        }
        if (edit === savedEdit && committed && !pendingAutomaticFiling()) break;
        if (result?.status === 'deferred' && edit === attemptEdit) break;
      }
      return active && lastSucceeded;
    })()
      .catch(() => { report?.('saveFailed'); return false; })
      .finally(() => { autosaving = undefined; });
    return autosaving;
  }

  async function waitForSaves(): Promise<boolean> {
    let saved = true;
    while (fence || autosaving || pending || checkpoints.size) {
      const results = await Promise.all([
        fence?.then(() => true, () => true) ?? true,
        autosaving ?? true, pending ?? true, ...checkpoints,
      ]);
      saved = saved && results.every(Boolean);
    }
    return active && saved;
  }

  async function leave(): Promise<boolean> {
    clearTimer();
    const settled = await waitForSaves();
    if (!authoredAutosave) return settled;
    const canLeave = settled && !conflicted && ((edit === savedEdit && !pendingAutomaticFiling()) || await saveAutomatically());
    if (!canLeave && conflicted) report?.('draftConflict', { focusConflict: true });
    return canLeave;
  }

  type DraftExplanationEntry = ReturnType<IFormEngine['getExplanationEntries']>[number];
  type ExplanationKey = Parameters<IFormEngine['removeExplanation']>[0];
  type ReconciliationBaseline = {
    baseExplanations?: readonly DraftExplanationEntry[];
    committedAnswers?: readonly DraftExplanationEntry[];
  };
  type PendingReconciliation = ReconciliationBaseline & {
    revision: string;
  };
  type StagedReconciliation = {
    stamped: readonly SavedExplanation[];
    base?: readonly DraftExplanationEntry[];
  };
  let pendingReconciliation: PendingReconciliation | undefined;
  let supersededReconciliation: ReconciliationBaseline | undefined;
  let activeStaged: StagedReconciliation | undefined;
  const retractedKeys: ExplanationKey[] = [];

  function matchesExplanationKey(entry: DraftExplanationEntry, key: ExplanationKey): boolean {
    return 'shapeId' in key
      ? 'shapeId' in entry && entry.shapeId === key.shapeId && entry.path === key.path
      : 'group' in entry && entry.code === key.code && entry.partyRef === key.partyRef;
  }

  function filterRetracted<T extends DraftExplanationEntry>(entries: readonly T[]): T[] {
    return retractedKeys.length === 0
      ? [...entries]
      : entries.filter(entry => !retractedKeys.some(key => matchesExplanationKey(entry, key)));
  }

  const ownRemoveDescriptor = Object.getOwnPropertyDescriptor(engine, 'removeExplanation');
  const originalRemoveExplanation = typeof engine.removeExplanation === 'function'
    ? engine.removeExplanation.bind(engine)
    : undefined;
  let wrappedRemoveExplanation = false;
  if (originalRemoveExplanation && Object.isExtensible(engine)) {
    try {
      Object.defineProperty(engine, 'removeExplanation', {
        configurable: true,
        writable: true,
        value(key: ExplanationKey) {
          if (pendingReconciliation || supersededReconciliation || activeStaged || options.waitForReview?.()) {
            retractedKeys.push(key);
            if (activeStaged?.stamped.some(entry => matchesExplanationKey(entry, key))) {
              edit++;
            }
          }
          return originalRemoveExplanation(key);
        },
      });
      wrappedRemoveExplanation = true;
    } catch {
      // Non-configurable engine wrapper; fall back to reactive explanation tracking.
    }
  }

  const unsubscribe = preactReactiveRuntime.effect(() => {
    // Track evaluation so hidden answers and empty repeat changes participate.
    engine.getEvaluatedFormState({ profile: 'off' });
    const latest = engine.getDraftSnapshot();
    const latestExplanations = engine.getExplanationEntries();
    if (retractedKeys.length > 0 && latestExplanations.length > 0) {
      for (let i = retractedKeys.length - 1; i >= 0; i--) {
        if (latestExplanations.some(entry => matchesExplanationKey(entry, retractedKeys[i]!))) {
          retractedKeys.splice(i, 1);
        }
      }
    }
    if (!deepEqual(latest, snapshot) || !deepEqual(latestExplanations, explanations)) {
      explanations = latestExplanations;
      snapshot = latest;
      edit++;
      schedule();
    }
  });

  let hadExplanations = explanations.length > 0;

  function sameExplanationIdentity(left: DraftExplanationEntry, right: DraftExplanationEntry): boolean {
    if ('group' in left && 'group' in right) {
      return left.code === right.code && left.partyRef === right.partyRef;
    }
    if (!('group' in left) && !('group' in right)) {
      return left.shapeId === right.shapeId && left.path === right.path;
    }
    return false;
  }

  function sameExplanationAnswer(left: DraftExplanationEntry, right: DraftExplanationEntry): boolean {
    if ('group' in left && 'group' in right) {
      return left.code === right.code
        && left.partyRef === right.partyRef
        && left.basis === right.basis
        && deepEqual(left.paths, right.paths);
    }
    if (!('group' in left) && !('group' in right)) {
      return left.shapeId === right.shapeId
        && left.path === right.path
        && left.basis === right.basis
        && left.text === right.text;
    }
    return false;
  }

  function mergeExplanations(
    current: readonly DraftExplanationEntry[],
    stamped: readonly SavedExplanation[],
    base?: readonly DraftExplanationEntry[],
  ): DraftExplanationEntry[] {
    if (base === undefined) {
      return current.map(entry => stamped.find(saved => sameExplanationAnswer(entry, saved)) ?? entry);
    }
    const merged: DraftExplanationEntry[] = [];
    for (const local of current) {
      const committedEntry = stamped.find(saved => sameExplanationIdentity(local, saved));
      const baseEntry = base.find(entry => sameExplanationIdentity(local, entry));
      if (committedEntry && sameExplanationAnswer(local, committedEntry)) {
        merged.push(committedEntry);
      } else if (baseEntry && sameExplanationAnswer(local, baseEntry)) {
        if (committedEntry) merged.push(committedEntry);
      } else {
        merged.push(local);
      }
    }
    for (const committedEntry of stamped) {
      if (merged.some(existing => sameExplanationIdentity(existing, committedEntry))) continue;
      const baseEntry = base.find(entry => sameExplanationIdentity(committedEntry, entry));
      if (!baseEntry || !sameExplanationAnswer(baseEntry, committedEntry)) {
        merged.push(committedEntry);
      }
    }
    return merged;
  }

  function acceptStamps(
    stamped: readonly SavedExplanation[],
    base?: readonly DraftExplanationEntry[],
  ) {
    const before = engine.getExplanationEntries();
    // Sync our local mirror before mutating engine state so adopting server stamps
    // or a committed review acknowledgement does not bump `edit` or schedule another autosave.
    explanations = mergeExplanations(before, stamped, base);
    engine.acceptSavedExplanations([...stamped], base !== undefined ? { base } : undefined);
    explanations = engine.getExplanationEntries();
  }

  function applyCommittedReview(
    fromRevision: string,
    toRevision: string,
    baseExplanations: readonly DraftExplanationEntry[],
    committedExplanations?: readonly SavedExplanation[],
  ): boolean {
    if (!active || conflicted || committed?.revision !== fromRevision) return false;
    committed = { revision: toRevision };
    preparedEdit = signedEdit = undefined;
    pendingReconciliation = undefined;
    supersededReconciliation = undefined;
    if (committedExplanations !== undefined) {
      const surviving = filterRetracted(committedExplanations);
      acceptStamps(surviving, baseExplanations);
      if (surviving.length !== committedExplanations.length) edit++;
      hadExplanations = explanations.length > 0 || committedExplanations.length > 0;
    }
    retractedKeys.length = 0;
    return true;
  }

  function deferCommittedReview(
    fromRevision: string,
    toRevision: string,
    baseExplanations: readonly DraftExplanationEntry[],
    committedAnswers?: readonly DraftExplanationEntry[],
  ): boolean {
    if (!active || conflicted || committed?.revision !== fromRevision) return false;
    committed = { revision: toRevision };
    preparedEdit = signedEdit = undefined;
    supersededReconciliation = undefined;
    pendingReconciliation = {
      revision: toRevision,
      baseExplanations: [...baseExplanations],
      ...(committedAnswers !== undefined && { committedAnswers: [...committedAnswers] }),
    };
    return true;
  }

  function supersedeCommittedReview(
    fromRevision: string,
    toRevision: string,
    baseExplanations: readonly DraftExplanationEntry[],
    committedAnswers?: readonly DraftExplanationEntry[],
  ): boolean {
    if (!active || committed?.revision !== fromRevision) return false;
    committed = { revision: toRevision };
    preparedEdit = signedEdit = undefined;
    pendingReconciliation = undefined;
    supersededReconciliation = {
      baseExplanations: [...baseExplanations],
      ...(committedAnswers !== undefined && { committedAnswers: [...committedAnswers] }),
    };
    observeConflict();
    report?.('draftConflict');
    return true;
  }

  async function reconcilePendingReadback(): Promise<boolean> {
    if (!pendingReconciliation) return true;
    const target = pendingReconciliation;
    const readback = await readCommittedExplanationsAtRevision(port, key, definitionVersion, target.revision);
    if (!active) return false;
    if (pendingReconciliation !== target) return true;
    if (readback.status === 'loaded') {
      const surviving = filterRetracted(readback.explanations);
      acceptStamps(surviving, target.baseExplanations);
      if (surviving.length !== readback.explanations.length) edit++;
      hadExplanations = explanations.length > 0 || readback.explanations.length > 0;
      pendingReconciliation = undefined;
      supersededReconciliation = undefined;
      retractedKeys.length = 0;
      return true;
    }
    if (readback.status === 'superseded') {
      supersededReconciliation = {
        ...(target.baseExplanations !== undefined && { baseExplanations: target.baseExplanations }),
        ...(target.committedAnswers !== undefined && { committedAnswers: target.committedAnswers }),
      };
      pendingReconciliation = undefined;
      observeConflict();
      return false;
    }
    return false;
  }

  function reconcilePending(): Promise<boolean> {
    if (pending) return pending;
    if (!pendingReconciliation) return Promise.resolve(true);
    failureNotice = 'saveFailed';
    pending = (async () => {
      if (options.waitForReview?.()) await waitForPendingReview();
      if (!active || conflicted) return false;
      const ok = await reconcilePendingReadback();
      if (ok) report?.(options.locally ? 'savedLocally' : 'saved');
      return ok;
    })().catch(() => false).then(ok => {
      pending = undefined;
      if (!ok) report?.(failureNotice);
      return ok;
    });
    return pending;
  }

  async function waitForPendingReview(): Promise<void> {
    while (active) {
      const review = options.waitForReview?.();
      if (!review) break;
      await review;
    }
  }

  function captureActionResponse({ profile }: Parameters<NonNullable<DraftActionPorts['submit']>>[0]) {
    return engine.getResponseSnapshot({ id: responseId, ...(author && { author }), profile: 'off' }, profile);
  }

  function observeConflict() {
    conflicted = true;
    clearTimer();
    failureNotice = 'draftConflict';
  }

  function capture(
    revision: string | null,
    staged?: StagedReconciliation,
    responseOverride?: FormResponse,
  ): DraftSaveInput {
    const evaluated = engine.getEvaluatedFormState({ profile: 'on-submit' });
    const progress = summarizeDraftProgress(options.sections, evaluated);
    const response = responseOverride ?? engine.getResponse({ id: responseId, ...(author && { author }), profile: 'off' });
    const rawExplanations = engine.getExplanationEntries();
    const currentExplanations = staged
      ? mergeExplanations(rawExplanations, staged.stamped, staged.base)
      : rawExplanations;
    const includeExplanations = currentExplanations.length > 0 || hadExplanations;
    const persistedSnapshot = currentExplanations.length > 0
      ? { ...snapshot, explanations: currentExplanations }
      : snapshot;
    return {
      ...(revision === null && options.creationPins && { creationPins: options.creationPins }),
      ...(includeExplanations && { explanations: currentExplanations }),
      key, definitionVersion, expectedRevision: revision, snapshotJson: JSON.stringify(persistedSnapshot),
      responseJson: JSON.stringify(response),
      summary: {
        sections: placements,
        progress: {
          status: 'current',
          form: { ...counts(progress.form), ready: progress.form.ready },
          sections: Object.fromEntries(progress.sections.flatMap(({ id, counts: values }) =>
            id === undefined ? [] : [[id, counts(values)]])),
        },
      },
    };
  }

  function checkpoint(
    explicitRevision?: string | null,
    staged?: StagedReconciliation,
    responseOverride?: FormResponse,
  ): Promise<boolean> {
    if (pending) return pending;
    failureNotice = 'saveFailed';
    activeStaged = staged;
    pending = (async () => {
      if (options.waitForReview?.()) await waitForPendingReview();
      if (!active || (explicitRevision === undefined && conflicted)) return false;
      if (explicitRevision === undefined && pendingReconciliation) {
        if (!await reconcilePendingReadback()) return false;
      }
      const savingEdit = edit;
      const expectedRevision = explicitRevision !== undefined
        ? explicitRevision
        : (committed?.revision ?? options.initializedRevision ?? null);
      const input = capture(expectedRevision, staged, responseOverride);
      const retractionsBeforeSave = retractedKeys.length;
      const result = await port.save(input);
      if (result.status !== 'saved') {
        if (result.status === 'conflict' || result.status === 'pin-unavailable') observeConflict();
        return false;
      }
      committed = { revision: result.revision };
      savedEdit = savingEdit;
      conflicted = false;
      const postSaveRetractions = retractedKeys.slice(retractionsBeforeSave);
      const adopt = (entries: readonly SavedExplanation[]) => {
        const surviving = postSaveRetractions.length === 0
          ? entries
          : entries.filter(entry => !postSaveRetractions.some(k => matchesExplanationKey(entry, k)));
        acceptStamps(surviving, staged?.base);
      };
      if (result.explanations !== undefined) {
        adopt(result.explanations);
        pendingReconciliation = undefined;
        supersededReconciliation = undefined;
        retractedKeys.length = 0;
      } else if (input.explanations && input.explanations.length > 0) {
        const readback = await readCommittedExplanationsAtRevision(port, key, definitionVersion, result.revision);
        if (!active) return false;
        if (readback.status === 'loaded') {
          adopt(readback.explanations);
          pendingReconciliation = undefined;
          supersededReconciliation = undefined;
          retractedKeys.length = 0;
        } else if (readback.status === 'superseded') {
          supersededReconciliation = {
            ...(staged?.base !== undefined && { baseExplanations: staged.base }),
            committedAnswers: [...input.explanations],
          };
          pendingReconciliation = undefined;
          observeConflict();
          return false;
        } else {
          hadExplanations = explanations.length > 0 || input.explanations.length > 0;
          pendingReconciliation = {
            revision: result.revision,
            ...(staged?.base !== undefined && { baseExplanations: staged.base }),
            committedAnswers: [...input.explanations],
          };
          supersededReconciliation = undefined;
          return false;
        }
      } else {
        pendingReconciliation = undefined;
        supersededReconciliation = undefined;
        retractedKeys.length = 0;
      }
      hadExplanations = explanations.length > 0 || (input.explanations?.length ?? 0) > 0;
      report?.(options.locally ? 'savedLocally' : 'saved');
      return true;
    })().catch(() => false).then(saved => {
      activeStaged = undefined;
      pending = undefined;
      if (!saved) report?.(failureNotice);
      return saved;
    });
    return pending;
  }

  type AutomaticFlushGuard = {
    expectedEdit: number;
    expectedDocument: ResponseActionsDocument | undefined;
    expectedAction: ResponseAction | undefined;
    expectedPolicy: unknown;
    capturedResponse?: FormResponse | undefined;
  };

  async function drain(create: boolean, automatic?: AutomaticFlushGuard): Promise<boolean> {
    clearTimer();
    if (pending && !await pending) return false;
    if (options.waitForReview?.()) await waitForPendingReview();
    if (conflicted) return false;
    if (automatic) {
      // Never persist a newer edit or superseded action under a prior automatic invocation.
      if (
        !active
        || !authoredAutosave
        || edit !== automatic.expectedEdit
        || currentActions !== automatic.expectedDocument
        || authoredAutosave !== automatic.expectedAction
        || !deepEqual(captureEffectiveAutosavePolicy(currentActions, authoredAutosave), automatic.expectedPolicy)
      ) {
        return false;
      }
      if (edit === savedEdit && (!create || committed)) {
        if (pendingReconciliation && !await reconcilePending()) return false;
        clearTimer();
        return active;
      }
      const saved = await checkpoint(undefined, undefined, automatic.capturedResponse);
      clearTimer();
      return saved && active;
    }
    if (pendingReconciliation && edit === savedEdit && !(create && !committed)) {
      if (!await reconcilePending()) return false;
    }
    while (active && (edit !== savedEdit || (create && !committed))) {
      if (!await checkpoint()) return false;
      clearTimer();
    }
    clearTimer();
    return active;
  }

  async function flush(create = false, automatic?: AutomaticFlushGuard): Promise<boolean> {
    if (fence) await fence.catch(() => undefined);
    return drain(create, automatic);
  }

  function resolveConflict(choice: 'load' | 'keep'): Promise<boolean | 'reopen'> {
    if (!conflicted || fence || pending) return Promise.resolve(false);
    const editAtConfirmation = edit;
    const run = Promise.resolve().then(async () => {
      const latest = await port.load(key, definitionVersion);
      if (!active) return false;
      if (choice === 'load' && edit === editAtConfirmation &&
          (latest.status === 'loaded' || latest.status === 'absent') &&
          Object.values(engine.definition.instances ?? {}).some(instance => instance.response)) {
        return 'reopen' as const;
      }
      if (latest.status === 'absent' && choice === 'keep') return await checkpoint(null) && drain(false);
      if (latest.status !== 'loaded') return false;
      const { draft } = latest;
      if (options.creationPins && !deepEqual(draft.pins ?? {}, options.creationPins)) return false;
      const response = parseJsonExact(draft.responseJson) as FormResponse;
      if (choice === 'load') {
        if (edit !== editAtConfirmation) return false;
        engine.loadDraftSnapshot(parseJsonExact(draft.snapshotJson) as FormDraftSnapshot, response.explanations);
        hadExplanations = engine.getExplanationEntries().length > 0;
        committed = draft;
        savedEdit = edit;
        filingBaselineEdit = edit;
        preparedEdit = signedEdit = undefined;
        pendingReconciliation = undefined;
        supersededReconciliation = undefined;
        retractedKeys.length = 0;
        responseId = response.id ?? responseId;
        author = options.author ?? response.author;
        conflicted = false;
        report?.('draftLoaded');
        return true;
      }
      const oldId = responseId;
      const oldAuthor = author;
      responseId = response.id ?? responseId;
      author = options.author ?? response.author;
      let staged: StagedReconciliation | undefined;
      if (supersededReconciliation && response.explanations && response.explanations.length > 0) {
        const baseline = supersededReconciliation;
        const matching = filterRetracted(
          baseline.committedAnswers
            ? response.explanations.filter(saved =>
              baseline.committedAnswers!.some(own => sameExplanationAnswer(own, saved)))
            : response.explanations,
        );
        if (matching.length > 0) {
          staged = {
            stamped: matching,
            ...(baseline.baseExplanations !== undefined && { base: baseline.baseExplanations }),
          };
        }
      }
      if (await checkpoint(draft.revision, staged)) return drain(false);
      responseId = oldId;
      author = oldAuthor;
      return false;
    }).catch(() => false);
    fence = run;
    return run.finally(() => { fence = undefined; schedule(); });
  }

  async function invokeCheckpoint(input: DraftActionInput, { automatic = false }: { automatic?: boolean } = {}) {
    const expectedEdit = edit;
    const expectedDocument = currentActions;
    const expectedAction = authoredAutosave;
    const expectedPolicy = captureEffectiveAutosavePolicy(expectedDocument, expectedAction);
    const invocationId = input.invocationContext?.invocationId ?? `urn:uuid:${crypto.randomUUID()}`;
    const invocationContext = { ...input.invocationContext, invocationId };
    const ports = options.checkpointPorts?.({ ...input, invocationContext }) ?? input.ports;
    const invocation = await invokeResponseActionAsync(input.document, input.actionRef, ports, input.nodeId, invocationContext);
    if (invocation.detail === null || (invocation.status !== 'completed' && invocation.status !== 'deferred')) {
      if (!conflicted) report?.('saveFailed');
      return invocation;
    }
    if (await flush(true, automatic ? { expectedEdit, expectedDocument, expectedAction, expectedPolicy } : undefined)) return invocation;
    return { ...invocation, status: 'failed' as const, failureReason: 'Draft could not be saved.' };
  }

  const preconditionCatalog = new ResponseActionsPreconditionCatalog();

  async function evaluateAutomaticPreconditionsBeforeFence(
    input: DraftActionInput,
    resolution: ReturnType<typeof resolveResponseAction>,
    action: ResponseAction,
    expectedEdit: number,
    expectedDocument: ResponseActionsDocument | undefined,
    expectedAction: ResponseAction | undefined,
    expectedPolicy: EffectiveAutosavePolicySnapshot | null,
    prePorts: ResponseActionAsyncInvocationPorts<SubmitResult>,
    invocationContext: NonNullable<DraftActionInput['invocationContext']> & { invocationId: string },
  ): Promise<
    | { ok: true; verdicts: Map<string, boolean>; validationTuple: ReturnType<typeof resolveResponseActionValidationTuple> }
    | { ok: false; result: ResponseActionInvocationResult<SubmitResult> }
  > {
    const notInvokedTrace = () => planResponseActionEffects(action).map((planned) => ({
      type: planned.effect.type,
      status: 'not-invoked' as const,
      ...(planned.effect.type === 'hostEvent' ? { eventName: planned.effect.eventName } : {}),
    }));
    let validationTuple: ReturnType<typeof resolveResponseActionValidationTuple>;
    try {
      validationTuple = resolveResponseActionValidationTuple(action);
    } catch (error) {
      if (!conflicted) report?.('saveFailed');
      return {
        ok: false,
        result: {
          status: 'failed',
          invocationId: invocationContext.invocationId,
          resolution,
          validationTuple: null,
          detail: null,
          effectTrace: notInvokedTrace(),
          failureReason: error instanceof Error ? error.message : String(error),
        },
      };
    }

    const verdicts = new Map<string, boolean>();
    const preconditions = action.preconditions ?? [];
    if (preconditions.length === 0) {
      return { ok: true, verdicts, validationTuple };
    }

    const buildEnginePreconditionFailure = async (
      failingId?: string,
      outcome?: { threw: true; error: unknown } | { threw: false; value: Awaited<ReturnType<NonNullable<ResponseActionAsyncInvocationPorts<SubmitResult>['evaluatePrecondition']>>> },
    ): Promise<ResponseActionInvocationResult<SubmitResult>> => invokeResponseActionAsync(
      input.document,
      input.actionRef,
      {
        dispatchHostEvent: () => {},
        ...(prePorts.recordActionLifecycle && { recordActionLifecycle: prePorts.recordActionLifecycle }),
        ...(failingId && outcome
          ? {
              evaluatePrecondition: (candidate) => {
                if (verdicts.has(candidate.id)) return true;
                if (candidate.id === failingId) {
                  if (outcome.threw) throw outcome.error;
                  return outcome.value;
                }
                return false;
              },
            }
          : {}),
      },
      input.nodeId,
      invocationContext,
    );

    for (const precondition of preconditions) {
      const check = preconditionCatalog.validateExpression(precondition.expression);
      if (!check.ok || !prePorts.evaluatePrecondition) {
        if (!conflicted) report?.('saveFailed');
        return {
          ok: false,
          result: await buildEnginePreconditionFailure(),
        };
      }
      let rawOutcome: Awaited<ReturnType<NonNullable<ResponseActionAsyncInvocationPorts<SubmitResult>['evaluatePrecondition']>>>;
      try {
        rawOutcome = await prePorts.evaluatePrecondition(precondition, action);
      } catch (error) {
        if (!conflicted) report?.('saveFailed');
        return {
          ok: false,
          result: await buildEnginePreconditionFailure(precondition.id, { threw: true, error }),
        };
      }
      const passed = typeof rawOutcome === 'boolean' ? rawOutcome : rawOutcome.passed;
      if (!passed) {
        if (!conflicted) report?.('saveFailed');
        return {
          ok: false,
          result: await buildEnginePreconditionFailure(precondition.id, { threw: false, value: rawOutcome }),
        };
      }
      verdicts.set(precondition.id, true);
      if (
        !active
        || edit !== expectedEdit
        || currentActions !== expectedDocument
        || authoredAutosave !== expectedAction
        || !deepEqual(captureEffectiveAutosavePolicy(currentActions, authoredAutosave), expectedPolicy)
      ) {
        return {
          ok: false,
          result: {
            status: 'failed',
            invocationId: invocationContext.invocationId,
            resolution,
            validationTuple,
            detail: null,
            effectTrace: notInvokedTrace(),
            failureReason: 'Draft or autosave policy changed before saving.',
          },
        };
      }
    }
    return { ok: true, verdicts, validationTuple };
  }

  async function invoke(
    input: DraftActionInput,
    { invoker = options.invoker, current, automatic = false }: {
      invoker?: DraftActionInvoker | undefined;
      current?: () => boolean;
      automatic?: boolean;
    } = {},
  ) {
    if (current && !current()) throw new Error('The form visit ended.');
    const resolution = resolveResponseAction(input.document, input.actionRef, input.nodeId);
    const { action } = resolution;
    const kind = filingAction(input.document, action);
    if (!kind && action && input.document?.scope !== 'app' && usesDraftCheckpoint(action)) {
      const invocation = invokeCheckpoint(input, { automatic });
      const checkpoint = invocation.then(result => result.detail !== null &&
        (result.status === 'completed' || result.status === 'deferred'), () => false)
        .finally(() => { checkpoints.delete(checkpoint); });
      checkpoints.add(checkpoint);
      return invocation;
    }

    let automaticGuard: AutomaticFlushGuard | undefined;
    let precheckedVerdicts: Map<string, boolean> | undefined;
    let resolvedCheckpointPorts: ResponseActionAsyncInvocationPorts<SubmitResult> | undefined;
    let capturedDetail: SubmitResult | null | undefined;
    let effectiveInvocationContext = input.invocationContext;
    if (automatic && kind) {
      const expectedEdit = edit;
      const expectedDocument = currentActions;
      const expectedAction = authoredAutosave;
      const expectedPolicy = captureEffectiveAutosavePolicy(expectedDocument, expectedAction);
      if (
        !active
        || conflicted
        || !action
        || !expectedAction
        || expectedDocument !== input.document
        || expectedAction.id !== input.actionRef
      ) {
        return {
          status: 'failed' as const,
          resolution,
          validationTuple: null,
          detail: null,
          effectTrace: [],
          failureReason: 'Autosave action is no longer current.',
        };
      }
      const invocationId = input.invocationContext?.invocationId ?? `urn:uuid:${crypto.randomUUID()}`;
      const guaranteedContext = { ...input.invocationContext, invocationId };
      effectiveInvocationContext = guaranteedContext;
      resolvedCheckpointPorts = options.checkpointPorts?.({ ...input, invocationContext: guaranteedContext });
      const prePorts: ResponseActionAsyncInvocationPorts<SubmitResult> = resolvedCheckpointPorts
        ? { ...input.ports, ...resolvedCheckpointPorts, submit: resolvedCheckpointPorts.submit ?? input.ports.submit }
        : input.ports;
      const precheck = await evaluateAutomaticPreconditionsBeforeFence(
        input,
        resolution,
        action,
        expectedEdit,
        expectedDocument,
        expectedAction,
        expectedPolicy,
        prePorts,
        guaranteedContext,
      );
      if (!precheck.ok) {
        return precheck.result;
      }
      if (prePorts.submit) {
        capturedDetail = prePorts.submit({
          profile: precheck.validationTuple.profile,
          validationTuple: precheck.validationTuple,
          emitEvent: false,
        });
      }
      precheckedVerdicts = precheck.verdicts;
      automaticGuard = {
        expectedEdit,
        expectedDocument,
        expectedAction,
        expectedPolicy,
        capturedResponse: capturedDetail?.response,
      };
    }

    const dispatch = async (draftFence?: Readonly<SurfaceDraftFence>, isCurrent?: () => boolean): Promise<DraftActionInvokerResult<SubmitResult>> => {
      if (isCurrent && !isCurrent()) throw new Error('The filing action visit ended.');
      const basePorts: ResponseActionAsyncInvocationPorts<SubmitResult> = resolvedCheckpointPorts
        ? { ...input.ports, ...resolvedCheckpointPorts, submit: resolvedCheckpointPorts.submit ?? input.ports.submit }
        : input.ports;
      const { submit, dispatchEffect } = basePorts;
      const ports: ResponseActionAsyncInvocationPorts<SubmitResult> = {
        ...basePorts,
        ...(precheckedVerdicts && precheckedVerdicts.size > 0 && {
          evaluatePrecondition: (precondition, candidate) => {
            if (precheckedVerdicts!.has(precondition.id)) return true;
            return basePorts.evaluatePrecondition?.(precondition, candidate) ?? false;
          },
        }),
        ...(isCurrent && submit && {
          submit: submitOptions => {
            if (!isCurrent()) throw new Error('Draft changed before the action captured its answers.');
            let detail = automaticGuard && capturedDetail !== undefined
              ? capturedDetail
              : submit(submitOptions);
            if (automaticGuard && detail && draftFence && JSON.stringify(detail.response) !== draftFence.responseJson) {
              detail = { ...detail, response: parseJsonExact(draftFence.responseJson) as FormResponse };
            }
            return detail && draftFence ? { ...detail, draftFence } : detail;
          },
        }),
        ...(draftFence && dispatchEffect && {
          dispatchEffect: (effect, detail, candidate, context) => {
            if (!isCurrent?.()) throw new Error('Draft changed before the effect ran.');
            return dispatchEffect(
              effect,
              detail,
              candidate,
              { ...context, draftFence } as ResponseActionEffectDispatchContext & { draftFence?: Readonly<SurfaceDraftFence> },
            );
          },
        }),
      };
      return invoker
        ? await invoker({
            ...input,
            ports: ports as DraftActionPorts,
            ...(effectiveInvocationContext && { invocationContext: effectiveInvocationContext }),
            ...(draftFence && { draftFence }),
          })
        : await invokeResponseActionAsync(input.document, input.actionRef, ports, input.nodeId, effectiveInvocationContext);
    };
    const result = kind ? await runFenced(kind, dispatch, {
      completed: result => ('invocation' in result ? result.invocation : result).status === 'completed',
      committedRevision: result => result.committedDraftRevision,
      ...(current && { current }),
      ...(automaticGuard && { automaticGuard }),
    }) : await dispatch();
    const invocation = 'invocation' in result ? result.invocation : result;
    if (automatic && kind && (invocation.detail === null || (invocation.status !== 'completed' && invocation.status !== 'deferred'))) {
      if (!conflicted) report?.('saveFailed');
    }
    return invocation;
  }

  function runFenced<T>(
    kind: DraftFencedAction, operation: (draft: Readonly<SurfaceDraftFence>, isCurrent: () => boolean) => Promise<T>,
    { completed, committedRevision, current, automaticGuard }: {
      completed?: ((result: T) => boolean) | undefined;
      committedRevision?: ((result: T) => string | undefined) | undefined;
      current?: () => boolean;
      automaticGuard?: AutomaticFlushGuard | undefined;
    } = {},
  ): Promise<T> {
    if (fence) return Promise.reject(new Error('A filing action is already running.'));
    const run = Promise.resolve().then(async () => {
      if (!await drain(true, automaticGuard) || !committed) throw new Error('Draft could not be saved.');
      const revision = committed.revision;
      const editAtStart = automaticGuard ? automaticGuard.expectedEdit : edit;
      const unchanged = () => active && editAtStart === edit;
      const automaticCurrent = () =>
        active
        && currentActions === automaticGuard!.expectedDocument
        && authoredAutosave === automaticGuard!.expectedAction
        && savedEdit === automaticGuard!.expectedEdit
        && deepEqual(
          captureEffectiveAutosavePolicy(currentActions, authoredAutosave),
          automaticGuard!.expectedPolicy,
        );
      const isCurrent = () => (automaticGuard ? automaticCurrent() : unchanged()) && (current?.() ?? true);
      if (!isCurrent()) {
        throw new Error('Draft changed before the filing action.');
      }
      const latest = await port.load(key, definitionVersion);
      if (!isCurrent() || latest.status !== 'loaded' || latest.draft.revision !== revision) {
        if (active && latest.status === 'loaded' && latest.draft.revision !== revision) {
          observeConflict();
          report?.('draftConflict');
        }
        throw new Error('Draft changed before the filing action.');
      }
      if (kind === 'sign' && preparedEdit !== undefined && preparedEdit !== editAtStart) {
        throw new Error('Prepare this draft before signing.');
      }
      if (kind === 'submit' && signedEdit !== undefined && signedEdit !== editAtStart) {
        throw new Error('Sign this draft before submitting.');
      }
      const draft = Object.freeze({ key, definitionVersion, revision, responseJson: latest.draft.responseJson });
      const latestResponse = parseJsonExact(latest.draft.responseJson) as FormResponse;
      if (latestResponse.explanations) acceptStamps(latestResponse.explanations);
      const result = await operation(draft, isCurrent);
      if (active && kind !== 'submit' && (completed?.(result) ?? true)) {
        const actionRevision = committedRevision?.(result) ?? revision;
        preparedEdit = editAtStart;
        if (kind === 'sign') signedEdit = editAtStart;
        const after = await port.load(key, definitionVersion);
        if (active && after.status === 'loaded' && after.draft.revision === actionRevision) {
          committed = after.draft;
        }
        if (active && kind === 'sign' && !unchanged() && !automaticGuard) await drain(false);
      }
      return result;
    });
    fence = run;
    return run.finally(() => {
      fence = undefined;
      schedule();
    });
  }

  return {
    invoke, flush, runFenced, resolveConflict, captureActionResponse, applyCommittedReview, deferCommittedReview, supersedeCommittedReview,
    get actions() { return currentActions; },
    get autosaveFinding() { return autosaveFinding; },
    get conflict() { return conflicted; },
    get dirty() { return edit !== savedEdit || pendingAutomaticFiling() || pending !== undefined || fence !== undefined || checkpoints.size > 0; },
    get revision() { return committed?.revision; },
    setActions(nextActions: ResponseActionsDocument | undefined) {
      return reconcileActions(nextActions);
    },
    leave, waitForSaves,
    setMounted(value: boolean) { mounted = value; schedule(); },
    dispose() {
      active = false;
      clearTimer();
      unsubscribe();
      if (wrappedRemoveExplanation) {
        if (ownRemoveDescriptor) Object.defineProperty(engine, 'removeExplanation', ownRemoveDescriptor);
        else delete (engine as unknown as Record<string, unknown>).removeExplanation;
      }
    },
  };
}

export type DraftWriter = ReturnType<typeof createDraftWriter>;
