/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { ValidationResult as FormspecValidationResult } from './validation-result.js';
export type { FormspecValidationResult };
/**
 * A Formspec Response document — a completed or in-progress Instance pinned to a specific Definition version (§2.1.6). A Response is the canonical record of captured form data: the filled-in form. It references exactly one Definition by the immutable tuple (definitionUrl, definitionVersion). A conformant processor MUST reject a Response whose definitionVersion does not match any known Definition at the given definitionUrl. Responses are always validated against their pinned Definition version, even if a newer version exists (Response Pinning Rule VP-01). The tuple (definitionUrl, definitionVersion) identifies the Definition pin this Response is bound to (Response Pinning Rule VP-01); the Response record itself is identified by its 'id' when present, and byte identity of any signed-payload commitment is carried by the relevant signedPayload.digest, not by the Definition pin. A Response MAY also carry authored signature evidence records that bind one or more signer/document acts to the canonical response envelope.
 */
export interface FormResponse {
  /**
   * Response specification version. MUST be '1.0'.
   */
  $formspecResponse: '1.0';
  /**
   * The canonical URL of the Definition this Response was created against. This is the stable logical-form identifier shared across all versions of the same form. Combined with definitionVersion to form the immutable identity reference. MUST match the 'url' property of a known Definition.
   */
  definitionUrl: string;
  /**
   * The exact version of the Definition against which this Response was created. Interpretation of the version string is governed by the Definition's versionAlgorithm (default: semver). A Response is always validated against this specific version, never against a newer version — even if one exists (Pinning Rule VP-01). Once set, this value MUST NOT change for the lifetime of the Response.
   */
  definitionVersion: string;
  /**
   * The current lifecycle status of this Response. 'in-progress': actively being edited, MAY contain validation errors. 'completed': all error-severity validation results resolved, form submitted — a Response with one or more error-severity results MUST NOT be marked completed. 'amended': previously completed, reopened for modification. 'stopped': abandoned before completion, data preserved for audit. Saving data MUST never be blocked by validation status (VE-05) — only the transition to 'completed' requires zero error-level results.
   */
  status: 'in-progress' | 'completed' | 'amended' | 'stopped';
  /**
   * The primary Instance — the form data. Structure mirrors the Definition's item tree: field Items produce scalar properties, non-repeatable group Items produce nested objects, repeatable group Items produce arrays of objects, display Items have no representation. Non-relevant fields are handled per the Definition's nonRelevantBehavior setting: 'remove' (default) omits them entirely, 'empty' retains the key with null value, 'keep' retains the last value. Calculated fields (those with a 'calculate' Bind) are included with their computed values.
   */
  data: {
    [k: string]: unknown;
  };
  /**
   * When the Response was last modified (ISO 8601 date-time with timezone). Updated on every save, not just on status transitions. Used for conflict detection, audit trails, and ordering Responses chronologically.
   */
  authored: string;
  /**
   * A globally unique identifier for this Response (e.g., UUID v4). While optional in the schema, implementations SHOULD generate an id for every Response to support cross-system correlation, audit trails, amendment chains, and deduplication. When authoredSignatures are present, id becomes REQUIRED so each authored signature can bind through signedPayload.responseId.
   */
  id?: string;
  /**
   * Identifier and display name of the person or system that authored the Response. For human authors, 'id' is typically a user account identifier; for automated systems, 'id' identifies the service or integration.
   */
  author?: {
    /**
     * Unique identifier of the author within the host system.
     */
    id: string;
    /**
     * Display name of the author. For human authors, typically their full name.
     */
    name?: string;
  };
  /**
   * The entity this Response is about — the grant, patient, project, or other domain object the form data describes. Distinct from 'author' (who filled in the form).
   */
  subject?: {
    /**
     * Unique identifier of the subject entity within the host system.
     */
    id: string;
    /**
     * The type of the subject entity. Implementations SHOULD use consistent type labels within a system.
     */
    type?: string;
  };
  /**
   * The most recent set of ValidationResult entries for this Response. Includes results from all sources: bind constraints, validation shapes, required checks, type checks, and external validation. Only error-severity results block the transition to 'completed' status. Warning and info results are advisory. Non-relevant fields MUST NOT produce results. When persisted alongside the Response, this array represents a snapshot — it may be stale if the data has changed since the last validation run.
   */
  validationResults?: FormspecValidationResult[];
  /**
   * Canonical authored-signature evidence records attached to this Response. Each entry binds one signer/document act to the Formspec Signed Response Payload through signedPayload.digest. These records are distinct from respondent-ledger attestations: they are authored evidence produced at signing time, not later audit-history observations.
   *
   * @minItems 1
   */
  authoredSignatures?: [AuthoredSignature, ...AuthoredSignature[]];
  /**
   * Implementor-specific extension data. All keys MUST be prefixed with 'x-'. Processors MUST ignore unrecognized extensions and MUST preserve them during round-tripping. Extensions MUST NOT alter core semantics (validation, calculation, relevance, required state).
   */
  extensions?: {};
}
/**
 * Canonical authored-signature evidence attached to a Response. Each record binds one signer/document act to the Formspec Signed Response Payload through signedPayload.digest. The signature value may be a drawn-image reference, a typed-signature token, a detached cryptographic signature blob, or a provider-managed ceremony reference, but a signature value alone is not sufficient signing intent.
 *
 * This interface was referenced by `FormResponse`'s JSON-Schema
 * via the `definition` "AuthoredSignature".
 */
