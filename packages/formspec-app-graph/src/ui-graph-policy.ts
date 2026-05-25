/** @filedesc Built-in UI Graph Policy validation for loaded Surface route evidence. */

import {
  type AppGraphContext,
  type AppGraphDiagnostic,
  type AppGraphSourcePointer,
  type ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';
import type { SurfaceDocument, UiGraphPolicyDocument } from '@formspec-org/types';

interface SurfaceRoute {
  id: string;
  index: number;
  slots: Map<string, number>;
}

interface IndexedRoutePolicy {
  routeId: string;
  index: number;
  collapseOrder: string[];
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

function loadedSurfaceHandles(handles: readonly ResolvedArtifactHandle[]): LoadedSurfaceHandle[] {
  return handles
    .filter((handle) => handle.artifactKind === 'surface' && handle.status === 'loaded')
    .map((handle) => handle as LoadedSurfaceHandle);
}

function surfaceRefUrl(handle: ResolvedArtifactHandle): string | undefined {
  return handle.ref?.url;
}

function surfaceSource(handle: LoadedSurfaceHandle, jsonPointer: string): AppGraphSourcePointer {
  return diagnosticSourceForHandle(handle, jsonPointer);
}

function surfaceRoutes(surface: LoadedSurfaceHandle): SurfaceRoute[] {
  return (surface.document?.routes ?? []).map((route, index): SurfaceRoute => {
    const slots = new Map<string, number>();
    for (const [slotIndex, slot] of route.slots.entries()) {
      slots.set(slot.id, slotIndex);
    }
    return { id: route.id, index, slots };
  });
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
      if (route.slots.has(slotId)) continue;
      diagnostics.push(diagnostic(
        'UI-POLICY-RESPONSIVE-SLOT',
        'A responsive collapse entry references a slot absent from the route.',
        evidenceSource(evidence, `/routePolicies/${policy.index}/responsive/collapseOrder/${slotOrderIndex}`),
        [surfaceSource(surface, `/routes/${route.index}/slots`)],
        { routeId: policy.routeId, slotId },
      ));
    }
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

export function validateUiGraphPolicySurfaceRoutes(context: AppGraphContext): AppGraphDiagnostic[] {
  const surfaces = loadedSurfaceHandles(context.handles);
  return policyEvidences(context).flatMap((evidence) => {
    const targetUrl = targetSurfaceUrl(evidence.document);
    const matchingSurfaces = surfaces.filter((surface) => surfaceRefUrl(surface) === targetUrl);
    if (matchingSurfaces.length !== 1) {
      return [targetSurfaceDiagnostic(evidence, surfaces, targetUrl)];
    }
    return validateRoutePolicies(evidence, matchingSurfaces[0], routePolicies(evidence.document));
  });
}
