import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  detachedSignatureProtectedHeader,
  encodeCoseSign1,
  sigStructureBytes,
} from '@integrity-stack/cose';
import { WebCryptoVerifier } from '@integrity-stack/signature-adapter-webcrypto';
import {
  StaticKeyResolver,
  semVer,
  uri,
  type SignatureMethodRegistry,
} from '@integrity-stack/signature-port';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  admitVerifiedSurfaceBundle,
  buildSurfaceBundlePreimage,
  verifySurfaceBundleCandidate,
  type MonotonicCommitResult,
  type MonotonicReleaseState,
  type MonotonicReleaseStore,
  type PublisherAuthority,
  type SurfaceBundleSignedPayloadV1,
  type SurfaceBundleVerificationResult,
} from '../src/index.js';

const METHOD_ED25519 =
  'urn:formspec:sig-method:ed25519-cose-sign1@1';
const METHOD_UNSUPPORTED =
  'urn:formspec:sig-method:ml-dsa-65-cose-sign1@1';
const NOW = new Date('2026-07-28T16:00:00.000Z');
const APP_ID = 'https://example.gov/apps/intake';
const PUBLISHER_ID = 'https://publisher.example/';
const TRUSTED_KID = new TextEncoder().encode('publisher-key-2026');

const REGISTRY: SignatureMethodRegistry = {
  version: semVer('1.1.0'),
  entries: [
    {
      id: uri(METHOD_ED25519),
      suite: 'Ed25519',
      wire: 'COSE_Sign1 with alg = -8',
      alg: -8,
      status: 'registered',
    },
    {
      id: uri(METHOD_UNSUPPORTED),
      suite: 'ML-DSA-65',
      wire: 'COSE_Sign1',
      alg: null,
      status: 'registered',
    },
  ],
};

interface VectorExpectation {
  readonly id: string;
  readonly expectedStatus: string;
  readonly expectedCode?: string;
}

class AtomicTestStore implements MonotonicReleaseStore {
  state: MonotonicReleaseState | null;
  commitCalls = 0;

  constructor(initial: MonotonicReleaseState | null) {
    this.state = initial;
  }

  async read(): Promise<MonotonicReleaseState | null> {
    return this.state ? { ...this.state } : null;
  }

  async commitAdmitted(
    _appId: string,
    candidate: MonotonicReleaseState,
  ): Promise<MonotonicCommitResult> {
    this.commitCalls += 1;
    const current = this.state;
    if (current && candidate.sequence < current.sequence) {
      return { status: 'rejected', code: 'stale', current: { ...current } };
    }
    if (
      current
      && candidate.sequence === current.sequence
      && candidate.digest !== current.digest
    ) {
      return {
        status: 'rejected',
        code: 'sequence-conflict',
        current: { ...current },
      };
    }
    if (
      current
      && candidate.sequence === current.sequence
      && candidate.digest === current.digest
    ) {
      return { status: 'already-current', state: { ...current } };
    }
    this.state = { ...candidate };
    return { status: 'committed', state: { ...candidate } };
  }
}

let trustedKeyPair: CryptoKeyPair;
let trustedPublicKey: Uint8Array;
let trustedVerifier: WebCryptoVerifier;

beforeAll(async () => {
  trustedKeyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;
  trustedPublicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', trustedKeyPair.publicKey),
  );
  trustedVerifier = new WebCryptoVerifier({
    keyResolver: new StaticKeyResolver([
      [TRUSTED_KID, trustedPublicKey],
    ]),
    methodUriPrefix: 'urn:formspec:sig-method:',
  });
});

