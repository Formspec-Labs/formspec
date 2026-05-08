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

export class VerifierError extends Error {
  constructor(
    message: string,
    public code: 'method_unsupported' | 'verification_failed' | 'invalid_cose' | 'internal'
  ) {
    super(message);
    this.name = 'VerifierError';
  }
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
