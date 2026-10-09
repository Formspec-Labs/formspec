/** Exact presentation selection from a schema-validated App graph. No route or service authority. */
import { targetDefinitionMatches } from '@formspec-org/types';
import { collectComponentRouteClaims, isExactVersion } from './component-routes.js';
import { artifactHandlesFor, validateAppGraph } from './validator.js';
import type { AppGraphDiagnostic, AppGraphValidationRequest, AppGraphValidationReport, ResolvedArtifactHandle } from './types.js';

export interface ComponentRouteSelection {
  surface: { url: string; version: string };
  route: string;
  slot: string;
  role: 'slot';
  definition: { url: string; version: string };
}

type Snapshot<T> = T extends readonly (infer V)[] ? readonly Snapshot<V>[]
  : T extends object ? { readonly [K in keyof T]: Snapshot<T[K]> } : T;

export type ComponentRouteArtifact = Snapshot<ResolvedArtifactHandle>;
export type ComponentRouteDiagnostics = readonly Snapshot<AppGraphDiagnostic>[];

export type ComponentRouteResolution =
  | { status: 'ready'; component: ComponentRouteArtifact; diagnostics: ComponentRouteDiagnostics }
  | { status: 'unavailable'; reason: ComponentRouteRefusal; diagnostics: ComponentRouteDiagnostics };

export type ComponentRouteRefusal = 'graph-not-validated' | 'incomplete-selection' | 'surface-not-exact'
  | 'route-not-unique' | 'slot-definition-mismatch' | 'definition-not-exact' | 'component-claim-not-unique'
  | 'component-not-exact' | 'component-definition-mismatch' | 'graph-snapshot-failed';

export type ComponentRouteResolver = (selection: ComponentRouteSelection) => ComponentRouteResolution;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function entries(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.flatMap(v => record(v) ? [record(v)!] : []) : [];
}

/**
 * Validate the supplied graph and select one authored slot Component. The host
 * supplies current route coordinates; this result establishes no current task,
 * draft, signing, attachment, or render-instance authority. No I/O occurs.
 */
export function resolveComponentRouteTarget(
  graph: AppGraphValidationRequest,
  selection: ComponentRouteSelection,
): ComponentRouteResolution {
  return prepareComponentRouteResolver(graph, validateAppGraph(graph))(selection);
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Internal producer seam: the report must come from validation of this exact graph. */
export function prepareComponentRouteResolver(
  graph: AppGraphValidationRequest,
  report: AppGraphValidationReport,
): ComponentRouteResolver {
  try {
    const snapshot = freeze(structuredClone({ manifest: graph.manifest, artifacts: graph.artifacts }));
    const evidence = freeze(structuredClone(report));
    const claims = collectComponentRouteClaims({
      manifest: snapshot.manifest, handles: artifactHandlesFor(snapshot),
      schemaResults: evidence.schemaResults, evidenceResults: evidence.evidenceResults,
    }).claims;
    return selection => resolveValidatedComponentRouteTarget(snapshot, evidence, claims, selection);
  } catch {
    return () => ({ status: 'unavailable', reason: 'graph-snapshot-failed', diagnostics: [] });
  }
}

function resolveValidatedComponentRouteTarget(
  graph: Pick<AppGraphValidationRequest, 'manifest' | 'artifacts'>,
  report: AppGraphValidationReport,
  routeClaims: ReturnType<typeof collectComponentRouteClaims>['claims'],
  selection: ComponentRouteSelection,
): ComponentRouteResolution {
  const diagnostics = report.diagnostics;
  const refuse = (reason: ComponentRouteRefusal): ComponentRouteResolution => ({ status: 'unavailable', reason, diagnostics });
  if (diagnostics.some(d => d.severity === 'error')
    || ['artifact-resolution', 'schema', 'cross-artifact'].some(phase =>
      !report.phases.some(p => p.phase === phase && p.status === 'completed'))) {
    return refuse('graph-not-validated');
  }
  if (selection.role !== 'slot' || !selection.surface.url || !isExactVersion(selection.surface.version)
    || !selection.route || !selection.slot || !selection.definition.url || !isExactVersion(selection.definition.version)) {
    return refuse('incomplete-selection');
  }
  const handles = artifactHandlesFor(graph);
  const manifest = record(graph.manifest.document);
  const manifested = (kind: string, pin: { url: string; version: string }) =>
    entries(manifest?.[kind]).filter(ref => ref.url === pin.url && ref.version === pin.version);
  const loaded = (kind: string, pin: { url: string; version: string }) => handles.filter(h =>
    h.artifactKind === kind && h.status === 'loaded' && h.ref?.url === pin.url && h.ref.version === pin.version);
  const surfaces = loaded('surface', selection.surface);
  if (manifested('surfaces', selection.surface).length !== 1 || surfaces.length !== 1) {
    return refuse('surface-not-exact');
  }
  const routes = entries(record(surfaces[0].document)?.routes).filter(r => r.id === selection.route);
  if (routes.length !== 1) return refuse('route-not-unique');
  const slots = entries(routes[0].slots).filter(s => s.id === selection.slot);
  if (slots.length !== 1 || slots[0].slotType !== 'definition-form'
    || record(slots[0].binding)?.definitionRef !== selection.definition.url) {
    return refuse('slot-definition-mismatch');
  }
  const definitions = loaded('definition', selection.definition);
  if (manifested('definitions', selection.definition).length !== 1 || definitions.length !== 1
    || record(definitions[0].document)?.url !== selection.definition.url
    || record(definitions[0].document)?.version !== selection.definition.version) {
    return refuse('definition-not-exact');
  }
  const claims = routeClaims.filter(({ target }) => target.surface?.url === selection.surface.url
    && (target.surface.version === undefined || target.surface.version === selection.surface.version) && target.route === selection.route
    && target.slot === selection.slot && target.role === selection.role);
  if (claims.length !== 1) return refuse('component-claim-not-unique');
  const { component, membership } = claims[0];
  const componentDocument = record(component.document);
  const memberships = entries(manifest?.components).filter(ref => ref.handle === membership.handle);
  if (record(manifest?.component) && membership.handle === 'default') memberships.push(record(manifest?.component)!);
  if (memberships.length !== 1 || !isExactVersion(membership.version) || component.ref?.version !== membership.version
    || componentDocument?.version !== membership.version) return refuse('component-not-exact');
  const target = record(componentDocument?.targetDefinition);
  if (!targetDefinitionMatches(target as { url?: string; compatibleVersions?: string }, selection.definition)) {
    return refuse('component-definition-mismatch');
  }
  return { status: 'ready', component, diagnostics };
}
