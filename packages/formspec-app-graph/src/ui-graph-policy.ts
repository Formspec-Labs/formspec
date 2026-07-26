/** @filedesc Built-in UI Graph Policy validation for loaded app-graph evidence. */

import {
  type AppGraphContext,
  type AppGraphDiagnostic,
  type AppGraphHostLandmarkRole,
  type AppGraphSourcePointer,
  type ResolvedArtifactHandle,
} from './types.js';
import {
  appGraphSourceFromModuleSource,
  diagnosticSourceForHandle,
} from './report.js';
import { satisfies, valid, validRange } from 'semver';

import type {
  LocaleDocument,
  ModuleResolutionContribution,
  ModuleResolutionModule,
  ModuleResolutionReport,
  ModuleResolutionTokenCategoryEvidence,
  SurfaceDocument,
  ThemeDocument,
  UiGraphPolicyDocument,
} from '@formspec-org/types';

type HiddenDefinitionRef = NonNullable<
  NonNullable<UiGraphPolicyDocument['routePolicies'][number]['definitionVisibility']>['hiddenDefinitionRefs']
>[number];
type ThemeTokenAssignment = NonNullable<NonNullable<UiGraphPolicyDocument['theme']>['assignments']>[number];
type ModuleResolutionWidgetTokenSlot = NonNullable<ModuleResolutionContribution['widgetTokenSlots']>[number];

/**
 * The Surface route-class vocabulary, taken from the schema-generated type
 * rather than restated. A new or renamed `routeClass` enum member changes this
 * union, which breaks `ROUTE_CLASS_THEME_AUTHORITY` at compile time.
 */
type RouteClass = NonNullable<SurfaceDocument['routes'][number]['routeClass']>;

interface SurfaceRoute {
  id: string;
  index: number;
  routeClass?: RouteClass;
  slots: SurfaceRouteSlot[];
  slotsById: Map<string, SurfaceRouteSlot>;
}

interface SurfaceRouteSlot {
  id: string;
  index: number;
  slotType: string;
  definitionRef?: string;
  moduleWidget?: { moduleId: string; widgetName: string };
  embedRouteRef?: string;
}

type RouteA11yPolicy = NonNullable<UiGraphPolicyDocument['routePolicies'][number]['a11y']>;

const HOST_LANDMARK_ROLES = new Set<AppGraphHostLandmarkRole>(['main', 'navigation', 'complementary']);

interface IndexedRoutePolicy {
  routeId: string;
  index: number;
  a11y?: RouteA11yPolicy;
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

interface IndexedThemeTokenAssignment {
  assignment: ThemeTokenAssignment;
  index: number;
}

interface ThemeTokenEvidence {
  resolved: boolean;
  tokenSource?: AppGraphSourcePointer;
  diagnostics: AppGraphDiagnostic[];
}

interface UiGraphPolicyEvidence {
  evidenceSlot: string;
  source: string;
  document: UiGraphPolicyDocument;
}

const UI_GRAPH_THEME_WIDGET_SITE = 'ui-graph-policy.theme.assignments.widgetRef';
export const PLATFORM_TOKEN_CATEGORY_PREFIXES = new Set(['color', 'font', 'radius', 'spacing']);

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
type LoadedThemeHandle = ResolvedArtifactHandle<ThemeDocument>;

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

function loadedThemeHandles(handles: readonly ResolvedArtifactHandle[]): LoadedThemeHandle[] {
  return handles
    .filter((handle) => handle.artifactKind === 'theme' && handle.status === 'loaded')
    .map((handle) => handle as LoadedThemeHandle);
}

function surfaceRefUrl(handle: ResolvedArtifactHandle): string | undefined {
  return handle.ref?.url;
}

function surfaceRefVersion(handle: ResolvedArtifactHandle): string | undefined {
  return handle.ref?.version;
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
        moduleWidget: moduleWidgetFromSlot(slot),
        embedRouteRef: embedRouteRefFromSlot(slot),
      };
      slots.push(slotView);
      slotsById.set(slot.id, slotView);
    }
    return { id: route.id, index, routeClass: routeClassOf(route), slots, slotsById };
  });
}

/**
 * An authored `routeClass` that is not in the vocabulary is treated as absent:
 * unclassified, so no class-keyed rule fires. The closed enum in
 * `surface.schema.json` is the gate for the value itself, and a graph whose
 * Surface failed schema validation never reaches cross-artifact checks.
 */
