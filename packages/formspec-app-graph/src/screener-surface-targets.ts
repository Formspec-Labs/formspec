/** @filedesc Screener surface:<route-id> terminal-hop validation for app graphs. */

import {
  type AppGraphContext,
  type AppGraphDiagnostic,
  type AppGraphSourcePointer,
  type ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';

interface ScreenerRouteTarget {
  evaluationIndex: number;
  routeIndex: number;
  target: string;
  routeId: string;
}

interface SurfaceRoute {
  handle: ResolvedArtifactHandle;
  index: number;
  routeId: string;
}

interface ManifestScreenerRef {
  url: string;
  version?: string;
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

function screenerRefsFromManifest(manifest: unknown): ManifestScreenerRef[] {
  const screeners = record(manifest)?.screeners;
  if (!Array.isArray(screeners)) return [];
  return screeners.flatMap((entry): ManifestScreenerRef[] => {
    const ref = record(entry);
    const url = stringProp(ref, 'url');
    if (!url) return [];
    return [{ url, version: stringProp(ref, 'version') }];
  });
}

function handleMatchesManifestRef(handle: ResolvedArtifactHandle, ref: ManifestScreenerRef): boolean {
  const handleRef = record(handle.ref);
  if (stringProp(handleRef, 'url') !== ref.url) return false;
  return ref.version === undefined || stringProp(handleRef, 'version') === ref.version;
}

function associatedScreeners(context: AppGraphContext): ResolvedArtifactHandle[] {
  const refs = screenerRefsFromManifest(context.manifest.document);
  if (refs.length === 0) return [];
  return handlesByKind(context.handles, 'screener').filter((handle) =>
    refs.some((ref) => handleMatchesManifestRef(handle, ref)),
  );
}

function surfaceRoutes(handle: ResolvedArtifactHandle): SurfaceRoute[] {
  const routes = record(handle.document)?.routes;
  if (!Array.isArray(routes)) return [];
  return routes.flatMap((route, index): SurfaceRoute[] => {
    const routeRecord = record(route);
    const routeId = stringProp(routeRecord, 'id');
    return routeId ? [{ handle, index, routeId }] : [];
  });
}

function screenerSurfaceTargets(handle: ResolvedArtifactHandle): ScreenerRouteTarget[] {
  const evaluation = record(handle.document)?.evaluation;
  if (!Array.isArray(evaluation)) return [];
  return evaluation.flatMap((phase, evaluationIndex): ScreenerRouteTarget[] => {
    const routes = record(phase)?.routes;
    if (!Array.isArray(routes)) return [];
    return routes.flatMap((route, routeIndex): ScreenerRouteTarget[] => {
      const target = stringProp(record(route), 'target');
      if (!target?.startsWith('surface:')) return [];
      const routeId = target.slice('surface:'.length);
      return [{ evaluationIndex, routeIndex, target, routeId }];
    });
  });
}

function targetSource(handle: ResolvedArtifactHandle, target: ScreenerRouteTarget): AppGraphSourcePointer {
  return diagnosticSourceForHandle(
    handle,
    `/evaluation/${target.evaluationIndex}/routes/${target.routeIndex}/target`,
  );
}

function routeIdSource(route: SurfaceRoute): AppGraphSourcePointer {
  return diagnosticSourceForHandle(route.handle, `/routes/${route.index}/id`);
}

function routesSource(handle: ResolvedArtifactHandle): AppGraphSourcePointer {
  return diagnosticSourceForHandle(handle, '/routes');
}

function diagnostic(
  message: string,
  primarySource: AppGraphSourcePointer,
  relatedSources: AppGraphSourcePointer[] | undefined,
  details: Record<string, unknown>,
): AppGraphDiagnostic {
  return {
    code: 'APP-GRAPH-SCREENER-SURFACE-TARGET',
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message,
    primarySource,
    relatedSources,
    details,
  };
}

export function validateScreenerSurfaceTargets(context: AppGraphContext): AppGraphDiagnostic[] {
  const surfaces = handlesByKind(context.handles, 'surface');
  const routes = surfaces.flatMap(surfaceRoutes);
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const screener of associatedScreeners(context)) {
    for (const target of screenerSurfaceTargets(screener)) {
      const matches = routes.filter((route) => route.routeId === target.routeId);
      if (matches.length === 1) continue;

      diagnostics.push(diagnostic(
        matches.length === 0
          ? `Screener target '${target.target}' does not resolve to a loaded Surface route.`
          : `Screener target '${target.target}' resolves to multiple loaded Surface routes.`,
        targetSource(screener, target),
        matches.length === 0
          ? surfaces.map(routesSource)
          : matches.map(routeIdSource),
        matches.length === 0
          ? {
              reason: 'route-unresolved',
              target: target.target,
              routeId: target.routeId,
            }
          : {
              reason: 'route-ambiguous',
              target: target.target,
              routeId: target.routeId,
              matches: matches.length,
            },
      ));
    }
  }

  return diagnostics;
}
