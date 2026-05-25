/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { Extensions } from './common.js';
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
   * Runtime owner responsible for supplying this source. This is ownership metadata, not authorization.
   */
  owner: 'host' | 'formspec' | 'module';
  /**
   * Lifetime or addressing scope for the source.
   */
  scope: 'session' | 'route' | 'definition' | 'resource';
  availability: Availability;
  runtime: RuntimeBehavior;
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
   * Coarse boundary that owns admission before this source is exposed. Fine-grained actor, route, operation, widget, or field authorization remains forbidden until ADR 0152.
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
