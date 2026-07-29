/** @filedesc Data Sources catalog, availability, and Surface widget binding checks. */

import type {
  AppGraphContext,
  AppGraphDiagnostic,
  ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';
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
  type SurfaceWidgetSlot,
} from './surface-widgets.js';

interface CatalogSource {
  catalog: ResolvedArtifactHandle;
  catalogRef?: string;
  catalogId?: string;
  source: JsonRecord;
  sourceIndex: number;
  sourceId?: string;
}

interface BindingFailure {
  reason: string;
  details?: Record<string, unknown>;
}

function manifestDocument(context: AppGraphContext): JsonRecord | undefined {
  return record(context.manifest.document);
}

function manifestRefs(context: AppGraphContext, key: string): JsonRecord[] {
  return recordArray(ownProp(manifestDocument(context), key));
}

function catalogSources(context: AppGraphContext): CatalogSource[] {
  return handlesByKind(context.handles, 'dataSources').flatMap((catalog) => {
    const document = record(catalog.document);
    const catalogId = stringProp(document, 'id');
    const catalogRef = typeof catalog.ref?.url === 'string' ? catalog.ref.url : undefined;
    return recordArray(ownProp(document, 'sources')).map((source, sourceIndex) => ({
      catalog,
      ...(catalogRef ? { catalogRef } : {}),
      ...(catalogId ? { catalogId } : {}),
      source,
      sourceIndex,
      ...(stringProp(source, 'id') ? { sourceId: stringProp(source, 'id') } : {}),
    }));
  });
}

function catalogIdentityDiagnostics(context: AppGraphContext): AppGraphDiagnostic[] {
  const manifestedUrls = manifestRefs(context, 'dataSources')
    .map((ref) => stringProp(ref, 'url'))
    .filter((url): url is string => url !== undefined);
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const catalog of handlesByKind(context.handles, 'dataSources')) {
    const catalogRef = typeof catalog.ref?.url === 'string' ? catalog.ref.url : undefined;
    const catalogId = stringProp(record(catalog.document), 'id');
    const manifestMatches = catalogRef
      ? manifestedUrls.filter((url) => url === catalogRef).length
      : 0;
    if (catalogRef === catalogId && manifestMatches === 1) continue;
    diagnostics.push({
      code: 'DATA-SOURCE-CATALOG-REF',
      severity: 'error',
      phase: 'cross-artifact',
      origin: 'app-graph-validator',
      message: `Loaded Data Sources catalog '${catalog.slot}' must have one exact App Manifest dataSources[] reference and a matching document id.`,
      primarySource: diagnosticSourceForHandle(catalog, '/id'),
      relatedSources: [diagnosticSourceForHandle(context.manifest, '/dataSources')],
      details: {
        reason: manifestMatches !== 1 ? 'catalog-not-manifested-exactly-once' : 'catalog-id-mismatch',
        catalogRef,
        catalogId,
        manifestMatches,
      },
    });
  }

  return diagnostics;
}

function duplicateSourceDiagnostics(context: AppGraphContext): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  for (const catalog of handlesByKind(context.handles, 'dataSources')) {
    const sources = recordArray(ownProp(record(catalog.document), 'sources'));
    const indicesById = new Map<string, number[]>();
    sources.forEach((source, sourceIndex) => {
      const id = stringProp(source, 'id');
      if (!id) return;
      indicesById.set(id, [...(indicesById.get(id) ?? []), sourceIndex]);
    });
    for (const [sourceId, sourceIndices] of indicesById) {
      if (sourceIndices.length < 2) continue;
      diagnostics.push({
        code: 'DATA-SOURCE-ID-COLLISION',
        severity: 'error',
        phase: 'cross-artifact',
        origin: 'app-graph-validator',
        message: `Data Sources catalog '${catalog.slot}' declares source id '${sourceId}' more than once.`,
        primarySource: diagnosticSourceForHandle(catalog, `/sources/${sourceIndices[0]}/id`),
        relatedSources: sourceIndices.slice(1).map((index) =>
          diagnosticSourceForHandle(catalog, `/sources/${index}/id`)
        ),
        details: { sourceId, sourceIndices },
      });
    }
  }
  return diagnostics;
}

function exactDefinitionCount(context: AppGraphContext, definitionRef: string): number {
  const manifested = manifestRefs(context, 'definitions')
    .filter((ref) => stringProp(ref, 'url') === definitionRef).length;
  if (manifested !== 1) return 0;
  return handlesByKind(context.handles, 'definition').filter((definition) => {
    const documentUrl = stringProp(record(definition.document), 'url');
    return definition.ref?.url === definitionRef && documentUrl === definitionRef;
  }).length;
}

function surfacesForRef(context: AppGraphContext, surfaceRef: string): ResolvedArtifactHandle[] {
  const manifested = manifestRefs(context, 'surfaces')
    .filter((ref) => stringProp(ref, 'url') === surfaceRef).length;
  if (manifested !== 1) return [];
  return handlesByKind(context.handles, 'surface').filter(
    (surface) => surface.ref?.url === surfaceRef,
  );
}

