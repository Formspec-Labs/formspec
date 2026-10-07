/** @filedesc Stable widget-action identity, coalescing, and durable replay. */
import { describe, expect, it, vi } from 'vitest';
import type {
  ResponseActionInvocationResult,
  SubmitResult,
} from '@formspec-org/react';
import type { ResponseActionsDocument } from '@formspec-org/types';
import {
  admitSurfaceWidgetActionInput,
  createWidgetActionCoordinator,
  responseActionsDocumentForAction,
  createWidgetActionDelivery,
  snapshotWidgetResponseContext,
} from '../src/widget-action-runtime.js';
import type {
  SurfaceWidgetActionExecutor,
  SurfaceWidgetActionOutcomeStore,
  SurfaceWidgetStoredActionOutcome,
  SurfaceWidgetResponseContext,
} from '../src/widget-api.js';

const action = { id: 'acceptReceipt', intent: 'review' };
const document = {
  $formspecResponseActions: '1.0',
  version: '1.0.0',
  scope: 'app',
  actions: [action],
} as unknown as ResponseActionsDocument;

function completed(): ResponseActionInvocationResult<SubmitResult> {
  return {
    status: 'completed',
    resolution: { resolved: true, action },
    validationTuple: null,
    detail: {
      response: {} as SubmitResult['response'],
      validationReport: { valid: true } as SubmitResult['validationReport'],
    },
    effectTrace: [],
  };
}

const source = {
  moduleId: 'x-receipts',
  widgetName: 'ReceiptPanel',
  slotId: 'panel',
  route: {
    surfaceId: 'respondent',
    surfaceRef: 'urn:surface',
    routeId: 'receipt',
    routeClass: 'proof' as const,
    params: { caseRef: 'case-1' },
  },
  outputName: 'accepted',
};

const baseRequest = {
  generation: 'session-1/receipt',
  document,
  actionRef: 'acceptReceipt',
  source,
};

describe('responseActionsDocumentForAction', () => {
  it('requires one exact action declaration', () => {
    expect(responseActionsDocumentForAction([document], 'acceptReceipt')).toBe(document);
    expect(responseActionsDocumentForAction([document], 'missing')).toBeUndefined();
    expect(
      responseActionsDocumentForAction([document, document], 'acceptReceipt'),
    ).toBeUndefined();
  });

  it('rejects a response-scoped owner even when its action id is unique', () => {
    const responseScoped = {
      ...document,
      scope: 'response',
      targetDefinition: { url: 'urn:def' },
    } as unknown as ResponseActionsDocument;

    expect(
      responseActionsDocumentForAction([responseScoped], 'acceptReceipt'),
    ).toBeUndefined();
  });

  it('requires the explicit Response subject and target compatibility', () => {
    const responseScoped = { ...document, scope: 'response', targetDefinition: { url: 'urn:def', compatibleVersions: '1.0.0' } } as ResponseActionsDocument;
    const subject = responseSubject();
    expect(responseActionsDocumentForAction([responseScoped], 'acceptReceipt', subject)).toBe(responseScoped);
    expect(responseActionsDocumentForAction([document], 'acceptReceipt', subject)).toBeUndefined();
    expect(responseActionsDocumentForAction([responseScoped], 'acceptReceipt', { ...subject, definition: { ...subject.definition, version: '2.0.0' } })).toBeUndefined();
  });
});

function responseSubject(): SurfaceWidgetResponseContext {
  return { inputName: 'saved', source: { catalogRef: 'urn:catalog', sourceRef: 'saved' },
    definition: { $formspec: '1.0', url: 'urn:def', version: '1.0.0', items: [] },
    response: { $formspecResponse: '1.0', definitionUrl: 'urn:def', definitionVersion: '1.0.0', status: 'in-progress',
      authored: '2026-10-06T12:00:00Z', data: { answer: 'original' }, extensions: { 'x-proof': { literal: 'kept' } } },
  } as unknown as SurfaceWidgetResponseContext;
}
const responseDocument = { ...document, scope: 'response', targetDefinition: { url: 'urn:def', compatibleVersions: '1.0.0' } } as ResponseActionsDocument;

