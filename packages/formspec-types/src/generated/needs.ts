/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { Extensions, AuthorActor } from './common.js';
/**
 * This interface was referenced by `NeedsDocument`'s JSON-Schema
 * via the `definition` "Need".
 */
export type Need = {
  [k: string]: unknown;
} & {
  /**
   * Stable identifier for this Need. Unique within needs[]. Referenced by Experience needRefs[].id and by need:<id>@<revision> generation anchors. Renaming is supersession, not an edit.
   */
  id: string;
  /**
   * Grouping key. When journeys[] is declared, MUST resolve to a journeys[].id.
   */
  journey?: string;
  title?: string;
  statement: Statement;
  /**
   * Evidence citations. Exactly one of grounding / ungroundedReason is present (spec S5.4); the oneOf below enforces it.
   *
   * @minItems 1
   */
  grounding?: [Grounding, ...Grounding[]];
  /**
   * Declared absence of evidence. Closed enum: hypothesis (we intend to validate), team-consensus (held without a citable source), self-evident (evidence would be circular). Mutually exclusive with grounding.
   */
  ungroundedReason?: 'hypothesis' | 'team-consensus' | 'self-evident';
  /**
   * How this Need entered the document. Closed enum. Immutable for the record's life; adoption does not rewrite entry. ai-proposed requires proposedBy and files at status proposed.
   */
  origin: 'human-asserted' | 'ai-proposed' | 'imported';
  proposedBy?: AuthorActor;
  /**
   * Lifecycle status. Closed enum. proposed: candidate awaiting human judgment. adopted: a commitment (requires adoptedBy). superseded: replaced by a successor carrying supersedes (terminal). withdrawn: rejected or found wrong (terminal; the record remains).
   */
  status: 'proposed' | 'adopted' | 'superseded' | 'withdrawn';
  adoptedBy?: AuthorActor;
  /**
   * Content revision covering statement + grounding (incl. ungroundedReason). Bumps on any content change; MUST NOT bump on status/adoptedBy/title/journey changes. Pinned by need:<id>@<revision> anchors.
   */
  revision: number;
  /**
   * The need.id this record replaces. MUST resolve within this document to a record with status superseded.
   */
  supersedes?: string;
  extensions?: Extensions;
} & Need1;
/**
 * Discriminated union on kind: assertion (normative channel — Rulespec IRI, cite never compile) or observation (empirical channel — product-local research record).
 *
 * This interface was referenced by `NeedsDocument`'s JSON-Schema
 * via the `definition` "Grounding".
 */
export type Grounding = AssertionGrounding | ObservationGrounding;
/**
 * Relationship of the evidence to the Need. motivates: shows the lack exists. constrains: bounds any satisfying solution. authorizes: establishes that meeting the need is permitted or mandated. constrains/authorizes shared with the References rel vocabulary.
 *
 * This interface was referenced by `NeedsDocument`'s JSON-Schema
 * via the `definition` "GroundingRole".
 */
export type GroundingRole = 'motivates' | 'constrains' | 'authorizes';
export type Need1 = {
  [k: string]: unknown;
};

/**
 * A Formspec Needs Document per the Needs specification. An authored artifact recording why software should exist: plain-language Need records grounded in normative evidence (Rulespec assertion IRIs) or empirical evidence (Observation research records), with declared-absence fail-closed, an adoption lifecycle, and supersession-never-erasure. The Needs Document targets no Definition; downstream artifacts cite Needs via needRefs and need: generation anchors. Needs MUST NOT alter core behavioral semantics (required, relevant, readonly, calculate, validation).
 */
export interface NeedsDocument {
  /**
   * Needs specification version. MUST be '1.0'.
   */
  $formspecNeeds: '1.0';
  /**
   * Version of this Needs Document. SemVer is RECOMMENDED.
   */
  version: string;
  /**
   * Canonical URI identifier for this Needs Document. RECOMMENDED when external systems cite its Needs.
   */
  url?: string;
  name?: string;
  title?: string;
  description?: string;
  journeys?: Journey[];
  /**
   * Substantive payload. Each Need is an evidence-grounded plain-language statement of why software should exist, with lifecycle and revision.
   */
  needs: Need[];
  extensions?: Extensions;
  /**
   * This interface was referenced by `NeedsDocument`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * This interface was referenced by `NeedsDocument`'s JSON-Schema
 * via the `definition` "Journey".
 */
export interface Journey {
  /**
   * Stable identifier for this Journey. Unique within journeys[]. Referenced by need.journey.
   */
  id: string;
  title?: string;
  description?: string;
  extensions?: Extensions;
}
/**
 * The Who / What / Why / Done block. Plain language is normative (spec S4.1): readable by a non-technical reader, no spec vocabulary, no solution names. done MUST describe an outcome observable by the person in who.
 *
 * This interface was referenced by `NeedsDocument`'s JSON-Schema
 * via the `definition` "Statement".
 */
export interface Statement {
  /**
   * The kind of person, as they would describe themselves. A population, not a system role.
   */
  who: string;
  /**
   * The need, stated the way that person would say it.
   */
  want: string;
  /**
   * What happens if this is not met — the harm or the loss, concretely.
   */
  why: string;
  /**
   * The outcome the person in who would observe when the need is met. Not a system behavior.
   */
  done: string;
}
/**
 * This interface was referenced by `NeedsDocument`'s JSON-Schema
 * via the `definition` "AssertionGrounding".
 */
export interface AssertionGrounding {
  kind: 'assertion';
  /**
   * IRI of the cited Rulespec assertion or artifact (e.g., urn:rkaf:workspace:<ws>/<localId>). Opaque to Formspec processors; Rulespec owns everything behind it.
   */
  ref: string;
  role?: GroundingRole;
  description?: string;
  extensions?: Extensions;
}
/**
 * This interface was referenced by `NeedsDocument`'s JSON-Schema
 * via the `definition` "ObservationGrounding".
 */
export interface ObservationGrounding {
  kind: 'observation';
  /**
   * How the observation was made. Closed enum.
   */
  method: 'interview' | 'usability-session' | 'analytics' | 'support-signal' | 'field-report';
  /**
   * Source of the observation (research repository entry, analytics query, ticket). Discovery-weight: not required to be content-addressable; promotion to a Rulespec assertion is the escalation.
   */
  uri: string;
  excerpt?: Excerpt;
  /**
   * RFC 3339 date or date-time of the observation itself.
   */
  observedAt?: string;
  observer?: AuthorActor;
  role?: GroundingRole;
  description?: string;
  extensions?: Extensions;
}
/**
 * The quoted moment, Web Annotation TextQuoteSelector-shaped (oa:exact / oa:prefix / oa:suffix) so the quote is re-findable in its source.
 *
 * This interface was referenced by `NeedsDocument`'s JSON-Schema
 * via the `definition` "Excerpt".
 */
export interface Excerpt {
  exact: string;
  prefix?: string;
  suffix?: string;
}
