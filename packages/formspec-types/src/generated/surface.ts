/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { ModuleRef, Generation, Extensions } from './common.js';
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
   * Closed v0.2 slot-type taxonomy per ADR 0150 §6.2. Each value pins a binding shape (see allOf gates below). Extensions land via the module Registry's `slot-type` contribution category in a future revision.
   */
  slotType: 'definition-form' | 'experience-unit' | 'module-widget' | 'static-content' | 'embed-route';
  /**
   * OPTIONAL renderer hint naming a layout position (e.g. 'left', 'main', 'right', 'header'). Author-defined; renderers consume per their layout model. v0.2 carries no normative position vocabulary.
   */
  position?: string;
  title?: string;
  'x-generation'?: Generation;
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
   * Surface specification version. MUST be '0.2'.
   */
  $formspecSurface: '0.2';
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
  'x-generation'?: Generation;
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
   * URL-style path for this route. SHOULD start with '/'. v0.2 route parameters use simple URI Template markers like '/matter/{matterId}'. Colon-prefixed framework parameters, wildcards, regex captures, matrix/query parameters, optional segments, URI Template operators, and malformed markers are invalid. Paths with no `{name}` markers and no params[] remain opaque non-empty strings.
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
  'x-generation'?: Generation;
  navigation?: RouteNavigation;
  /**
   * Slots bound on this route. Each slot has a typed binding per §6.2 closed taxonomy. v0.2 does NOT pin slot positions in the schema — `position` is an optional renderer hint. Each slot has exactly one slotType discriminator.
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
   * Route parameter value type. v0.2 admits strings only; richer coercion belongs to runtime or Data Sources consumers.
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
 * Authoring identity per ADR 0150 §5.4. Distinct from `respondent-ledger-event.Actor` (respondent-identity) and `experience.Actor` (workflow-role) — three Actor $defs by design. `kind` and `actChannel` are terminal-closed enums; product nuance (e.g. discriminating Wireframes-MCP from Forms-MCP, both `actChannel: 'mcp'`) rides URN-encoded into `id`, not via new enum values.
 */
export interface AuthorActor {
  /**
   * Stable actor URN (urn:formspec:actor:... scheme). Product nuance rides URN-encoded (e.g. urn:formspec:actor:mcp:wireframes:agent-7).
   */
  id: string;
  /**
   * Terminal-closed per §5.4 (NOT §4.5-extensible). Answers 'what kind of authoring entity'.
   */
  kind: 'human' | 'ai-agent' | 'service';
  /**
   * Terminal-closed per §5.4. Orthogonal to kind. Answers 'through what channel'. An ai-agent MAY have actChannel:'mcp' (mediated via MCP) OR 'agent' (autonomous). A human MAY have actChannel:'human' (direct editor) OR 'mcp' (CLI-driven MCP).
   */
  actChannel: 'human' | 'mcp' | 'agent' | 'service';
  /**
   * Optional human-readable label for timeline/support views.
   */
  display?: string;
  extensions?: Extensions;
}
/**
 * Graph-wide Component node identity for x-generation movedFrom/copiedFrom provenance. Mirrors the app-graph Component node identity tuple: Component membership, Surface sibling identity, route, absolute route-scoped nodePath, and optional public/structural node ids. This is provenance metadata only; it does not authorize, execute, or resolve runtime behavior.
 */
export interface ComponentNodeIdentityRef {
  component: {
    /**
     * App Manifest components[] membership handle.
     */
    handle: string;
    /**
     * Canonical URL of the Component document when available.
     */
    url?: string;
    /**
     * Component document version evidence when available.
     */
    version?: string;
  };
  surface: {
    /**
     * Canonical URL of the Surface document.
     */
    url: string;
    /**
     * Surface document version evidence when available.
     */
    version?: string;
  };
  /**
   * Surface routes[].id for the route-scoped node.
   */
  route: string;
  /**
   * Absolute route-scoped Component node path built from stable node segments.
   */
  nodePath: string;
  /**
   * Optional ComponentBase.id evidence for the node.
   */
  id?: string;
  /**
   * Optional structural authoring identity for the node.
   */
  nodeId?: string;
}
/**
 * Legacy same-runtime route + intra-document node path. Retained for Studio/kernel compatibility; it is not sufficient graph-wide Component provenance once multiple Surfaces or Component documents are loaded.
 */
