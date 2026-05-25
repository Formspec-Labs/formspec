/** @filedesc Built-in Component route target validation for app graphs. */

import {
  type AppGraphContext,
  type AppGraphDiagnostic,
  type AppGraphSourcePointer,
  type ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';

interface ManifestRef {
  url: string;
  version?: string;
  handle?: string;
  pointer: string;
}

interface ComponentMembership {
  handle: string;
  url: string;
  version?: string;
  pointer: string;
}

interface RouteTarget {
  surface?: {
    url?: string;
    version?: string;
  };
  route?: string;
  slot?: string;
  role?: string;
}

interface ComponentClaim {
  key: string;
  owner: string;
  source: AppGraphSourcePointer;
}

const EXACT_SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

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
      handle: stringProp(ref, 'handle'),
      pointer: `/${key}/${index}`,
    }];
  });
}

function componentMemberships(manifest: unknown): ComponentMembership[] {
  const singular = record(record(manifest)?.component);
  const singularUrl = stringProp(singular, 'url');
  return [
    ...(singularUrl ? [{
      handle: 'default',
      url: singularUrl,
      version: refVersion(singular),
      pointer: '/component',
    }] : []),
    ...refsFromManifest(manifest, 'components').flatMap((ref): ComponentMembership[] =>
      ref.handle ? [{
        handle: ref.handle,
        url: ref.url,
        version: ref.version,
        pointer: ref.pointer,
      }] : []
    ),
  ];
}

