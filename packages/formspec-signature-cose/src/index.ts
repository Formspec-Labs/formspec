/** @filedesc Formspec COSE_Sign1 compatibility shim over integrity-stack. */

export type { CoseSign1 } from '@integrity-stack/cose';
export {
  COSE_LABEL_ALG,
  COSE_LABEL_KID,
  COSE_LABEL_METHOD_URI,
  COSE_LABEL_SUITE_ID,
  COSE_SIGN1_TAG,
  CoseError,
  SUITE_ID_PHASE_1,
  decodeCoseSign1,
  decodeCoseSign1WithMethodUri,
  detachedSignatureProtectedHeader as protectedHeaderBytes,
  encodeCoseSign1,
  extractMethodUri,
  resolvePayload,
  sigStructureBytes,
} from '@integrity-stack/cose';

/**
 * Formspec response-signing URI prefix (`urn:formspec:sig-method:`).
 *
 * Mirrors `FORMSPEC_SIG_METHOD_URI_PREFIX` in the Rust signature-cose crate.
 * Method URIs under this prefix identify response-signing methods registered
 * in `formspec/specs/registry/signature-method-registry.md`; distinct from
 * the receipt-signing prefix, cross-domain reuse is forbidden by ADR 0111.
 */
export const FORMSPEC_SIG_METHOD_URI_PREFIX = 'urn:formspec:sig-method:';

/**
 * Formspec receipt-signing URI prefix (`urn:formspec:receipt-method:`).
 *
 * Mirrors `FORMSPEC_RECEIPT_METHOD_URI_PREFIX` in the Rust signature-cose
 * crate. Method URIs under this prefix identify receipt-signing methods
 * registered per ADR 0111. Disjoint from the response-signing subspace;
 * the preimage canonicalization differs (RECEIPT_SIGNED_PAYLOAD_DOMAIN).
 */
export const FORMSPEC_RECEIPT_METHOD_URI_PREFIX = 'urn:formspec:receipt-method:';
