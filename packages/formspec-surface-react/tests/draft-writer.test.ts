/** @filedesc Verify editable snapshots, debounce, refusal and action fencing with the real engine. */
import { createFormEngine, initFormspecEngine, invokeResponseActionAsync } from '@formspec-org/engine';
import { createAssistProvider } from '../../formspec-assist/src/provider.js';
import { resolvePageSequence, summarizeFormProgress } from '@formspec-org/layout';
import type { FormDefinition, ResponseActionsDocument } from '@formspec-org/types';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import * as surface from '../src/index.js';
import { fenceDraftWidgetActions } from '../src/draft-widget-action.js';
import { createDraftSession, type DraftSession } from '../src/draft-session.js';
import type { DraftPort, DraftSaveInput } from '../../formspec-surface/src/draft-port.js';

const definition: FormDefinition = {
  $formspec: '1.0', url: 'https://example.test/draft', version: '1.0.0', title: 'Draft',
  nonRelevantBehavior: 'remove',
  items: [
    { key: 'answer', type: 'field', dataType: 'string' },
    { key: 'show', type: 'field', dataType: 'boolean' },
    { key: 'hidden', type: 'field', dataType: 'string' },
    { key: 'rows', type: 'group', repeatable: true, children: [{ key: 'answer', type: 'field', dataType: 'string' }] },
  ],
  binds: [{ path: 'hidden', relevant: '$show = true' }],
};
const key = { scope: 'edition', definitionUrl: definition.url };
const actions = (autosave: boolean) => ({
  actions: [
    { id: 'save', intent: 'save-draft' as const },
    ...(autosave ? [{ id: 'auto', intent: 'autosave' as const }] : []),
  ],
});
const sections = resolvePageSequence(definition);

function fixture(
  autosave = true, checkpointPorts?: surface.DraftCheckpointPorts, document = actions(autosave),
) {
  const engine = createFormEngine(definition);
  let committed: DraftSaveInput | undefined;
  let revision = 0;
  const stored = new Map<string, DraftSaveInput>();
  const save = vi.fn<DraftPort['save']>(async input => {
    committed = input;
    stored.set(String(++revision), input);
    return { status: 'saved' as const, revision: String(revision) };
  });
  const report = vi.fn();
  const port: DraftPort = {
    save, load: async () => committed
      ? { status: 'loaded', draft: { revision: String(revision), snapshotJson: committed.snapshotJson, responseJson: committed.responseJson } }
      : { status: 'absent' }, readSummaries: async () => new Map(),
  };
  const writer = surface.createDraftWriter({
    engine, key, sections, actions: document, port,
    report,
    debounceMs: 50, checkpointPorts,
  });
  cleanup.push(() => { writer.dispose(); engine.dispose(); });
  return { engine, save, report, writer, stored, port };
}

const cleanup: Array<() => void> = [];
beforeAll(async () => { await initFormspecEngine(); });
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
  vi.useRealTimers();
});

it('debounces programmatic edits and commits the filtered Response with the latest counts and editable snapshot', async () => {
  vi.useFakeTimers();
  const { engine, save } = fixture();
  engine.setValue('show', true);
  engine.setValue('hidden', 'retained');
  engine.setValue('show', false);
  engine.addRepeatInstance('rows');
  engine.setValue('answer', 'last');
  await vi.advanceTimersByTimeAsync(50);
  expect(save).toHaveBeenCalledTimes(1);
  const input = save.mock.calls[0][0];
  expect(JSON.parse(input.responseJson).data).toMatchObject({ answer: 'last' });
  expect(JSON.parse(input.responseJson).data).not.toHaveProperty('hidden');
  const snapshot = JSON.parse(input.snapshotJson);
  expect(snapshot.data).toMatchObject({ hidden: 'retained', rows: [{}] });
  const resumed = createFormEngine(definition, { draftSnapshot: snapshot });
  cleanup.push(() => resumed.dispose());
  resumed.setValue('show', true);
  expect(resumed.signals.hidden.value).toBe('retained');
  expect(resumed.repeats.rows.value).toBe(1);
  const evaluated = summarizeFormProgress(sections, engine.getEvaluatedFormState({ profile: 'on-submit' }));
  expect(input.summary?.progress.form).toMatchObject({ total: evaluated.form.total, filled: evaluated.form.filled, ready: evaluated.form.ready });
  const assist = createAssistProvider({ engine, registerWebMCP: false });
  cleanup.push(() => assist.dispose());
  const { total, filled, ready } = assist.getProgress();
  expect(input.summary?.progress.form).toMatchObject({ total, filled, ready });
});

