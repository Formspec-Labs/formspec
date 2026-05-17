/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * Structured verification result from the crypto-verifier port (ADR-0088). Produced by a Verifier adapter; consumed by WOS admission and Trellis integrity checks.
 */
export interface VerificationReceipt {
  /**
   * Verification outcome. verified: cryptographic check passed. failed: check attempted and rejected. unsupported: adapter cannot evaluate this method.
   */
  result: 'verified' | 'failed' | 'unsupported';
  /**
   * The signature-method URI from the registry that was used for verification.
   */
  method: string;
  /**
   * SemVer of the signature-method registry document at verification time.
   */
  methodRegistryVersion: string;
  adapter: {
    /**
     * URI identifying the adapter that produced this receipt.
     */
    id: string;
    /**
     * SemVer of the adapter at verification time.
     */
    version: string;
  };
  key: {
    /**
     * Key identifier KID, thumbprint, or DID reference to the signing key.
     */
    ref: string;
    /**
     * Optional version of the key material referenced.
     */
    version?: string;
    /**
     * Optional snapshot of the key bytes at verification time.
     */
    snapshot?: string;
  };
  /**
   * RFC 3339 timestamp when verification was performed.
   */
  verifiedAt: string;
  /**
   * Optional verification context including revocation, timestamping, and witness data.
   */
  context?: {
    revocation?: {
      /**
       * Type of revocation check performed.
       */
      kind: 'ocsp' | 'crl' | 'witness';
      /**
       * Hash of the revocation response bytes.
       */
      responseHash: string;
    };
    timestamping?: {
      /**
       * URI of the timestamping authority.
       */
      authority: string;
      /**
       * Hash of the timestamp receipt bytes.
       */
      receiptHash: string;
    };
    witness?: {
      /**
       * Trellis anchor reference for the witness attestation.
       */
      anchor: {
        /**
         * Trellis canonical_event_hash of the witness event.
         */
        eventHash: string;
        /**
         * Trellis ledger scope identifier.
         */
        ledgerScope: string;
      };
    };
  };
  /**
   * OPTIONAL base64-encoded COSE_Sign1 signed receipt. Present when the adapter has a signing key and posture requires receipt signing.
   */
  receiptBytes?: string;
}