export interface CrossComponentRef {
  route: string;
  nodePath: string;
}
/**
 * OPTIONAL person-facing navigation membership and presentation. Omission preserves the v0.2 default: the route appears in navigation using its route title. This field changes only navigation chrome; it does not change route reachability, matching, transitions, or authorization.
 */
export interface RouteNavigation {
  'x-generation'?: Generation;
  /**
   * Whether this route appears in the shell's route navigation. Default true. Hidden routes remain addressable and may remain transition targets.
   */
  visible?: boolean;
  /**
   * Navigation context this route belongs to. The shell renders only visible entries whose scope matches the active route's scope. Omission is semantically the "default" scope.
   */
  scope?: string;
  /**
   * Person-facing navigation label. When omitted, the renderer uses the route title, then the route id.
   */
  label?: string;
  /**
   * Relative order within this Surface's navigation group. Lower values appear first; equal or absent values preserve route declaration order.
   */
  order?: number;
  /**
   * This interface was referenced by `RouteNavigation`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   *
   * This interface was referenced by `RouteNavigation`'s JSON-Schema definition
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
  'x-generation'?: Generation;
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
/**
 * This interface was referenced by `SurfaceDocument`'s JSON-Schema
 * via the `definition` "WidgetDataBindings".
 */
export interface WidgetDataBindings {
  [k: string]: WidgetDataBinding;
}
/**
 * This interface was referenced by `WidgetDataBindings`'s JSON-Schema definition
 * via the `patternProperty` "^[A-Za-z][A-Za-z0-9_-]*$".
 *
 * This interface was referenced by `SurfaceDocument`'s JSON-Schema
 * via the `definition` "WidgetDataBinding".
 */
export interface WidgetDataBinding {
  /**
   * Canonical Data Sources URL. App-graph validation requires an exact match to one App Manifest dataSources[].url.
   */
  catalogRef: string;
  /**
   * Data Sources 1.0 source id. App-graph validation resolves it only within catalogRef; unqualified source lookup is forbidden.
   */
  sourceRef: string;
  'x-generation'?: Generation;
}
/**
 * This interface was referenced by `SurfaceDocument`'s JSON-Schema
 * via the `definition` "DefinitionFormInitialDataBinding".
 */
export interface DefinitionFormInitialDataBinding {
  /**
   * Canonical Data Sources URL. App-graph and runtime resolution require an exact match to one App Manifest dataSources[].url.
   */
  catalogRef: string;
  /**
   * Data Sources 1.0 source id resolved only within catalogRef; unqualified source lookup is forbidden. A direct definition-response source delivers Response.data, not the enclosing Form Response.
   */
  sourceRef: string;
  /**
   * Optional App Manifest mappings[].handle. Use only when the delivered source value does not already match the Definition; the existing Mapping DSL executes in reverse. Mapping rules cannot be inlined here.
   */
  mappingRef?: string;
  'x-generation'?: Generation;
  /**
   * This interface was referenced by `DefinitionFormInitialDataBinding`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * This interface was referenced by `SurfaceDocument`'s JSON-Schema
 * via the `definition` "WidgetActionBindings".
 */
export interface WidgetActionBindings {
  [k: string]: WidgetActionBinding;
}
/**
 * This interface was referenced by `WidgetActionBindings`'s JSON-Schema definition
 * via the `patternProperty` "^[A-Za-z][A-Za-z0-9_-]*$".
 *
 * This interface was referenced by `SurfaceDocument`'s JSON-Schema
 * via the `definition` "WidgetActionBinding".
 */
export interface WidgetActionBinding {
  /**
   * Exact actions[].id from one loaded Response Actions document. This value is not a route id, intent, or widget output name.
   */
  actionRef: string;
  'x-generation'?: Generation;
}
