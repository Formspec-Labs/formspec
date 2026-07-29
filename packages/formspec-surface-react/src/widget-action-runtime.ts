/**
 * @filedesc Runtime delivery discipline for one widget-emitted action.
 *
 * Widgets never call this module. They receive only `emitAction(outputName)`.
 * The Surface binding resolves the output, allocates the invocation identity,
 * and uses this delivery controller to ensure one executor call for one logical
 * invocation. A host outcome store can replay an already-recorded terminal.
 */
import type {
  ResponseActionInvocationResult,
  ResponseActionInvokerResult,
  SubmitResult,
} from '@formspec-org/react';
import type { ResponseActionsDocument } from '@formspec-org/types';
import type {
  SurfaceWidgetActionExecutor,
  SurfaceWidgetActionExecutorInput,
  SurfaceWidgetActionOutcomeKey,
  SurfaceWidgetActionOutcomeStore,
  SurfaceWidgetStoredActionOutcome,
} from './widget-api.js';

let invocationSequence = 0;

/** Shell-owned identity. Widgets and executors cannot choose it. */
export function allocateWidgetActionInvocationId(): string {
  invocationSequence += 1;
  return `surface-widget-${Date.now().toString(36)}-${invocationSequence.toString(36)}`;
}

export function normalizeWidgetActionResult(
  result: ResponseActionInvokerResult<SubmitResult>,
): ResponseActionInvocationResult<SubmitResult> {
  return 'invocation' in result ? result.invocation : result;
}

/**
 * Select the document only when one exact loaded action declaration exists.
 * Repeated ids across or within documents are ambiguous and resolve to none.
 */
export function responseActionsDocumentForAction(
  documents: readonly ResponseActionsDocument[],
  actionRef: string,
): ResponseActionsDocument | undefined {
  const matches = documents.flatMap((document) =>
    (document.actions ?? [])
      .filter((action) => action.id === actionRef)
      .map(() => document),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export interface DeliverWidgetActionRequest extends SurfaceWidgetActionExecutorInput {
  generation: string;
  executor: SurfaceWidgetActionExecutor;
}

export interface WidgetActionDelivery {
  deliver(
    request: DeliverWidgetActionRequest,
  ): Promise<ResponseActionInvocationResult<SubmitResult>>;
}

function keyFor(request: DeliverWidgetActionRequest): string {
  const parts = [
    request.generation,
    request.source.route.surfaceId,
    request.source.route.routeId,
    request.source.slotId,
    request.source.outputName,
    request.invocationId,
  ];
  return parts.map((part) => `${part.length}:${part}`).join('|');
}

/**
 * One in-memory delivery domain, normally one mounted widget slot. Duplicate
 * delivery with the same generation/slot/output/invocation shares a Promise;
 * later duplicates replay the terminal. Different invocation ids remain
 * distinct user emissions.
 */
export function createWidgetActionDelivery(): WidgetActionDelivery {
  const inFlight = new Map<string, Promise<ResponseActionInvocationResult<SubmitResult>>>();
  const terminals = new Map<string, ResponseActionInvocationResult<SubmitResult>>();

  return {
    deliver(request) {
      const key = keyFor(request);
      const terminal = terminals.get(key);
      if (terminal) return Promise.resolve(terminal);
      const pending = inFlight.get(key);
      if (pending) return pending;

      const delivery = (async () => {
        const result = normalizeWidgetActionResult(
          await request.executor({
            document: request.document,
            actionRef: request.actionRef,
            invocationId: request.invocationId,
            source: request.source,
          }),
        );
        terminals.set(key, result);
        return result;
      })();
      inFlight.set(key, delivery);
      void delivery.then(
        () => inFlight.delete(key),
        () => inFlight.delete(key),
      );
      return delivery;
    },
  };
}

export interface EmitWidgetActionRequest {
  generation: string;
  document: ResponseActionsDocument;
  actionRef: string;
  source: SurfaceWidgetActionExecutorInput['source'];
  executor: SurfaceWidgetActionExecutor;
  outcomeStore?: SurfaceWidgetActionOutcomeStore | undefined;
}

export interface CoordinatedWidgetActionResult
  extends SurfaceWidgetStoredActionOutcome {
  replayed: boolean;
}

export interface CoordinatedWidgetActionEmission {
  /** False only for a duplicate call while this logical output is in flight. */
  started: boolean;
  completion: Promise<CoordinatedWidgetActionResult>;
}

export interface WidgetActionCoordinator {
  emit(request: EmitWidgetActionRequest): CoordinatedWidgetActionEmission;
}

function logicalKey(request: EmitWidgetActionRequest): string {
  const parts = [
    request.generation,
    request.source.route.surfaceId,
    request.source.route.routeId,
    request.source.slotId,
    request.source.outputName,
    request.actionRef,
  ];
  return parts.map((part) => `${part.length}:${part}`).join('|');
}

function logicalOutcomeKey(
  request: EmitWidgetActionRequest,
): SurfaceWidgetActionOutcomeKey {
  return {
    generation: request.generation,
    source: request.source,
  };
}

/**
 * Shell-owned logical invocation coordinator.
 *
 * - Two calls for the same generation/slot/output before terminal share one
 *   invocation, executor call and Promise.
 * - A durable outcome returned after remount carries and reuses its original
 *   invocation id.
 * - Once this coordinator has observed a terminal, a later call is a genuinely
 *   new emission and receives a new id even if a simple store still returns its
 *   last recorded terminal.
 */
export function createWidgetActionCoordinator(): WidgetActionCoordinator {
  const delivery = createWidgetActionDelivery();
  const inFlight = new Map<string, Promise<CoordinatedWidgetActionResult>>();
  const observedDurableIds = new Map<string, Set<string>>();

  return {
    emit(request) {
      const key = logicalKey(request);
      const pending = inFlight.get(key);
      if (pending) return { started: false, completion: pending };

      const completion = (async (): Promise<CoordinatedWidgetActionResult> => {
        const observed = observedDurableIds.get(key) ?? new Set<string>();
        observedDurableIds.set(key, observed);
        const persisted = await request.outcomeStore?.read(
          logicalOutcomeKey(request),
        );
        if (persisted && !observed.has(persisted.invocationId)) {
          observed.add(persisted.invocationId);
          return { ...persisted, replayed: true };
        }

        const invocationId = allocateWidgetActionInvocationId();
        const result = await delivery.deliver({
          generation: request.generation,
          document: request.document,
          actionRef: request.actionRef,
          invocationId,
          source: request.source,
          executor: request.executor,
        });
        observed.add(invocationId);
        await request.outcomeStore?.write(logicalOutcomeKey(request), {
          invocationId,
          result,
        });
        return { invocationId, result, replayed: false };
      })();
      inFlight.set(key, completion);
      void completion.then(
        () => inFlight.delete(key),
        () => inFlight.delete(key),
      );
      return { started: true, completion };
    },
  };
}
