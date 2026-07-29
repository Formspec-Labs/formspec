import type {
  SignatureMethodRegistry,
  VerificationReceipt,
  Verifier,
} from '@integrity-stack/signature-port';

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface SurfaceBundleSignedPayloadV1 extends JsonObject {
  readonly profile: 'formspec-surface-bundle-signing-v1';
  readonly publisher: {
    readonly id: string;
  };
  readonly release: {
    readonly id: string;
    readonly sequence: number;
  };
  readonly manifest: JsonObject & {
    readonly id: string;
  };
  readonly documents: Readonly<Record<string, JsonObject>>;
}

export interface ParsedSurfaceBundleCandidate {
  readonly payload: SurfaceBundleSignedPayloadV1;
  /** Freshly decoded copy of the detached COSE_Sign1 bytes. */
  readonly signatureBytes: Uint8Array;
}

export interface PublisherAuthority {
  /** Exact COSE protected-header kid bytes. */
  readonly kid: Uint8Array;
  /** Canonical absolute URI that must equal signedPayload.publisher.id. */
  readonly publisherId: string;
  /** Host-configured name. The signed bundle cannot override it. */
  readonly publisherDisplayName: string;
  /** Canonical absolute app IDs authorized for this key. */
  readonly appIds?: readonly string[];
  /** Canonical HTTPS prefixes ending in "/" authorized for this key. */
  readonly appNamespaces?: readonly string[];
  /** Exact protected method_uri values authorized for this key. */
  readonly methods: readonly string[];
  /** Inclusive RFC 3339 lower bound. */
  readonly validFrom: string;
  /** Exclusive RFC 3339 upper bound. */
  readonly validUntil: string;
  readonly revoked: boolean;
}

export interface PublisherTrustPolicy {
  readonly authorities: readonly PublisherAuthority[];
}

export interface PinnedReleasePolicy {
  readonly mode: 'pinned';
  readonly allowed: readonly {
    readonly digest: string;
    readonly releaseId?: string;
  }[];
}

export interface MonotonicReleaseState {
  readonly sequence: number;
  readonly digest: string;
  readonly releaseId: string;
}

export type MonotonicCommitResult =
  | {
      readonly status: 'committed' | 'already-current';
      readonly state: MonotonicReleaseState;
    }
  | {
      readonly status: 'rejected';
      readonly code: 'stale' | 'sequence-conflict';
      readonly current: MonotonicReleaseState;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: string;
    };

/**
 * Durable state for monotonic releases.
 *
 * `commitAdmitted` must perform one atomic read, monotonic comparison, and
 * update for `appId`. It must never implement that operation as a separate
 * final read and write.
 */
export interface MonotonicReleaseStore {
  read(appId: string): Promise<MonotonicReleaseState | null>;
  commitAdmitted(
    appId: string,
    candidate: MonotonicReleaseState,
  ): Promise<MonotonicCommitResult>;
}

export interface MonotonicReleasePolicy {
  readonly mode: 'monotonic';
  readonly store: MonotonicReleaseStore;
}

export type SurfaceBundleReleasePolicy =
  | PinnedReleasePolicy
  | MonotonicReleasePolicy;

export interface SurfaceBundleVerifyInput {
  /** Bytes acquired once from the source. The verifier copies them immediately. */
  readonly candidateBytes: Uint8Array;
  /** Existing integrity-stack verifier, configured with an independent KeyResolver. */
  readonly verifier: Verifier;
  readonly methodRegistry: SignatureMethodRegistry;
  readonly trustPolicy: PublisherTrustPolicy;
  readonly releasePolicy: SurfaceBundleReleasePolicy;
  /** Host clock. Called exactly once. */
  readonly now?: () => Date;
}

export interface TrustPolicyEvidence {
  readonly status: 'authorized';
  readonly kid: string;
  readonly publisherId: string;
  readonly publisherDisplayName: string;
  readonly appId: string;
  readonly methodUri: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly revoked: false;
}

