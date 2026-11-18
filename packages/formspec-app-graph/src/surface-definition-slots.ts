/** @filedesc Surface definition-form slot binding cross-artifact validation against loaded Definitions. */

import {
  type AppGraphContext,
  type AppGraphDiagnostic,
  type AppGraphSourcePointer,
  type ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';
import { exactDefinitionResolution } from './data-sources.js';
import { escapeJsonPointerToken, ownProp } from './surface-widgets.js';

interface ResolvedRoute {
  route: Record<string, unknown>;
  index: number;
}

interface DefinitionFormSlot {
  route: ResolvedRoute;
  slotIndex: number;
  slotId?: string;
  definitionRef?: string;
  subjectKeys?: unknown;
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
      subjectKeys: ownProp(record(slotRecord?.binding), 'subjectKeys'),
    }];
  });
}

/** Direct mounts and the embed slots through which the same Surface renders this Definition. */
export function renderingSlots(surface: ResolvedArtifactHandle, definitionUrl: string) {
  const mounts: Pick<DefinitionFormSlot, 'route' | 'slotIndex' | 'slotId'>[] = [];
  const parents = new Map<string, typeof mounts>();
  for (const route of surfaceRoutes(surface)) {
    mounts.push(...definitionFormSlots(route).filter(slot => slot.definitionRef === definitionUrl));
    if (!Array.isArray(route.route.slots)) continue;
    route.route.slots.forEach((value, slotIndex) => {
      const slot = record(value);
      if (stringProp(slot, 'slotType') !== 'embed-route') return;
      const target = stringProp(record(slot?.binding), 'routeRef');
      if (!target) return;
      const entries = parents.get(target) ?? [];
      entries.push({ route, slotIndex, slotId: stringProp(slot, 'id') });
      parents.set(target, entries);
    });
  }
  const visited = new Set<string>();
  for (let cursor = 0; cursor < mounts.length; cursor++) {
    const id = routeId(mounts[cursor].route);
    if (!id || visited.has(id)) continue;
    visited.add(id);
    mounts.push(...(parents.get(id) ?? []));
  }
  return mounts;
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

/** Parse a Definition subject key from its route string using the Core I-JSON range. */
export function parseRouteSubjectKey(dataType: unknown, value: string): string | number | undefined {
  if (dataType === 'string') return value;
  if (dataType !== 'integer' || !/^(?:0|-?[1-9][0-9]*)$/u.test(value)) return undefined;
  const integer = Number(value);
  return Number.isSafeInteger(integer) ? integer : undefined;
}

function subjectKeyDiagnostics(
  surface: ResolvedArtifactHandle,
  slot: DefinitionFormSlot,
  definition: ResolvedArtifactHandle,
): AppGraphDiagnostic[] {
  const declared = record(record(record(definition.document)?.subject)?.keys);
  const bound = record(slot.subjectKeys) ?? {};
  const params = Array.isArray(slot.route.route.params) ? slot.route.route.params : [];
  const paramNames = new Set(params.map(param => stringProp(record(param), 'name')));
  const diagnostics: AppGraphDiagnostic[] = [];
  const pointer = `/routes/${slot.route.index}/slots/${slot.slotIndex}/binding/subjectKeys`;
  function report(reason: string, message: string, key?: string, parameter?: unknown) {
    diagnostics.push({
      code: 'APP-GRAPH-SURFACE-SUBJECT-KEYS',
      severity: 'error',
      phase: 'cross-artifact',
      origin: 'app-graph-validator',
      message,
      primarySource: diagnosticSourceForHandle(
        surface,
        key === undefined || reason === 'subject-key-unbound' ? pointer : `${pointer}/${escapeJsonPointerToken(key)}`,
      ),
      relatedSources: [diagnosticSourceForHandle(definition, '/subject')],
      details: { reason, routeId: routeId(slot.route), slotId: slot.slotId, key, parameter },
    });
  }

  if (!declared) {
    if (slot.subjectKeys !== undefined) {
      report('subject-not-declared', 'This Definition has no subject declaration. Omit subjectKeys.');
    }
    return diagnostics;
  }
  for (const key of Object.keys(declared)) {
    if (ownProp(bound, key) === undefined) {
      report('subject-key-unbound', `Bind the Definition subject key "${key}" to a route parameter.`, key);
    }
  }
  for (const [key, parameter] of Object.entries(bound)) {
    if (ownProp(declared, key) === undefined) {
      report('subject-key-undeclared', `The Definition does not declare subject key "${key}".`, key, parameter);
    } else if (typeof parameter !== 'string' || !paramNames.has(parameter)) {
      report('subject-route-parameter-undeclared', `The route does not declare parameter "${String(parameter)}" for subject key "${key}".`, key, parameter);
    }
  }
  return diagnostics;
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
        if (!declaredUrls.has(slot.definitionRef)) {
          diagnostics.push(undeclaredDiagnostic(surfaceHandle, context.manifest, slot, declaredUrls));
          continue;
        }
        for (const definition of exactDefinitionResolution(context, slot.definitionRef).candidates) {
          diagnostics.push(...subjectKeyDiagnostics(surfaceHandle, slot, definition));
        }
      }
    }
  }

  return diagnostics;
}