describe('actual COSE and WebCrypto adversarial conformance', () => {
  it('matches every committed adversarial vector outcome', async () => {
    const expectations = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, 'fixtures/adversarial-vectors.json'),
        'utf8',
      ),
    ) as VectorExpectation[];
    const observed = new Map<string, SurfaceBundleVerificationResult>();

    const currentStore = new AtomicTestStore(null);
    const validPayload = payload();
    const validBytes = await signCandidate(validPayload);
    observed.set(
      'valid-authorized-current',
      await verify(validBytes, {
        store: currentStore,
      }),
    );

    const mutated = JSON.parse(
      new TextDecoder().decode(validBytes),
    ) as CandidateJson;
    mutated.signedPayload.release.id = '2026-07-28.2';
    observed.set(
      'one-byte-mutation',
      await verify(encodeCandidate(mutated)),
    );

    observed.set(
      'wrong-domain',
      await verify(
        await signCandidate(validPayload, {
          preimage: replaceDomain(buildSurfaceBundlePreimage(validPayload)),
        }),
      ),
    );

    observed.set(
      'unsupported-method',
      await verify(
        await signCandidate(validPayload, {
          methodUri: METHOD_UNSUPPORTED,
        }),
      ),
    );

    const attackerKid = new TextEncoder().encode('attacker-key');
    const attackerKeyPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify'],
    ) as CryptoKeyPair;
    observed.set(
      'unknown-key',
      await verify(
        await signCandidate(validPayload, {
          kid: attackerKid,
          privateKey: attackerKeyPair.privateKey,
        }),
      ),
    );

    const forgedWithSidecar = JSON.parse(
      new TextDecoder().decode(
        await signCandidate(validPayload, {
          kid: attackerKid,
          privateKey: attackerKeyPair.privateKey,
        }),
      ),
    ) as CandidateJson & { publicKey?: string };
    forgedWithSidecar.publicKey = encodeBase64Url(
      new Uint8Array(
        await crypto.subtle.exportKey('raw', attackerKeyPair.publicKey),
      ),
    );
    observed.set(
      'forged-with-replacement-sidecar-key',
      await verify(encodeCandidate(forgedWithSidecar)),
    );

    const signerMetadata = JSON.parse(
      new TextDecoder().decode(validBytes),
    ) as CandidateJson & { signerName?: string };
    signerMetadata.signerName = 'Replacement signer';
    observed.set(
      'altered-signer-metadata',
      await verify(encodeCandidate(signerMetadata)),
    );

    observed.set(
      'wrong-publisher',
      await verify(
        await signCandidate(payload({ publisherId: 'https://attacker.example/' })),
      ),
    );

    observed.set(
      'wrong-app',
      await verify(
        await signCandidate(payload({ appId: 'https://example.gov/apps/operator' })),
      ),
    );

    observed.set(
      'expired-authority',
      await verify(validBytes, {
        authority: authority({
          validUntil: '2026-07-28T16:00:00.000Z',
        }),
      }),
    );

    observed.set(
      'revoked-key',
      await verify(validBytes, {
        authority: authority({ revoked: true }),
      }),
    );

    const conflictingMethod = JSON.parse(
      new TextDecoder().decode(validBytes),
    ) as CandidateJson;
    conflictingMethod.signature = {
      ...conflictingMethod.signature,
      methodUri: 'urn:formspec:sig-method:ecdsa-p256-cose-sign1@1',
    } as CandidateJson['signature'];
    observed.set(
      'conflicting-json-protected-method',
      await verify(encodeCandidate(conflictingMethod)),
    );

    const rawKeyBypass = JSON.parse(
      new TextDecoder().decode(validBytes),
    ) as CandidateJson;
    rawKeyBypass.signature = {
      ...rawKeyBypass.signature,
      rawPublicKey: encodeBase64Url(trustedPublicKey),
    } as CandidateJson['signature'];
    observed.set(
      'raw-public-key-bypass',
      await verify(encodeCandidate(rawKeyBypass)),
    );

    const oldStore = new AtomicTestStore({
      sequence: 42,
      digest: 'a'.repeat(64),
      releaseId: '2026-07-28.1',
    });
    observed.set(
      'old-but-valid-release',
      await verify(
        await signCandidate(payload({ sequence: 41 })),
        { store: oldStore },
      ),
    );

    const conflictStore = new AtomicTestStore({
      sequence: 42,
      digest: 'b'.repeat(64),
      releaseId: '2026-07-28.0',
    });
    observed.set(
      'same-sequence-different-bytes',
      await verify(validBytes, { store: conflictStore }),
    );

    expect([...observed.keys()].sort()).toEqual(
      expectations.map((vector) => vector.id).sort(),
    );
    for (const vector of expectations) {
      const result = observed.get(vector.id);
      expect(result, vector.id).toBeDefined();
      expect(result?.status, vector.id).toBe(vector.expectedStatus);
      if (vector.expectedCode) {
        expect(
          result && 'code' in result ? result.code : undefined,
          vector.id,
        ).toBe(vector.expectedCode);
      }
    }
  });
});