function availabilityFailure(
  context: AppGraphContext,
  availability: JsonRecord | undefined,
): BindingFailure | undefined {
  const level = stringProp(availability, 'level');
  if (level === 'app') return undefined;
  if (level === 'definition') {
    const definitionRef = stringProp(availability, 'definitionRef');
    return definitionRef && exactDefinitionCount(context, definitionRef) === 1
      ? undefined
      : { reason: 'definition-unresolved', details: { definitionRef } };
  }
  if (level === 'module') {
    const moduleId = stringProp(availability, 'moduleId');
    return moduleId && moduleIsAdmitted(context, moduleId)
      ? undefined
      : { reason: 'module-unresolved', details: { moduleId } };
  }

  const surfaceRef = stringProp(availability, 'surfaceRef');
  const surfaces = surfaceRef ? surfacesForRef(context, surfaceRef) : [];
  if (surfaces.length !== 1) {
    return {
      reason: 'surface-unresolved',
      details: { surfaceRef, surfaceMatches: surfaces.length },
    };
  }
  if (level === 'surface') return undefined;

  const routeRef = stringProp(availability, 'routeRef');
  const routes = recordArray(ownProp(record(surfaces[0]?.document), 'routes'))
    .filter((route) => stringProp(route, 'id') === routeRef);
  if (!routeRef || routes.length !== 1) {
    return {
      reason: 'qualified-route-unresolved',
      details: { surfaceRef, routeRef, routeMatches: routes.length },
    };
  }
  if (level === 'route') return undefined;

  if (level === 'slot') {
    const slotId = stringProp(availability, 'slotId');
    const slots = recordArray(ownProp(routes[0], 'slots'))
      .filter((slot) => stringProp(slot, 'id') === slotId);
    return slotId && slots.length === 1
      ? undefined
      : {
        reason: 'qualified-slot-unresolved',
        details: { surfaceRef, routeRef, slotId, slotMatches: slots.length },
      };
  }

  return { reason: 'availability-level-unsupported', details: { level } };
}

function sourceAvailabilityDiagnostics(context: AppGraphContext): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  for (const source of catalogSources(context)) {
    const availability = record(ownProp(source.source, 'availability'));
    const failure = availabilityFailure(context, availability);
    if (failure) {
      diagnostics.push({
        code: 'DATA-SOURCE-AVAILABILITY-REF',
        severity: 'error',
        phase: 'cross-artifact',
        origin: 'app-graph-validator',
        message: `Data source '${source.sourceId ?? '<unknown>'}' has an availability selector that does not resolve in the loaded app graph.`,
        primarySource: diagnosticSourceForHandle(
          source.catalog,
          `/sources/${source.sourceIndex}/availability`,
        ),
        details: {
          ...failure.details,
          reason: failure.reason,
          catalogRef: source.catalogRef,
          sourceRef: source.sourceId,
        },
      });
    }

    const definitionRef = stringProp(source.source, 'definitionRef');
    if (definitionRef && exactDefinitionCount(context, definitionRef) !== 1) {
      diagnostics.push({
        code: 'DATA-SOURCE-AVAILABILITY-REF',
        severity: 'error',
        phase: 'cross-artifact',
        origin: 'app-graph-validator',
        message: `Data source '${source.sourceId ?? '<unknown>'}' names a Definition that does not resolve exactly once in the loaded app graph.`,
        primarySource: diagnosticSourceForHandle(
          source.catalog,
          `/sources/${source.sourceIndex}/definitionRef`,
        ),
        details: {
          reason: 'source-definition-unresolved',
          catalogRef: source.catalogRef,
          sourceRef: source.sourceId,
          definitionRef,
        },
      });
    }
  }
  return diagnostics;
}

function sourceCoversWidget(source: JsonRecord, widget: SurfaceWidgetSlot): boolean {
  const availability = record(ownProp(source, 'availability'));
  const level = stringProp(availability, 'level');
  if (level === 'app') return true;
  if (level === 'surface') {
    return stringProp(availability, 'surfaceRef') === widget.surfaceRef;
  }
  if (level === 'route') {
    return (
      stringProp(availability, 'surfaceRef') === widget.surfaceRef
      && stringProp(availability, 'routeRef') === widget.routeId
    );
  }
  if (level === 'slot') {
    return (
      stringProp(availability, 'surfaceRef') === widget.surfaceRef
      && stringProp(availability, 'routeRef') === widget.routeId
      && stringProp(availability, 'slotId') === widget.slotId
    );
  }
  if (level === 'module') {
    return stringProp(availability, 'moduleId') === widget.moduleId;
  }
  return false;
}

function bindingDiagnostic(
  widget: SurfaceWidgetSlot,
  inputName: string,
  code: string,
  reason: string,
  details: Record<string, unknown> = {},
): AppGraphDiagnostic {
  return {
    code,
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message: code === 'WIDGET-DATA-REQUIRED-UNAVAILABLE'
      ? `Required widget input '${inputName}' is not available for slot '${widget.slotId ?? '<unknown>'}'.`
      : `Widget data binding '${inputName}' is invalid for slot '${widget.slotId ?? '<unknown>'}'.`,
    primarySource: diagnosticSourceForHandle(
      widget.surface,
      `/routes/${widget.routeIndex}/slots/${widget.slotIndex}/binding/dataBindings/${escapeJsonPointerToken(inputName)}`,
    ),
    details: {
      reason,
      surfaceRef: widget.surfaceRef,
      routeId: widget.routeId,
      slotId: widget.slotId,
      moduleId: widget.moduleId,
      widgetName: widget.widgetName,
      inputName,
      ...details,
    },
  };
}