export interface AuthoredSignature {
  /**
   * Stable identifier for this authored signature record within the Response.
   */
  signatureId: string;
  /**
   * Identifier of the document or signing surface this authored signature affirms.
   */
  documentId: string;
  /**
   * URI identifying the signing intent or certification profile the signer accepted. MUST equal signedPayload.signingIntent. Both are required — the top-level field enables quick lookup without payload inspection; the signed-payload copy is part of what the signer assented to.
   */
  signingIntent: string;
  /**
   * Base64-encoded COSE_Sign1 byte string (RFC 9052). Detached payload; canonical signed bytes live in signedPayload.digest. The signatureMethod URI selects the cryptographic suite from the Formspec signature-method registry.
   */
  signatureValue: string;
  /**
   * URI identifying the cryptographic signature method from the Formspec signature-method registry. Selects the adapter and algorithm for primitive verification.
   */
  signatureMethod: string;
  /**
   * Stable signer identifier when the signing ceremony supplies one.
   */
  signerId?: string;
  /**
   * Human-readable signer name shown during the signing ceremony.
   */
  signerName: string;
  /**
   * UX evidence record — drawn artifacts, typed tokens, provider-managed ceremony references. NOT cryptographic verification input.
   */
  signerEvidence?: {
    /**
     * The kind of UX evidence this is.
     */
    kind: 'drawn' | 'typed' | 'provider-receipt';
    /**
     * Opaque evidence value — data URL for drawn, token for typed, reference for provider-receipt.
     */
    value: string;
  };
  /**
   * Optional base64-encoded COSE_Sign1 VerificationReceipt. Present when a verifier has produced a signed receipt for this signature.
   */
  verificationReceipt?: string;
  /**
   * Whether the signer explicitly accepted the declared consent text as part of the signing act.
   */
  consentAccepted: boolean;
  /**
   * URI reference to the consent text the signer accepted. This keeps signing intent bound to declared text rather than to the signature image alone.
   */
  consentTextRef: string;
  /**
   * Version of the consent text accepted by the signer.
   */
  consentVersion: string;
  /**
   * Affirmation text shown to and accepted by the signer at authoring time.
   */
  affirmationText: string;
  signedPayload: AuthoredSignatureSignedPayload;
  /**
   * Digest of the document bytes, rendered view, certification page, or signing surface shown to the signer. This is not the normative response-byte assent binding; signedPayload.digest carries that commitment.
   */
  documentHash: string;
  /**
   * Digest algorithm used to compute documentHash.
   */
  documentHashAlgorithm: string;
  /**
   * URI reference to the identity-proofing artifact or proof bundle associated with this signing act, when one exists.
   */
  identityProofRef?: string;
  identityBinding?: AuthoredSignatureIdentityBinding;
  /**
   * Provider or adapter that supplied the signing ceremony evidence.
   */
  signatureProvider: string;
  /**
   * Identifier for the signing ceremony or provider session that produced this authored signature evidence.
   */
  ceremonyId: string;
}
/**
 * Digest commitment for the Formspec Signed Response Payload. The payload is the canonical Response envelope with authoredSignatures omitted, so the digest remains stable when later co-signatures are appended.
 *
 * This interface was referenced by `FormResponse`'s JSON-Schema
 * via the `definition` "AuthoredSignatureSignedPayload".
 */
export interface AuthoredSignatureSignedPayload {
  /**
   * Canonicalization profile used to produce the signed-payload bytes.
   */
  canonicalization: 'formspec-response-signing-v1';
  /**
   * Digest algorithm used to hash the canonical signed payload.
   */
  digestAlgorithm: string;
  /**
   * Digest of the Formspec Signed Response Payload: the canonical Response envelope with authoredSignatures omitted.
   */
  digest: string;
  /**
   * Identifier of the Response whose signed payload was hashed. It MUST equal the top-level Response id.
   */
  responseId: string;
  /**
   * RFC 3339 timestamp when the signer completed the authored signing act. Part of the signed payload — a verifier MUST reject if this differs from the source-of-truth.
   */
  signedAt: string;
  /**
   * URI identifying the signing intent or certification profile the signer accepted. Part of the signed payload.
   */
  signingIntent: string;
  /**
   * Definition URL pin included in the signed payload. It MUST equal the top-level Response definitionUrl.
   */
  definitionUrl: string;
  /**
   * Definition version pin included in the signed payload. It MUST equal the top-level Response definitionVersion.
   */
  definitionVersion: string;
}
/**
 * Provider-neutral identity-binding evidence attached to an authored signature. This records how the signer identity was bound to the signing act without baking one provider or ceremony vendor into the Response contract.
 *
 * This interface was referenced by `FormResponse`'s JSON-Schema
 * via the `definition` "AuthoredSignatureIdentityBinding".
 */
export interface AuthoredSignatureIdentityBinding {
  /**
   * Authentication method used to bind the signer identity to the authored signing act.
   */
  method: string;
  /**
   * Assurance strength reached by the identity-binding evidence.
   */
  assuranceLevel: 'none' | 'low' | 'standard' | 'high' | 'very-high';
  /**
   * URI reference to the identity or signature provider used for this identity binding, when one exists.
   */
  providerRef?: string;
  /**
   * URI reference to an external identity attestation that supports this signature evidence, when one exists.
   */
  externalAttestationRef?: string;
}