describe('verified versus admitted and atomic release state', () => {
  it('does not advance monotonic state until every host check passes', async () => {
    const store = new AtomicTestStore({
      sequence: 41,
      digest: 'a'.repeat(64),
      releaseId: '2026-07-27.9',
    });
    const verification = await verify(
      await signCandidate(payload()),
      { store },
    );
    expect(verification.status).toBe('verified');
    expect(store.state?.sequence).toBe(41);
    expect(store.commitCalls).toBe(0);
    if (verification.status !== 'verified') {
      return;
    }

    const refused = await admitVerifiedSurfaceBundle({
      verification,
      hostChecks: () => ({
        status: 'refused',
        code: 'APP-GRAPH-INVALID',
        reason: 'graph validation failed',
      }),
    });
    expect(refused.status).toBe('refused');
    expect(store.state?.sequence).toBe(41);
    expect(store.commitCalls).toBe(0);

    const admitted = await admitVerifiedSurfaceBundle({
      verification,
      hostChecks: (frozenPayload) => {
        expect(Object.isFrozen(frozenPayload)).toBe(true);
        expect(Object.isFrozen(frozenPayload.manifest)).toBe(true);
        return { status: 'passed' };
      },
    });
    expect(admitted.status).toBe('admitted');
    expect(store.state).toEqual({
      sequence: 42,
      digest: verification.digest,
      releaseId: '2026-07-28.1',
    });
    expect(store.commitCalls).toBe(1);
  });

  it('re-evaluates a concurrent high-water change in the atomic commit', async () => {
    const store = new AtomicTestStore({
      sequence: 41,
      digest: 'a'.repeat(64),
      releaseId: '2026-07-27.9',
    });
    const verification = await verify(
      await signCandidate(payload()),
      { store },
    );
    expect(verification.status).toBe('verified');
    if (verification.status !== 'verified') {
      return;
    }

    const admission = await admitVerifiedSurfaceBundle({
      verification,
      hostChecks: () => {
        store.state = {
          sequence: 43,
          digest: 'c'.repeat(64),
          releaseId: '2026-07-29.1',
        };
        return { status: 'passed' };
      },
    });

    expect(admission).toMatchObject({
      status: 'refused',
      code: 'release-stale-after-verification',
    });
    expect(store.state?.sequence).toBe(43);
  });

  it('snapshots policy before await and cannot be switched to pinned after verify', async () => {
    const originalStore = new AtomicTestStore({
      sequence: 41,
      digest: 'a'.repeat(64),
      releaseId: '2026-07-27.9',
    });
    const bypassStore = new AtomicTestStore(null);
    const mutableAuthority = authority() as PublisherAuthority & {
      publisherId: string;
    };
    const mutableTrust = {
      authorities: [mutableAuthority],
    };
    const mutableReleasePolicy: {
      mode: 'monotonic' | 'pinned';
      store?: AtomicTestStore;
      allowed?: { digest: string }[];
    } = {
      mode: 'monotonic',
      store: originalStore,
    };

    const verificationPromise = verifySurfaceBundleCandidate({
      candidateBytes: await signCandidate(payload()),
      verifier: trustedVerifier,
      methodRegistry: REGISTRY,
      trustPolicy: mutableTrust,
      releasePolicy: mutableReleasePolicy as {
        mode: 'monotonic';
        store: AtomicTestStore;
      },
      now: () => NOW,
    });

    // These mutations happen while SHA-256 and integrity verification are
    // awaiting. They must not change the captured trust facts, mode, or store.
    mutableAuthority.publisherId = 'https://attacker.example/';
    mutableReleasePolicy.mode = 'pinned';
    mutableReleasePolicy.allowed = [];
    mutableReleasePolicy.store = bypassStore;

    const verification = await verificationPromise;
    expect(verification.status).toBe('verified');
    if (verification.status !== 'verified') {
      return;
    }
    const admission = await admitVerifiedSurfaceBundle({
      verification,
      hostChecks: () => ({ status: 'passed' }),
    });
    expect(admission.status).toBe('admitted');
    expect(originalStore.commitCalls).toBe(1);
    expect(originalStore.state?.sequence).toBe(42);
    expect(bypassStore.commitCalls).toBe(0);
  });

  it('uses a digest pin without touching monotonic state', async () => {
    const signedBytes = await signCandidate(payload());
    const preimage = buildSurfaceBundlePreimage(payload());
    const digest = await sha256Hex(preimage);
    const verification = await verifySurfaceBundleCandidate({
      candidateBytes: signedBytes,
      verifier: trustedVerifier,
      methodRegistry: REGISTRY,
      trustPolicy: { authorities: [authority()] },
      releasePolicy: {
        mode: 'pinned',
        allowed: [{ digest, releaseId: '2026-07-28.1' }],
      },
      now: () => NOW,
    });
    expect(verification.status).toBe('verified');
    if (verification.status !== 'verified') {
      return;
    }
    const admission = await admitVerifiedSurfaceBundle({
      verification,
      hostChecks: () => ({ status: 'passed' }),
    });
    expect(admission).toMatchObject({
      status: 'admitted',
      releaseCommit: 'not-required',
    });
  });
});

