/** @filedesc Surface transition trigger validation against Response Actions. */

import {
  type AppGraphContext,
  type AppGraphDiagnostic,
  type AppGraphSourcePointer,
  type ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';

const CLOSED_RESPONSE_ACTION_INTENTS = new Set([
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
  trigger: string;
}

interface ResponseActionReferences {
  actionIds: Set<string>;
  closedIntentActionIds: Map<string, string[]>;
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
        trigger,
      }];
    });
  });
}

function responseActionReferences(handles: readonly ResolvedArtifactHandle[]): ResponseActionReferences {
  const actionIds = new Set<string>();
  const closedIntentActionIds = new Map<string, string[]>();
  for (const handle of handlesByKind(handles, 'responseActions')) {
    const actions = record(handle.document)?.actions;
    if (!Array.isArray(actions)) continue;
    for (const action of actions) {
      const actionRecord = record(action);
      const id = stringProp(actionRecord, 'id');
      if (!id) continue;
      actionIds.add(id);
      const intent = stringProp(actionRecord, 'intent');
      if (intent && CLOSED_RESPONSE_ACTION_INTENTS.has(intent)) {
        const matches = closedIntentActionIds.get(intent) ?? [];
        matches.push(id);
        closedIntentActionIds.set(intent, matches);
      }
    }
  }
  return { actionIds, closedIntentActionIds };
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

export function validateSurfaceResponseActionTriggers(context: AppGraphContext): AppGraphDiagnostic[] {
  const references = responseActionReferences(context.handles);
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const surface of handlesByKind(context.handles, 'surface')) {
    for (const trigger of transitionTriggers(surface)) {
      if (references.actionIds.has(trigger.trigger)) continue;
      if (CLOSED_RESPONSE_ACTION_INTENTS.has(trigger.trigger)) {
        const matches = references.closedIntentActionIds.get(trigger.trigger) ?? [];
        if (matches.length === 1) continue;
        diagnostics.push(diagnostic(
          surface,
          trigger,
          references,
          context.handles,
          matches.length === 0 ? 'closed-intent-unresolved' : 'closed-intent-ambiguous',
        ));
        continue;
      }
      diagnostics.push(diagnostic(surface, trigger, references, context.handles, 'trigger-unresolved'));
    }
  }

  return diagnostics;
}
