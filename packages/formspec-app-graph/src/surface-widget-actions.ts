/** @filedesc Surface module-widget action binding and transition checks. */

import type {
  AppGraphContext,
  AppGraphDiagnostic,
  ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';
import {
  resolvedActionIds,
  responseActionReferences,
  type ResponseActionReferences,
} from './response-action-resolution.js';
import {
  escapeJsonPointerToken,
  handlesByKind,
  moduleIsAdmitted,
  ownProp,
  record,
  recordArray,
  registryWidgetEntries,
  resolvedWidgetContributionFromEntries,
  stringProp,
  surfaceWidgetSlots,
  widgetShape,
  type JsonRecord,
  type RegistryWidgetEntry,
  type SurfaceWidgetSlot,
} from './surface-widgets.js';

interface ResolvedWidgetActionSource {
  widget: SurfaceWidgetSlot;
  outputName: string;
  actionRef: string;
}

interface TransitionMatch {
  transition: JsonRecord;
  transitionIndex: number;
  trigger: string;
}

interface ConfiguredStateOutput {
  outputName: string;
  pointer: string;
}

const MODULE_WIDGET_STATE_NAMES = new Set([
  'loading',
  'empty',
  'unavailable',
  'error',
]);

function configuredStateOutputs(widget: SurfaceWidgetSlot): ConfiguredStateOutput[] {
  const config = record(ownProp(widget.binding, 'config'));
  const stateViews = record(ownProp(config, 'stateViews'));
  return Object.entries(stateViews ?? {}).flatMap(([state, candidate]) => {
    if (!MODULE_WIDGET_STATE_NAMES.has(state)) return [];
    return recordArray(ownProp(record(candidate), 'actions')).flatMap(
      (action, actionIndex) => {
        if (stringProp(action, 'kind') !== 'output') return [];
        const outputName = stringProp(action, 'outputName');
        return outputName
          ? [{
              outputName,
              pointer:
                `/routes/${widget.routeIndex}/slots/${widget.slotIndex}` +
                `/binding/config/stateViews/${escapeJsonPointerToken(state)}` +
                `/actions/${actionIndex}/outputName`,
            }]
          : [];
      },
    );
  });
}

function declaredActionOutputs(contribution: RegistryWidgetEntry): Map<string, number> {
  const counts = new Map<string, number>();
  for (const output of recordArray(ownProp(widgetShape(contribution), 'actionOutputs'))) {
    const name = stringProp(output, 'name');
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

function actionBindingPointer(widget: SurfaceWidgetSlot, outputName: string): string {
  return `/routes/${widget.routeIndex}/slots/${widget.slotIndex}/binding/actionBindings/${escapeJsonPointerToken(outputName)}`;
}

function actionMatches(references: ResponseActionReferences, actionRef: string): number {
  return references.actions.filter((action) => action.id === actionRef).length;
}

function validActionsForWidget(
  context: AppGraphContext,
  widget: SurfaceWidgetSlot,
  entries: readonly RegistryWidgetEntry[],
  references: ResponseActionReferences,
): ResolvedWidgetActionSource[] {
  if (context.moduleResolution && !moduleIsAdmitted(context, widget.moduleId)) return [];
  const contribution = resolvedWidgetContributionFromEntries(widget, entries);
  if (!contribution) return [];
  const outputs = declaredActionOutputs(contribution);
  const bindings = record(ownProp(widget.binding, 'actionBindings'));
  return Object.entries(bindings ?? {}).flatMap(([outputName, value]) => {
    const actionRef = stringProp(record(value), 'actionRef');
    return (
      outputs.get(outputName) === 1
      && actionRef
      && actionMatches(references, actionRef) === 1
    )
      ? [{ widget, outputName, actionRef }]
      : [];
  });
}

function widgetActionBindingDiagnostics(
  context: AppGraphContext,
  entries: readonly RegistryWidgetEntry[],
  references: ResponseActionReferences,
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  for (const surface of handlesByKind(context.handles, 'surface')) {
    for (const widget of surfaceWidgetSlots(surface)) {
      const contribution = resolvedWidgetContributionFromEntries(widget, entries);
      if (!contribution) continue;
      const outputs = declaredActionOutputs(contribution);
      const bindings = record(ownProp(widget.binding, 'actionBindings'));
      for (const [outputName, value] of Object.entries(bindings ?? {})) {
        const binding = record(value);
        const actionRef = stringProp(binding, 'actionRef');
        const outputMatches = outputs.get(outputName) ?? 0;
        if (outputMatches !== 1) {
          diagnostics.push({
            code: 'E612',
            severity: 'error',
            phase: 'cross-artifact',
            origin: 'app-graph-validator',
            message: `Surface widget output '${outputName}' is not declared exactly once by Registry widget '${widget.widgetName}'.`,
            primarySource: diagnosticSourceForHandle(
              widget.surface,
              actionBindingPointer(widget, outputName),
            ),
            relatedSources: [
              diagnosticSourceForHandle(
                contribution.registry,
                `/entries/${contribution.entryIndex}/widgetShape/actionOutputs`,
              ),
            ],
            details: {
              reason: outputMatches === 0
                ? 'widget-output-undeclared'
                : 'widget-output-not-unique',
              surfaceRef: widget.surfaceRef,
              routeId: widget.routeId,
              slotId: widget.slotId,
              moduleId: widget.moduleId,
              widgetName: widget.widgetName,
              outputName,
              outputMatches,
            },
          });
        }
        const matches = actionRef ? actionMatches(references, actionRef) : 0;
        if (matches !== 1) {
          diagnostics.push({
            code: 'E612',
            severity: 'error',
            phase: 'cross-artifact',
            origin: 'app-graph-validator',
            message: `Surface widget output '${outputName}' actionRef '${actionRef ?? '<missing>'}' does not resolve to exactly one loaded Response Actions action.`,
            primarySource: diagnosticSourceForHandle(
              widget.surface,
              `${actionBindingPointer(widget, outputName)}/actionRef`,
            ),
            relatedSources: handlesByKind(context.handles, 'responseActions').map((handle) =>
              diagnosticSourceForHandle(handle, '/actions')
            ),
            details: {
              reason: 'widget-action-ref-unresolved',
              surfaceRef: widget.surfaceRef,
              routeId: widget.routeId,
              slotId: widget.slotId,
              moduleId: widget.moduleId,
              widgetName: widget.widgetName,
              outputName,
              actionRef,
              actionMatches: matches,
            },
          });
        }
      }

      for (const use of configuredStateOutputs(widget)) {
        const outputMatches = outputs.get(use.outputName) ?? 0;
        if (outputMatches !== 1) {
          diagnostics.push({
            code: 'E612',
            severity: 'error',
            phase: 'cross-artifact',
            origin: 'app-graph-validator',
            message: `Module-widget state action output '${use.outputName}' is not declared exactly once by Registry widget '${widget.widgetName}'.`,
            primarySource: diagnosticSourceForHandle(widget.surface, use.pointer),
            relatedSources: [diagnosticSourceForHandle(
              contribution.registry,
              `/entries/${contribution.entryIndex}/widgetShape/actionOutputs`,
            )],
            details: {
              reason: 'state-action-output-undeclared',
              surfaceRef: widget.surfaceRef,
              routeId: widget.routeId,
              slotId: widget.slotId,
              moduleId: widget.moduleId,
              widgetName: widget.widgetName,
              outputName: use.outputName,
              outputMatches,
            },
          });
          continue;
        }
        const binding = record(ownProp(bindings, use.outputName));
        if (!binding) {
          diagnostics.push({
            code: 'E612',
            severity: 'error',
            phase: 'cross-artifact',
            origin: 'app-graph-validator',
            message: `Module-widget state action output '${use.outputName}' has no Surface action binding.`,
            primarySource: diagnosticSourceForHandle(widget.surface, use.pointer),
            details: {
              reason: 'state-action-output-unmapped',
              surfaceRef: widget.surfaceRef,
              routeId: widget.routeId,
              slotId: widget.slotId,
              moduleId: widget.moduleId,
              widgetName: widget.widgetName,
              outputName: use.outputName,
            },
          });
          continue;
        }
        const actionRef = stringProp(binding, 'actionRef');
        const matches = actionRef
          ? references.actions.filter((action) => action.id === actionRef)
          : [];
        if (matches.length !== 1) continue;
        const match = matches[0]!;
        const action = recordArray(ownProp(record(match.handle.document), 'actions'))[
          match.actionIndex
        ];
        const literal = stringProp(record(ownProp(action, 'label')), 'literal');
        if (literal && literal.length > 0) continue;
        diagnostics.push({
          code: 'E612',
          severity: 'error',
          phase: 'cross-artifact',
          origin: 'app-graph-validator',
          message: `Module-widget state action output '${use.outputName}' resolves to action '${actionRef}', but that action has no non-empty literal label.`,
          primarySource: diagnosticSourceForHandle(widget.surface, use.pointer),
          relatedSources: [diagnosticSourceForHandle(
            match.handle,
            `/actions/${match.actionIndex}/label`,
          )],
          details: {
            reason: 'state-action-label-not-renderable',
            surfaceRef: widget.surfaceRef,
            routeId: widget.routeId,
            slotId: widget.slotId,
            moduleId: widget.moduleId,
            widgetName: widget.widgetName,
            outputName: use.outputName,
            actionRef,
          },
        });
      }
    }
  }
  return diagnostics;
}

function routesForSurface(surface: ResolvedArtifactHandle): JsonRecord[] {
  return recordArray(ownProp(record(surface.document), 'routes'));
}

function routeActionSources(
  context: AppGraphContext,
  surface: ResolvedArtifactHandle,
  route: JsonRecord,
  entries: readonly RegistryWidgetEntry[],
  references: ResponseActionReferences,
): ResolvedWidgetActionSource[] {
  const routes = routesForSurface(surface);
  const routesById = new Map<string, JsonRecord[]>();
  for (const candidate of routes) {
    const id = stringProp(candidate, 'id');
    if (id) routesById.set(id, [...(routesById.get(id) ?? []), candidate]);
  }
  const widgets = surfaceWidgetSlots(surface);
  const visited = new Set<JsonRecord>();
  const sources: ResolvedWidgetActionSource[] = [];

  const walk = (candidate: JsonRecord): void => {
    if (visited.has(candidate)) return;
    visited.add(candidate);
    for (const widget of widgets.filter((entry) => entry.route === candidate)) {
      sources.push(...validActionsForWidget(context, widget, entries, references));
    }
    for (const slot of recordArray(ownProp(candidate, 'slots'))) {
      if (stringProp(slot, 'slotType') !== 'embed-route') continue;
      const routeRef = stringProp(record(ownProp(slot, 'binding')), 'routeRef');
      const matches = routeRef ? routesById.get(routeRef) ?? [] : [];
      if (matches.length === 1) walk(matches[0]!);
    }
  };
  walk(route);

  const unique = new Map<string, ResolvedWidgetActionSource>();
  for (const source of sources) {
    const key = [
      source.widget.routeIndex,
      source.widget.slotIndex,
      source.outputName,
      source.actionRef,
    ].join('\u0000');
    unique.set(key, source);
  }
  return [...unique.values()];
}

export function routeHasWidgetActionSource(
  context: AppGraphContext,
  surface: ResolvedArtifactHandle,
  route: JsonRecord,
  actionIds: readonly string[],
): boolean {
  const entries = registryWidgetEntries(context);
  const references = responseActionReferences(context.handles);
  return routeActionSources(context, surface, route, entries, references)
    .some((source) => actionIds.includes(source.actionRef));
}

function matchingTransitions(
  route: JsonRecord,
  actionRef: string,
  references: ResponseActionReferences,
): TransitionMatch[] {
  return recordArray(ownProp(route, 'transitions')).flatMap((transition, transitionIndex) => {
    const trigger = stringProp(transition, 'trigger');
    if (!trigger) return [];
    const actionIds = resolvedActionIds(trigger, references);
    return actionIds?.includes(actionRef)
      ? [{ transition, transitionIndex, trigger }]
      : [];
  });
}

function widgetTransitionDiagnostics(
  context: AppGraphContext,
  entries: readonly RegistryWidgetEntry[],
  references: ResponseActionReferences,
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  for (const surface of handlesByKind(context.handles, 'surface')) {
    const routes = routesForSurface(surface);
    for (const [routeIndex, route] of routes.entries()) {
      const sources = routeActionSources(context, surface, route, entries, references);
      const sourcesByAction = new Map<string, ResolvedWidgetActionSource[]>();
      for (const source of sources) {
        sourcesByAction.set(source.actionRef, [
          ...(sourcesByAction.get(source.actionRef) ?? []),
          source,
        ]);
      }

      for (const [actionRef, actionSources] of sourcesByAction) {
        const transitions = matchingTransitions(route, actionRef, references);
        if (transitions.length === 1) continue;
        const primary = actionSources[0]!;
        if (transitions.length === 0) {
          diagnostics.push({
            code: 'APP-GRAPH-WIDGET-ACTION-TRANSITION',
            severity: 'info',
            phase: 'cross-artifact',
            origin: 'app-graph-validator',
            message: `Completed widget action '${actionRef}' has no eligible transition on route '${stringProp(route, 'id') ?? '<unknown>'}'; the route remains unchanged.`,
            primarySource: diagnosticSourceForHandle(
              primary.widget.surface,
              actionBindingPointer(primary.widget, primary.outputName),
            ),
            details: {
              reason: 'no-eligible-transition',
              surfaceRef: surface.ref?.url,
              routeId: stringProp(route, 'id'),
              routeIndex,
              actionRef,
              eligibleTransitions: 0,
              outcome: 'stay',
            },
          });
          continue;
        }

        diagnostics.push({
          code: 'WIDGET-ACTION-TRANSITION-AMBIGUOUS',
          severity: 'error',
          phase: 'cross-artifact',
          origin: 'app-graph-validator',
          message: `Completed widget action '${actionRef}' selects more than one transition on route '${stringProp(route, 'id') ?? '<unknown>'}'.`,
          primarySource: diagnosticSourceForHandle(
            primary.widget.surface,
            actionBindingPointer(primary.widget, primary.outputName),
          ),
          relatedSources: transitions.map((transition) =>
            diagnosticSourceForHandle(
              surface,
              `/routes/${routeIndex}/transitions/${transition.transitionIndex}/trigger`,
            )
          ),
          details: {
            reason: 'multiple-eligible-transitions',
            surfaceRef: surface.ref?.url,
            routeId: stringProp(route, 'id'),
            routeIndex,
            actionRef,
            eligibleTransitions: transitions.length,
            transitionIndices: transitions.map((transition) => transition.transitionIndex),
            outcome: 'refuse',
          },
        });
      }
    }
  }
  return diagnostics;
}

export function validateSurfaceWidgetActions(context: AppGraphContext): AppGraphDiagnostic[] {
  const entries = registryWidgetEntries(context);
  const references = responseActionReferences(context.handles);
  return [
    ...widgetActionBindingDiagnostics(context, entries, references),
    ...widgetTransitionDiagnostics(context, entries, references),
  ];
}
