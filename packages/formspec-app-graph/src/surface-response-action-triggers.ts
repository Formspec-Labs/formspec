/** @filedesc Surface transition trigger validation against Response Actions. */

import {
  type AppGraphContext,
  type AppGraphDiagnostic,
  type AppGraphSourcePointer,
  type ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';

/**
 * The closed-core Response Actions intent vocabulary a Surface transition
 * `trigger` may name without resolving to an `actions[*].id`
 * (`surface-spec.md` §4 "Transition trigger semantics"; `x-formspec-core-actions`
 * per ADR 0150 §4.9).
 *
 * Exported because a runtime router needs the same set the validator uses to
 * decide whether an authored transition is even addressable. Restating it in a
 * renderer is how a router ends up admitting a trigger the graph refuses.
 */
export const CLOSED_RESPONSE_ACTION_INTENTS: ReadonlySet<string> = new Set([
  'save-draft',
  'autosave',
  'review',
  'submit',
  'request-evidence',
]);

interface SurfaceTransitionTrigger {
  routeIndex: number;
  transitionIndex: number;
  routeId?: string;
  route: Record<string, unknown>;
  trigger: string;
}

interface ResponseActionReference {
  id: string;
  intent?: string;
  targetDefinition?: string;
}

interface ResponseActionReferences {
  actionIds: Set<string>;
  closedIntentActionIds: Map<string, string[]>;
  actions: ResponseActionReference[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringProp(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const candidate = value?.[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

function handlesByKind(handles: readonly ResolvedArtifactHandle[], artifactKind: string): ResolvedArtifactHandle[] {
  return handles.filter((handle) => handle.artifactKind === artifactKind && handle.status === 'loaded');
}

function transitionTriggers(surface: ResolvedArtifactHandle): SurfaceTransitionTrigger[] {
  const routes = record(surface.document)?.routes;
  if (!Array.isArray(routes)) return [];
  return routes.flatMap((route, routeIndex): SurfaceTransitionTrigger[] => {
    const routeRecord = record(route);
    const transitions = routeRecord?.transitions;
    if (!Array.isArray(transitions)) return [];
    return transitions.flatMap((transition, transitionIndex): SurfaceTransitionTrigger[] => {
      const trigger = stringProp(record(transition), 'trigger');
      if (trigger === undefined) return [];
      return [{
        routeIndex,
        transitionIndex,
        routeId: stringProp(routeRecord, 'id'),
        route: routeRecord ?? {},
        trigger,
      }];
    });
  });
}

function responseActionReferences(handles: readonly ResolvedArtifactHandle[]): ResponseActionReferences {
  const actionIds = new Set<string>();
  const closedIntentActionIds = new Map<string, string[]>();
  const actions: ResponseActionReference[] = [];
  for (const handle of handlesByKind(handles, 'responseActions')) {
    const document = record(handle.document);
    const documentActions = document?.actions;
    if (!Array.isArray(documentActions)) continue;
    const targetDefinition = stringProp(record(document?.targetDefinition), 'url');
    for (const action of documentActions) {
      const actionRecord = record(action);
      const id = stringProp(actionRecord, 'id');
      if (!id) continue;
      actionIds.add(id);
      const intent = stringProp(actionRecord, 'intent');
      actions.push({
        id,
        ...(intent === undefined ? {} : { intent }),
        ...(targetDefinition === undefined ? {} : { targetDefinition }),
      });
      if (intent && CLOSED_RESPONSE_ACTION_INTENTS.has(intent)) {
        const matches = closedIntentActionIds.get(intent) ?? [];
        matches.push(id);
        closedIntentActionIds.set(intent, matches);
      }
    }
  }
  return { actionIds, closedIntentActionIds, actions };
}

function triggerSource(
  surface: ResolvedArtifactHandle,
  trigger: SurfaceTransitionTrigger,
): AppGraphSourcePointer {
  return diagnosticSourceForHandle(
    surface,
    `/routes/${trigger.routeIndex}/transitions/${trigger.transitionIndex}/trigger`,
  );
}

function responseActionsSources(handles: readonly ResolvedArtifactHandle[]): AppGraphSourcePointer[] {
  return handlesByKind(handles, 'responseActions').map((handle) =>
    diagnosticSourceForHandle(handle, '/actions')
  );
}

function diagnostic(
  surface: ResolvedArtifactHandle,
  trigger: SurfaceTransitionTrigger,
  references: ResponseActionReferences,
  handles: readonly ResolvedArtifactHandle[],
  reason: 'trigger-unresolved' | 'closed-intent-unresolved' | 'closed-intent-ambiguous',
): AppGraphDiagnostic {
  const knownActions = [...references.actionIds].sort();
  const matchingActionIds = references.closedIntentActionIds.get(trigger.trigger) ?? [];
  return {
    code: 'APP-GRAPH-SURFACE-RESPONSE-ACTION-TRIGGER',
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message: `Surface route '${trigger.routeId ?? '<unknown>'}' transition trigger '${trigger.trigger}' does not resolve to a loaded Response Actions action id or to exactly one loaded Response Actions action with that closed intent.`,
    primarySource: triggerSource(surface, trigger),
    relatedSources: responseActionsSources(handles),
    details: {
      reason,
      routeId: trigger.routeId,
      trigger: trigger.trigger,
      closedIntents: [...CLOSED_RESPONSE_ACTION_INTENTS].sort(),
      knownActionIds: knownActions,
      matchingActionIds: matchingActionIds.sort(),
    },
  };
}

function definitionRefForSlot(slot: Record<string, unknown>): string | undefined {
  if (stringProp(slot, 'slotType') !== 'definition-form') return undefined;
  return stringProp(record(slot.binding), 'definitionRef');
}

function embeddedRouteRefForSlot(slot: Record<string, unknown>): string | undefined {
  if (stringProp(slot, 'slotType') !== 'embed-route') return undefined;
  return stringProp(record(slot.binding), 'routeRef');
}

function resolvedActionIds(
  trigger: SurfaceTransitionTrigger,
  references: ResponseActionReferences,
): string[] | undefined {
  if (references.actionIds.has(trigger.trigger)) return [trigger.trigger];
  if (!CLOSED_RESPONSE_ACTION_INTENTS.has(trigger.trigger)) return undefined;
  const matches = references.closedIntentActionIds.get(trigger.trigger) ?? [];
  return matches.length === 1 ? matches : undefined;
}

function routeHasTriggerSource(
  surface: ResolvedArtifactHandle,
  trigger: SurfaceTransitionTrigger,
  actionIds: readonly string[],
  references: ResponseActionReferences,
): boolean {
  const routesValue = record(surface.document)?.routes;
  if (!Array.isArray(routesValue)) return false;
  const routes = routesValue.flatMap((value): Record<string, unknown>[] => {
    const route = record(value);
    return route ? [route] : [];
  });
  const routesById = new Map<string, Record<string, unknown>[]>();
  for (const route of routes) {
    const id = stringProp(route, 'id');
    if (!id) continue;
    routesById.set(id, [...(routesById.get(id) ?? []), route]);
  }

  const visited = new Set<Record<string, unknown>>();
  const walk = (route: Record<string, unknown>): boolean => {
    if (visited.has(route)) return false;
    visited.add(route);
    const slots = route.slots;
    if (!Array.isArray(slots)) return false;

    for (const value of slots) {
      const slot = record(value);
      if (!slot) continue;
      const definitionRef = definitionRefForSlot(slot);
      if (
        definitionRef !== undefined &&
        references.actions.some(
          (action) =>
            actionIds.includes(action.id) &&
            action.targetDefinition === definitionRef,
        )
      ) {
        return true;
      }

      const routeRef = embeddedRouteRefForSlot(slot);
      if (!routeRef) continue;
      const embedded = routesById.get(routeRef) ?? [];
      if (embedded.length === 1 && walk(embedded[0]!)) return true;
    }
    return false;
  };

  return walk(trigger.route);
}

function unfireableDiagnostic(
  surface: ResolvedArtifactHandle,
  trigger: SurfaceTransitionTrigger,
  actionIds: readonly string[],
  handles: readonly ResolvedArtifactHandle[],
): AppGraphDiagnostic {
  return {
    code: 'E611',
    severity: 'warning',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message: `Surface route '${trigger.routeId ?? '<unknown>'}' transition trigger '${trigger.trigger}' resolves, but no definition-form slot on that route or an embedded route binds a Definition targeted by the matching Response Action.`,
    primarySource: triggerSource(surface, trigger),
    relatedSources: responseActionsSources(handles),
    details: {
      reason: 'transition-unfireable',
      routeId: trigger.routeId,
      trigger: trigger.trigger,
      resolvedActionIds: [...actionIds].sort(),
      triggerSourceSlotTypes: ['definition-form', 'embed-route'],
    },
  };
}

export function validateSurfaceResponseActionTriggers(context: AppGraphContext): AppGraphDiagnostic[] {
  const references = responseActionReferences(context.handles);
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const surface of handlesByKind(context.handles, 'surface')) {
    for (const trigger of transitionTriggers(surface)) {
      let actionIds = resolvedActionIds(trigger, references);
      if (actionIds === undefined && CLOSED_RESPONSE_ACTION_INTENTS.has(trigger.trigger)) {
        const matches = references.closedIntentActionIds.get(trigger.trigger) ?? [];
        diagnostics.push(diagnostic(
          surface,
          trigger,
          references,
          context.handles,
          matches.length === 0 ? 'closed-intent-unresolved' : 'closed-intent-ambiguous',
        ));
        continue;
      }
      if (actionIds === undefined) {
        diagnostics.push(diagnostic(surface, trigger, references, context.handles, 'trigger-unresolved'));
        continue;
      }
      if (!routeHasTriggerSource(surface, trigger, actionIds, references)) {
        diagnostics.push(unfireableDiagnostic(surface, trigger, actionIds, context.handles));
      }
    }
  }

  return diagnostics;
}