function routeClassOf(route: { routeClass?: unknown }): RouteClass | undefined {
  const routeClass = route.routeClass;
  return typeof routeClass === 'string' && routeClass in ROUTE_CLASS_THEME_AUTHORITY
    ? routeClass as RouteClass
    : undefined;
}

function definitionRefFromSlot(slot: { binding?: unknown }): string | undefined {
  const binding = slot.binding;
  if (!binding || typeof binding !== 'object') return undefined;
  const definitionRef = (binding as { definitionRef?: unknown }).definitionRef;
  return typeof definitionRef === 'string' ? definitionRef : undefined;
}

function moduleWidgetFromSlot(
  slot: { slotType?: unknown; binding?: unknown },
): { moduleId: string; widgetName: string } | undefined {
  if (slot.slotType !== 'module-widget') return undefined;
  const binding = slot.binding;
  if (!binding || typeof binding !== 'object') return undefined;
  const { moduleId, widgetName } = binding as { moduleId?: unknown; widgetName?: unknown };
  if (typeof moduleId !== 'string' || typeof widgetName !== 'string') return undefined;
  return { moduleId, widgetName };
}

function embedRouteRefFromSlot(slot: { slotType?: unknown; binding?: unknown }): string | undefined {
  if (slot.slotType !== 'embed-route') return undefined;
  const binding = slot.binding;
  if (!binding || typeof binding !== 'object') return undefined;
  const routeRef = (binding as { routeRef?: unknown }).routeRef;
  return typeof routeRef === 'string' ? routeRef : undefined;
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

function targetSurfaceVersion(policy: UiGraphPolicyDocument): string | undefined {
  return policy.targetSurface.version;
}

function routePolicies(policy: UiGraphPolicyDocument): IndexedRoutePolicy[] {
  return policy.routePolicies.map((entry, index) => ({
    routeId: entry.routeId,
    index,
    a11y: entry.a11y,
    collapseOrder: entry.responsive?.collapseOrder ?? [],
    hiddenDefinitionRefs: (entry.definitionVisibility?.hiddenDefinitionRefs ?? []).map((ref, refIndex) => ({
      ref,
      index: refIndex,
    })),
  }));
}

function hostReservedLandmarks(context: AppGraphContext): Set<AppGraphHostLandmarkRole> {
  const reserved = context.hostEvidence?.hostLandmarks?.reserved ?? [];
  return new Set(reserved.filter((landmark): landmark is AppGraphHostLandmarkRole => HOST_LANDMARK_ROLES.has(landmark)));
}

function validateRouteA11yPolicy(
  evidence: UiGraphPolicyEvidence,
  policy: IndexedRoutePolicy,
  hostReserved: ReadonlySet<AppGraphHostLandmarkRole>,
): AppGraphDiagnostic[] {
  const a11y = policy.a11y;
  if (!a11y) return [];

  const diagnostics: AppGraphDiagnostic[] = [];
  const a11yPointer = `/routePolicies/${policy.index}/a11y`;

  if (a11y.landmark === 'region') {
    const label = typeof a11y.landmarkLabel === 'string' ? a11y.landmarkLabel.trim() : '';
    if (label.length === 0) {
      diagnostics.push(diagnostic(
        'UI-POLICY-REGION-LABEL',
        'Region route policy requires a non-empty landmarkLabel.',
        evidenceSource(evidence, `${a11yPointer}/landmarkLabel`),
        [evidenceSource(evidence, `${a11yPointer}/landmark`)],
        { routeId: policy.routeId, landmark: 'region' },
      ));
    }
  }

  const landmark = a11y.landmark;
  if (landmark && landmark !== 'region' && hostReserved.has(landmark)) {
    diagnostics.push(diagnostic(
      'UI-POLICY-HOST-LANDMARK-CONFLICT',
      'Route policy landmark conflicts with a host-reserved landmark.',
      evidenceSource(evidence, `${a11yPointer}/landmark`),
      undefined,
      { routeId: policy.routeId, landmark, hostReserved: [...hostReserved] },
    ));
  }

  return diagnostics;
}

function localeKeyOwners(policy: UiGraphPolicyDocument): IndexedLocaleKeyOwner[] {
  return (policy.localeKeyOwners ?? []).map((entry, index) => ({
    keyPrefix: entry.keyPrefix,
    moduleId: entry.moduleId,
    index,
    keyPrefixModuleId: keyPrefixModuleId(entry.keyPrefix),
  }));
}

function themeAssignments(policy: UiGraphPolicyDocument): IndexedThemeTokenAssignment[] {
  return (policy.theme?.assignments ?? []).map((assignment, index) => ({
    assignment,
    index,
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

function targetSurfaceVersionDiagnostic(
  evidence: UiGraphPolicyEvidence,
  surface: LoadedSurfaceHandle,
  targetVersion: string,
): AppGraphDiagnostic {
  const loadedVersion = surfaceRefVersion(surface);
  return diagnostic(
    'UI-POLICY-SURFACE-TARGET',
    'Policy targetSurface version is incompatible with the loaded Surface ref.',
    evidenceSource(evidence, '/targetSurface/version'),
    [surfaceSource(surface, loadedVersion ? '/ref/version' : '/ref/url')],
    {
      targetSurfaceUrl: targetSurfaceUrl(evidence.document),
      targetSurfaceVersion: targetVersion,
      loadedSurfaceVersion: loadedVersion,
      reason: 'version-incompatible',
    },
  );
}

function versionSatisfies(requested: string, actual: string | undefined): boolean {
  if (!actual) return false;
  if (!valid(actual) || !validRange(requested)) return false;
  return satisfies(actual, requested, { includePrerelease: true });
}

function targetSurfaceVersionCompatible(policy: UiGraphPolicyDocument, surface: LoadedSurfaceHandle): boolean {
  const requestedVersion = targetSurfaceVersion(policy);
  return requestedVersion === undefined || versionSatisfies(requestedVersion, surfaceRefVersion(surface));
}

function validateRoutePolicies(
  evidence: UiGraphPolicyEvidence,
  surface: LoadedSurfaceHandle,
  definitions: readonly LoadedDefinitionHandle[],
  policies: readonly IndexedRoutePolicy[],
  hostReserved: ReadonlySet<AppGraphHostLandmarkRole>,
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
    diagnostics.push(...validateRouteA11yPolicy(evidence, policy, hostReserved));
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
  moduleResolution: ModuleResolutionReport | undefined,
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  const owners = localeKeyOwners(evidence.document);
  const collidingOwnerIndexes = new Set<number>();
  const mismatchedOwnerIndexes = new Set<number>();

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
    mismatchedOwnerIndexes.add(owner.index);
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

  diagnostics.push(...validateLocaleOwnerModuleRefs(
    evidence,
    owners,
    moduleResolution,
    new Set([...collidingOwnerIndexes, ...mismatchedOwnerIndexes]),
  ));

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

function validateLocaleOwnerModuleRefs(
  evidence: UiGraphPolicyEvidence,
  owners: readonly IndexedLocaleKeyOwner[],
  moduleResolution: ModuleResolutionReport | undefined,
  skippedOwnerIndexes: ReadonlySet<number>,
): AppGraphDiagnostic[] {
  if (moduleResolution?.phase.status !== 'completed') return [];

  const modulesById = new Map<string, ModuleResolutionModule[]>();
  for (const entry of moduleResolution.modules) {
    const matches = modulesById.get(entry.ref.id) ?? [];
    matches.push(entry);
    modulesById.set(entry.ref.id, matches);
  }

  return owners.flatMap((owner) => {
    if (skippedOwnerIndexes.has(owner.index)) return [];
    const matches = modulesById.get(owner.moduleId) ?? [];
    if (matches.some((entry) => entry.status === 'admitted')) return [];

    const reason = matches.length > 0 ? 'unadmitted-module' : 'missing-module';
    const relatedSources = matches
      .map((entry) => appGraphSourceFromModuleSource(entry.source))
      .filter((source): source is AppGraphSourcePointer => source !== undefined);
    const details: Record<string, unknown> = {
      keyPrefix: owner.keyPrefix,
      moduleId: owner.moduleId,
      reason,
    };
    if (matches.length > 0) {
      details.moduleStatuses = [...new Set(matches.map((entry) => entry.status))].sort();
    }

    return [diagnostic(
      'LOCALE-KEY-OWNER-MODULE-REF',
      'A Locale key owner moduleId is not admitted by ModuleResolver evidence.',
      evidenceSource(evidence, `/localeKeyOwners/${owner.index}/moduleId`),
      relatedSources.length > 0 ? relatedSources : undefined,
      details,
    )];
  });
}

function contributionMatchesThemeWidgetAssignment(
  contribution: ModuleResolutionContribution,
  evidence: UiGraphPolicyEvidence,
  assignment: IndexedThemeTokenAssignment,
): boolean {
  const expectedPointer = `/theme/assignments/${assignment.index}/widgetRef`;
  return contribution.site === UI_GRAPH_THEME_WIDGET_SITE
    && contribution.expectedCategory === 'widget'
    && contribution.name === assignment.assignment.widgetRef.widgetName
    && contribution.source.artifactSlot === evidence.evidenceSlot
    && (
      contribution.source.jsonPointer === expectedPointer
      || contribution.source.jsonPointer.startsWith(`${expectedPointer}/`)
    );
}

function contributionResolvedForModule(
  contribution: ModuleResolutionContribution,
  moduleId: string,
): boolean {
  return contribution.status === 'resolved'
    && (contribution.owningModules ?? []).some((moduleRef) => moduleRef.id === moduleId);
}

function themeWidgetReason(
  contributions: readonly ModuleResolutionContribution[],
  moduleId: string,
): string {
  if (contributions.length === 0) return 'missing-contribution-evidence';
  if (contributions.some((contribution) => contribution.status === 'resolved')) {
    return contributions.some((contribution) =>
      (contribution.owningModules ?? []).some((moduleRef) => moduleRef.id !== moduleId)
    )
      ? 'owner-module-mismatch'
      : 'unresolved-widget';
  }
  if (contributions.some((contribution) => contribution.status === 'unadmitted')) return 'unadmitted-widget';
  return 'unresolved-widget';
}

function validateThemeWidgetRefs(
  evidence: UiGraphPolicyEvidence,
  assignments: readonly IndexedThemeTokenAssignment[],
  moduleResolution: ModuleResolutionReport | undefined,
  tokenEvidenceByAssignment: ReadonlyMap<number, ThemeTokenEvidence>,
): AppGraphDiagnostic[] {
  if (moduleResolution?.phase.status !== 'completed') return [];

  return assignments.flatMap((assignment) => {
    const widgetRef = assignment.assignment.widgetRef;
    const matchingContributions = moduleResolution.contributions.filter((contribution) =>
      contributionMatchesThemeWidgetAssignment(contribution, evidence, assignment)
    );
    const resolvedContributions = matchingContributions.filter((contribution) =>
      contributionResolvedForModule(contribution, widgetRef.moduleId)
    );
    if (resolvedContributions.length > 0) {
      const tokenSlotDiagnostics = validateThemeTokenSlot(evidence, assignment, resolvedContributions);
      if (tokenSlotDiagnostics.length > 0) return tokenSlotDiagnostics;
      const tokenEvidence = tokenEvidenceByAssignment.get(assignment.index);
      if (!tokenEvidence?.resolved) return [];
      return validateThemeTokenCategory(evidence, assignment, resolvedContributions, tokenEvidence, moduleResolution);
    }

    const details: Record<string, unknown> = {
      moduleId: widgetRef.moduleId,
      widgetName: widgetRef.widgetName,
      reason: themeWidgetReason(matchingContributions, widgetRef.moduleId),
    };
    if (matchingContributions.length > 0) {
      details.contributionStatuses = [...new Set(matchingContributions.map((contribution) => contribution.status))].sort();
    }

    return [diagnostic(
      'THEME-TOKEN-WIDGET',
      'A Theme token assignment references an unresolved or unadmitted module widget.',
      evidenceSource(evidence, `/theme/assignments/${assignment.index}/widgetRef`),
      undefined,
      details,
    )];
  });
}

/**
 * Whether each route class admits tenant chrome theming. Exactly one value
 * admits: `intake`, a Definition-backed capture from a respondent. Every other
 * class refuses, because a third party relies on what it renders — an artifact
 * the platform issued, the act of signing one, the independent check of one, a
 * claim the publisher is accountable for, or a credential exchange whose chrome
 * is the anti-phishing control. `operation` refuses too: it is a residual value
 * for routes with nothing to declare, and a residual value on the permissive
 * side of the only rule keyed on this vocabulary is fail-open.
 *
 * Exhaustive over the schema-generated `RouteClass` union by construction: a new
 * or renamed `routeClass` enum member fails to compile HERE, at the decision
 * site, instead of silently defaulting to admitted. There is no `default` arm,
 * deliberately. Note what that does and does not buy — adding `attestation` and
 * `authentication` broke the build here as intended, and flipping `operation`
 * from `admits` to `refuses` did not, because a wrong-but-total map still
 * compiles. The vocabulary's members are compiler-checked; their postures are
 * checked by `tests/ui-graph-policy-route-class.test.ts` and by running the
 * vocabulary over a real route corpus.
 *
 * `surface-spec.md` §3 Route Class; `ui-graph-policy-spec.md` §5.7.
 */
export const ROUTE_CLASS_THEME_AUTHORITY = {
  intake: 'admits',
  proof: 'refuses',
  ceremony: 'refuses',
  verification: 'refuses',
  attestation: 'refuses',
  authentication: 'refuses',
  operation: 'refuses',
} as const satisfies Record<RouteClass, 'admits' | 'refuses'>;

/**
 * The `refuses` half of {@link ROUTE_CLASS_THEME_AUTHORITY}, derived rather than
 * restated. An unclassified route has stated nothing, so no rule keyed on a
 * class fires against it.
 */
export const TENANT_THEMING_REFUSING_ROUTE_CLASSES: ReadonlySet<RouteClass> = new Set(
  (Object.entries(ROUTE_CLASS_THEME_AUTHORITY) as [RouteClass, 'admits' | 'refuses'][])
    .filter(([, authority]) => authority === 'refuses')
    .map(([routeClass]) => routeClass),
);

interface RenderedWidgetBinding {
  route: SurfaceRoute;
  routeSlot: SurfaceRouteSlot;
  /** Route ids from the class-bearing route to `route`; length 1 when direct. */
  embedChain: string[];
}

/**
 * Every `module-widget` slot `root` renders, including those reached through
 * `embed-route` slots. `embed-route` renders another route of this Surface
 * INSIDE the host route (`surface-spec.md` §6.2), so an embedded route's slots
 * paint on the host's surface — composition carries the host's protection down
 * every embed edge, and an embedded route's own class cannot lower it.
 *
 * BFS over embed edges with a visited set, the same traversal shape as the E606
 * route-graph walk in `crates/formspec-lint/src/pass_surface.rs`. `embed-route`
 * cycles are authorable — `routeRef` is constrained to a route id, not to an
 * acyclic graph — so the visited set is a termination requirement, not an
 * optimization. A `routeRef` resolving to no route is skipped; lint E607 owns
 * dangling refs.
 */
function widgetBindingsRenderedBy(
  root: SurfaceRoute,
  routesById: ReadonlyMap<string, SurfaceRoute>,
): RenderedWidgetBinding[] {
  const bindings: RenderedWidgetBinding[] = [];
  const visited = new Set<string>([root.id]);
  const frontier: { route: SurfaceRoute; embedChain: string[] }[] = [
    { route: root, embedChain: [root.id] },
  ];

  for (let cursor = 0; cursor < frontier.length; cursor += 1) {
    const { route, embedChain } = frontier[cursor];
    for (const routeSlot of route.slots) {
      if (routeSlot.moduleWidget) {
        bindings.push({ route, routeSlot, embedChain });
        continue;
      }
      const embedded = routeSlot.embedRouteRef === undefined
        ? undefined
        : routesById.get(routeSlot.embedRouteRef);
      if (!embedded || visited.has(embedded.id)) continue;
      visited.add(embedded.id);
      frontier.push({ route: embedded, embedChain: [...embedChain, embedded.id] });
    }
  }
  return bindings;
}

/**
 * Theme authority. A tenant Theme token assignment MUST NOT land on a widget
 * rendered by a route whose class is anything other than `intake`. The refusing
 * set is derived from {@link ROUTE_CLASS_THEME_AUTHORITY}, never restated, so
 * the rule follows the vocabulary rather than an enumeration that can drift
 * out of step with it.
 *
 * The check is deliberately widget-grained rather than route-grained, because
 * `ThemeTokenAssignment` is `{widgetRef, slot, token}` and carries no route:
 * a widget bound on both an `intake` route and a `proof` route makes the
 * assignment invalid, since the assignment would in fact repaint it on the
 * proof route. Narrowing this needs route-scoped assignments — a UI Graph
 * Policy schema revision, not a validator change (§5.7 "Grain").
 *
 * "Rendered by" is transitive over `embed-route`, not just the protected
 * route's own `slots[]`: an unclassified route embedded in a `proof` route
 * paints on the proof surface, so a bare `slots[]` scan let one schema-valid
 * composition hop restore the whole violation (§5.7 "Composition").
 *
 * Reads only the Surface document and the policy: no ModuleResolver, no Theme
 * token evidence. An assignment that repaints a proof surface is refused
 * whether or not its token resolves.
 */
function validateThemeRouteClass(
  evidence: UiGraphPolicyEvidence,
  surface: LoadedSurfaceHandle,
  assignments: readonly IndexedThemeTokenAssignment[],
): AppGraphDiagnostic[] {
  const routes = surfaceRoutes(surface);
  const protectedRoutes = routes
    .filter((route) => route.routeClass !== undefined
      && TENANT_THEMING_REFUSING_ROUTE_CLASSES.has(route.routeClass));
  if (protectedRoutes.length === 0) return [];

  const routesById = new Map(routes.map((route) => [route.id, route]));
  const protectedBindings = protectedRoutes.flatMap((protectedRoute) =>
    widgetBindingsRenderedBy(protectedRoute, routesById)
      .map((binding) => ({ protectedRoute, ...binding })));

  return assignments.flatMap((assignment) => {
    const { widgetRef, slot, token } = assignment.assignment;
    const bindings = protectedBindings.filter((binding) =>
      binding.routeSlot.moduleWidget?.moduleId === widgetRef.moduleId
      && binding.routeSlot.moduleWidget?.widgetName === widgetRef.widgetName);
    if (bindings.length === 0) return [];

    const [first] = bindings;
    return [diagnostic(
      'THEME-ROUTE-CLASS',
      'A Theme token assignment targets a widget rendered by a Surface route whose routeClass refuses tenant theming.',
      evidenceSource(evidence, `/theme/assignments/${assignment.index}/widgetRef`),
      distinctSources(bindings.map(({ route, routeSlot }) =>
        surfaceSource(surface, `/routes/${route.index}/slots/${routeSlot.index}/binding`))),
      {
        moduleId: widgetRef.moduleId,
        widgetName: widgetRef.widgetName,
        slot,
        token,
        routeId: first.protectedRoute.id,
        routeClass: first.protectedRoute.routeClass,
        embedChain: first.embedChain,
        reason: 'tenant-theming-refused-by-route-class',
      },
    )];
  });
}

/**
 * One pointer per distinct slot binding. Two protected routes can embed the
 * same route, so the same binding is reachable twice; the diagnostic names each
 * binding once.
 */
function distinctSources(sources: AppGraphSourcePointer[]): AppGraphSourcePointer[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.artifactSlot}#${source.jsonPointer}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function themeTokens(handle: LoadedThemeHandle): Record<string, unknown> {
  const tokens = handle.document?.tokens;
  return tokens && typeof tokens === 'object' && !Array.isArray(tokens)
    ? tokens as Record<string, unknown>
    : {};
}

function hasToken(tokens: Record<string, unknown>, token: string): boolean {
  return Object.prototype.hasOwnProperty.call(tokens, token);
}

function themeTokenSource(handle: LoadedThemeHandle, token: string): AppGraphSourcePointer {
  return diagnosticSourceForHandle(handle, `/tokens/${escapeJsonPointerToken(token)}`);
}

function themeTokensSource(handle: LoadedThemeHandle): AppGraphSourcePointer {
  return diagnosticSourceForHandle(handle, '/tokens');
}

function validateThemeTokenRef(
  evidence: UiGraphPolicyEvidence,
  assignment: IndexedThemeTokenAssignment,
  themes: readonly LoadedThemeHandle[],
): ThemeTokenEvidence {
  const token = assignment.assignment.token;
  const primarySource = evidenceSource(evidence, `/theme/assignments/${assignment.index}/token`);
  const widgetRef = assignment.assignment.widgetRef;

  const details: Record<string, unknown> = {
    moduleId: widgetRef.moduleId,
    widgetName: widgetRef.widgetName,
    slot: assignment.assignment.slot,
    token,
  };

  if (themes.length === 0) {
    return {
      resolved: false,
      diagnostics: [diagnostic(
        'THEME-TOKEN-REF',
        'A Theme token assignment requires loaded Theme token evidence.',
        primarySource,
        undefined,
        { ...details, reason: 'missing-theme-evidence' },
      )],
    };
  }

  if (themes.length > 1) {
    return {
      resolved: false,
      diagnostics: [diagnostic(
        'THEME-TOKEN-REF',
        'A Theme token assignment has ambiguous loaded Theme token evidence.',
        primarySource,
        themes.map((theme) => themeTokensSource(theme)),
        { ...details, reason: 'ambiguous-theme-evidence' },
      )],
    };
  }

  const [theme] = themes;
  if (!hasToken(themeTokens(theme), token)) {
    return {
      resolved: false,
      diagnostics: [diagnostic(
        'THEME-TOKEN-REF',
        'A Theme token assignment references a token absent from loaded Theme token evidence.',
        primarySource,
        [themeTokensSource(theme)],
        { ...details, reason: 'missing-token' },
      )],
    };
  }

  return {
    resolved: true,
    tokenSource: themeTokenSource(theme, token),
    diagnostics: [],
  };
}

function themeTokenEvidenceByAssignment(
  evidence: UiGraphPolicyEvidence,
  assignments: readonly IndexedThemeTokenAssignment[],
  themes: readonly LoadedThemeHandle[],
): Map<number, ThemeTokenEvidence> {
  return new Map(assignments.map((assignment) => [
    assignment.index,
    validateThemeTokenRef(evidence, assignment, themes),
  ]));
}

function tokenSlotSources(
  tokenSlots: readonly ModuleResolutionWidgetTokenSlot[],
): AppGraphSourcePointer[] {
  return tokenSlots
    .map((tokenSlot) => appGraphSourceFromModuleSource(tokenSlot.source))
    .filter((source): source is AppGraphSourcePointer => source !== undefined);
}

function tokenCategorySources(
  tokenCategories: readonly ModuleResolutionTokenCategoryEvidence[],
): AppGraphSourcePointer[] {
  return tokenCategories
    .map((tokenCategory) => appGraphSourceFromModuleSource(tokenCategory.source))
    .filter((source): source is AppGraphSourcePointer => source !== undefined);
}

function matchingThemeTokenSlots(
  resolvedContributions: readonly ModuleResolutionContribution[],
  slot: string,
): ModuleResolutionWidgetTokenSlot[] {
  return resolvedContributions
    .flatMap((contribution) => contribution.widgetTokenSlots ?? [])
    .filter((tokenSlot) => tokenSlot.name === slot);
}

function validateThemeTokenSlot(
  evidence: UiGraphPolicyEvidence,
  assignment: IndexedThemeTokenAssignment,
  resolvedContributions: readonly ModuleResolutionContribution[],
): AppGraphDiagnostic[] {
  const tokenSlots = resolvedContributions.flatMap((contribution) => contribution.widgetTokenSlots ?? []);
  const slot = assignment.assignment.slot;
  if (matchingThemeTokenSlots(resolvedContributions, slot).length > 0) return [];

  const widgetRef = assignment.assignment.widgetRef;
  const declaredSlots = [...new Set(tokenSlots.map((tokenSlot) => tokenSlot.name))].sort();
  const details: Record<string, unknown> = {
    moduleId: widgetRef.moduleId,
    widgetName: widgetRef.widgetName,
    slot,
    reason: declaredSlots.length > 0 ? 'undeclared-slot' : 'no-token-slot-evidence',
  };
  if (declaredSlots.length > 0) details.declaredSlots = declaredSlots;

  const relatedSources = tokenSlotSources(tokenSlots);
  return [diagnostic(
    'THEME-TOKEN-SLOT',
    'A Theme token assignment targets a token slot not declared by the widget.',
    evidenceSource(evidence, `/theme/assignments/${assignment.index}/slot`),
    relatedSources.length > 0 ? relatedSources : undefined,
    details,
  )];
}

function validateThemeTokenCategory(
  evidence: UiGraphPolicyEvidence,
  assignment: IndexedThemeTokenAssignment,
  resolvedContributions: readonly ModuleResolutionContribution[],
  tokenEvidence: ThemeTokenEvidence,
  moduleResolution: ModuleResolutionReport,
): AppGraphDiagnostic[] {
  const slot = assignment.assignment.slot;
  const matchingSlots = matchingThemeTokenSlots(resolvedContributions, slot);
  const token = assignment.assignment.token;
  const acceptedPrefix = [...new Set(matchingSlots.flatMap((tokenSlot) => tokenSlot.acceptedTokenCategories))]
    .filter((categoryPrefix) => token.startsWith(`${categoryPrefix}.`))
    .sort((left, right) => right.length - left.length || left.localeCompare(right))[0];
  if (acceptedPrefix && PLATFORM_TOKEN_CATEGORY_PREFIXES.has(acceptedPrefix)) {
    return [];
  }
  if (acceptedPrefix?.startsWith('x-')) {
    const matchingTokenCategories = (moduleResolution.tokenCategories ?? [])
      .filter((tokenCategory) => tokenCategory.prefix === acceptedPrefix);
    const admittedTokenCategories = matchingTokenCategories
      .filter((tokenCategory) => tokenCategory.status === 'admitted');
    if (admittedTokenCategories.length === 1 && matchingTokenCategories.length === 1) {
      return [];
    }
    const widgetRef = assignment.assignment.widgetRef;
    const relatedSources = [
      ...tokenSlotSources(matchingSlots),
      ...(tokenEvidence.tokenSource ? [tokenEvidence.tokenSource] : []),
      ...tokenCategorySources(matchingTokenCategories),
    ];
    return [diagnostic(
      'THEME-TOKEN-CATEGORY-REF',
      'A Theme token assignment uses an accepted custom token category without exactly one admitted Registry category evidence entry.',
      evidenceSource(evidence, `/theme/assignments/${assignment.index}/token`),
      relatedSources.length > 0 ? relatedSources : undefined,
      {
        moduleId: widgetRef.moduleId,
        widgetName: widgetRef.widgetName,
        slot,
        token,
        categoryPrefix: acceptedPrefix,
        reason: matchingTokenCategories.length === 0
          ? 'missing-token-category-evidence'
          : (matchingTokenCategories.some((tokenCategory) => tokenCategory.status === 'conflict')
            ? 'conflicting-token-category-evidence'
            : (matchingTokenCategories.some((tokenCategory) => tokenCategory.status === 'shape-mismatch')
              ? 'token-category-shape-mismatch'
              : 'ambiguous-token-category-evidence')),
        tokenCategoryStatuses: [...new Set(matchingTokenCategories.map((tokenCategory) => tokenCategory.status))].sort(),
      },
    )];
  }
  if (acceptedPrefix) {
    const widgetRef = assignment.assignment.widgetRef;
    const relatedSources = [
      ...tokenSlotSources(matchingSlots),
      ...(tokenEvidence.tokenSource ? [tokenEvidence.tokenSource] : []),
    ];
    return [diagnostic(
      'THEME-TOKEN-CATEGORY-REF',
      'A Theme token assignment uses a non-platform token category prefix without custom x-* evidence authority.',
      evidenceSource(evidence, `/theme/assignments/${assignment.index}/token`),
      relatedSources.length > 0 ? relatedSources : undefined,
      {
        moduleId: widgetRef.moduleId,
        widgetName: widgetRef.widgetName,
        slot,
        token,
        categoryPrefix: acceptedPrefix,
        reason: 'unsupported-category-prefix',
      },
    )];
  }
  const widgetRef = assignment.assignment.widgetRef;
  const acceptedTokenCategories = [...new Set(matchingSlots.flatMap((tokenSlot) => tokenSlot.acceptedTokenCategories))].sort();
  const relatedSources = [
    ...tokenSlotSources(matchingSlots),
    ...(tokenEvidence.tokenSource ? [tokenEvidence.tokenSource] : []),
  ];

  return [diagnostic(
    'THEME-TOKEN-CATEGORY',
    'A Theme token assignment uses a token category not accepted by the declared widget token slot.',
    evidenceSource(evidence, `/theme/assignments/${assignment.index}/token`),
    relatedSources.length > 0 ? relatedSources : undefined,
    {
      moduleId: widgetRef.moduleId,
      widgetName: widgetRef.widgetName,
      slot,
      token,
      reason: 'category-not-accepted',
      acceptedTokenCategories,
    },
  )];
}

export function validateUiGraphPolicy(context: AppGraphContext): AppGraphDiagnostic[] {
  const surfaces = loadedSurfaceHandles(context.handles);
  const locales = loadedLocaleHandles(context.handles);
  const definitions = loadedDefinitionHandles(context.handles);
  const themes = loadedThemeHandles(context.handles);
  return policyEvidences(context).flatMap((evidence) => {
    const targetUrl = targetSurfaceUrl(evidence.document);
    const matchingSurfaces = surfaces.filter((surface) => surfaceRefUrl(surface) === targetUrl);
    if (matchingSurfaces.length !== 1) {
      return [targetSurfaceDiagnostic(evidence, surfaces, targetUrl)];
    }
    if (!targetSurfaceVersionCompatible(evidence.document, matchingSurfaces[0])) {
      return [targetSurfaceVersionDiagnostic(evidence, matchingSurfaces[0], targetSurfaceVersion(evidence.document) ?? '')];
    }
    const assignments = themeAssignments(evidence.document);
    const tokenEvidenceByAssignment = themeTokenEvidenceByAssignment(evidence, assignments, themes);
    const hostReserved = hostReservedLandmarks(context);
    return [
      ...validateRoutePolicies(
        evidence,
        matchingSurfaces[0],
        definitions,
        routePolicies(evidence.document),
        hostReserved,
      ),
      ...validateLocaleKeyOwners(evidence, locales, context.moduleResolution),
      ...validateThemeRouteClass(evidence, matchingSurfaces[0], assignments),
      ...[...tokenEvidenceByAssignment.values()].flatMap((tokenEvidence) => tokenEvidence.diagnostics),
      ...validateThemeWidgetRefs(evidence, assignments, context.moduleResolution, tokenEvidenceByAssignment),
    ];
  });
}
