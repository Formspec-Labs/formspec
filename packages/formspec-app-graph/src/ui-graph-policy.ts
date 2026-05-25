/** @filedesc Built-in UI Graph Policy validation for loaded app-graph evidence. */

import {
  type AppGraphContext,
  type AppGraphDiagnostic,
  type AppGraphSourcePointer,
  type ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';
import type { LocaleDocument, SurfaceDocument, UiGraphPolicyDocument } from '@formspec-org/types';

type HiddenDefinitionRef = NonNullable<
  NonNullable<UiGraphPolicyDocument['routePolicies'][number]['definitionVisibility']>['hiddenDefinitionRefs']
>[number];

interface SurfaceRoute {
  id: string;
  index: number;
  slots: SurfaceRouteSlot[];
  slotsById: Map<string, SurfaceRouteSlot>;
}

interface SurfaceRouteSlot {
  id: string;
  index: number;
  slotType: string;
  definitionRef?: string;
}

interface IndexedRoutePolicy {
  routeId: string;
  index: number;
  collapseOrder: string[];
  hiddenDefinitionRefs: IndexedHiddenDefinitionRef[];
}

interface IndexedHiddenDefinitionRef {
  ref: HiddenDefinitionRef;
  index: number;
}

interface IndexedLocaleKeyOwner {
  keyPrefix: string;
  moduleId: string;
  index: number;
  keyPrefixModuleId?: string;
}

interface UiGraphPolicyEvidence {
  evidenceSlot: string;
  source: string;
  document: UiGraphPolicyDocument;
}

function evidenceSource(
  evidence: UiGraphPolicyEvidence,
  jsonPointer: string,
): AppGraphSourcePointer {
  return {
    artifactSlot: evidence.evidenceSlot,
    source: evidence.source,
    jsonPointer,
  };
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
    origin: 'ui-graph-policy',
    message,
    primarySource,
    relatedSources,
    details,
  };
}

type LoadedSurfaceHandle = ResolvedArtifactHandle<SurfaceDocument>;
type LoadedLocaleHandle = ResolvedArtifactHandle<LocaleDocument>;
type LoadedDefinitionHandle = ResolvedArtifactHandle;

function loadedSurfaceHandles(handles: readonly ResolvedArtifactHandle[]): LoadedSurfaceHandle[] {
  return handles
    .filter((handle) => handle.artifactKind === 'surface' && handle.status === 'loaded')
    .map((handle) => handle as LoadedSurfaceHandle);
}

function loadedLocaleHandles(handles: readonly ResolvedArtifactHandle[]): LoadedLocaleHandle[] {
  return handles
    .filter((handle) => handle.artifactKind === 'locale' && handle.status === 'loaded')
    .map((handle) => handle as LoadedLocaleHandle);
}

function loadedDefinitionHandles(handles: readonly ResolvedArtifactHandle[]): LoadedDefinitionHandle[] {
  return handles
    .filter((handle) => handle.artifactKind === 'definition' && handle.status === 'loaded');
}

function surfaceRefUrl(handle: ResolvedArtifactHandle): string | undefined {
  return handle.ref?.url;
}

function surfaceSource(handle: LoadedSurfaceHandle, jsonPointer: string): AppGraphSourcePointer {
  return diagnosticSourceForHandle(handle, jsonPointer);
}

function surfaceRoutes(surface: LoadedSurfaceHandle): SurfaceRoute[] {
  return (surface.document?.routes ?? []).map((route, index): SurfaceRoute => {
    const slots: SurfaceRouteSlot[] = [];
    const slotsById = new Map<string, SurfaceRouteSlot>();
    for (const [slotIndex, slot] of route.slots.entries()) {
      const slotView: SurfaceRouteSlot = {
        id: slot.id,
        index: slotIndex,
        slotType: slot.slotType,
        definitionRef: definitionRefFromSlot(slot),
      };
      slots.push(slotView);
      slotsById.set(slot.id, slotView);
    }
    return { id: route.id, index, slots, slotsById };
  });
}

function definitionRefFromSlot(slot: { binding?: unknown }): string | undefined {
  const binding = slot.binding;
  if (!binding || typeof binding !== 'object') return undefined;
  const definitionRef = (binding as { definitionRef?: unknown }).definitionRef;
  return typeof definitionRef === 'string' ? definitionRef : undefined;
}

function policyEvidences(context: AppGraphContext): UiGraphPolicyEvidence[] {
  return (context.hostEvidence?.uiGraphPolicies ?? []).flatMap((evidence, index): UiGraphPolicyEvidence[] => {
    const evidenceSlot = `hostEvidence.uiGraphPolicies[${index}]`;
    const result = context.evidenceResults.find((candidate) => candidate.evidenceSlot === evidenceSlot);
    if (!result || result.status !== 'completed' || !result.ok) return [];
    return [{
      evidenceSlot,
      source: evidence.source,
      document: evidence.document as UiGraphPolicyDocument,
    }];
  });
}

function targetSurfaceUrl(policy: UiGraphPolicyDocument): string {
  return policy.targetSurface.url;
}

