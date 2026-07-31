/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { Extensions, Generation } from './common.js';
/**
 * This interface was referenced by `DataSourcesDocument`'s JSON-Schema
 * via the `definition` "DataSource".
 */
export type DataSource = {
  /**
   * Stable source id unique within this document. Prefix MUST match kind: host, response, resource, query, conversation, or route.
   */
  id: string;
  kind: DataSourceKind;
  /**
   * Canonical Definition URL when this source family reads or exposes Definition-response state.
   */
  definitionRef?: string;
  /**
   * Exact Definition version used to partition non-draft Definition-response selection. The pair (definitionRef, definitionVersion) is immutable selection identity.
   */
  definitionVersion?: string;
  responseSelection?: ResponseSelection;
  /**
   * Runtime owner responsible for supplying this source. This is ownership metadata, not authorization.
   */
  owner: 'host' | 'formspec' | 'module';
  /**
   * Lifetime or addressing scope for the source.
   */
  scope: 'session' | 'route' | 'definition' | 'resource';
  availability: Availability;
  runtime: RuntimeBehavior;
  'x-generation'?: Generation;
  /**
   * Optional JSON Schema fragment describing payload shape. This is a contract for hosts and validators, not inline source data.
   */
  schema?: {};
  description?: string;
  extensions?: Extensions;
  /**
   * This interface was referenced by `undefined`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
};
/**
 * Closed source family taxonomy for Data Sources v1.0.
 *
 * This interface was referenced by `DataSourcesDocument`'s JSON-Schema
 * via the `definition` "DataSourceKind".
 */
export type DataSourceKind =
  | 'host-state'
  | 'definition-response'
  | 'document-resource'
  | 'conversation-stream'
  | 'query-result'
  | 'route-params';
/**
 * This interface was referenced by `DataSourcesDocument`'s JSON-Schema
 * via the `definition` "Availability".
 */
export type Availability = {
  /**
   * Where this source is advertised in the resolved app graph.
   */
  level: 'app' | 'definition' | 'surface' | 'route' | 'slot' | 'module';
  /**
   * Canonical Definition URL for definition-scoped availability.
   */
  definitionRef?: string;
  /**
   * Canonical Surface URL. Required for surface, route, and slot availability because App Manifest surfaces[] may contain more than one Surface.
   */
  surfaceRef?: string;
  /**
   * Surface route id. Requires surfaceRef.
   */
  routeRef?: string;
  /**
   * Surface slot id. Requires surfaceRef and routeRef.
   */
  slotId?: string;
  /**
   * Module id when the source is advertised to a module contribution.
   */
  moduleId?: string;
};
/**
 * This interface was referenced by `DataSourcesDocument`'s JSON-Schema
 * via the `definition` "RuntimeBehavior".
 */
export type RuntimeBehavior = {
  /**
   * How the source is delivered to consumers: one-time snapshot, live subscription, or draft Response state.
   */
  delivery: 'snapshot' | 'live' | 'draft';
  cache: CacheRule;
  /**
   * Coarse boundary that owns admission before this source is exposed. Fine-grained actor, route, operation, widget, or field authorization stays forbidden here by decision: runtime data-access authorization is server-side engine territory (ADR 0117, Zanzibar-lineage behind AuthorizationPort), and ADR 0152 covers authoring-time write authority only.
   */
  authorizationBoundary: 'host' | 'formspec-session' | 'module';
  /**
   * Consumer behavior when the source cannot be supplied.
   */
  failureMode: 'empty-state' | 'stale-ok' | 'block-render' | 'degraded-widget';
  provenance: ProvenanceRule;
};
/**
 * This interface was referenced by `DataSourcesDocument`'s JSON-Schema
 * via the `definition` "CacheRule".
 */
export type CacheRule = {
  /**
   * Cache behavior. `none` forbids staleAfter; live delivery requires subscribe; draft delivery requires draft.
   */
  mode: 'snapshot' | 'subscribe' | 'draft' | 'none';
  /**
   * ISO 8601 duration after which a cached value is stale. Forbidden when mode is none.
   */
  staleAfter?: string;
};
/**
 * Host-reported outcome of one Data Source load request.
 *
 * This interface was referenced by `DataSourcesDocument`'s JSON-Schema
 * via the `definition` "DataSourceLoadState".
 */
export type DataSourceLoadState = 'loaded' | 'unavailable';
/**
 * Host-reported freshness of a loaded Data Source value. Hosts report this value; consumers do not infer it from a clock.
 *
 * This interface was referenced by `DataSourcesDocument`'s JSON-Schema
 * via the `definition` "DataSourceFreshness".
 */
export type DataSourceFreshness = 'fresh' | 'stale';

/**
 * Peer app-graph artifact declaring named Data Sources for app, route, slot, module, resource, and Definition-response availability. Definition-local instances remain the authority for @instance() lookup inside a Definition; this document is the app-level catalog consumed by App Manifest resolution and future AppGraphValidator work.
 */
export interface DataSourcesDocument {
  /**
   * Data Sources document version. MUST be '1.0'.
   */
  $formspecDataSources: '1.0';
  /**
   * Canonical identity URL for this Data Sources catalog. App Manifest v2.1 dataSources[] entries reference this URL.
   */
  id: string;
  /**
   * Version of this Data Sources document. MUST be a strict SemVer 2.0.0 string.
   */
  version: string;
  /**
   * Human-readable title for this Data Sources catalog.
   */
  title?: string;
  description?: string;
  /**
   * Named data sources available to the resolved app graph. Each id MUST be unique within this document; processors enforce that semantic invariant.
   *
   * @minItems 1
   */
  sources: [DataSource, ...DataSource[]];
  extensions?: Extensions;
  /**
   * This interface was referenced by `DataSourcesDocument`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * Complete deterministic selection policy for a non-draft Definition-response source.
 */
export interface ResponseSelection {
  /**
   * Select only Responses whose owner-defined ResponseStatus is completed.
   */
  status: 'completed';
  /**
   * Return exactly the latest matching Response when one exists.
   */
  cardinality: 'latest';
  /**
   * Order matching Responses by the RFC 3339 instant represented by authored, newest first.
   */
  orderBy: 'authored-desc';
  /**
   * Resolve equal authored instants by Response id ascending in unsigned UTF-8 byte order.
   */
  tieBreak: 'response-id-asc';
  /**
   * Select only within the exact (definitionRef, definitionVersion) partition.
   */
  partitionBy: 'definition';
}
/**
 * This interface was referenced by `DataSourcesDocument`'s JSON-Schema
 * via the `definition` "ProvenanceRule".
 */
export interface ProvenanceRule {
  kind: DataSourceKind;
  /**
   * Host, resource, query, conversation, route, or response provenance pointer. The Data Source spec defines the expected family; concrete resolver syntax is host-specific.
   */
  source: string;
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
 * Module/template provenance per §5.3. Orthogonal to generatedBy — answers 'which module supplied this template' not 'who authored this op'.
 */
export interface ModuleRef {
  /**
   * Module ID following the Registry naming pattern per ADR 0150 §4.8. Despite §4.4 prose calling this a 'URN', §4.3 examples and §4.8 regex are bare `^x-` prefix (e.g. 'x-formspec-core-task'). This pattern matches the canonical regex.
   */
  id: string;
  /**
   * Strict SemVer string or range expression (e.g. '1.0.0', '^1.0.0', '>=1.0.0 <2.0.0').
   */
  version: string;
  /**
   * OPTIONAL provenance assertion (the document asserts; posture admission checks).
   */
  publisher?: string;
  /**
   * OPTIONAL digest pin (e.g. 'sha256:...'). Pins hostile-substitution risk when paired with posture.allowedModules[].
   */
  lockHash?: string;
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
