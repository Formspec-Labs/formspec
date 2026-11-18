/** @filedesc Serialize checkpoints and fence filing actions against one editable form revision. */
import {
  deepEqual, invokeResponseActionAsync, preactReactiveRuntime, resolveResponseAction,
  resolveResponseActionValidationTuple, resolveServiceRequest,
  type FormDraftSnapshot, type IFormEngine, type ResponseAction, type ResponseActionAsyncInvocationPorts,
  type ResponseActionEffectDispatchContext, type ResponseActionInvocationPorts,
} from '@formspec-org/engine';
import {
  summarizeFormProgress, workspaceSections, type PageSequenceEntry, type ProgressCounts,
} from '@formspec-org/layout';
import type { DraftKey, DraftPort, DraftRecord, DraftSaveInput, FilingProgressCounts } from '@formspec-org/surface';
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
  draft?: DraftRecord | undefined;
  sections: readonly PageSequenceEntry[];
  actions?: ResponseActionsDocument | undefined;
  author?: { id: string; name?: string } | undefined;
  locally?: boolean | undefined;
  debounceMs?: number | undefined;
  report?: DraftNoticeReporter | undefined;
  invoker?: DraftActionInvoker | undefined;
  checkpointPorts?: DraftCheckpointPorts | undefined;
  responseId?: string | undefined;
}

export type DraftFencedAction = 'prepare' | 'sign' | 'submit';

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

export function filingAction(
  document: ResponseActionsDocument | null | undefined, action: ResponseAction | null | undefined,
): DraftFencedAction | undefined {
  if (!action || document?.scope === 'app') return undefined;
  const catalog = document?.['x-formspec-runtime'];
  for (const effect of action.effects ?? []) {
    if (!catalog || effect.type !== 'serviceRequest') continue;
    const operation = resolveServiceRequest(catalog, effect.requestRef).operation;
    if (operation === 'prepare' || operation === 'sign') return operation;
  }
  return action.intent === 'submit' ? 'submit' : undefined;
}

export function usesDraftCheckpoint(action: ResponseAction): boolean {
  try {
    return resolveResponseActionValidationTuple(action).persistence === 'draft-checkpoint';
  } catch {
    return false; // The action dispatcher reports its invalid tuple on invocation.
  }
}

function counts({ total, filled, toFix, toCheck }: ProgressCounts): FilingProgressCounts {
  return { total, filled, toFix, toCheck };
}

