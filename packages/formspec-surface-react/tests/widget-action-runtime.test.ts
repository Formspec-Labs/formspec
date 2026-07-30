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
} from '../src/widget-action-runtime.js';
import type {
  SurfaceWidgetActionExecutor,
  SurfaceWidgetActionOutcomeStore,
  SurfaceWidgetStoredActionOutcome,
} from '../src/widget-api.js';

const action = { id: 'acceptReceipt', intent: 'review' };
const document = {
  $formspecResponseActions: '1.0',
  version: '1.0.0',
  targetDefinition: { url: 'urn:def' },
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
