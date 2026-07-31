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
} from '@formspec-org/react';
import type { ResponseActionsDocument } from '@formspec-org/types';
import type {
  SurfaceWidgetActionExecutor,
  SurfaceWidgetActionDetail,
  SurfaceWidgetActionExecutorInput,
  SurfaceWidgetActionOutcomeKey,
  SurfaceWidgetActionOutcomeStore,
  SurfaceWidgetActionInput,
  SurfaceWidgetActionValue,
  SurfaceWidgetStoredActionOutcome,
} from './widget-api.js';

let invocationSequence = 0;

const UNSAFE_INPUT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_INPUT_DEPTH = 64;
const MAX_INPUT_NODES = 10_000;

export type SurfaceWidgetActionInputAdmission =
  | {
      accepted: true;
      input?: SurfaceWidgetActionInput | undefined;
    }
  | {
      accepted: false;
      reason: string;
    };

/**
 * Admit detached JSON data without invoking getters or following prototypes.
 * This is a data boundary, not a serializer: invalid values fail closed.
 */
export function admitSurfaceWidgetActionInput(
  candidate: unknown,
): SurfaceWidgetActionInputAdmission {
  if (candidate === undefined) return { accepted: true };
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    return { accepted: false, reason: 'the action input must be an object' };
  }

  const active = new WeakSet<object>();
  let nodeCount = 0;
  const copy = (
    value: unknown,
    depth: number,
  ): SurfaceWidgetActionValue | undefined => {
    nodeCount += 1;
    if (nodeCount > MAX_INPUT_NODES || depth > MAX_INPUT_DEPTH) {
      throw new TypeError('the action input exceeds the supported size or nesting limit');
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new TypeError('the action input contains a non-finite number');
      }
      return value;
    }
    if (typeof value !== 'object') {
      throw new TypeError(`the action input contains a ${typeof value} value`);
    }
    if (active.has(value)) {
      throw new TypeError('the action input contains a cycle');
    }
    const prototype = Object.getPrototypeOf(value);
    if (
      prototype !== Object.prototype &&
      prototype !== Array.prototype &&
      prototype !== null
    ) {
      throw new TypeError('the action input contains a non-JSON object');
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError('the action input contains a symbol-keyed property');
    }
    active.add(value);
    try {
      if (Array.isArray(value)) {
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const result: SurfaceWidgetActionValue[] = [];
        for (const key of Object.keys(descriptors)) {
          if (key === 'length') continue;
          if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length) {
            throw new TypeError('the action input contains a non-JSON array property');
          }
        }
        for (let index = 0; index < value.length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (
            !descriptor ||
            !Object.prototype.hasOwnProperty.call(descriptor, 'value')
          ) {
            throw new TypeError('the action input contains a sparse or accessor array value');
          }
          const child = copy(descriptor.value, depth + 1);
          if (child === undefined) {
            throw new TypeError('the action input contains an unsupported array value');
          }
          result.push(child);
        }
        return Object.freeze(result);
      }
      const result: Record<string, SurfaceWidgetActionValue> =
        Object.create(null) as Record<string, SurfaceWidgetActionValue>;
      const descriptors = Object.getOwnPropertyDescriptors(value);
      for (const key of Object.keys(descriptors).sort()) {
        if (UNSAFE_INPUT_KEYS.has(key)) {
          throw new TypeError(`the action input contains unsafe key "${key}"`);
        }
        const descriptor = descriptors[key];
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          throw new TypeError('the action input contains an accessor property');
        }
        const child = copy(descriptor.value, depth + 1);
        if (child === undefined) {
          throw new TypeError('the action input contains an unsupported object value');
        }
        result[key] = child;
      }
      return Object.freeze(result);
    } finally {
      active.delete(value);
    }
  };

  try {
    const input = copy(candidate, 0);
    if (!input || Array.isArray(input) || typeof input !== 'object') {
      return { accepted: false, reason: 'the action input must be an object' };
    }
    return {
      accepted: true,
      input: input as SurfaceWidgetActionInput,
    };
  } catch (error) {
    return {
      accepted: false,
      reason: error instanceof Error
        ? error.message
        : 'the action input is not valid JSON data',
    };
  }
}

