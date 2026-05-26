/** @filedesc Validates host-supplied Component graph projection context evidence. */

import {
  type AppGraphContext,
  type AppGraphDiagnostic,
  type AppGraphSourcePointer,
  type ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';

interface ComponentGraphContextEvidence {
  evidenceSlot: string;
  schemaId: string;
  source: string;
  document: ComponentGraphProjectionContextLike;
}

interface ComponentGraphProjectionContextLike {
  component: {
    handle: string;
    url?: string;
    version?: string;
  };
  surface: {
    url: string;
    version?: string;
  };
  route: string;
}

interface ComponentMembership {
  handle: string;
  url: string;
  version?: string;
  pointer: string;
}

interface ManifestRef {
  url: string;
  version?: string;
  pointer: string;
}

const EXACT_SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const COMPONENT_GRAPH_CONTEXT_SCHEMA_ID = 'https://formspec.org/schemas/componentGraphProjectionContext/0.1';

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringProp(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const candidate = value?.[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

function refVersion(ref: Record<string, unknown> | undefined): string | undefined {
  return stringProp(ref, 'version');
}

function isExactVersion(value: string | undefined): value is string {
  return typeof value === 'string' && EXACT_SEMVER.test(value);
}

function versionsConflict(left: string | undefined, right: string | undefined): boolean {
  return isExactVersion(left) && isExactVersion(right) && left !== right;
}

function refsFromManifest(manifest: unknown, key: string): ManifestRef[] {
  const entries = record(manifest)?.[key];
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry, index): ManifestRef[] => {
    const ref = record(entry);
    const url = stringProp(ref, 'url');
    if (!url) return [];
    return [{
      url,
      version: refVersion(ref),
      pointer: `/${key}/${index}`,
    }];
  });
}

function componentMembershipsFromManifest(manifest: unknown): ComponentMembership[] {
  const singular = record(record(manifest)?.component);
  const singularUrl = stringProp(singular, 'url');
  const componentEntries = record(manifest)?.components;
  const components = Array.isArray(componentEntries)
    ? componentEntries.flatMap((entry, index): ComponentMembership[] => {
      const ref = record(entry);
      const url = stringProp(ref, 'url');
      const handle = stringProp(ref, 'handle');
      if (!url || !handle) return [];
      return [{
        handle,
        url,
        version: refVersion(ref),
        pointer: `/components/${index}`,
      }];
    })
    : [];
  return [
    ...(singularUrl ? [{
      handle: 'default',
      url: singularUrl,
      version: refVersion(singular),
      pointer: '/component',
    }] : []),
    ...components,
  ];
}

function loadedHandlesByKind(
  handles: readonly ResolvedArtifactHandle[],
  artifactKind: string,
): ResolvedArtifactHandle[] {
  return handles.filter((handle) => handle.artifactKind === artifactKind && handle.status === 'loaded');
}

function evidenceSource(
  evidence: ComponentGraphContextEvidence,
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
    origin: 'app-graph-validator',
    message,
    primarySource,
    relatedSources,
    details,
  };
}

function contextEvidences(context: AppGraphContext): ComponentGraphContextEvidence[] {
  return (context.hostEvidence?.componentGraphContexts ?? []).flatMap((evidence, index): ComponentGraphContextEvidence[] => {
    const evidenceSlot = `hostEvidence.componentGraphContexts[${index}]`;
    const result = context.evidenceResults.find((candidate) => candidate.evidenceSlot === evidenceSlot);
    if (
      !result ||
      result.status !== 'completed' ||
      !result.ok ||
      evidence.schemaId !== COMPONENT_GRAPH_CONTEXT_SCHEMA_ID ||
      result.schemaId !== evidence.schemaId ||
      result.source !== evidence.source
    ) {
      return [];
    }
    const document = componentGraphProjectionContextLike(evidence.document);
    if (!document) return [];
    return [{
      evidenceSlot,
      schemaId: evidence.schemaId,
      source: evidence.source,
      document,
    }];
  });
}

function componentGraphProjectionContextLike(value: unknown): ComponentGraphProjectionContextLike | undefined {
  const context = record(value);
  const component = record(context?.component);
  const surface = record(context?.surface);
  const handle = stringProp(component, 'handle');
  const surfaceUrl = stringProp(surface, 'url');
  const route = stringProp(context, 'route');
  if (!component || !surface || !handle || !surfaceUrl || !route) return undefined;
  return {
    component: {
      handle,
      url: stringProp(component, 'url'),
      version: refVersion(component),
    },
    surface: {
      url: surfaceUrl,
      version: refVersion(surface),
    },
    route,
  };
}

