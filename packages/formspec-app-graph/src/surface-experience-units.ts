/** @filedesc Surface experience-unit slot validation for app graphs. */

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

interface ExperienceUnitSlot {
  route: ResolvedRoute;
  slotIndex: number;
  slotId?: string;
  unitRef: string;
  experienceRef?: string;
}

interface RouteDefinitionRefs {
  refs: string[];
  sources: AppGraphSourcePointer[];
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

function handleId(handle: ResolvedArtifactHandle): string | undefined {
  return stringProp(record(handle.identity), 'id');
}

function targetDefinitionUrl(handle: ResolvedArtifactHandle): string | undefined {
  return stringProp(record(record(handle.document)?.targetDefinition), 'url');
}

function surfaceUrl(handle: ResolvedArtifactHandle): string | undefined {
  return handleUrl(handle);
}

function routeId(route: ResolvedRoute): string | undefined {
  return stringProp(route.route, 'id');
}

function routeSlots(route: ResolvedRoute): unknown[] {
  const slots = route.route.slots;
  return Array.isArray(slots) ? slots : [];
}

function surfaceRoutes(handle: ResolvedArtifactHandle): ResolvedRoute[] {
  const routes = record(handle.document)?.routes;
  if (!Array.isArray(routes)) return [];
  return routes.flatMap((route, index): ResolvedRoute[] => {
    const routeRecord = record(route);
    return routeRecord ? [{ route: routeRecord, index }] : [];
  });
}

function experienceUnitSlots(route: ResolvedRoute): ExperienceUnitSlot[] {
  return routeSlots(route).flatMap((slot, slotIndex): ExperienceUnitSlot[] => {
    const slotRecord = record(slot);
    if (stringProp(slotRecord, 'slotType') !== 'experience-unit') return [];
    const binding = record(slotRecord?.binding);
    const unitRef = stringProp(binding, 'unitRef');
    if (!unitRef) return [];
    return [{
      route,
      slotIndex,
      slotId: stringProp(slotRecord, 'id'),
      unitRef,
      experienceRef: stringProp(binding, 'experienceRef'),
    }];
  });
}

function routeDefinitionRefs(surfaceHandle: ResolvedArtifactHandle, route: ResolvedRoute): RouteDefinitionRefs {
  const refs: string[] = [];
  const sources: AppGraphSourcePointer[] = [];
  for (const [slotIndex, slot] of routeSlots(route).entries()) {
    const slotRecord = record(slot);
    if (stringProp(slotRecord, 'slotType') !== 'definition-form') continue;
    const definitionRef = stringProp(record(slotRecord?.binding), 'definitionRef');
    const source = diagnosticSourceForHandle(
      surfaceHandle,
      `/routes/${route.index}/slots/${slotIndex}/binding/definitionRef`,
    );
    if (definitionRef) refs.push(definitionRef);
    sources.push(source);
  }
  return {
    refs,
    sources: sources.length > 0
      ? sources
      : [diagnosticSourceForHandle(surfaceHandle, `/routes/${route.index}/slots`)],
  };
}

function matchingExperienceHandles(
  handles: readonly ResolvedArtifactHandle[],
  experienceRef: string | undefined,
): ResolvedArtifactHandle[] {
  const experiences = handlesByKind(handles, 'experience');
  if (!experienceRef) return experiences;
  return experiences.filter((handle) =>
    handleUrl(handle) === experienceRef || handleId(handle) === experienceRef
  );
}

function experienceUnitSource(
  experience: ResolvedArtifactHandle,
  unitRef: string,
): AppGraphSourcePointer | undefined {
  const units = record(experience.document)?.units;
  if (!Array.isArray(units)) return undefined;
  for (const [index, unit] of units.entries()) {
    if (stringProp(record(unit), 'id') === unitRef) {
      return diagnosticSourceForHandle(experience, `/units/${index}/id`);
    }
  }
  return undefined;
}

function diagnostic(
  code: string,
  message: string,
  primarySource: AppGraphSourcePointer,
  relatedSources?: AppGraphSourcePointer[],
  details?: Record<string, unknown>,
): AppGraphDiagnostic {
  return {
    code,
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message,
    primarySource,
    relatedSources,
    details,
  };
}

function slotSource(
  surfaceHandle: ResolvedArtifactHandle,
  slot: ExperienceUnitSlot,
  property: 'experienceRef' | 'unitRef',
): AppGraphSourcePointer {
  return diagnosticSourceForHandle(
    surfaceHandle,
    `/routes/${slot.route.index}/slots/${slot.slotIndex}/binding/${property}`,
  );
}

function slotDetails(
  surfaceHandle: ResolvedArtifactHandle,
  slot: ExperienceUnitSlot,
  reason: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    surfaceUrl: surfaceUrl(surfaceHandle),
    routeId: routeId(slot.route),
    slotId: slot.slotId,
    unitRef: slot.unitRef,
    ...(slot.experienceRef ? { experienceRef: slot.experienceRef } : {}),
    reason,
    ...extra,
  };
}

