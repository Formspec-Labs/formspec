/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * A Formspec Intake Handoff records the boundary object emitted when a validated intake session is handed to a workflow or case system. It carries the canonical response reference, validation snapshot reference, respondent-ledger head reference, and initiation mode without assigning case lifecycle authority to Formspec. WOS or another workflow host owns governed case identity and the case-created event. For workflowInitiated handoffs, caseRef is the handoff-carried governed-case handle string; the host MAY resolve aliases or mint canonical identifiers for durable records and provenance without mutating the handoff document.
 */
export type IntakeHandoff = {
  [k: string]: unknown;
} & {
  /**
   * Intake Handoff specification version. MUST be '1.0'.
   */
  $formspecIntakeHandoff: '1.0';
  /**
   * Stable identifier for this handoff object. It should be idempotent for the same submitted intake session.
   */
  handoffId: string;
  /**
   * Case initiation topology. 'workflowInitiated' means an existing workflow task or case requested this intake and caseRef is required; binding checks that tie acceptance to this handoff MUST use the same caseRef string as carried in the document (unless a host profile defines explicit equivalence). 'publicIntake' means a respondent began from an open form and no governed caseRef exists on the handoff; governed case identity after acceptance is host-owned outside this document.
   */
  initiationMode: 'workflowInitiated' | 'publicIntake';
  /**
   * Reference to the governed case identity when one already exists, as emitted on the handoff. Required for workflowInitiated handoffs and absent or null for publicIntake handoffs. The host MAY map this value to a canonical governed-case id for storage; adapter finalization that compares the handoff to an accepted attach disposition MUST use this handoff string (or host-defined equivalence), not only a post-resolution canonical id absent from the handoff.
   */
  caseRef?: Ref | null;
  definitionRef: DefinitionRef;
  /**
   * Opaque non-empty reference string owned by the producing system.
   */
  responseRef: string;
  /**
   * Digest of the canonical Response envelope referenced by responseRef, including the current authoredSignatures array when signatures are present. This handoff digest is distinct from authoredSignatures[*].signedPayload.digest, which hashes the signer-assented payload with authoredSignatures omitted.
   */
  responseHash: string;
  /**
   * Opaque non-empty reference string owned by the producing system.
   */
  validationReportRef: string;
  /**
   * Identifier for the intake session that produced the response and ledger evidence.
   */
  intakeSessionId: string;
  /**
   * Optional reference to the actor who submitted or caused the handoff.
   */
  actorRef?: Ref | null;
  /**
   * Optional reference to the person, organization, asset, or matter that the intake concerns.
   */
  subjectRef?: Ref | null;
  /**
   * Opaque non-empty reference string owned by the producing system.
   */
  ledgerHeadRef: string;
  /**
   * RFC 3339 timestamp when the handoff was produced.
   */
  occurredAt: string;
  extensions?: Extensions;
};
/**
 * Opaque non-empty reference string owned by the producing system.
 *
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "Ref".
 */
export type Ref = string;
/**
 * Algorithm-prefixed digest or integrity token, such as 'sha256:...'.
 *
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "HashString".
 */
export type HashString = string;

/**
 * Pinned Formspec Definition identity used to interpret responseRef. This carries the same pinning semantics as Response.definitionUrl plus Response.definitionVersion, but as a nested object.
 */
export interface DefinitionRef {
  /**
   * Canonical Definition URL.
   */
  url: string;
  /**
   * Exact pinned Definition version.
   */
  version: string;
}
/**
 * Implementation-specific extension data. Keys must be namespaced with an 'x-' prefix.
 *
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "Extensions".
 */
export interface Extensions {
  [k: string]: unknown;
}
