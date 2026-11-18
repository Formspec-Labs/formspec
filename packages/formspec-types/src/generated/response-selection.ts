/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "ResponseSelectionRequest".
 */
export type ResponseSelectionRequest = DefinitionResponseSelectionRequest | CatalogResponseSelectionRequest;
export type ResponseSelectionProjection = string[];
/**
 * Required for completed records and absent for current drafts. ResponseJson::handoff_hash() over the complete immutable Response under formspec.response.handoff.v1; equals its IntakeHandoff.responseHash.
 */
export type Sha256Digest = string;
export type ResponseSelectionRecords = ResolvedInstanceRecord[];
/**
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "ResponseSelectionOutcome".
 */
export type ResponseSelectionOutcome = AvailableResponseSelection | UnavailableResponseSelection;
/**
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "DispositionObservation".
 */
export type DispositionObservation = DecidedDisposition | UndecidedDisposition;
export type DispositionComments = string[];

/**
 * Shared request and result types for scoped Response selection and review joins.
 */
export interface ResponseSelectionPayloads {}
/**
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "DefinitionResponseSelectionRequest".
 */
export interface DefinitionResponseSelectionRequest {
  key: string;
  scope: string;
  selection: ResponseSelection;
  consumerSubject?: ResponseSelectionSubjectKeys;
  projection?: ResponseSelectionProjection;
  fallback?: unknown;
  pin?: ResponseSelectionDelivery;
  kind: 'definition';
}
/**
 * Closed, same-scope Response selection shared by Definition instances and catalog sources. Authorize read before querying; order by authored instant descending then Response id ascending. Definition-local predicates use only from.subject; routeParam is catalog-only.
 *
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "ResponseSelection".
 */
export interface ResponseSelection {
  definition: TargetDefinition;
  /**
   * Predicates over upstream subject keys; empty means no key predicates.
   */
  subject: SubjectPredicate[];
  /**
   * completed selects immutable filings. current selects the unit open draft, else latest completed; distinct from catalog delivery draft.
   */
  status: 'completed' | 'current';
  /**
   * Review outcome resolved by DispositionAuthority using responseId and responseHash, never inherited by an amendment.
   */
  disposition?: string;
  /**
   * Successful no-match behavior. empty delivers fallback and records none; authorization refusal always remains unavailable.
   */
  whenNone?: 'unavailable' | 'empty';
  /**
   * Select latest overall or latest per distinct subject after filtering and fixed ordering.
   */
  cardinality: 'latest' | 'latest-per-subject';
  /**
   * at-open selects and records a pin at draft open; later loads retain the pin and report newer.
   */
  pin: 'none' | 'at-open';
  /**
   * URL of an optional Mapping applied forward.
   */
  mapping?: string;
}
/**
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "TargetDefinition".
 */
export interface TargetDefinition {
  /**
   * Canonical URL of the target Definition.
   */
  url: string;
  /**
   * Semver range expression describing which Definition versions this document supports.
   */
  compatibleVersions?: string;
}
/**
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "SubjectPredicate".
 */
export interface SubjectPredicate {
  /**
   * Upstream subject key to compare.
   */
  key: string;
  /**
   * Compare the upstream key with the referenced value plus any offset. le and ge are allowed only for integer keys; eq preserves the declared type.
   */
  op: 'eq' | 'le' | 'ge';
  from: {
    [k: string]: unknown;
  };
  /**
   * Added to the referenced key before comparison; allowed only for integer keys.
   */
  offset?: number;
}
/**
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "ResponseSelectionSubjectKeys".
 */
export interface ResponseSelectionSubjectKeys {
  [k: string]: string | number;
}
/**
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "ResponseSelectionDelivery".
 */
export interface ResponseSelectionDelivery {
  records: ResponseSelectionRecords;
  valueDigest: Sha256Digest;
  none: boolean;
  pinned: boolean;
  mapping?: ResponseSelectionMapping;
  value: unknown;
}
/**
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "ResolvedInstanceRecord".
 */
export interface ResolvedInstanceRecord {
  /**
   * Identity of the selected Response.
   */
  responseId: string;
  /**
   * Exact upstream Definition version.
   */
  definitionVersion: string;
  responseHash?: Sha256Digest;
}
/**
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "ResponseSelectionMapping".
 */
export interface ResponseSelectionMapping {
  /**
   * URL of the forward Mapping used.
   */
  url: string;
  digest: Sha256Digest;
}
/**
 * The adapter resolves the selection from its own catalog and refuses a digest mismatch.
 *
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "CatalogResponseSelectionRequest".
 */
export interface CatalogResponseSelectionRequest {
  key: string;
  kind: 'catalog';
  catalogRef: string;
  sourceRef: string;
  catalogDigest: Sha256Digest;
  routeParams?: ResponseSelectionRouteParams;
  consumerSubject?: ResponseSelectionSubjectKeys;
  pin?: ResponseSelectionDelivery;
}
export interface ResponseSelectionRouteParams {
  [k: string]: string;
}
/**
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "NewerSelectedResponse".
 */
export interface NewerSelectedResponse {
  responseId: string;
  responseHash: Sha256Digest;
}
/**
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "AvailableResponseSelection".
 */
export interface AvailableResponseSelection {
  status: 'available';
  records: ResponseSelectionRecords;
  valueDigest: Sha256Digest;
  none: boolean;
  pinned: boolean;
  mapping?: ResponseSelectionMapping;
  value: unknown;
  newer?: NewerSelectedResponse;
}
/**
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "UnavailableResponseSelection".
 */
export interface UnavailableResponseSelection {
  status: 'unavailable';
}
/**
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "DecidedDisposition".
 */
export interface DecidedDisposition {
  status: 'decided';
  disposition: string;
  review: 'returned' | 'accepted' | 'closed-without-acceptance' | 'reopened';
  comments: DispositionComments;
}
/**
 * This interface was referenced by `ResponseSelectionPayloads`'s JSON-Schema
 * via the `definition` "UndecidedDisposition".
 */
export interface UndecidedDisposition {
  status: 'none' | 'unavailable';
}
