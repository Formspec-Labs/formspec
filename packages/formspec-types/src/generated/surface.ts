/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { ModuleRef, Extensions } from './common.js';
/**
 * This interface was referenced by `SurfaceDocument`'s JSON-Schema
 * via the `definition` "Slot".
 */
export type Slot = {
  [k: string]: unknown;
} & {
  /**
   * Slot ID. Unique within the enclosing route.
   */
  id: string;
  /**
   * Closed v0.1 slot-type taxonomy per ADR 0150 §6.2. Each value pins a binding shape (see allOf gates below). Closed at v0.1 — extensions land via the module Registry's `slot-type` contribution category in a future rev.
   */
  slotType: 'definition-form' | 'experience-unit' | 'module-widget' | 'static-content' | 'embed-route';
  /**
   * OPTIONAL renderer hint naming a layout position (e.g. 'left', 'main', 'right', 'header'). Author-defined; renderers consume per their layout model. v0.1 carries no normative position vocabulary.
   */
  position?: string;
  title?: string;
  /**
   * Typed binding payload. Shape determined by slotType per the allOf gates.
   */
  binding: {};
  /**
   * This interface was referenced by `undefined`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
};

/**
 * A published Formspec Surface document per ADR 0150 §6 (Surface as composition primitive). Surface names routes within an app and binds slots that compose Experience units, Definition forms, module widgets, static content, and nested route references. Surface is orthogonal to Screener (§7) — Surface is steady-state inward composition; Screener is one-shot outward routing. The cross-seam is the `surface:<route-id>` URI scheme: a Screener terminal-hop target with that scheme lands inside Surface composition. Authoring drafts are not separate source artifacts; tools that expose drafts must export a schema-valid Surface document before publication.
 */
export interface SurfaceDocument {
  /**
   * Surface specification version. MUST be '0.1'.
   */
  $formspecSurface: '0.1';
  /**
   * Stable identifier for this Surface document. Unique within the bundle.
   */
  id: string;
  /**
   * OPTIONAL declaration of substrate modules this document depends on. Each entry is a canonical ModuleRef (id + version, with optional publisher + lockHash). Per ADR 0150 §4.3. Default-module-set behavior preserves form-only documents (omitting modules[] is identical to declaring the core module set).
   */
  modules?: ModuleRef[];
  /**
   * ID of the entry route. MUST resolve to a routes[].id in this document. The route-graph connectedness lint (E606) walks the graph from this entry to verify reachability.
   */
  entry: string;
  /**
   * Routes defined by this Surface. Each route names a path, binds slots, and optionally declares transitions.
   *
   * @minItems 1
   */
  routes: [Route, ...Route[]];
  /**
   * Human-readable title for this Surface.
   */
  title?: string;
  description?: string;
  extensions?: Extensions;
  /**
   * This interface was referenced by `SurfaceDocument`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * This interface was referenced by `SurfaceDocument`'s JSON-Schema
 * via the `definition` "Route".
 */
export interface Route {
  /**
   * Route ID. Unique within this Surface's routes[]. Targeted by surface:<route-id> URI scheme from Screener terminal-hops (ADR §7) and by embed-route slot bindings (§6.2).
   */
  id: string;
  /**
   * URL-style path for this route. SHOULD start with '/'. v0.1 route parameters use simple URI Template markers like '/matter/{matterId}'; paths with no `{name}` markers and no params[] remain opaque non-empty strings.
   */
  path: string;
  /**
   * OPTIONAL required route parameters for entering this route. Each declared name MUST appear as a simple `{name}` marker in path; every Surface-local edge into this route MUST supply all declared params.
   */
  params?: RouteParam[];
  /**
   * OPTIONAL closed, NON-EXTENSIBLE vocabulary naming WHAT THIS ROUTE PRESENTS. `intake` = a Definition-backed capture from a respondent. `proof` = an artifact the platform issued that a third party relies on as evidence (receipt, certificate, disclosure). `ceremony` = the act of signing or attesting, where the signer's preimage IS the thing signed. `verification` = independent checking of an issued artifact. `attestation` = a claim the platform publishes about itself that a third party relies on (trust center, capability matrix, subprocessor list, data-flow disclosure, status) — the accountable party is the publisher, not a port, which is why `proof` cannot absorb it. `authentication` = a credential exchange binding an actor to an external identity, where the chrome IS the anti-phishing control. `operation` = operator-facing product UI (dashboards, admin, developer, authoring) — a negative declaration, "someone looked and found nothing to declare", NOT an assertion that the route carries no trust claim. Names the route's kind, NOT a permission — rules derive from it (theme authority admits tenant Theme assignments on `intake` routes and refuses them on every other value; see ui-graph-policy-spec.md §5.7, `THEME-ROUTE-CLASS`). Deliberately orthogonal to access posture and route lifecycle; MUST NOT absorb either. NO DEFAULT: an absent routeClass means *unclassified* (nobody has stated what this route is), which is a distinct state from `operation` and refuses nothing. Processors MUST NOT treat absence as `operation`. See surface-spec.md §3 Route Class.
   */
  routeClass?: 'intake' | 'proof' | 'ceremony' | 'verification' | 'attestation' | 'authentication' | 'operation';
  /**
   * Human-readable route title (for navigation chrome, breadcrumbs, etc.).
   */
  title?: string;
  /**
   * Slots bound on this route. Each slot has a typed binding per §6.2 closed taxonomy. v0.1 does NOT pin slot positions in the schema — `position` is an optional renderer hint. Each slot has exactly one slotType discriminator.
   *
   * @minItems 1
   */
  slots: [Slot, ...Slot[]];
  /**
   * OPTIONAL outgoing transitions from this route. Each transition names a trigger, target route, and optional when-condition. Used by the lint route-graph walker to compute reachability.
   */
  transitions?: Transition[];
  /**
   * This interface was referenced by `Route`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * This interface was referenced by `SurfaceDocument`'s JSON-Schema
 * via the `definition` "RouteParam".
 */
export interface RouteParam {
  /**
   * Route parameter name. MUST appear exactly once as `{name}` in the route path when params[] is declared.
   */
  name: string;
  /**
   * Route parameter value type. v0.1 admits strings only; richer coercion belongs to runtime or Data Sources consumers.
   */
  type: 'string';
  description?: string;
  example?: string;
  /**
   * This interface was referenced by `RouteParam`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * This interface was referenced by `SurfaceDocument`'s JSON-Schema
 * via the `definition` "Transition".
 */
export interface Transition {
  /**
   * Transition trigger declaration. Typically references a Response Actions action ID (resolved against the bundle's response-actions document) or names a standard Response Actions intent value declared by exactly one loaded action. Surface declares the navigation trigger; Response Actions remains the executor for preconditions, validation, effects, idempotency, replay, retry, blocking, and terminal state.
   */
  trigger: string;
  /**
   * Target route id within this Surface. Edge in the route-graph for E606 reachability.
   */
  to: string;
  /**
   * OPTIONAL FEL condition gating this transition. Processors evaluate against validated bundle-state bindings; authoring facades may reject this field until they can validate those bindings.
   */
  when?: string;
  params?: RouteParamMap;
  /**
   * This interface was referenced by `Transition`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * OPTIONAL transition parameter map. Keys name params declared by the target route; values name host/runtime bindings supplied after the transition trigger completes under Response Actions authority.
 */
export interface RouteParamMap {
  /**
   * Name of the runtime, host, prior route param, or response binding whose value supplies this target route parameter.
   *
   * This interface was referenced by `RouteParamMap`'s JSON-Schema definition
   * via the `patternProperty` "^[a-zA-Z][a-zA-Z0-9_-]*$".
   *
   * This interface was referenced by `RouteParamMap`'s JSON-Schema definition
   * via the `patternProperty` "^[a-zA-Z][a-zA-Z0-9_-]*$".
   */
  [k: string]: string;
}