function loadedComponentFor(
  handles: readonly ResolvedArtifactHandle[],
  membership: ComponentMembership,
): ResolvedArtifactHandle | undefined | 'ambiguous' {
  const candidates = loadedHandlesByKind(handles, 'component').filter((handle) => {
    const ref = record(handle.ref);
    const refHandle = stringProp(ref, 'handle');
    const refUrl = stringProp(ref, 'url');
    if (refHandle) return refHandle === membership.handle && refUrl === membership.url;
    if (refUrl !== membership.url) return false;
    const version = refVersion(ref);
    return !version || !membership.version || version === membership.version;
  });
  if (candidates.length === 0) return undefined;
  if (candidates.length > 1) return 'ambiguous';
  return candidates[0];
}

function loadedSurfaceFor(
  handles: readonly ResolvedArtifactHandle[],
  surfaceUrl: string,
): ResolvedArtifactHandle | undefined | 'ambiguous' {
  const candidates = loadedHandlesByKind(handles, 'surface').filter((handle) =>
    stringProp(record(handle.ref), 'url') === surfaceUrl
  );
  if (candidates.length === 0) return undefined;
  if (candidates.length > 1) return 'ambiguous';
  return candidates[0];
}

function routeExists(surface: ResolvedArtifactHandle, routeId: string): boolean {
  const routes = record(surface.document)?.routes;
  return Array.isArray(routes) && routes
    .map(record)
    .some((route) => stringProp(route, 'id') === routeId);
}

function componentTargetMatches(
  component: ResolvedArtifactHandle,
  context: ComponentGraphProjectionContextLike,
): boolean {
  const targets = record(component.document)?.targetSurfaceRoutes;
  if (!Array.isArray(targets)) return false;
  return targets.some((targetValue) => {
    const target = record(targetValue);
    const surface = record(target?.surface);
    const surfaceUrl = stringProp(surface, 'url');
    const surfaceVersion = refVersion(surface);
    const route = stringProp(target, 'route');
    return surfaceUrl === context.surface.url
      && route === context.route
      && !versionsConflict(surfaceVersion, context.surface.version);
  });
}

function targetRouteSources(component: ResolvedArtifactHandle): AppGraphSourcePointer[] {
  const targets = record(component.document)?.targetSurfaceRoutes;
  if (!Array.isArray(targets)) return [diagnosticSourceForHandle(component, '/targetSurfaceRoutes')];
  return targets.map((_, index) => diagnosticSourceForHandle(component, `/targetSurfaceRoutes/${index}`));
}

function appendMembershipDiagnostics(
  diagnostics: AppGraphDiagnostic[],
  evidence: ComponentGraphContextEvidence,
  membership: ComponentMembership | undefined,
): membership is ComponentMembership {
  const context = evidence.document;
  if (!membership) {
    diagnostics.push(diagnostic(
      'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-MEMBERSHIP',
      `Component graph context references Component handle '${context.component.handle}', but App Manifest has no matching component membership.`,
      evidenceSource(evidence, '/document/component/handle'),
      undefined,
      { componentHandle: context.component.handle },
    ));
    return false;
  }
  if (context.component.url && context.component.url !== membership.url) {
    diagnostics.push(diagnostic(
      'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-COMPONENT',
      `Component graph context handle '${context.component.handle}' uses Component URL '${context.component.url}', but App Manifest membership uses '${membership.url}'.`,
      evidenceSource(evidence, '/document/component/url'),
      undefined,
      { componentHandle: context.component.handle, contextUrl: context.component.url, membershipUrl: membership.url },
    ));
    return false;
  }
  if (versionsConflict(context.component.version, membership.version)) {
    diagnostics.push(diagnostic(
      'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-COMPONENT-VERSION',
      `Component graph context handle '${context.component.handle}' pins Component version '${context.component.version}', but App Manifest membership pins '${membership.version}'.`,
      evidenceSource(evidence, '/document/component/version'),
      undefined,
      { componentHandle: context.component.handle, contextVersion: context.component.version, membershipVersion: membership.version },
    ));
    return false;
  }
  return true;
}

