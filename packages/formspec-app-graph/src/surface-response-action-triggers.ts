/** @filedesc Surface transition trigger validation against Response Actions. */

import {
  type AppGraphContext,
  type AppGraphDiagnostic,
  type AppGraphSourcePointer,
  type ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';
import {
  CLOSED_RESPONSE_ACTION_INTENTS,
  resolvedActionIds,
  responseActionReferences,
  type ResponseActionReferences,
} from './response-action-resolution.js';
import { routeHasWidgetActionSource } from './surface-widget-actions.js';

export { CLOSED_RESPONSE_ACTION_INTENTS } from './response-action-resolution.js';

interface SurfaceTransitionTrigger {
  routeIndex: number;
  transitionIndex: number;
  routeId?: string;
  route: Record<string, unknown>;
  trigger: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringProp(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const candidate = value && Object.prototype.hasOwnProperty.call(value, key)
    ? value[key]
    : undefined;
  return typeof candidate === 'string' ? candidate : undefined;
}

function ownProp(value: Record<string, unknown> | undefined, key: string): unknown {
  return value && Object.prototype.hasOwnProperty.call(value, key)
    ? value[key]
    : undefined;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const items: Record<string, unknown>[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) continue;
    const item = record(value[index]);
    if (item) items.push(item);
  }
  return items;
}

function handlesByKind(handles: readonly ResolvedArtifactHandle[], artifactKind: string): ResolvedArtifactHandle[] {
  return handles.filter((handle) => handle.artifactKind === artifactKind && handle.status === 'loaded');
}

function transitionTriggers(surface: ResolvedArtifactHandle): SurfaceTransitionTrigger[] {
  const routes = ownProp(record(surface.document), 'routes');
  return recordArray(routes).flatMap((routeRecord, routeIndex): SurfaceTransitionTrigger[] => {
    const transitions = recordArray(ownProp(routeRecord, 'transitions'));
    return transitions.flatMap((transition, transitionIndex): SurfaceTransitionTrigger[] => {
      const trigger = stringProp(transition, 'trigger');
      if (trigger === undefined) return [];
      return [{
        routeIndex,
        transitionIndex,
        routeId: stringProp(routeRecord, 'id'),
        route: routeRecord,
        trigger,
      }];
    });
  });
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
  return stringProp(record(ownProp(slot, 'binding')), 'definitionRef');
}

function embeddedRouteRefForSlot(slot: Record<string, unknown>): string | undefined {
  if (stringProp(slot, 'slotType') !== 'embed-route') return undefined;
  return stringProp(record(ownProp(slot, 'binding')), 'routeRef');
}

function routeHasTriggerSource(
  context: AppGraphContext,
  surface: ResolvedArtifactHandle,
  trigger: SurfaceTransitionTrigger,
  actionIds: readonly string[],
  references: ResponseActionReferences,
): boolean {
  const routesValue = ownProp(record(surface.document), 'routes');
  const routes = recordArray(routesValue);
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
    const slots = recordArray(ownProp(route, 'slots'));

    for (const slot of slots) {
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

  return walk(trigger.route)
    || routeHasWidgetActionSource(context, surface, trigger.route, actionIds);
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
    message: `Surface route '${trigger.routeId ?? '<unknown>'}' transition trigger '${trigger.trigger}' resolves, but no definition-form or Registry-declared module-widget source on that route or an embedded route can produce the matching action.`,
    primarySource: triggerSource(surface, trigger),
    relatedSources: responseActionsSources(handles),
    details: {
      reason: 'transition-unfireable',
      routeId: trigger.routeId,
      trigger: trigger.trigger,
      resolvedActionIds: [...actionIds].sort(),
      triggerSourceSlotTypes: ['definition-form', 'module-widget', 'embed-route'],
    },
  };
}

export function validateSurfaceResponseActionTriggers(context: AppGraphContext): AppGraphDiagnostic[] {
  const references = responseActionReferences(context.handles);
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const surface of handlesByKind(context.handles, 'surface')) {
    for (const trigger of transitionTriggers(surface)) {
      let actionIds = resolvedActionIds(trigger.trigger, references);
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
      if (!routeHasTriggerSource(context, surface, trigger, actionIds, references)) {
        diagnostics.push(unfireableDiagnostic(surface, trigger, actionIds, context.handles));
      }
    }
  }

  return diagnostics;
}