it('requires an authored autosave, and explicit Save uses the same writer', async () => {
  vi.useFakeTimers();
  const { writer, engine, save } = fixture(false);
  engine.setValue('answer', 'manual');
  await vi.advanceTimersByTimeAsync(100);
  expect(save).toHaveBeenCalledTimes(0);
  const action = await writer.invoke({
    document: actions(false), actionRef: 'save',
    ports: { submit: () => engine.getResponseSnapshot({ profile: 'off' }, 'off'), dispatchHostEvent: () => {} },
  });
  expect(action).toMatchObject({ status: 'completed', validationTuple: { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' } });
  expect(save).toHaveBeenCalledTimes(1);
});

it('refuses departure on a storage error and retains dirty edits for a retry', async () => {
  const { writer, engine, save, report } = fixture();
  save.mockRejectedValueOnce(new Error('storage refused'));
  engine.setValue('answer', 'keep this');
  expect(await writer.flush()).toBe(false);
  expect(writer.dirty).toBe(true);
  expect(report).toHaveBeenLastCalledWith('saveFailed');
  expect(await writer.flush()).toBe(true);
  expect(writer.dirty).toBe(false);
  expect(save.mock.calls[1][0].expectedRevision).toBeNull();
  expect(JSON.parse(save.mock.calls[1][0].snapshotJson).data.answer).toBe('keep this');
});

it.each(['block', 'defer'] as const)('honors an autosave precondition with severity %s before departure', async severity => {
  let allowed = false;
  const evaluatePrecondition = vi.fn(() => allowed);
  const document = { actions: [{
    id: 'auto', intent: 'autosave' as const,
    preconditions: [{ id: 'permission', kind: 'fel' as const, expression: 'true', severity }],
  }] };
  const { writer, engine, save } = fixture(true, ({ ports }) => ({ ...ports, evaluatePrecondition }), document);
  engine.setValue('answer', 'retained');
  expect(await writer.leave()).toBe(false);
  expect(save).not.toHaveBeenCalled();
  expect(writer.dirty).toBe(true);
  allowed = true;
  expect(await writer.leave()).toBe(true);
  expect(evaluatePrecondition).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenCalledTimes(1);
});

it('can keep edits when a concurrent discard leaves the draft absent', async () => {
  const { writer, engine, save, port } = fixture(false);
  engine.setValue('answer', 'saved answer');
  expect(await writer.flush()).toBe(true);
  engine.setValue('answer', 'retained tab edits');
  save.mockResolvedValueOnce({ status: 'conflict' });
  expect(await writer.flush()).toBe(false);
  vi.spyOn(port, 'load').mockResolvedValueOnce({ status: 'absent' });
  expect(await writer.resolveConflict('keep')).toBe(true);
  expect(save.mock.calls[2][0].expectedRevision).toBeNull();
  expect(JSON.parse(save.mock.calls[2][0].snapshotJson).data.answer).toBe('retained tab edits');
});

it.each(['during', 'after'])('keeps signed bytes when editing %s Sign and requires Prepare and Sign again', async (when) => {
  const { writer, engine } = fixture();
  engine.setValue('answer', 'first');
  await writer.runFenced('prepare', async draft => draft.revision);
  const signed = await writer.runFenced('sign', async draft => {
    if (when === 'during') engine.setValue('answer', 'next');
    return draft.responseJson;
  });
  if (when === 'after') engine.setValue('answer', 'next');
  expect(JSON.parse(signed).data.answer).toBe('first');
  const submit = vi.fn(async () => true);
  await expect(writer.runFenced('submit', submit)).rejects.toThrow();
  expect(submit).not.toHaveBeenCalled();
  expect(await writer.flush()).toBe(true);
  await writer.runFenced('prepare', async draft => draft.revision);
  await writer.runFenced('sign', async draft => draft.responseJson);
  await expect(writer.runFenced('submit', submit)).resolves.toBe(true);
});

it('fences the native Response Action invoker against the revision it will prepare', async () => {
  const { writer, engine, save } = fixture();
  engine.setValue('answer', 'prepared');
  let expected: string | undefined;
  const input = {
    document: {
      'x-formspec-runtime': {
        version: '1.0', requests: [{ id: 'candidate', operation: 'prepare', adapter: 'http-json',
          request: { method: 'POST', pathTemplate: '/candidate' } }],
      },
      actions: [{ id: 'prepare', intent: 'review' as const, effects: [
        { type: 'serviceRequest' as const, requestRef: 'candidate', idempotencyKey: '@invocation.id', onError: 'fail' as const },
      ] }],
    },
    actionRef: 'prepare',
    ports: {
      submit: ({ profile }: { profile: 'off' | 'live' | 'on-demand' | 'on-submit' }) => engine.getResponseSnapshot({ profile: 'off' }, profile),
      dispatchHostEvent: () => {},
      resolveIdempotencyKey: () => 'prepare-once',
      dispatchEffect: () => ({ type: 'serviceRequest' as const, status: 'succeeded' as const }),
    },
  };
  await writer.invoke({ ...input, document: input.document as ResponseActionsDocument }, {
    invoker: ({ draftFence }) => {
      if (!draftFence) throw new Error('missing draft fence');
      expected = draftFence.revision;
      expect(JSON.parse(draftFence.responseJson).data.answer).toBe('prepared');
      return invokeResponseActionAsync(input.document as ResponseActionsDocument, input.actionRef, input.ports);
    },
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(expected).toBe('1');
  await expect(writer.runFenced('sign', async draft => draft.revision)).resolves.toBe('1');
});

it('disqualifies a signed revision replaced by another tab', async () => {
  const { writer, engine, save } = fixture();
  engine.setValue('answer', 'original');
  await writer.runFenced('prepare', async () => {});
  const signed = await writer.runFenced('sign', async draft => {
    await save({ ...save.mock.calls[0][0], expectedRevision: draft.revision });
    return draft.responseJson;
  });
  expect(JSON.parse(signed).data.answer).toBe('original');
  const submit = vi.fn(async () => true);
  await expect(writer.runFenced('submit', submit)).rejects.toThrow('Draft changed');
  expect(submit).not.toHaveBeenCalled();
});

it('keeps a Sign race edit as a new unsigned checkpoint when autosave is absent', async () => {
  const { writer, engine, save } = fixture(false);
  engine.setValue('answer', 'signed answer');
  await writer.runFenced('prepare', async () => {});
  const signed = await writer.runFenced('sign', async draft => {
    engine.setValue('answer', 'unsigned answer');
    return draft.responseJson;
  });
  expect(JSON.parse(signed).data.answer).toBe('signed answer');
  expect(save).toHaveBeenCalledTimes(2);
  expect(JSON.parse(save.mock.calls[1][0].responseJson).data.answer).toBe('unsigned answer');
  expect(writer.dirty).toBe(false);
});

it('compares against the revision produced by Sign when saving buffered edits', async () => {
  const { writer, engine, save, stored } = fixture(false);
  engine.setValue('answer', 'first');
  await writer.runFenced('prepare', async draft => draft.revision);
  const signed = await writer.runFenced('sign', async draft => {
    const bytes = JSON.stringify({ ...JSON.parse(draft.responseJson), authoredSignatures: [{ signedBytes: 'retained' }] });
    const updated = await save({ ...save.mock.calls[0][0], expectedRevision: draft.revision, responseJson: bytes });
    engine.setValue('answer', 'buffered');
    if (updated.status !== 'saved') throw new Error('Sign did not update the fixture store');
    return updated.revision;
  }, { committedRevision: result => result });
  expect(JSON.parse(stored.get(signed)!.responseJson)).toMatchObject({ data: { answer: 'first' }, authoredSignatures: [{ signedBytes: 'retained' }] });
  expect(save.mock.calls[2][0].expectedRevision).toBe(signed);
  const edited = JSON.parse(save.mock.calls[2][0].responseJson);
  expect(edited.data.answer).toBe('buffered');
  expect(edited).not.toHaveProperty('authoredSignatures');
  expect(writer.dirty).toBe(false);
});

it('passes host preconditions and other effects through the checkpoint dispatcher', async () => {
  const dispatchEffect = vi.fn(() => ({ status: 'succeeded' as const, type: 'serviceRequest' as const }));
  const evaluatePrecondition = vi.fn(() => true);
  const { writer, engine, save } = fixture(false, ({ ports }) => ({
    ...ports, dispatchEffect, evaluatePrecondition, resolveIdempotencyKey: () => 'audit-1',
  }));
  engine.setValue('answer', 'save this');
  const result = await writer.invoke({
    document: {
      'x-formspec-runtime': {
        version: '1.0', requests: [{ id: 'save-draft', adapter: 'http-json', request: { method: 'POST', pathTemplate: '/audit' } }],
      },
      actions: [{
        id: 'save', intent: 'save-draft',
        preconditions: [{ id: 'save-allowed', kind: 'fel', expression: 'true' }],
        // The tuple checkpoints. An unrelated service request retains its own dispatch, even with this id.
        effects: [{ type: 'serviceRequest', requestRef: 'save-draft', idempotencyKey: '@invocation.id', onError: 'fail' }],
      }],
    },
    actionRef: 'save',
    ports: { submit: () => engine.getResponseSnapshot({ profile: 'off' }, 'off'), dispatchHostEvent: () => {} },
  });
  expect(result.status).toBe('completed');
  expect(evaluatePrecondition).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledTimes(1);
  expect(dispatchEffect).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ requestRef: 'save-draft' }), expect.anything(), expect.anything(), expect.anything(),
  );
});

it('stops a filing action if its visit ended during the qualified read', async () => {
  const { writer, engine } = fixture(false);
  let current = true;
  let checks = 0;
  const operation = vi.fn(async () => {});
  engine.setValue('answer', 'keep this');
  const action = writer.runFenced('prepare', operation, {
    current: () => { checks++; return current; },
  });
  // Retire this visit while the writer is performing the initial checkpoint.
  void Promise.resolve().then(() => { current = false; });
  await expect(action).rejects.toThrow('Draft changed');
  expect(checks).toBe(1);
  expect(operation).not.toHaveBeenCalled();
});


const ceremony = {
  $formspecResponseActions: '1.0', version: '1.0.0', scope: 'response', targetDefinition: { url: definition.url },
  'x-formspec-runtime': {
    version: '1.0',
    requests: [{ id: 'approval', operation: 'sign', adapter: 'http-json', request: { method: 'POST', pathTemplate: '/approve' } }],
  },
  actions: [
    { id: 'approve', intent: 'review',
      effects: [{ type: 'serviceRequest', requestRef: 'approval', idempotencyKey: '@invocation.id' }] },
    { id: 'file', intent: 'submit' },
    { id: 'save', intent: 'save-draft' },
  ],
} satisfies ResponseActionsDocument;

function widget(
  writer: surface.DraftWriter, engine: ReturnType<typeof createFormEngine>,
  { widgetName = 'SigningCeremony', document = ceremony, session }: {
    widgetName?: string; document?: ResponseActionsDocument; session?: DraftSession;
  } = {},
) {
  const executor = vi.fn<surface.SurfaceWidgetActionExecutor>(input =>
    invokeResponseActionAsync(input.document, input.actionRef, {
      submit: () => engine.getResponseSnapshot({ profile: 'off' }, 'off'), dispatchHostEvent: () => {},
      validationReportValid: () => true,
      resolveIdempotencyKey: () => input.invocationId,
      dispatchEffect: effect => ({ type: effect.type, status: 'succeeded' }),
    }));
  const draftSession = session ?? { scope: key.scope, writerFor: () => writer } as unknown as DraftSession;
  const invoke = fenceDraftWidgetActions(executor, draftSession, new Map([[definition.url, definition]]), () => true);
  return { executor, run: (actionRef: string, outputName: string) => invoke({
    document, actionRef, invocationId: 'widget-run',
    source: { moduleId: 'test', widgetName, slotId: 'widget', outputName,
      route: { surfaceId: 'app', routeId: 'filing', routeClass: 'intake', params: {} } },
  }) };
}

it('lets durable widget Sign and Submit adjudicate on a fresh writer', async () => {
  const { engine, writer, port } = fixture(false);
  const { executor, run } = widget(writer, engine);
  engine.setValue('answer', 'candidate');
  await expect(run('approve', 'sign')).resolves.toMatchObject({ status: 'completed' });
  const loaded = await port.load(key, definition.version);
  if (loaded.status !== 'loaded') throw new Error('Sign did not leave a saved draft');
  const resumedEngine = createFormEngine(definition, { draftSnapshot: JSON.parse(loaded.draft.snapshotJson) });
  const resumedWriter = surface.createDraftWriter({ engine: resumedEngine, key, sections, port, draft: loaded.draft });
  cleanup.push(() => { resumedWriter.dispose(); resumedEngine.dispose(); });
  const resumed = widget(resumedWriter, resumedEngine);
  await expect(resumed.run('file', 'submit')).resolves.toMatchObject({ status: 'completed' });
  expect(executor.mock.calls[0][0].draftFence?.revision).toBe('1');
  expect(resumed.executor.mock.calls[0][0].draftFence?.revision).toBe('1');
});

it('qualifies filing actions on a reloaded widget-only route with no mounted form', async () => {
  const { engine, writer, port } = fixture(false);
  engine.setValue('answer', 'persisted before reload');
  expect(await writer.flush()).toBe(true);
  writer.dispose();
  const session = createDraftSession({ scope: key.scope, port });
  cleanup.push(() => session.dispose());
  expect(session.writerFor(key, definition.version)).toBeUndefined();
  const { run, executor } = widget(writer, engine, { session });
  await expect(run('approve', 'sign')).resolves.toMatchObject({ status: 'completed' });
  await expect(run('file', 'submit')).resolves.toMatchObject({ status: 'completed' });
  expect(executor.mock.calls.map(([input]) => input.draftFence?.revision)).toEqual(['1', '1']);
  expect(JSON.parse(executor.mock.calls[0][0].draftFence!.responseJson).data.answer).toBe('persisted before reload');
});

it('refuses widget Submit after an edit replaces the revision seen by Sign', async () => {
  const { engine, writer } = fixture(false);
  const { executor, run } = widget(writer, engine);
  engine.setValue('answer', 'signed candidate');
  await writer.runFenced('prepare', async () => {});
  await expect(run('approve', 'sign')).resolves.toMatchObject({ status: 'completed' });
  engine.setValue('answer', 'changed');
  await expect(run('file', 'submit')).rejects.toThrow('Sign this draft');
  expect(executor).toHaveBeenCalledTimes(1);
});

it('routes a response widget Save through the writer using the checkpoint tuple', async () => {
  const { engine, writer, stored } = fixture(false);
  const { executor, run } = widget(writer, engine, { widgetName: 'TestWidget' });
  engine.setValue('answer', 'widget edit');
  await expect(run('save', 'commit')).resolves.toMatchObject({ status: 'completed' });
  expect(executor).not.toHaveBeenCalled();
  expect(JSON.parse(stored.get('1')!.snapshotJson).data.answer).toBe('widget edit');
});

it('applies the response writer and filing fence when the authored scope is omitted', async () => {
  const { engine, writer, stored } = fixture(false);
  const document: ResponseActionsDocument = { ...ceremony };
  delete document.scope; // Response Actions §2 defaults omitted scope to response.
  const { executor, run } = widget(writer, engine, { widgetName: 'TestWidget', document });
  engine.setValue('answer', 'implicit response');
  await expect(run('save', 'commit')).resolves.toMatchObject({ status: 'completed' });
  expect(JSON.parse(stored.get('1')!.snapshotJson).data.answer).toBe('implicit response');
  await expect(run('file', 'complete')).resolves.toMatchObject({ status: 'completed' });
  expect(executor).toHaveBeenCalledTimes(1);
  expect(executor.mock.calls[0][0].draftFence?.revision).toBe('1');
});

it('passes the draft fence to the effect adapter when no invoker is provided', async () => {
  const { engine, writer } = fixture(false);
  engine.setValue('answer', 'signed');
  await writer.runFenced('prepare', async () => {});
  const dispatchEffect = vi.fn(() => ({ type: 'serviceRequest' as const, status: 'succeeded' as const }));
  const result = await writer.invoke({
    document: ceremony, actionRef: 'approve',
    ports: {
      submit: ({ profile }) => engine.getResponseSnapshot({ profile: 'off' }, profile), dispatchHostEvent: () => {},
      resolveIdempotencyKey: () => 'once', dispatchEffect,
    },
  });
  expect(result).toMatchObject({ status: 'completed' });
  expect(dispatchEffect).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.anything(), expect.anything(),
    expect.objectContaining({ draftFence: expect.objectContaining({ revision: '1' }) }));
});

it('saves a newer edit after an in-flight save commits', async () => {
  const { engine, writer, save, stored } = fixture();
  const commit = save.getMockImplementation()!;
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  save.mockImplementationOnce(async input => { await blocked; return commit(input); });
  engine.setValue('answer', 'first');
  const flushing = writer.flush();
  expect(save).toHaveBeenCalledTimes(1);
  engine.setValue('answer', 'newest');
  release();
  expect(await flushing).toBe(true);
  expect(writer.revision).toBe('2');
  expect(JSON.parse(stored.get('2')!.snapshotJson).data.answer).toBe('newest');
  expect(stored.get('2')!.expectedRevision).toBe('1');
});

it('takes no JSON snapshot during edits and leaves manual forms without saving later edits', async () => {
  const { engine, writer, save } = fixture(false);
  const serializations = vi.spyOn(JSON, 'stringify');
  try {
    engine.setValue('answer', 'manual');
    expect(serializations.mock.calls.some(([value]) =>
      value?.definitionUrl === definition.url && value.data?.answer === 'manual')).toBe(false);
  } finally {
    serializations.mockRestore();
  }
  await writer.flush();
  engine.setValue('answer', 'still manual');
  expect(await writer.leave()).toBe(true);
  expect(save).toHaveBeenCalledTimes(1);
});