export function validateComponentGraphContexts(context: AppGraphContext): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  const memberships = componentMembershipsFromManifest(context.manifest.document);
  const surfaces = refsFromManifest(context.manifest.document, 'surfaces');

  for (const evidence of contextEvidences(context)) {
    const graphContext = evidence.document;
    const membership = memberships.find((entry) => entry.handle === graphContext.component.handle);
    if (!appendMembershipDiagnostics(diagnostics, evidence, membership)) continue;

    const component = loadedComponentFor(context.handles, membership);
    if (component === undefined) {
      diagnostics.push(diagnostic(
        'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-COMPONENT-UNLOADED',
        `Component graph context references Component handle '${graphContext.component.handle}', but no loaded Component handle resolves to that App Manifest membership.`,
        evidenceSource(evidence, '/document/component/handle'),
        [diagnosticSourceForHandle(context.manifest, membership.pointer)],
        { componentHandle: graphContext.component.handle },
      ));
      continue;
    }
    if (component === 'ambiguous') {
      diagnostics.push(diagnostic(
        'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-COMPONENT-AMBIGUOUS',
        `Component graph context references Component handle '${graphContext.component.handle}', but multiple loaded Component handles resolve to that App Manifest membership.`,
        evidenceSource(evidence, '/document/component/handle'),
        [diagnosticSourceForHandle(context.manifest, membership.pointer)],
        { componentHandle: graphContext.component.handle },
      ));
      continue;
    }

    const componentRef = record(component.ref);
    if (versionsConflict(graphContext.component.version, refVersion(componentRef))) {
      diagnostics.push(diagnostic(
        'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-COMPONENT-VERSION',
        `Component graph context handle '${graphContext.component.handle}' pins Component version '${graphContext.component.version}', but loaded Component handle pins '${refVersion(componentRef)}'.`,
        evidenceSource(evidence, '/document/component/version'),
        [diagnosticSourceForHandle(component)],
        { componentHandle: graphContext.component.handle, contextVersion: graphContext.component.version, loadedVersion: refVersion(componentRef) },
      ));
      continue;
    }

    const manifestSurface = surfaces.find((entry) => entry.url === graphContext.surface.url);
    if (!manifestSurface) {
      diagnostics.push(diagnostic(
        'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-SURFACE',
        `Component graph context references Surface '${graphContext.surface.url}', but App Manifest surfaces[] has no matching ref.`,
        evidenceSource(evidence, '/document/surface/url'),
        undefined,
        { surfaceUrl: graphContext.surface.url },
      ));
      continue;
    }
    if (versionsConflict(graphContext.surface.version, manifestSurface.version)) {
      diagnostics.push(diagnostic(
        'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-SURFACE-VERSION',
        `Component graph context references Surface version '${graphContext.surface.version}', but App Manifest Surface ref pins '${manifestSurface.version}'.`,
        evidenceSource(evidence, '/document/surface/version'),
        [diagnosticSourceForHandle(context.manifest, manifestSurface.pointer)],
        { surfaceUrl: graphContext.surface.url, contextVersion: graphContext.surface.version, manifestVersion: manifestSurface.version },
      ));
      continue;
    }

    const surface = loadedSurfaceFor(context.handles, graphContext.surface.url);
    if (surface === undefined) {
      diagnostics.push(diagnostic(
        'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-SURFACE-UNLOADED',
        `Component graph context references Surface '${graphContext.surface.url}', but no loaded Surface handle resolves to that App Manifest ref.`,
        evidenceSource(evidence, '/document/surface/url'),
        [diagnosticSourceForHandle(context.manifest, manifestSurface.pointer)],
        { surfaceUrl: graphContext.surface.url },
      ));
      continue;
    }
    if (surface === 'ambiguous') {
      diagnostics.push(diagnostic(
        'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-SURFACE-AMBIGUOUS',
        `Component graph context references Surface '${graphContext.surface.url}', but multiple loaded Surface handles resolve to that App Manifest ref.`,
        evidenceSource(evidence, '/document/surface/url'),
        [diagnosticSourceForHandle(context.manifest, manifestSurface.pointer)],
        { surfaceUrl: graphContext.surface.url },
      ));
      continue;
    }
    if (versionsConflict(graphContext.surface.version, refVersion(record(surface.ref)))) {
      diagnostics.push(diagnostic(
        'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-SURFACE-VERSION',
        `Component graph context references Surface version '${graphContext.surface.version}', but loaded Surface handle pins '${refVersion(record(surface.ref))}'.`,
        evidenceSource(evidence, '/document/surface/version'),
        [diagnosticSourceForHandle(surface)],
        { surfaceUrl: graphContext.surface.url, contextVersion: graphContext.surface.version, loadedVersion: refVersion(record(surface.ref)) },
      ));
      continue;
    }
    if (!routeExists(surface, graphContext.route)) {
      diagnostics.push(diagnostic(
        'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-ROUTE',
        `Component graph context references route '${graphContext.route}', but Surface '${graphContext.surface.url}' has no matching routes[].id.`,
        evidenceSource(evidence, '/document/route'),
        [diagnosticSourceForHandle(surface, '/routes')],
        { surfaceUrl: graphContext.surface.url, route: graphContext.route },
      ));
      continue;
    }
    if (!componentTargetMatches(component, graphContext)) {
      diagnostics.push(diagnostic(
        'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-TARGET',
        `Component graph context references Surface '${graphContext.surface.url}' route '${graphContext.route}', but the loaded Component does not declare a matching targetSurfaceRoutes[] entry.`,
        evidenceSource(evidence, '/document/route'),
        targetRouteSources(component),
        {
          componentHandle: graphContext.component.handle,
          surfaceUrl: graphContext.surface.url,
          surfaceVersion: graphContext.surface.version,
          route: graphContext.route,
        },
      ));
    }
  }

  return diagnostics;
}