describe('immutable widget Response subject', () => {
  it('preserves all fields, supports drafts, and refuses wrong pins and accessors', () => {
    const subject = responseSubject();
    const snapshot = snapshotWidgetResponseContext(subject);
    subject.response.data.answer = 'changed';
    expect(snapshot.response.data.answer).toBe('original');
    expect(snapshot.response.extensions).toEqual({ 'x-proof': { literal: 'kept' } });
    expect(Object.isFrozen(snapshot.response.data)).toBe(true);
    expect(() => snapshotWidgetResponseContext({ ...subject, response: { ...subject.response, definitionVersion: '2.0.0' } })).toThrow(/pins/);
    const getter = vi.fn();
    Object.defineProperty(subject.response.data, 'secret', { enumerable: true, get: getter });
    expect(() => snapshotWidgetResponseContext(subject)).toThrow(/accessor/);
    expect(getter).not.toHaveBeenCalled();
  });
  it('includes the entire subject in coalescing and durable replay keys', async () => {
    const keys: unknown[] = [];
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => completed());
    const outcomeStore: SurfaceWidgetActionOutcomeStore = { read(key) { keys.push(key); return undefined; }, write() {} };
    const coordinator = createWidgetActionCoordinator();
    const first = coordinator.emit({ ...baseRequest, document: responseDocument, responseContext: responseSubject(), executor, outcomeStore });
    const changed = responseSubject(); changed.response.data.answer = 'second';
    const second = coordinator.emit({ ...baseRequest, document: responseDocument, responseContext: changed, executor, outcomeStore });
    const [a, b] = await Promise.all([first.completion, second.completion]);
    expect(first.started && second.started).toBe(true);
    expect(a.invocationId).not.toBe(b.invocationId);
    expect(executor).toHaveBeenCalledTimes(2);
    expect(keys[0]).not.toEqual(keys[1]);
  });
  it('refuses replacing a subject under the same delivery identity', async () => {
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => completed());
    const delivery = createWidgetActionDelivery();
    const request = { ...baseRequest, document: responseDocument, responseContext: responseSubject(), invocationId: 'same', executor };
    await delivery.deliver(request);
    request.responseContext.response.data.answer = 'changed';
    await expect(delivery.deliver(request)).rejects.toThrow(/replace/);
    expect(executor).toHaveBeenCalledTimes(1);
  });
  it('never replays another selected action from the same document and subject', async () => {
    const actions = { ...responseDocument, actions: [...responseDocument.actions, { ...action, id: 'otherAction' }] };
    const outcomes = new Map<string, SurfaceWidgetStoredActionOutcome>();
    const outcomeStore: SurfaceWidgetActionOutcomeStore = {
      read(key) { return outcomes.get(JSON.stringify(key)); },
      write(key, outcome) { outcomes.set(JSON.stringify(key), outcome); },
    };
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => completed());
    const request = { ...baseRequest, document: actions, responseContext: responseSubject(), executor, outcomeStore };
    await createWidgetActionCoordinator().emit(request).completion;
    const second = await createWidgetActionCoordinator().emit({ ...request, actionRef: 'otherAction' }).completion;
    expect(second.replayed).toBe(false);
    expect(executor).toHaveBeenCalledTimes(2);
    expect(outcomes.size).toBe(2);
    const delivery = createWidgetActionDelivery();
    await delivery.deliver({ ...request, invocationId: 'single' });
    await expect(delivery.deliver({ ...request, actionRef: 'otherAction', invocationId: 'single' })).rejects.toThrow(/replace/);
    expect(executor).toHaveBeenCalledTimes(3);
  });
});

