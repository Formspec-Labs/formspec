/** @filedesc Surface module-widget action binding and transition checks. */

import { targetDefinitionMatches } from '@formspec-org/types';
import type {
  AppGraphContext,
  AppGraphDiagnostic,
  ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';
import { bindingFailure, exactDefinitionResolution } from './data-sources.js';
import { widgetActionScopeMatches } from './widget-action-scope.js';
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

function actionMatches(
  references: ResponseActionReferences,
  actionRef: string,
): ResponseActionReferences['actions'] {
  return references.actions.filter((action) => action.id === actionRef);
}

/** Reuse manifested Definition and qualified source ownership for every widget consumer. */
export function widgetActionOwnershipMatches(
  context: AppGraphContext,
  widget: SurfaceWidgetSlot,
  contribution: RegistryWidgetEntry,
  binding: JsonRecord | undefined,
  action: ResponseActionReferences['actions'][number],
): boolean {
  const document = record(action.handle.document);
  if (!document) return false;
  const responseInput = ownProp(binding, 'responseInput');
  const inputs = recordArray(ownProp(widgetShape(contribution), 'dataInputs')).map((input) => ({
    name: stringProp(input, 'name') ?? '', required: ownProp(input, 'required') === true,
  }));
  if (action.scope === 'app') return widgetActionScopeMatches({ document, responseInput, inputs });
  if (action.scope !== 'response' || typeof responseInput !== 'string') return false;
  const dataBinding = record(ownProp(record(ownProp(widget.binding, 'dataBindings')), responseInput));
  if (!dataBinding || bindingFailure(context, widget, dataBinding)) return false;
  const catalog = handlesByKind(context.handles, 'dataSources').find((candidate) =>
    candidate.ref?.url === stringProp(dataBinding, 'catalogRef'));
  const source = recordArray(ownProp(record(catalog?.document), 'sources')).find((candidate) =>
    stringProp(candidate, 'id') === stringProp(dataBinding, 'sourceRef'));
  const resolution = exactDefinitionResolution(context, action.targetDefinition ?? '');
  const definition = record(resolution.definition?.document);
  const url = stringProp(definition, 'url');
  const version = stringProp(definition, 'version');
  if (resolution.status !== 'resolved' || !url || !version) return false;
  return widgetActionScopeMatches({
    document, responseInput, inputs, sourceSchema: ownProp(source, 'schema'), definition: { url, version },
  });
}

const SIGNING_CEREMONY_DELIVERY_CONTRACT_ID = '@formspec-org/surface-react/SigningCeremony@0.1';

function serviceRequestOperationMatches(
  reference: ResponseActionReferences['actions'][number],
  expectedOperation: 'prepare' | 'sign',
): boolean {
  if (reference.scope !== 'response') return false;
  const document = record(reference.handle.document);
  const action = recordArray(ownProp(document, 'actions'))[reference.actionIndex];
  const catalog = record(ownProp(document, 'x-formspec-runtime'));
  const requests = recordArray(ownProp(catalog, 'requests'));
  const operations: string[] = [];
  for (const effect of recordArray(ownProp(action, 'effects'))) {
    if (stringProp(effect, 'type') !== 'serviceRequest') continue;
    const id = stringProp(effect, 'requestRef');
    const matches = requests.filter(request => id && stringProp(request, 'id') === id);
    if (matches.length !== 1) return false;
    const operation = stringProp(matches[0], 'operation');
    if (operation !== undefined) operations.push(operation);
  }
  return operations.length === 1 && operations[0] === expectedOperation;
}

/** The maintained ceremony maps its Sign output to a response-scoped signing request. */
function ceremonySignMatches(contribution: RegistryWidgetEntry, output: string,
  reference: ResponseActionReferences['actions'][number]): boolean {
  if (output !== 'sign' || stringProp(widgetShape(contribution), 'deliveryContractId')
      !== SIGNING_CEREMONY_DELIVERY_CONTRACT_ID) return true;
  return serviceRequestOperationMatches(reference, 'sign');
}

function routeMountsDefinition(
  surfaceRoutes: readonly JsonRecord[],
  route: JsonRecord,
  definitionRef: string,
): boolean {
  const routesById = new Map<string, JsonRecord[]>();
  for (const candidate of surfaceRoutes) {
    const id = stringProp(candidate, 'id');
    if (id) routesById.set(id, [...(routesById.get(id) ?? []), candidate]);
  }
  const visited = new Set<JsonRecord>();
  const walk = (candidate: JsonRecord): boolean => {
    if (visited.has(candidate)) return false;
    visited.add(candidate);
    for (const slot of recordArray(ownProp(candidate, 'slots'))) {
      const slotType = stringProp(slot, 'slotType');
      const binding = record(ownProp(slot, 'binding'));
      if (slotType === 'definition-form' && stringProp(binding, 'definitionRef') === definitionRef) {
        return true;
      }
      if (slotType === 'embed-route') {
        const ref = stringProp(binding, 'routeRef');
        const matches = ref ? routesById.get(ref) ?? [] : [];
        if (matches.length === 1 && walk(matches[0]!)) return true;
      }
    }
    return false;
  };
  return walk(route);
}

function mappingRelatesDefinitions(
  context: AppGraphContext,
  mappingRef: string,
  upstreamDefinitionUrl: string,
  downstreamDefinitionUrl: string,
): boolean {
  const manifestMappings = recordArray(ownProp(record(context.manifest.document), 'mappings'))
    .filter(entry => stringProp(entry, 'handle') === mappingRef);
  if (manifestMappings.length !== 1) return false;
  const mappingUrl = stringProp(manifestMappings[0], 'url');
  if (!mappingUrl) return false;
  const loadedMappings = handlesByKind(context.handles, 'mapping')
    .filter(handle => handle.ref?.url === mappingUrl);
  if (loadedMappings.length !== 1) return false;
  const doc = record(loadedMappings[0]!.document);
  const defRef = stringProp(doc, 'definitionRef');
  const targetUrl = stringProp(record(ownProp(doc, 'targetSchema')), 'url');
  if (!defRef || !targetUrl) return false;
  return (defRef === upstreamDefinitionUrl && targetUrl === downstreamDefinitionUrl)
    || (defRef === downstreamDefinitionUrl && targetUrl === upstreamDefinitionUrl);
}

function ceremonyDraftProducerDiagnostic(
  context: AppGraphContext,
  widget: SurfaceWidgetSlot,
  contribution: RegistryWidgetEntry,
  references: ResponseActionReferences,
): AppGraphDiagnostic | null {
  if (stringProp(widgetShape(contribution), 'deliveryContractId') !== SIGNING_CEREMONY_DELIVERY_CONTRACT_ID) {
    return null;
  }
  const dataBindings = record(ownProp(widget.binding, 'dataBindings'));
  const draftBinding = record(ownProp(dataBindings, 'draft'));
  const hasDraftInput = recordArray(ownProp(widgetShape(contribution), 'dataInputs'))
    .some(input => stringProp(input, 'name') === 'draft');
  if (!draftBinding) {
    return null;
  }
  if (!hasDraftInput && !ownProp(draftBinding, 'producer')) {
    return null;
  }
  const basePointer = `/routes/${widget.routeIndex}/slots/${widget.slotIndex}/binding/dataBindings/draft`;
  const fail = (
    reason: string,
    message: string,
    pointer: string,
    details: Record<string, unknown> = {},
    relatedSources?: AppGraphDiagnostic['relatedSources'],
  ): AppGraphDiagnostic => ({
    code: 'E612',
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message,
    primarySource: diagnosticSourceForHandle(widget.surface, pointer),
    ...(relatedSources && relatedSources.length > 0 ? { relatedSources } : {}),
    details: {
      reason,
      surfaceRef: widget.surfaceRef,
      routeId: widget.routeId,
      slotId: widget.slotId,
      moduleId: widget.moduleId,
      widgetName: widget.widgetName,
      ...details,
    },
  });

  const producer = record(ownProp(draftBinding, 'producer'));
  if (!producer) {
    return fail(
      'ceremony-prepare-producer-missing',
      'Signing ceremony draft binding must declare a typed producer referencing its upstream route, Definition, and Prepare action.',
      basePointer,
    );
  }
  const routeRef = stringProp(producer, 'routeRef');
  const definitionRef = stringProp(producer, 'definitionRef');
  const actionRef = stringProp(producer, 'actionRef');

  const surfaceRoutes = routesForSurface(widget.surface);
  const routeMatches = routeRef ? surfaceRoutes.filter(r => stringProp(r, 'id') === routeRef) : [];
  if (routeMatches.length !== 1) {
    return fail(
      'ceremony-prepare-route-unresolved',
      `Signing ceremony draft producer routeRef '${routeRef ?? '<missing>'}' does not resolve to one route in this Surface.`,
      `${basePointer}/producer/routeRef`,
      { routeRef },
    );
  }
  const upstreamRoute = routeMatches[0]!;

  const defResolution = definitionRef ? exactDefinitionResolution(context, definitionRef) : undefined;
  const defDoc = record(defResolution?.definition?.document);
  const defUrl = stringProp(defDoc, 'url');
  const defVersion = stringProp(defDoc, 'version');
  if (!definitionRef || !defResolution || defResolution.status !== 'resolved' || !defUrl || !defVersion
      || !routeMountsDefinition(surfaceRoutes, upstreamRoute, definitionRef)) {
    return fail(
      'ceremony-prepare-definition-unresolved',
      `Signing ceremony draft producer definitionRef '${definitionRef ?? '<missing>'}' must resolve to a manifested Definition mounted on route '${routeRef}'.`,
      `${basePointer}/producer/definitionRef`,
      { routeRef, definitionRef },
    );
  }

  const actionCandidates = actionRef ? actionMatches(references, actionRef) : [];
  if (actionCandidates.length !== 1) {
    return fail(
      'ceremony-prepare-action-unresolved',
      `Signing ceremony draft producer actionRef '${actionRef ?? '<missing>'}' does not resolve to one loaded Response Actions action.`,
      `${basePointer}/producer/actionRef`,
      { routeRef, definitionRef, actionRef },
    );
  }
  const prepAction = actionCandidates[0]!;
  const prepDoc = record(prepAction.handle.document);
  const prepTarget = record(ownProp(prepDoc, 'targetDefinition'));
  const targetUrl = stringProp(prepTarget, 'url');
  const targetVersions = stringProp(prepTarget, 'compatibleVersions');
  const targetMatches = prepAction.scope === 'response'
    && targetUrl === definitionRef
    && targetDefinitionMatches(
      { url: targetUrl, ...(targetVersions ? { compatibleVersions: targetVersions } : {}) },
      { url: defUrl, version: defVersion },
    );
  if (!targetMatches || !serviceRequestOperationMatches(prepAction, 'prepare')) {
    return fail(
      'ceremony-prepare-operation',
      `Signing ceremony draft producer actionRef '${actionRef}' must be a response-scoped Action for '${definitionRef}' with one signing request whose operation is prepare.`,
      `${basePointer}/producer/actionRef`,
      { routeRef, definitionRef, actionRef },
      [diagnosticSourceForHandle(prepAction.handle, `/actions/${prepAction.actionIndex}`)],
    );
  }

  // Determine the ceremony's downstream signing Definition URL (from its Sign action binding, if bound).
  const actionBindings = record(ownProp(widget.binding, 'actionBindings'));
  const signActionRef = stringProp(record(ownProp(actionBindings, 'sign')), 'actionRef');
  const signMatches = signActionRef ? actionMatches(references, signActionRef) : [];
  const downstreamDefinitionUrl = signMatches.length === 1 && signMatches[0]!.scope === 'response'
    ? signMatches[0]!.targetDefinition
    : undefined;
  if (downstreamDefinitionUrl && downstreamDefinitionUrl !== definitionRef) {
    const relation = record(ownProp(producer, 'relation'));
    const mappingRef = stringProp(relation, 'kind') === 'mapping'
      ? stringProp(relation, 'mappingRef')
      : undefined;
    if (!mappingRef || !mappingRelatesDefinitions(context, mappingRef, definitionRef, downstreamDefinitionUrl)) {
      return fail(
        'ceremony-prepare-cross-definition-unrelated',
        `Signing ceremony draft producer targets Definition '${definitionRef}' while Sign targets '${downstreamDefinitionUrl}' without a valid declared Mapping relation.`,
        `${basePointer}/producer`,
        { routeRef, definitionRef, downstreamDefinitionUrl, ...(mappingRef ? { mappingRef } : {}) },
      );
    }
  }

  return null;
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
  const draftProducerInvalid = ceremonyDraftProducerDiagnostic(context, widget, contribution, references) !== null;
  return Object.entries(bindings ?? {}).flatMap(([outputName, value]) => {
    const actionRef = stringProp(record(value), 'actionRef');
    const matches = actionRef ? actionMatches(references, actionRef) : [];
    return (
      outputs.get(outputName) === 1
      && actionRef
      && matches.length === 1
      && ceremonySignMatches(contribution, outputName, matches[0]!)
      && !(outputName === 'sign' && draftProducerInvalid)
      && widgetActionOwnershipMatches(context, widget, contribution, record(value), matches[0]!)
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
      const producerDiagnostic = ceremonyDraftProducerDiagnostic(context, widget, contribution, references);
      if (producerDiagnostic) diagnostics.push(producerDiagnostic);
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
        const matches = actionRef ? actionMatches(references, actionRef) : [];
        if (matches.length !== 1) {
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
              reason: matches.length > 1
                ? 'widget-action-ref-ambiguous'
                : 'widget-action-ref-unresolved',
              surfaceRef: widget.surfaceRef,
              routeId: widget.routeId,
              slotId: widget.slotId,
              moduleId: widget.moduleId,
              widgetName: widget.widgetName,
              outputName,
              actionRef,
              actionMatches: matches.length,
            },
          });
        } else if (!widgetActionOwnershipMatches(context, widget, contribution, binding, matches[0]!)) {
          diagnostics.push({
            code: 'E612',
            severity: 'error',
            phase: 'cross-artifact',
            origin: 'app-graph-validator',
            message: `Surface widget output '${outputName}' actionRef '${actionRef}' has no admitted action scope: app actions omit responseInput; response actions require a qualified canonical Response input and loaded compatible Definition.`,
            primarySource: diagnosticSourceForHandle(
              widget.surface,
              `${actionBindingPointer(widget, outputName)}/actionRef`,
            ),
            relatedSources: [diagnosticSourceForHandle(
              matches[0]!.handle,
              `/actions/${matches[0]!.actionIndex}`,
            )],
            details: {
              reason: 'widget-action-scope-mismatch',
              surfaceRef: widget.surfaceRef,
              routeId: widget.routeId,
              slotId: widget.slotId,
              moduleId: widget.moduleId,
              widgetName: widget.widgetName,
              outputName,
              actionRef,
              actualScope: matches[0]!.scope,
              responseInput: stringProp(binding, 'responseInput'),
            },
          });
        } else if (!ceremonySignMatches(contribution, outputName, matches[0]!)) {
          const action = matches[0]!;
          diagnostics.push({
            code: 'E612',
            severity: 'error',
            phase: 'cross-artifact',
            origin: 'app-graph-validator',
            message: 'Map the signing ceremony Sign output to a response Action with one signing request whose operation is sign.',
            primarySource: diagnosticSourceForHandle(widget.surface, actionBindingPointer(widget, outputName)),
            relatedSources: [diagnosticSourceForHandle(action.handle, `/actions/${action.actionIndex}`)],
            details: { reason: 'ceremony-sign-operation', outputName, actionRef },
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
        const matches = actionRef ? actionMatches(references, actionRef) : [];
        if (matches.length !== 1 || !widgetActionOwnershipMatches(context, widget, contribution,
          record(ownProp(bindings, use.outputName)), matches[0]!)) continue;
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
