// Branded types prevent accidental URI/SemVer/KidOrThumbprint confusion at
// compile time while serializing transparently to/from plain strings.
export type SemVer = string & { readonly __brand: 'SemVer' };
export type Uri = string & { readonly __brand: 'Uri' };
export type KidOrThumbprint = string & { readonly __brand: 'KidOrThumbprint' };

export function semVer(s: string): SemVer { return s as SemVer; }
export function uri(s: string): Uri { return s as Uri; }
export function kidOrThumbprint(s: string): KidOrThumbprint { return s as KidOrThumbprint; }

export type VerificationResult = 'verified' | 'failed' | 'unsupported';

export interface AdapterInfo {
  id: Uri;
  version: SemVer;
}

export interface KeyInfo {
  ref: KidOrThumbprint;
  version?: string;
  snapshot?: string;
}

export interface RevocationContext {
  kind: 'ocsp' | 'crl' | 'witness';
  responseHash: string;
}

export interface TimestampingContext {
  authority: Uri;
  receiptHash: string;
}

export interface WitnessContext {
  anchor: {
    eventHash: string;
    ledgerScope: string;
  };
}

export interface VerificationContext {
  revocation?: RevocationContext;
  timestamping?: TimestampingContext;
  witness?: WitnessContext;
}

export interface VerificationReceipt {
  result: VerificationResult;
  method: Uri;
  methodRegistryVersion: SemVer;
  adapter: AdapterInfo;
  key: KeyInfo;
  verifiedAt: string;
  /**
   * Human-readable diagnostic for non-`verified` verdicts. Always sanitized
   * (length-capped, control chars stripped) — attacker-controlled bytes from
   * COSE decoders / WebCrypto exceptions flow through this field. Never
   * present on `verified` receipts. Adapter-internal errors do NOT use this
   * field; they throw `VerifierError` with code `'internal'` instead.
   */
  reason?: string;
  context?: VerificationContext;
  receiptBytes?: string;
}

export interface VerifyRequest {
  signedBytes: Uint8Array;
  signatureBytes: Uint8Array;
  signatureMethod: Uri;
  keyRef: KidOrThumbprint;
}

export interface RegistryEntry {
  id: Uri;
  suite: string;
  wire: string;
  alg: number | null;
  status: 'registered' | 'deprecated';
  deprecationNotice?: string;
}

export interface SignatureMethodRegistry {
  version: SemVer;
  entries: RegistryEntry[];
}

export type VerifierErrorCode =
  | 'method_unsupported'
  | 'verification_failed'
  | 'invalid_cose'
  | 'internal';

export class VerifierError extends Error {
  constructor(
    message: string,
    public code: VerifierErrorCode,
  ) {
    super(message);
    this.name = 'VerifierError';
  }
}

/**
 * Sanitize an attacker-influenced reason string for inclusion in a
 * `VerificationReceipt.reason` (or `VerifierError.message`). Caps length,
 * collapses whitespace, strips ASCII control chars. Adapters MUST funnel
 * `String(e)` through this before surfacing it to callers.
 */
export function sanitizeReason(input: string, maxLen = 200): string {
  // Replace ASCII control + DEL with single space; collapse runs of whitespace;
  // trim; cap length. Caller-friendly without leaking raw CBOR/exception bytes.
  // eslint-disable-next-line no-control-regex
  const stripped = input.replace(/[\x00-\x1f\x7f]/g, ' ');
  const collapsed = stripped.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxLen
    ? `${collapsed.slice(0, maxLen - 1)}…`
    : collapsed;
}

export interface Verifier {
  verify(request: VerifyRequest, registry: SignatureMethodRegistry): Promise<VerificationReceipt>;
}

export function resolveRegistryEntry(
  registry: SignatureMethodRegistry,
  method: Uri
): RegistryEntry | undefined {
  return registry.entries.find((e) => e.id === method);
}