function routePolicies(policy: UiGraphPolicyDocument): IndexedRoutePolicy[] {
  return policy.routePolicies.map((entry, index) => ({
    routeId: entry.routeId,
    index,
    collapseOrder: entry.responsive?.collapseOrder ?? [],
    hiddenDefinitionRefs: (entry.definitionVisibility?.hiddenDefinitionRefs ?? []).map((ref, refIndex) => ({
      ref,
      index: refIndex,
    })),
  }));
}

function localeKeyOwners(policy: UiGraphPolicyDocument): IndexedLocaleKeyOwner[] {
  return (policy.localeKeyOwners ?? []).map((entry, index) => ({
    keyPrefix: entry.keyPrefix,
    moduleId: entry.moduleId,
    index,
    keyPrefixModuleId: keyPrefixModuleId(entry.keyPrefix),
  }));
}

function targetSurfaceDiagnostic(
  evidence: UiGraphPolicyEvidence,
  surfaces: readonly LoadedSurfaceHandle[],
  targetUrl: string,
): AppGraphDiagnostic {
  const relatedSources = surfaces.map((surface) => surfaceSource(surface, '/ref/url'));
  return diagnostic(
    'UI-POLICY-SURFACE-TARGET',
    'Policy targets a different Surface than the loaded graph.',
    evidenceSource(evidence, '/targetSurface/url'),
    relatedSources.length > 0 ? relatedSources : undefined,
    { targetSurfaceUrl: targetUrl },
  );
}

function validateRoutePolicies(
  evidence: UiGraphPolicyEvidence,
  surface: LoadedSurfaceHandle,
  definitions: readonly LoadedDefinitionHandle[],
  policies: readonly IndexedRoutePolicy[],
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  const routes = surfaceRoutes(surface);
  const routesById = new Map(routes.map((route) => [route.id, route]));
  const firstPolicyByRoute = new Map<string, IndexedRoutePolicy>();
  const resolvedPolicyRouteIds = new Set<string>();
  let hasUnresolvedRoute = false;

  for (const policy of policies) {
    const firstPolicy = firstPolicyByRoute.get(policy.routeId);
    if (firstPolicy) {
      diagnostics.push(diagnostic(
        'UI-POLICY-ROUTE-COLLISION',
        'More than one policy entry targets the same route.',
        evidenceSource(evidence, `/routePolicies/${policy.index}/routeId`),
        [evidenceSource(evidence, `/routePolicies/${firstPolicy.index}/routeId`)],
        { routeId: policy.routeId },
      ));
      continue;
    }
    firstPolicyByRoute.set(policy.routeId, policy);
  }

  for (const policy of policies) {
    const route = routesById.get(policy.routeId);
    if (!route) {
      hasUnresolvedRoute = true;
      diagnostics.push(diagnostic(
        'UI-POLICY-ROUTE-REF',
        'A route policy references a route absent from the target Surface.',
        evidenceSource(evidence, `/routePolicies/${policy.index}/routeId`),
        [surfaceSource(surface, '/routes')],
        { routeId: policy.routeId },
      ));
      continue;
    }
    resolvedPolicyRouteIds.add(policy.routeId);

    for (const [slotOrderIndex, slotId] of policy.collapseOrder.entries()) {
      if (route.slotsById.has(slotId)) continue;
      diagnostics.push(diagnostic(
        'UI-POLICY-RESPONSIVE-SLOT',
        'A responsive collapse entry references a slot absent from the route.',
        evidenceSource(evidence, `/routePolicies/${policy.index}/responsive/collapseOrder/${slotOrderIndex}`),
        [surfaceSource(surface, `/routes/${route.index}/slots`)],
        { routeId: policy.routeId, slotId },
      ));
    }

    diagnostics.push(...validateHiddenDefinitionRefs(evidence, surface, route, policy, definitions));
  }

  if (!hasUnresolvedRoute) {
    for (const route of routes) {
      if (resolvedPolicyRouteIds.has(route.id)) continue;
      diagnostics.push(diagnostic(
        'UI-POLICY-ROUTE-MISSING',
        'Required route policy coverage is missing for a Surface route.',
        surfaceSource(surface, `/routes/${route.index}/id`),
        [evidenceSource(evidence, '/routePolicies')],
        { routeId: route.id },
      ));
    }
  }

  return diagnostics;
}

function definitionMatches(handle: LoadedDefinitionHandle, ref: HiddenDefinitionRef): boolean {
  if (handle.ref?.url !== ref.url) return false;
  return ref.version === undefined || handle.ref.version === ref.version;
}

function definitionRefDetails(
  routeId: string,
  ref: HiddenDefinitionRef,
  reason: 'unresolved-definition' | 'not-route-local',
): Record<string, unknown> {
  const details: Record<string, unknown> = {
    routeId,
    definitionRef: ref.url,
    reason,
  };
  if (ref.version !== undefined) details.definitionVersion = ref.version;
  return details;
}

