/** @filedesc Surface definition-form slot binding cross-artifact validation against loaded Definitions. */

import {
  type AppGraphContext,
  type AppGraphDiagnostic,
  type AppGraphSourcePointer,
  type ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';

interface ResolvedRoute {
  route: Record<string, unknown>;
  index: number;
}

interface DefinitionFormSlot {
  route: ResolvedRoute;
  slotIndex: number;
  slotId?: string;
  definitionRef?: string;
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

function handleUrl(handle: ResolvedArtifactHandle): string | undefined {
  return stringProp(record(handle.ref), 'url') ?? stringProp(record(handle.identity), 'url');
}

function routeId(route: ResolvedRoute): string | undefined {
  return stringProp(route.route, 'id');
}

function surfaceRoutes(handle: ResolvedArtifactHandle): ResolvedRoute[] {
  const routes = record(handle.document)?.routes;
  if (!Array.isArray(routes)) return [];
  return routes.flatMap((route, index): ResolvedRoute[] => {
    const routeRecord = record(route);
    return routeRecord ? [{ route: routeRecord, index }] : [];
  });
}

function definitionFormSlots(route: ResolvedRoute): DefinitionFormSlot[] {
  const slots = route.route.slots;
  if (!Array.isArray(slots)) return [];
  return slots.flatMap((slot, slotIndex): DefinitionFormSlot[] => {
    const slotRecord = record(slot);
    if (stringProp(slotRecord, 'slotType') !== 'definition-form') return [];
    return [{
      route,
      slotIndex,
      slotId: stringProp(slotRecord, 'id'),
      definitionRef: stringProp(record(slotRecord?.binding), 'definitionRef'),
    }];
  });
}

function declaredDefinitionUrls(manifest: ResolvedArtifactHandle): Set<string> {
  const urls = new Set<string>();
  const definitions = record(manifest.document)?.definitions;
  if (!Array.isArray(definitions)) return urls;
  for (const definition of definitions) {
    const url = stringProp(record(definition), 'url');
    if (url) urls.add(url);
  }
  return urls;
}

function manifestDefinitionsSource(manifest: ResolvedArtifactHandle): AppGraphSourcePointer {
  return diagnosticSourceForHandle(manifest, '/definitions');
}

function slotSource(
  surfaceHandle: ResolvedArtifactHandle,
  slot: DefinitionFormSlot,
): AppGraphSourcePointer {
  return diagnosticSourceForHandle(
    surfaceHandle,
    `/routes/${slot.route.index}/slots/${slot.slotIndex}/binding/definitionRef`,
  );
}

function undeclaredDiagnostic(
  surfaceHandle: ResolvedArtifactHandle,
  manifest: ResolvedArtifactHandle,
  slot: DefinitionFormSlot,
  declaredUrls: Set<string>,
): AppGraphDiagnostic {
  const known = [...declaredUrls].sort();
  return {
    code: 'APP-GRAPH-SURFACE-DEFINITION-SLOT',
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message: `Surface route '${routeId(slot.route) ?? '<unknown>'}' definition-form slot '${slot.slotId ?? `[${slot.slotIndex}]`}' binding definitionRef '${slot.definitionRef}' is not declared in App Manifest definitions[].`,
    primarySource: slotSource(surfaceHandle, slot),
    relatedSources: [manifestDefinitionsSource(manifest)],
    details: {
      reason: 'definition-not-declared',
      surfaceUrl: handleUrl(surfaceHandle),
      routeId: routeId(slot.route),
      slotId: slot.slotId,
      definitionRef: slot.definitionRef,
      declaredDefinitionUrls: known,
    },
  };
}

/**
 * Surface `definition-form` slot binding URLs MUST appear in App Manifest
 * `definitions[].url` — every form-bearing slot in an app graph references a
 * Definition the manifest explicitly declares. ArtifactResolver loading of those
 * declared Definitions is a separate (resolver-phase) concern; this validator
 * catches the graph-shape gap (Surface references a Definition the manifest
 * doesn't even know about). Surface schema requires `definitionRef` when
 * `slotType === 'definition-form'`; missing-URL is a schema-phase concern, not
 * a cross-artifact one. See surface-spec §"definition-form".
 */
export function validateSurfaceDefinitionSlots(context: AppGraphContext): AppGraphDiagnostic[] {
  const surfaceHandles = handlesByKind(context.handles, 'surface');
  if (surfaceHandles.length === 0) return [];

  const declaredUrls = declaredDefinitionUrls(context.manifest);
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const surfaceHandle of surfaceHandles) {
    for (const route of surfaceRoutes(surfaceHandle)) {
      for (const slot of definitionFormSlots(route)) {
        if (slot.definitionRef === undefined) continue;
        if (declaredUrls.has(slot.definitionRef)) continue;
        diagnostics.push(undeclaredDiagnostic(surfaceHandle, context.manifest, slot, declaredUrls));
      }
    }
  }

  return diagnostics;
}