export function createDraftWriter(options: DraftWriterOptions) {
  const { engine, key, port, report } = options;
  const definitionVersion = engine.definition.version;
  const placements = workspaceSections(options.sections).map(({ id, fields }) => ({
    ...(id === undefined ? {} : { id }), fields,
  }));
  const authoredAutosave = options.actions?.actions?.find(action => action.intent === 'autosave' &&
    usesDraftCheckpoint(action));
  let responseId = options.responseId ?? `urn:uuid:${crypto.randomUUID()}`;
  let committed = options.draft;
  let author = options.author;
  let snapshot = engine.getDraftSnapshot();
  let edit = 0;
  let savedEdit = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<boolean> | undefined;
  const checkpoints = new Set<Promise<boolean>>();
  let autosaving: Promise<boolean> | undefined;
  let fence: Promise<unknown> | undefined;
  let preparedEdit: number | undefined;
  let signedEdit: number | undefined;
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

  function saveAutomatically(): Promise<boolean> {
    if (autosaving) return autosaving;
    if (!authoredAutosave || !active || conflicted) return Promise.resolve(false);
    autosaving = invoke({
      document: options.actions,
      actionRef: authoredAutosave.id,
      ports: { submit: captureActionResponse, dispatchHostEvent: () => {} },
    }).then(result => result.detail !== null && (result.status === 'completed' || result.status === 'deferred'))
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
    const canLeave = settled && !conflicted && (edit === savedEdit || await saveAutomatically());
    if (!canLeave && conflicted) report?.('draftConflict', { focusConflict: true });
    return canLeave;
  }

  const unsubscribe = preactReactiveRuntime.effect(() => {
    // Track evaluation so hidden answers and empty repeat changes participate.
    engine.getEvaluatedFormState({ profile: 'off' });
    const latest = engine.getDraftSnapshot();
    if (!deepEqual(latest, snapshot)) {
      snapshot = latest;
      edit++;
      schedule();
    }
  });

  function captureActionResponse({ profile }: Parameters<NonNullable<DraftActionPorts['submit']>>[0]) {
    return engine.getResponseSnapshot({ id: responseId, ...(author && { author }), profile: 'off' }, profile);
  }

  function observeConflict() {
    conflicted = true;
    clearTimer();
    failureNotice = 'draftConflict';
  }

  function capture(revision: string | null): DraftSaveInput {
    const evaluated = engine.getEvaluatedFormState({ profile: 'on-submit' });
    const progress = summarizeFormProgress(options.sections, evaluated);
    const response = engine.getResponse({ id: responseId, ...(author && { author }), profile: 'off' });
    return {
      key, definitionVersion, expectedRevision: revision, snapshotJson: JSON.stringify(snapshot),
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

  function checkpoint(expectedRevision = committed?.revision ?? null): Promise<boolean> {
    if (pending) return pending;
    failureNotice = 'saveFailed';
    const savingEdit = edit;
    pending = (async () => {
      const input = capture(expectedRevision);
      const result = await port.save(input);
      if (result.status !== 'saved') {
        if (result.status === 'conflict') observeConflict();
        return false;
      }
      committed = { revision: result.revision, snapshotJson: input.snapshotJson, responseJson: input.responseJson };
      savedEdit = savingEdit;
      conflicted = false;
      report?.(options.locally ? 'savedLocally' : 'saved');
      return true;
    })().catch(() => false).then(saved => {
      pending = undefined;
      if (!saved) report?.(failureNotice);
      return saved;
    });
    return pending;
  }

  async function drain(create: boolean): Promise<boolean> {
    clearTimer();
    if (pending && !await pending) return false;
    if (conflicted) return false;
    while (active && (edit !== savedEdit || (create && !committed))) {
      if (!await checkpoint()) return false;
      clearTimer();
    }
    clearTimer();
    return active;
  }

  async function flush(create = false): Promise<boolean> {
    if (fence) await fence.catch(() => undefined);
    return drain(create);
  }

  function resolveConflict(choice: 'load' | 'keep'): Promise<boolean> {
    if (!conflicted || fence || pending) return Promise.resolve(false);
    const editAtConfirmation = edit;
    const run = Promise.resolve().then(async () => {
      const latest = await port.load(key, definitionVersion);
      if (!active) return false;
      if (latest.status === 'absent' && choice === 'keep') return await checkpoint(null) && drain(false);
      if (latest.status !== 'loaded') return false;
      const { draft } = latest;
      const response = parseJsonExact(draft.responseJson) as FormResponse;
      if (choice === 'load') {
        if (edit !== editAtConfirmation) return false;
        engine.loadDraftSnapshot(parseJsonExact(draft.snapshotJson) as FormDraftSnapshot);
        committed = draft;
        savedEdit = edit;
        preparedEdit = signedEdit = undefined;
        responseId = response.id ?? responseId;
        author = response.author;
        conflicted = false;
        report?.('draftLoaded');
        return true;
      }
      const oldId = responseId;
      const oldAuthor = author;
      responseId = response.id ?? responseId;
      author = response.author;
      if (await checkpoint(draft.revision)) return drain(false);
      responseId = oldId;
      author = oldAuthor;
      return false;
    }).catch(() => false);
    fence = run;
    return run.finally(() => { fence = undefined; schedule(); });
  }

  async function invokeCheckpoint(input: DraftActionInput) {
    const invocationId = input.invocationContext?.invocationId ?? `urn:uuid:${crypto.randomUUID()}`;
    const invocationContext = { ...input.invocationContext, invocationId };
    const ports = options.checkpointPorts?.({ ...input, invocationContext }) ?? input.ports;
    const invocation = await invokeResponseActionAsync(input.document, input.actionRef, ports, input.nodeId, invocationContext);
    if (invocation.detail === null || (invocation.status !== 'completed' && invocation.status !== 'deferred')) {
      if (!conflicted) report?.('saveFailed');
      return invocation;
    }
    if (await flush(true)) return invocation;
    return { ...invocation, status: 'failed' as const, failureReason: 'Draft could not be saved.' };
  }

  async function invoke(
    input: DraftActionInput,
    { invoker = options.invoker, current }: { invoker?: DraftActionInvoker | undefined; current?: () => boolean } = {},
  ) {
    if (current && !current()) throw new Error('The form visit ended.');
    const { action } = resolveResponseAction(input.document, input.actionRef, input.nodeId);
    const kind = filingAction(input.document, action);
    if (!kind && action && input.document?.scope !== 'app' && usesDraftCheckpoint(action)) {
      const invocation = invokeCheckpoint(input);
      const checkpoint = invocation.then(result => result.detail !== null &&
        (result.status === 'completed' || result.status === 'deferred'), () => false)
        .finally(() => { checkpoints.delete(checkpoint); });
      checkpoints.add(checkpoint);
      return invocation;
    }

    const dispatch = async (draftFence?: Readonly<SurfaceDraftFence>, isCurrent?: () => boolean): Promise<DraftActionInvokerResult<SubmitResult>> => {
      if (isCurrent && !isCurrent()) throw new Error('The filing action visit ended.');
      const { submit, dispatchEffect } = input.ports;
      const ports: DraftActionPorts = {
        ...input.ports,
        ...(isCurrent && submit && {
          submit: options => {
            if (!isCurrent()) throw new Error('Draft changed before the action captured its answers.');
            const detail = submit(options);
            return !invoker && detail && draftFence ? { ...detail, draftFence } : detail;
          },
        }),
        ...(!invoker && draftFence && dispatchEffect && {
          dispatchEffect: (effect, detail, action, context) => {
            if (!isCurrent?.()) throw new Error('Draft changed before the effect ran.');
            return dispatchEffect(effect, detail, action, { ...context, draftFence });
          },
        }),
      };
      return invoker
        ? await invoker({ ...input, ports, ...(draftFence && { draftFence }) })
        : await invokeResponseActionAsync(input.document, input.actionRef, ports, input.nodeId, input.invocationContext);
    };
    const result = kind ? await runFenced(kind, dispatch, {
      completed: result => ('invocation' in result ? result.invocation : result).status === 'completed',
      committedRevision: result => result.committedDraftRevision,
      ...(current && { current }),
    }) : await dispatch();
    return 'invocation' in result ? result.invocation : result;
  }

  function runFenced<T>(
    kind: DraftFencedAction, operation: (draft: Readonly<SurfaceDraftFence>, isCurrent: () => boolean) => Promise<T>,
    { completed, committedRevision, current }: {
      completed?: ((result: T) => boolean) | undefined;
      committedRevision?: ((result: T) => string | undefined) | undefined;
      current?: () => boolean;
    } = {},
  ): Promise<T> {
    if (fence) return Promise.reject(new Error('A filing action is already running.'));
    const run = Promise.resolve().then(async () => {
      if (!await drain(true) || !committed) throw new Error('Draft could not be saved.');
      const revision = committed.revision;
      const editAtStart = edit;
      const unchanged = () => active && editAtStart === edit;
      const isCurrent = () => unchanged() && (current?.() ?? true);
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
      const result = await operation(draft, isCurrent);
      if (active && kind !== 'submit' && (completed?.(result) ?? true)) {
        const actionRevision = committedRevision?.(result) ?? revision;
        preparedEdit = editAtStart;
        if (kind === 'sign') signedEdit = editAtStart;
        const after = await port.load(key, definitionVersion);
        if (active && after.status === 'loaded' && after.draft.revision === actionRevision) {
          committed = after.draft;
        }
        if (active && kind === 'sign' && !unchanged()) await drain(false);
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
    invoke, flush, runFenced, resolveConflict, captureActionResponse,
    get conflict() { return conflicted; },
    get dirty() { return edit !== savedEdit || pending !== undefined || fence !== undefined || checkpoints.size > 0; },
    get revision() { return committed?.revision; },
    leave, waitForSaves,
    setMounted(value: boolean) { mounted = value; schedule(); },
    dispose() { active = false; clearTimer(); unsubscribe(); },
  };
}

export type DraftWriter = ReturnType<typeof createDraftWriter>;