function canonicalInput(input: SurfaceWidgetActionInput | undefined): string {
  if (input === undefined) return '';
  const visit = (value: SurfaceWidgetActionValue): string => {
    if (Array.isArray(value)) {
      return `[${value.map(visit).join(',')}]`;
    }
    if (value !== null && typeof value === 'object') {
      const objectValue = value as Readonly<Record<string, SurfaceWidgetActionValue>>;
      return `{${Object.keys(objectValue)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${visit(objectValue[key]!)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  };
  return visit(input);
}

/** Shell-owned identity. Widgets and executors cannot choose it. */
export function allocateWidgetActionInvocationId(): string {
  invocationSequence += 1;
  return `surface-widget-${Date.now().toString(36)}-${invocationSequence.toString(36)}`;
}

export function normalizeWidgetActionResult(
  result: ResponseActionInvokerResult<SurfaceWidgetActionDetail>,
): ResponseActionInvocationResult<SurfaceWidgetActionDetail> {
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
  const match = matches.length === 1 ? matches[0] : undefined;
  return match?.scope === 'app' && match.targetDefinition === undefined
    ? match
    : undefined;
}

export interface DeliverWidgetActionRequest extends SurfaceWidgetActionExecutorInput {
  generation: string;
  executor: SurfaceWidgetActionExecutor;
}

export interface WidgetActionDelivery {
  deliver(
    request: DeliverWidgetActionRequest,
  ): Promise<ResponseActionInvocationResult<SurfaceWidgetActionDetail>>;
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
  const inFlight = new Map<
    string,
    Promise<ResponseActionInvocationResult<SurfaceWidgetActionDetail>>
  >();
  const terminals = new Map<
    string,
    ResponseActionInvocationResult<SurfaceWidgetActionDetail>
  >();

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
            ...(request.input === undefined ? {} : { input: request.input }),
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
  input?: SurfaceWidgetActionInput | undefined;
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
    canonicalInput(request.input),
  ];
  return parts.map((part) => `${part.length}:${part}`).join('|');
}

function logicalOutcomeKey(
  request: EmitWidgetActionRequest,
): SurfaceWidgetActionOutcomeKey {
  return {
    generation: request.generation,
    source: request.source,
    ...(request.input === undefined ? {} : { input: request.input }),
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
      const admission = admitSurfaceWidgetActionInput(request.input);
      if (!admission.accepted) {
        throw new TypeError(admission.reason);
      }
      const admittedRequest: EmitWidgetActionRequest = {
        ...request,
        ...(admission.input === undefined ? {} : { input: admission.input }),
      };
      const key = logicalKey(admittedRequest);
      const pending = inFlight.get(key);
      if (pending) return { started: false, completion: pending };

      const completion = (async (): Promise<CoordinatedWidgetActionResult> => {
        const observed = observedDurableIds.get(key) ?? new Set<string>();
        observedDurableIds.set(key, observed);
        const persisted = await admittedRequest.outcomeStore?.read(
          logicalOutcomeKey(admittedRequest),
        );
        if (persisted && !observed.has(persisted.invocationId)) {
          observed.add(persisted.invocationId);
          return { ...persisted, replayed: true };
        }

        const invocationId = allocateWidgetActionInvocationId();
        const result = await delivery.deliver({
          generation: request.generation,
          document: admittedRequest.document,
          actionRef: admittedRequest.actionRef,
          invocationId,
          source: admittedRequest.source,
          ...(admittedRequest.input === undefined
            ? {}
            : { input: admittedRequest.input }),
          executor: admittedRequest.executor,
        });
        observed.add(invocationId);
        await admittedRequest.outcomeStore?.write(logicalOutcomeKey(admittedRequest), {
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