function validateHiddenDefinitionRefs(
  evidence: UiGraphPolicyEvidence,
  surface: LoadedSurfaceHandle,
  route: SurfaceRoute,
  policy: IndexedRoutePolicy,
  definitions: readonly LoadedDefinitionHandle[],
): AppGraphDiagnostic[] {
  return policy.hiddenDefinitionRefs.flatMap(({ ref, index }) => {
    const primarySource = evidenceSource(
      evidence,
      `/routePolicies/${policy.index}/definitionVisibility/hiddenDefinitionRefs/${index}/url`,
    );
    if (!definitions.some((definition) => definitionMatches(definition, ref))) {
      return [diagnostic(
        'UI-POLICY-HIDDEN-DEFINITION-REF',
        'A hidden Definition ref is not a loaded Definition.',
        primarySource,
        undefined,
        definitionRefDetails(policy.routeId, ref, 'unresolved-definition'),
      )];
    }
    if (route.slots.some((slot) => slot.slotType === 'definition-form' && slot.definitionRef === ref.url)) {
      return [];
    }
    return [diagnostic(
      'UI-POLICY-HIDDEN-DEFINITION-REF',
      'A hidden Definition ref is not present as a route-local form slot.',
      primarySource,
      [surfaceSource(surface, `/routes/${route.index}/slots`)],
      definitionRefDetails(policy.routeId, ref, 'not-route-local'),
    )];
  });
}

function prefixesOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(right) || right.startsWith(left);
}

function keyPrefixModuleId(keyPrefix: string): string | undefined {
  return /^\$module\.([^.]+)\./.exec(keyPrefix)?.[1];
}

function escapeJsonPointerToken(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function validateLocaleKeyOwners(
  evidence: UiGraphPolicyEvidence,
  locales: readonly LoadedLocaleHandle[],
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  const owners = localeKeyOwners(evidence.document);
  const collidingOwnerIndexes = new Set<number>();

  for (const [rightIndex, right] of owners.entries()) {
    for (const left of owners.slice(0, rightIndex)) {
      if (left.moduleId === right.moduleId || !prefixesOverlap(left.keyPrefix, right.keyPrefix)) continue;
      collidingOwnerIndexes.add(left.index);
      collidingOwnerIndexes.add(right.index);
      diagnostics.push(diagnostic(
        'LOCALE-KEY-OWNER-COLLISION',
        'One Locale key prefix is claimed by different modules.',
        evidenceSource(evidence, `/localeKeyOwners/${right.index}/keyPrefix`),
        [evidenceSource(evidence, `/localeKeyOwners/${left.index}/keyPrefix`)],
        {
          keyPrefix: right.keyPrefix,
          moduleId: right.moduleId,
          conflictingKeyPrefix: left.keyPrefix,
          conflictingModuleId: left.moduleId,
        },
      ));
    }
  }

  for (const owner of owners) {
    if (owner.keyPrefixModuleId === undefined || owner.keyPrefixModuleId === owner.moduleId) continue;
    if (collidingOwnerIndexes.has(owner.index)) continue;
    diagnostics.push(diagnostic(
      'LOCALE-KEY-OWNER-MODULE-MISMATCH',
      'A Locale key owner moduleId does not match its $module.* key prefix segment.',
      evidenceSource(evidence, `/localeKeyOwners/${owner.index}/moduleId`),
      [evidenceSource(evidence, `/localeKeyOwners/${owner.index}/keyPrefix`)],
      {
        keyPrefix: owner.keyPrefix,
        moduleId: owner.moduleId,
        keyPrefixModuleId: owner.keyPrefixModuleId,
      },
    ));
  }

  for (const locale of locales) {
    const strings = locale.document?.strings ?? {};
    for (const key of Object.keys(strings)) {
      if (!key.startsWith('$module.')) continue;
      if (owners.some((owner) => key.startsWith(owner.keyPrefix))) continue;
      diagnostics.push(diagnostic(
        'LOCALE-KEY-OWNER',
        'A $module.* Locale key has no declared owner.',
        diagnosticSourceForHandle(locale, `/strings/${escapeJsonPointerToken(key)}`),
        [evidenceSource(evidence, '/localeKeyOwners')],
        { localeKey: key },
      ));
    }
  }

  return diagnostics;
}

export function validateUiGraphPolicy(context: AppGraphContext): AppGraphDiagnostic[] {
  const surfaces = loadedSurfaceHandles(context.handles);
  const locales = loadedLocaleHandles(context.handles);
  const definitions = loadedDefinitionHandles(context.handles);
  return policyEvidences(context).flatMap((evidence) => {
    const targetUrl = targetSurfaceUrl(evidence.document);
    const matchingSurfaces = surfaces.filter((surface) => surfaceRefUrl(surface) === targetUrl);
    if (matchingSurfaces.length !== 1) {
      return [targetSurfaceDiagnostic(evidence, surfaces, targetUrl)];
    }
    return [
      ...validateRoutePolicies(evidence, matchingSurfaces[0], definitions, routePolicies(evidence.document)),
      ...validateLocaleKeyOwners(evidence, locales),
    ];
  });
}