export function validateSurfaceExperienceUnits(context: AppGraphContext): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const surfaceHandle of handlesByKind(context.handles, 'surface')) {
    for (const route of surfaceRoutes(surfaceHandle)) {
      for (const slot of experienceUnitSlots(route)) {
        const experiences = matchingExperienceHandles(context.handles, slot.experienceRef);
        if (experiences.length !== 1) {
          const primary = slot.experienceRef
            ? slotSource(surfaceHandle, slot, 'experienceRef')
            : slotSource(surfaceHandle, slot, 'unitRef');
          diagnostics.push(diagnostic(
            'APP-GRAPH-SURFACE-EXPERIENCE-UNIT-REF',
            slot.experienceRef
              ? `Surface route '${routeId(route) ?? '<unknown>'}' references Experience '${slot.experienceRef}', but that Experience does not resolve to exactly one loaded Experience document.`
              : `Surface route '${routeId(route) ?? '<unknown>'}' contains an experience-unit slot, but the app graph has no unique loaded Experience document.`,
            primary,
            undefined,
            slotDetails(
              surfaceHandle,
              slot,
              experiences.length === 0 ? 'experience-unresolved' : 'experience-ambiguous',
            ),
          ));
          continue;
        }

        const experience = experiences[0];
        const unitSource = experienceUnitSource(experience, slot.unitRef);
        if (!unitSource) {
          diagnostics.push(diagnostic(
            'APP-GRAPH-SURFACE-EXPERIENCE-UNIT-REF',
            `Surface route '${routeId(route) ?? '<unknown>'}' references Experience unit '${slot.unitRef}', but no loaded Experience units[].id matches it.`,
            slotSource(surfaceHandle, slot, 'unitRef'),
            [diagnosticSourceForHandle(experience, '/units')],
            slotDetails(surfaceHandle, slot, 'unit-unresolved', {
              experienceUrl: handleUrl(experience),
            }),
          ));
          continue;
        }

        const targetDefinition = targetDefinitionUrl(experience);
        if (!targetDefinition) continue;
        const routeDefinitions = routeDefinitionRefs(surfaceHandle, route);
        if (routeDefinitions.refs.includes(targetDefinition)) continue;

        diagnostics.push(diagnostic(
          'APP-GRAPH-SURFACE-EXPERIENCE-UNIT-DEFINITION',
          `Surface route '${routeId(route) ?? '<unknown>'}' mounts Experience unit '${slot.unitRef}' for Definition '${targetDefinition}', but the route has no matching definition-form slot.`,
          slotSource(surfaceHandle, slot, 'unitRef'),
          [
            diagnosticSourceForHandle(experience, '/targetDefinition/url'),
            ...routeDefinitions.sources,
          ],
          slotDetails(surfaceHandle, slot, 'route-definition-mismatch', {
            experienceUrl: handleUrl(experience),
            targetDefinition,
            routeDefinitionRefs: routeDefinitions.refs,
          }),
        ));
      }
    }
  }

  return diagnostics;
}