function bindingFailure(
  context: AppGraphContext,
  widget: SurfaceWidgetSlot,
  binding: JsonRecord,
): BindingFailure | undefined {
  const catalogRef = stringProp(binding, 'catalogRef');
  const sourceRef = stringProp(binding, 'sourceRef');
  const manifestedMatches = manifestRefs(context, 'dataSources')
    .filter((ref) => stringProp(ref, 'url') === catalogRef).length;
  if (!catalogRef || manifestedMatches !== 1) {
    return {
      reason: 'catalog-unmanifested',
      details: { catalogRef, manifestedMatches, sourceRef },
    };
  }

  const catalogs = handlesByKind(context.handles, 'dataSources').filter((catalog) =>
    catalog.ref?.url === catalogRef
    && stringProp(record(catalog.document), 'id') === catalogRef
  );
  if (catalogs.length !== 1) {
    return {
      reason: 'catalog-unresolved',
      details: { catalogRef, catalogMatches: catalogs.length, sourceRef },
    };
  }

  const sources = recordArray(ownProp(record(catalogs[0]?.document), 'sources'))
    .filter((source) => stringProp(source, 'id') === sourceRef);
  if (!sourceRef || sources.length !== 1) {
    return {
      reason: 'source-unresolved',
      details: { catalogRef, sourceRef, sourceMatches: sources.length },
    };
  }
  if (!sourceCoversWidget(sources[0]!, widget)) {
    return {
      reason: 'source-unavailable',
      details: { catalogRef, sourceRef, availability: ownProp(sources[0], 'availability') },
    };
  }

  const payloadSchema = ownProp(sources[0], 'schema');
  if (payloadSchema !== undefined && !record(payloadSchema)) {
    return {
      reason: 'source-payload-schema-invalid',
      details: { catalogRef, sourceRef },
    };
  }
  return undefined;
}

function widgetDataBindingDiagnostics(context: AppGraphContext): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  // Read Registry entries once so a malicious getter or order-dependent source
  // cannot produce different contribution evidence within one validation pass.
  const registryEntries = registryWidgetEntries(context);

  for (const surface of handlesByKind(context.handles, 'surface')) {
    for (const widget of surfaceWidgetSlots(surface)) {
      const contribution = resolvedWidgetContributionFromEntries(widget, registryEntries);
      if (!contribution) continue;
      const inputs = recordArray(ownProp(widgetShape(contribution), 'dataInputs'));
      const inputsByName = new Map<string, JsonRecord[]>();
      for (const input of inputs) {
        const name = stringProp(input, 'name');
        if (name) inputsByName.set(name, [...(inputsByName.get(name) ?? []), input]);
      }

      const bindings = record(ownProp(widget.binding, 'dataBindings'));
      for (const [inputName, value] of Object.entries(bindings ?? {})) {
        const declarations = inputsByName.get(inputName) ?? [];
        if (declarations.length !== 1) {
          diagnostics.push(bindingDiagnostic(
            widget,
            inputName,
            'APP-GRAPH-WIDGET-DATA-BINDING',
            declarations.length === 0 ? 'input-undeclared' : 'input-declaration-not-unique',
            { declarationMatches: declarations.length },
          ));
          continue;
        }
        const declared = declarations[0]!;
        const failure = bindingFailure(context, widget, record(value) ?? {});
        if (!failure) continue;
        const required = ownProp(declared, 'required') === true;
        diagnostics.push(bindingDiagnostic(
          widget,
          inputName,
          required ? 'WIDGET-DATA-REQUIRED-UNAVAILABLE' : 'APP-GRAPH-WIDGET-DATA-BINDING',
          failure.reason,
          failure.details,
        ));
      }

      for (const [inputName, declarations] of inputsByName) {
        if (declarations.length !== 1) continue;
        const declaration = declarations[0]!;
        if (ownProp(declaration, 'required') !== true) continue;
        if (Object.prototype.hasOwnProperty.call(bindings ?? {}, inputName)) continue;
        diagnostics.push(bindingDiagnostic(
          widget,
          inputName,
          'WIDGET-DATA-REQUIRED-UNAVAILABLE',
          'input-unbound',
        ));
      }
    }
  }
  return diagnostics;
}

/**
 * Validate Data Sources graph membership and Surface widget data references.
 *
 * This pass only examines authored descriptors. It never fetches, caches, or
 * materializes a source payload.
 */
export function validateDataSources(context: AppGraphContext): AppGraphDiagnostic[] {
  return [
    ...catalogIdentityDiagnostics(context),
    ...duplicateSourceDiagnostics(context),
    ...sourceAvailabilityDiagnostics(context),
    ...widgetDataBindingDiagnostics(context),
  ];
}
