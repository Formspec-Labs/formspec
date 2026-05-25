/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * This interface was referenced by `UiGraphPolicyDocument`'s JSON-Schema
 * via the `definition` "ModuleId".
 */
export type ModuleId = string;

/**
 * Structural source contract for UI Graph Policy v0.1. This document constrains a loaded Surface graph with module Locale key ownership, route-level accessibility policy, responsive route slot collapse order, hidden Definition references, and Theme token assignments to module widget token slots. It is host-loaded evidence only in v0.1: it is not an App Manifest sibling slot, not an ArtifactResolver group, not an AppGraphValidator implementation, not ModuleResolver token-slot authority, not runtime hidden-state behavior, and not an authorization policy.
 */
export interface UiGraphPolicyDocument {
  /**
   * UI Graph Policy document version. MUST be '0.1'.
   */
  $formspecUiGraphPolicy: '0.1';
  /**
   * Version of this UI Graph Policy document. MUST be a strict SemVer 2.0.0 string.
   */
  version: string;
  title?: string;
  description?: string;
  targetSurface: SurfaceRef;
  /**
   * Module ownership declarations for $module.* Locale key prefixes. Prefix collisions, prefix-to-moduleId matching, and unresolved module ids are semantic app-graph checks, not structural schema checks.
   */
  localeKeyOwners?: LocaleKeyOwner[];
  /**
   * Route-scoped policy entries keyed by Surface routes[].id. Full route coverage and duplicate route policy checks are semantic app-graph checks.
   *
   * @minItems 1
   */
  routePolicies: [RoutePolicy, ...RoutePolicy[]];
  theme?: ThemePolicy;
}
/**
 * Canonical Surface identity this UI Graph Policy document constrains.
 */
export interface SurfaceRef {
  /**
   * Canonical Surface URL this policy constrains. The policy document MUST NOT infer Surface identity from source path, filename, URL suffix, or route name.
   */
  url: string;
  /**
   * Optional exact version or range expression. Compatibility is checked by app-graph semantics.
   */
  version?: string;
}
/**
 * This interface was referenced by `UiGraphPolicyDocument`'s JSON-Schema
 * via the `definition` "LocaleKeyOwner".
 */
export interface LocaleKeyOwner {
  /**
   * Owned Locale key prefix beginning with $module.<moduleId>. and ending with a dot.
   */
  keyPrefix: string;
  moduleId: ModuleId;
}
/**
 * This interface was referenced by `UiGraphPolicyDocument`'s JSON-Schema
 * via the `definition` "RoutePolicy".
 */
export interface RoutePolicy {
  /**
   * Surface routes[].id this policy entry targets.
   */
  routeId: string;
  a11y?: RouteA11YPolicy;
  responsive?: ResponsiveRoutePolicy;
  definitionVisibility?: DefinitionVisibilityPolicy;
}
/**
 * This interface was referenced by `UiGraphPolicyDocument`'s JSON-Schema
 * via the `definition` "RouteA11yPolicy".
 */
export interface RouteA11YPolicy {
  /**
   * Route-level landmark category. Renderer-specific ARIA or platform mapping is out of scope.
   */
  landmark?: 'main' | 'navigation' | 'complementary' | 'region';
  /**
   * Whether the route-level policy profile requires keyboard navigation support.
   */
  keyboardNavigation?: boolean;
}
/**
 * This interface was referenced by `UiGraphPolicyDocument`'s JSON-Schema
 * via the `definition` "ResponsiveRoutePolicy".
 */
export interface ResponsiveRoutePolicy {
  minColumns?: number;
  /**
   * Ordered Surface route slot ids used by the route's responsive collapse policy. Slot resolution is an app-graph semantic check.
   */
  collapseOrder?: string[];
}
/**
 * This interface was referenced by `UiGraphPolicyDocument`'s JSON-Schema
 * via the `definition` "DefinitionVisibilityPolicy".
 */
export interface DefinitionVisibilityPolicy {
  /**
   * Definition refs hidden by route policy. Loaded Definition resolution and route-local form-slot checks are semantic app-graph checks.
   */
  hiddenDefinitionRefs?: DefinitionRef[];
}
/**
 * This interface was referenced by `UiGraphPolicyDocument`'s JSON-Schema
 * via the `definition` "DefinitionRef".
 */
export interface DefinitionRef {
  url: string;
  version?: string;
}
/**
 * This interface was referenced by `UiGraphPolicyDocument`'s JSON-Schema
 * via the `definition` "ThemePolicy".
 */
export interface ThemePolicy {
  /**
   * Theme token assignments to module widget token slots. Widget and slot resolution is deferred to ModuleResolver/Registry evidence.
   */
  assignments?: ThemeTokenAssignment[];
}
/**
 * This interface was referenced by `UiGraphPolicyDocument`'s JSON-Schema
 * via the `definition` "ThemeTokenAssignment".
 */
export interface ThemeTokenAssignment {
  widgetRef: WidgetRef;
  slot: string;
  /**
   * Raw Theme token key from a loaded Theme tokens map, such as 'color.accent'. UI Graph Policy does not use '$token.<key>' reference syntax in this field.
   */
  token: string;
}
/**
 * This interface was referenced by `UiGraphPolicyDocument`'s JSON-Schema
 * via the `definition` "WidgetRef".
 */
export interface WidgetRef {
  moduleId: ModuleId;
  /**
   * Module-contributed widget name. Contribution ownership is resolved by ModuleResolver, not this schema.
   */
  widgetName: string;
}