export interface ReleasePolicyEvidence {
  readonly status: 'current';
  readonly mode: 'pinned' | 'monotonic';
  readonly releaseId: string;
  readonly sequence: number;
  readonly digest: string;
  readonly previous?: MonotonicReleaseState | null;
}

export interface SurfaceBundleVerifiedResult {
  readonly status: 'verified';
  readonly payload: SurfaceBundleSignedPayloadV1;
  readonly digest: string;
  readonly checkedAt: string;
  readonly integrityReceipt: VerificationReceipt;
  readonly trust: TrustPolicyEvidence;
  readonly release: ReleasePolicyEvidence;
}

export type SurfaceBundleFailureCode =
  | 'candidate-invalid'
  | 'signature-invalid'
  | 'integrity-failed'
  | 'publisher-unauthorized'
  | 'app-unauthorized'
  | 'method-unauthorized'
  | 'authority-expired'
  | 'authority-not-yet-valid'
  | 'authority-revoked'
  | 'release-not-pinned'
  | 'release-stale'
  | 'release-sequence-conflict';

export interface SurfaceBundleFailedResult {
  readonly status: 'failed';
  readonly code: SurfaceBundleFailureCode;
  readonly reason: string;
  readonly digest?: string;
  readonly checkedAt?: string;
  readonly integrityReceipt?: VerificationReceipt;
}

export type SurfaceBundleUnverifiedCode =
  | 'clock-unavailable'
  | 'integrity-unsupported'
  | 'verifier-unavailable'
  | 'trust-configuration-invalid'
  | 'release-configuration-invalid'
  | 'release-store-unavailable';

export interface SurfaceBundleUnverifiedResult {
  readonly status: 'unverified';
  readonly code: SurfaceBundleUnverifiedCode;
  readonly reason: string;
  readonly digest?: string;
  readonly checkedAt?: string;
  readonly integrityReceipt?: VerificationReceipt;
}

export type SurfaceBundleVerificationResult =
  | SurfaceBundleVerifiedResult
  | SurfaceBundleFailedResult
  | SurfaceBundleUnverifiedResult;

export type HostAdmissionCheckResult =
  | { readonly status: 'passed' }
  | {
      readonly status: 'refused';
      readonly code: string;
      readonly reason: string;
    }
  | {
      readonly status: 'unavailable';
      readonly code: string;
      readonly reason: string;
    };

export interface HostAdmissionContext {
  readonly digest: string;
  readonly checkedAt: string;
  readonly integrityReceipt: VerificationReceipt;
  readonly trust: TrustPolicyEvidence;
  readonly release: ReleasePolicyEvidence;
}

export type HostAdmissionChecks = (
  payload: SurfaceBundleSignedPayloadV1,
  context: HostAdmissionContext,
) => HostAdmissionCheckResult | Promise<HostAdmissionCheckResult>;

export interface SurfaceBundleAdmitInput {
  readonly verification: SurfaceBundleVerifiedResult;
  /**
   * Schema, AppGraph, actor, entry, and dereference checks supplied by the
   * host. They consume the same recursively frozen payload.
   */
  readonly hostChecks: HostAdmissionChecks;
}

export interface SurfaceBundleAdmittedResult {
  readonly status: 'admitted';
  readonly payload: SurfaceBundleSignedPayloadV1;
  readonly verification: SurfaceBundleVerifiedResult;
  readonly releaseCommit: 'not-required' | 'committed' | 'already-current';
}

export interface SurfaceBundleRefusedResult {
  readonly status: 'refused';
  readonly code: string;
  readonly reason: string;
  readonly verification: SurfaceBundleVerifiedResult;
}

export interface SurfaceBundleUnavailableResult {
  readonly status: 'unavailable';
  readonly code: string;
  readonly reason: string;
  readonly verification: SurfaceBundleVerifiedResult;
}

export type SurfaceBundleAdmissionResult =
  | SurfaceBundleAdmittedResult
  | SurfaceBundleRefusedResult
  | SurfaceBundleUnavailableResult;