interface CandidateJson {
  signedPayload: {
    profile: string;
    publisher: { id: string };
    release: { id: string; sequence: number };
    manifest: { id: string; [key: string]: unknown };
    documents: Record<string, Record<string, unknown>>;
  };
  signature: {
    format: string;
    value: string;
  };
}

function payload(
  overrides: {
    publisherId?: string;
    appId?: string;
    sequence?: number;
    releaseId?: string;
  } = {},
): SurfaceBundleSignedPayloadV1 {
  return {
    profile: 'formspec-surface-bundle-signing-v1',
    publisher: {
      id: overrides.publisherId ?? PUBLISHER_ID,
    },
    release: {
      id: overrides.releaseId ?? '2026-07-28.1',
      sequence: overrides.sequence ?? 42,
    },
    manifest: {
      id: overrides.appId ?? APP_ID,
      $formspecApp: '2.4',
      surfaces: [],
    },
    documents: {},
  };
}

function authority(
  overrides: Partial<PublisherAuthority> = {},
): PublisherAuthority {
  return {
    kid: TRUSTED_KID,
    publisherId: PUBLISHER_ID,
    publisherDisplayName: 'Example Benefits Publisher',
    appIds: [APP_ID],
    methods: [METHOD_ED25519, METHOD_UNSUPPORTED],
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
    revoked: false,
    ...overrides,
  };
}

async function verify(
  candidateBytes: Uint8Array,
  options: {
    store?: AtomicTestStore;
    authority?: PublisherAuthority;
  } = {},
): Promise<SurfaceBundleVerificationResult> {
  return verifySurfaceBundleCandidate({
    candidateBytes,
    verifier: trustedVerifier,
    methodRegistry: REGISTRY,
    trustPolicy: {
      authorities: [options.authority ?? authority()],
    },
    releasePolicy: {
      mode: 'monotonic',
      store: options.store ?? new AtomicTestStore(null),
    },
    now: () => NOW,
  });
}

async function signCandidate(
  signedPayload: SurfaceBundleSignedPayloadV1,
  options: {
    kid?: Uint8Array;
    methodUri?: string;
    privateKey?: CryptoKey;
    preimage?: Uint8Array;
  } = {},
): Promise<Uint8Array> {
  const kid = options.kid ?? TRUSTED_KID;
  const methodUri = options.methodUri ?? METHOD_ED25519;
  const protectedHeader = detachedSignatureProtectedHeader(
    -8,
    kid,
    methodUri,
  );
  const preimage = options.preimage ?? buildSurfaceBundlePreimage(signedPayload);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'Ed25519' },
      options.privateKey ?? trustedKeyPair.privateKey,
      sigStructureBytes(protectedHeader, preimage) as BufferSource,
    ),
  );
  return encodeCandidate({
    signedPayload: structuredClone(signedPayload),
    signature: {
      format: 'COSE_Sign1',
      value: encodeBase64Url(
        encodeCoseSign1(protectedHeader, null, signature),
      ),
    },
  });
}

function encodeCandidate(candidate: object): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(candidate));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
}

function replaceDomain(preimage: Uint8Array): Uint8Array {
  const replaced = new Uint8Array(preimage);
  replaced[0] = 'x'.charCodeAt(0);
  return replaced;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