function handlesByKind(handles: readonly ResolvedArtifactHandle[], artifactKind: string): ResolvedArtifactHandle[] {
  return handles.filter((handle) => handle.artifactKind === artifactKind && handle.status === 'loaded');
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

function membershipFor(
  handle: ResolvedArtifactHandle,
  memberships: readonly ComponentMembership[],
): ComponentMembership | undefined {
  const ref = record(handle.ref);
  const refUrl = stringProp(ref, 'url');
  const refHandle = stringProp(ref, 'handle');
  if (!refUrl) return undefined;
  if (refHandle) {
    return memberships.find((membership) => membership.handle === refHandle && membership.url === refUrl);
  }
  const candidates = memberships.filter((membership) => membership.url === refUrl);
  if (candidates.length === 1) return candidates[0];
  const refVersionValue = refVersion(ref);
  if (refVersionValue) {
    const versionCandidates = candidates.filter((membership) => membership.version === refVersionValue);
    if (versionCandidates.length === 1) return versionCandidates[0];
  }
  return undefined;
}

function hasRouteTargets(document: unknown): boolean {
  return Array.isArray(record(document)?.targetSurfaceRoutes);
}

function routeTargets(document: unknown): RouteTarget[] {
  const targets = record(document)?.targetSurfaceRoutes;
  if (!Array.isArray(targets)) return [];
  return targets.map((target) => {
    const targetRecord = record(target);
    const surface = record(targetRecord?.surface);
    return {
      surface: surface ? {
        url: stringProp(surface, 'url'),
        version: refVersion(surface),
      } : undefined,
      route: stringProp(targetRecord, 'route'),
      slot: stringProp(targetRecord, 'slot'),
      role: stringProp(targetRecord, 'role'),
    };
  });
}

function targetDefinitionUrl(document: unknown): string | undefined {
  return stringProp(record(record(document)?.targetDefinition), 'url');
}

function routeById(surfaceDocument: unknown, routeId: string): Record<string, unknown> | undefined {
  const routes = record(surfaceDocument)?.routes;
  if (!Array.isArray(routes)) return undefined;
  return routes
    .map(record)
    .find((route) => stringProp(route, 'id') === routeId);
}

function routeHasSlot(route: Record<string, unknown>, slotId: string): boolean {
  const slots = route.slots;
  return Array.isArray(slots) && slots
    .map(record)
    .some((slot) => stringProp(slot, 'id') === slotId);
}

function isExactVersion(value: string | undefined): value is string {
  return typeof value === 'string' && EXACT_SEMVER.test(value);
}

function checkExactVersion(
  targetVersion: string | undefined,
  candidateVersion: string | undefined,
  source: AppGraphSourcePointer,
  targetLabel: string,
): AppGraphDiagnostic | undefined {
  if (!isExactVersion(targetVersion) || !isExactVersion(candidateVersion) || targetVersion === candidateVersion) {
    return undefined;
  }
  return diagnostic(
    'APP-GRAPH-COMPONENT-SURFACE-VERSION',
    `Component route target pins Surface version '${targetVersion}', but ${targetLabel} pins '${candidateVersion}'.`,
    source,
    undefined,
    { targetVersion, candidateVersion },
  );
}

function sourceForTarget(handle: ResolvedArtifactHandle, index: number, suffix = ''): AppGraphSourcePointer {
  return diagnosticSourceForHandle(handle, `/targetSurfaceRoutes/${index}${suffix}`);
}

function sourceForTargetDefinition(handle: ResolvedArtifactHandle): AppGraphSourcePointer {
  return diagnosticSourceForHandle(handle, '/targetDefinition/url');
}

function definitionUrlsFromHandles(handles: readonly ResolvedArtifactHandle[]): Set<string> {
  const urls = new Set<string>();
  for (const handle of handlesByKind(handles, 'definition')) {
    const refUrl = stringProp(record(handle.ref), 'url');
    const identityUrl = stringProp(record(handle.identity), 'url');
    if (refUrl) urls.add(refUrl);
    if (identityUrl) urls.add(identityUrl);
  }
  return urls;
}

function surfaceHandleMap(handles: readonly ResolvedArtifactHandle[]): Map<string, ResolvedArtifactHandle[]> {
  const byUrl = new Map<string, ResolvedArtifactHandle[]>();
  for (const handle of handlesByKind(handles, 'surface')) {
    const refUrl = stringProp(record(handle.ref), 'url');
    if (!refUrl) continue;
    const candidates = byUrl.get(refUrl) ?? [];
    candidates.push(handle);
    byUrl.set(refUrl, candidates);
  }
  return byUrl;
}

function routeClaimKey(surfaceUrl: string, surfaceVersion: string | undefined, target: RouteTarget): string {
  return [
    surfaceUrl,
    surfaceVersion ?? '',
    target.route ?? '',
    target.slot ?? '',
    target.role ?? '',
  ].join('\u0000');
}

function ownerLabel(membership: ComponentMembership, handle: ResolvedArtifactHandle): string {
  return `${membership.handle} (${stringProp(record(handle.ref), 'url') ?? membership.url})`;
}

export function validateComponentRouteTargets(context: AppGraphContext): AppGraphDiagnostic[] {
  const manifestDocument = context.manifest.document;
  const manifestSurfaces = refsFromManifest(manifestDocument, 'surfaces');
  const manifestSurfaceUrls = new Set(manifestSurfaces.map((ref) => ref.url));
  const manifestDefinitions = refsFromManifest(manifestDocument, 'definitions');
  const manifestDefinitionUrls = new Set(manifestDefinitions.map((ref) => ref.url));
  const loadedDefinitionUrls = definitionUrlsFromHandles(context.handles);
  const surfaceHandles = surfaceHandleMap(context.handles);
  const memberships = componentMemberships(manifestDocument);
  const componentHandles = handlesByKind(context.handles, 'component');
  const claims = new Map<string, ComponentClaim>();
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const handle of componentHandles) {
    const document = handle.document;
    const membership = membershipFor(handle, memberships);
    const handleSource = diagnosticSourceForHandle(handle);
    if (!stringProp(record(handle.ref), 'url')) {
      diagnostics.push(diagnostic(
        'APP-GRAPH-COMPONENT-REF-MISSING',
        'Loaded Component handle has no App Manifest ref URL; the validator will not infer Component membership from source path, filename, document URL, or route names.',
        handleSource,
      ));
      continue;
    }
    if (!membership) {
      diagnostics.push(diagnostic(
        'APP-GRAPH-COMPONENT-MEMBERSHIP',
        'Loaded Component handle does not resolve to a singular component or components[] membership in the App Manifest.',
        handleSource,
      ));
      continue;
    }

    const targetDefinition = targetDefinitionUrl(document);
    if (targetDefinition) {
      const targetSource = sourceForTargetDefinition(handle);
      if (hasRouteTargets(document) && manifestDefinitionUrls.size === 0) {
        diagnostics.push(diagnostic(
          'APP-GRAPH-COMPONENT-FAKE-TARGET-DEFINITION',
          `Route-bound Component '${membership.handle}' declares targetDefinition '${targetDefinition}' in a non-form app graph with no manifested Definitions.`,
          targetSource,
          undefined,
          { componentHandle: membership.handle, targetDefinition },
        ));
      } else if (!manifestDefinitionUrls.has(targetDefinition)) {
        diagnostics.push(diagnostic(
          'APP-GRAPH-COMPONENT-TARGET-DEFINITION-UNMANIFESTED',
          `Component '${membership.handle}' targets Definition '${targetDefinition}', but that Definition is not listed in the App Manifest definitions[].`,
          targetSource,
          undefined,
          { componentHandle: membership.handle, targetDefinition },
        ));
      } else if (!loadedDefinitionUrls.has(targetDefinition)) {
        diagnostics.push(diagnostic(
          'APP-GRAPH-COMPONENT-TARGET-DEFINITION-UNLOADED',
          `Component '${membership.handle}' targets Definition '${targetDefinition}', but no loaded Definition handle resolves to that URL.`,
          targetSource,
          undefined,
          { componentHandle: membership.handle, targetDefinition },
        ));
      }
    }

    routeTargets(document).forEach((target, index) => {
      const targetSource = sourceForTarget(handle, index);
      const surfaceUrl = target.surface?.url;
      if (!surfaceUrl) return;
      const manifestSurface = manifestSurfaces.find((ref) => ref.url === surfaceUrl);
      if (!manifestSurfaceUrls.has(surfaceUrl)) {
        diagnostics.push(diagnostic(
          'APP-GRAPH-COMPONENT-SURFACE-UNMANIFESTED',
          `Component '${membership.handle}' targets Surface '${surfaceUrl}', but that Surface is not listed in App Manifest surfaces[].`,
          sourceForTarget(handle, index, '/surface/url'),
          undefined,
          { componentHandle: membership.handle, surfaceUrl },
        ));
        return;
      }

      const versionDiagnostic = checkExactVersion(
        target.surface?.version,
        manifestSurface?.version,
        sourceForTarget(handle, index, '/surface/version'),
        'the App Manifest Surface ref',
      );
      if (versionDiagnostic) diagnostics.push(versionDiagnostic);

      const matchingSurfaceHandles = surfaceHandles.get(surfaceUrl) ?? [];
      if (matchingSurfaceHandles.length === 0) {
        diagnostics.push(diagnostic(
          'APP-GRAPH-COMPONENT-SURFACE-UNLOADED',
          `Component '${membership.handle}' targets Surface '${surfaceUrl}', but no loaded Surface handle resolves to that App Manifest ref URL.`,
          sourceForTarget(handle, index, '/surface/url'),
          undefined,
          { componentHandle: membership.handle, surfaceUrl },
        ));
        return;
      }
      if (matchingSurfaceHandles.length > 1) {
        diagnostics.push(diagnostic(
          'APP-GRAPH-COMPONENT-SURFACE-AMBIGUOUS',
          `Component '${membership.handle}' targets Surface '${surfaceUrl}', but more than one loaded Surface handle resolves to that ref URL.`,
          sourceForTarget(handle, index, '/surface/url'),
          matchingSurfaceHandles.map((surfaceHandle) => diagnosticSourceForHandle(surfaceHandle)),
          { componentHandle: membership.handle, surfaceUrl },
        ));
        return;
      }

      const surfaceHandle = matchingSurfaceHandles[0];
      const loadedVersionDiagnostic = checkExactVersion(
        target.surface?.version,
        stringProp(record(surfaceHandle.ref), 'version'),
        sourceForTarget(handle, index, '/surface/version'),
        'the loaded Surface handle',
      );
      if (loadedVersionDiagnostic) diagnostics.push(loadedVersionDiagnostic);

      if (!target.route) return;
      const route = routeById(surfaceHandle.document, target.route);
      if (!route) {
        diagnostics.push(diagnostic(
          'APP-GRAPH-COMPONENT-ROUTE-UNRESOLVED',
          `Component '${membership.handle}' targets route '${target.route}', but Surface '${surfaceUrl}' has no matching routes[].id.`,
          sourceForTarget(handle, index, '/route'),
          [diagnosticSourceForHandle(surfaceHandle, '/routes')],
          { componentHandle: membership.handle, surfaceUrl, route: target.route },
        ));
        return;
      }

      if (target.slot && !routeHasSlot(route, target.slot)) {
        diagnostics.push(diagnostic(
          'APP-GRAPH-COMPONENT-SLOT-UNRESOLVED',
          `Component '${membership.handle}' targets slot '${target.slot}' on route '${target.route}', but the Surface route has no matching slots[].id.`,
          sourceForTarget(handle, index, '/slot'),
          [diagnosticSourceForHandle(surfaceHandle, '/routes')],
          { componentHandle: membership.handle, surfaceUrl, route: target.route, slot: target.slot },
        ));
        return;
      }

      const key = routeClaimKey(surfaceUrl, manifestSurface?.version ?? target.surface?.version, target);
      const owner = ownerLabel(membership, handle);
      const source = targetSource;
      const prior = claims.get(key);
      if (prior) {
        diagnostics.push(diagnostic(
          'APP-GRAPH-COMPONENT-ROUTE-CLAIM-DUPLICATE',
          `Component route target claim for Surface '${surfaceUrl}' route '${target.route}'${target.slot ? ` slot '${target.slot}'` : ''} role '${target.role}' is already claimed by ${prior.owner}; duplicate claim from ${owner}.`,
          source,
          [prior.source],
          {
            surfaceUrl,
            surfaceVersion: manifestSurface?.version ?? target.surface?.version,
            route: target.route,
            slot: target.slot,
            role: target.role,
            priorOwner: prior.owner,
            duplicateOwner: owner,
          },
        ));
      } else {
        claims.set(key, { key, owner, source });
      }
    });
  }

  return diagnostics;
}