describe('admitSurfaceWidgetActionInput', () => {
  it('rejects accessors without invoking them', () => {
    const getter = vi.fn(() => 'secret');
    const candidate = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(candidate, 'secret', {
      enumerable: true,
      get: getter,
    });
    expect(admitSurfaceWidgetActionInput(candidate)).toMatchObject({
      accepted: false,
      reason: 'the action input contains an accessor property',
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it('normalizes object keys so durable-store identity is deterministic', () => {
    const admission = admitSurfaceWidgetActionInput({
      resource: { status: 'ready', id: 'resource-7' },
      mode: 'open',
    });
    expect(admission.accepted).toBe(true);
    if (!admission.accepted || !admission.input) return;
    expect(Object.keys(admission.input)).toEqual(['mode', 'resource']);
    expect(Object.keys(admission.input.resource as object)).toEqual(['id', 'status']);
  });
});

describe('createWidgetActionCoordinator', () => {
  it('coalesces a double-click to one executor call, one id, and one completion', async () => {
    let finish: ((result: ResponseActionInvocationResult<SubmitResult>) => void) | undefined;
    const executor = vi.fn<SurfaceWidgetActionExecutor>(
      () =>
        new Promise<ResponseActionInvocationResult<SubmitResult>>((resolve) => {
          finish = resolve;
        }),
    );
    const coordinator = createWidgetActionCoordinator();

    const first = coordinator.emit({ ...baseRequest, executor });
    const duplicate = coordinator.emit({ ...baseRequest, executor });

    expect(first.started).toBe(true);
    expect(duplicate.started).toBe(false);
    expect(duplicate.completion).toBe(first.completion);
    await Promise.resolve();
    expect(executor).toHaveBeenCalledTimes(1);
    const invocationId = executor.mock.calls[0]?.[0].invocationId;
    expect(invocationId).toMatch(/^surface-widget-/);

    finish?.(completed());
    const [firstResult, duplicateResult] = await Promise.all([
      first.completion,
      duplicate.completion,
    ]);
    expect(firstResult.invocationId).toBe(invocationId);
    expect(duplicateResult.invocationId).toBe(invocationId);
  });

  it('replays a durable terminal with its original id after coordinator remount', async () => {
    const stored: SurfaceWidgetStoredActionOutcome = {
      invocationId: 'surface-widget-durable-7',
      result: completed(),
    };
    const outcomeStore: SurfaceWidgetActionOutcomeStore = {
      read: vi.fn(() => stored),
      write: vi.fn(),
    };
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => completed());
    const remounted = createWidgetActionCoordinator();

    const emission = remounted.emit({ ...baseRequest, executor, outcomeStore });
    await expect(emission.completion).resolves.toMatchObject({
      invocationId: 'surface-widget-durable-7',
      replayed: true,
    });
    expect(executor).not.toHaveBeenCalled();
    expect(outcomeStore.write).not.toHaveBeenCalled();
  });

  it('distinguishes a truly new post-terminal emission in the same mounted generation', async () => {
    let stored: SurfaceWidgetStoredActionOutcome | undefined;
    const outcomeStore: SurfaceWidgetActionOutcomeStore = {
      read: () => stored,
      write: (_key, outcome) => {
        stored = outcome;
      },
    };
    const executor = vi.fn<SurfaceWidgetActionExecutor>(() => completed());
    const coordinator = createWidgetActionCoordinator();

    const first = await coordinator.emit({
      ...baseRequest,
      executor,
      outcomeStore,
    }).completion;
    const second = await coordinator.emit({
      ...baseRequest,
      executor,
      outcomeStore,
    }).completion;

    expect(executor).toHaveBeenCalledTimes(2);
    expect(first.invocationId).not.toBe(second.invocationId);
    expect(second.replayed).toBe(false);
  });

  it('passes frozen JSON input through and does not coalesce different rows', async () => {
    let finishFirst:
      | ((result: ResponseActionInvocationResult<SubmitResult>) => void)
      | undefined;
    let finishSecond:
      | ((result: ResponseActionInvocationResult<SubmitResult>) => void)
      | undefined;
    const executor = vi.fn<SurfaceWidgetActionExecutor>(
      ({ input }) =>
        new Promise<ResponseActionInvocationResult<SubmitResult>>((resolve) => {
          if ((input as { resourceId?: string } | undefined)?.resourceId === 'one') {
            finishFirst = resolve;
          } else {
            finishSecond = resolve;
          }
        }),
    );
    const coordinator = createWidgetActionCoordinator();

    const first = coordinator.emit({
      ...baseRequest,
      input: { resourceId: 'one' },
      executor,
    });
    const second = coordinator.emit({
      ...baseRequest,
      input: { resourceId: 'two' },
      executor,
    });

    await Promise.resolve();
    expect(first.started).toBe(true);
    expect(second.started).toBe(true);
    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor.mock.calls[0]?.[0].input).toEqual({ resourceId: 'one' });
    expect(Object.isFrozen(executor.mock.calls[0]?.[0].input)).toBe(true);

    finishFirst?.(completed());
    finishSecond?.(completed());
    await Promise.all([first.completion, second.completion]);
  });

  it('uses canonical input identity regardless of object key order', async () => {
    let finish: ((result: ResponseActionInvocationResult<SubmitResult>) => void) | undefined;
    const executor = vi.fn<SurfaceWidgetActionExecutor>(
      () =>
        new Promise<ResponseActionInvocationResult<SubmitResult>>((resolve) => {
          finish = resolve;
        }),
    );
    const coordinator = createWidgetActionCoordinator();
    const first = coordinator.emit({
      ...baseRequest,
      input: { resourceId: 'one', mode: 'open' },
      executor,
    });
    const duplicate = coordinator.emit({
      ...baseRequest,
      input: { mode: 'open', resourceId: 'one' },
      executor,
    });

    expect(first.started).toBe(true);
    expect(duplicate.started).toBe(false);
    await Promise.resolve();
    finish?.(completed());
    await Promise.all([first.completion, duplicate.completion]);
    expect(executor).toHaveBeenCalledTimes(1);
  });
});
