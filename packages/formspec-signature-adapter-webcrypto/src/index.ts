/** @filedesc WebCrypto adapter implementing the Verifier interface for Ed25519 COSE_Sign1 verification. */
import {
  FORMSPEC_SIG_METHOD_URI_PREFIX,
  decodeCoseSign1WithMethodUri,
  resolvePayload,
  sigStructureBytes,
  type CoseSign1,
} from '@formspec/signature-cose';
import {
  Verifier,
  VerificationReceipt,
  VerifierError,
  VerifyRequest,
  SignatureMethodRegistry,
  StaticKeyResolver,
  KeyResolver,
  KeyResolverError,
  KeyRef,
  resolveRegistryEntry,
  sanitizeReason,
  type VerificationResult,
  type AdapterInfo,
  type KidOrThumbprint,
  semVer,
  uri,
  kidOrThumbprint,
} from '@formspec/signature-port';

const ADAPTER_ID = 'urn:formspec:adapter:webcrypto@1';
const ADAPTER_VERSION = '0.1.0';

/**
 * Outcome of a per-alg verify routine. The adapter pipeline distinguishes
 * three caller-relevant failure modes that previously collapsed into a single
 * `'failed'` verdict (see fs-no9r):
 *
 *  - `'verified'` / `'failed'` — legitimate cryptographic verdicts. The signature
 *    was decoded, the key was imported, and `subtle.verify` returned a boolean.
 *  - `'unsupported'` — the request was syntactically well-formed but the adapter
 *    cannot reach a verdict (e.g., COSE_Sign1 envelope is malformed, alg
 *    mismatch). Includes a sanitized `reason` for diagnostics.
 *
 * Adapter-internal errors (e.g., `crypto.subtle.importKey` throwing) are NOT
 * represented here — those bubble out as thrown `VerifierError` with code
 * `'internal'`, so a caller can distinguish "signature is forged" from "adapter
 * crashed processing this input".
 */
type AlgOutcome =
  | { kind: 'verdict'; result: VerificationResult }
  | { kind: 'unsupported'; reason: string };

export interface WebCryptoVerifierOptions {
  /**
   * Resolves `KeyRef.kid` to public-key bytes. Defaults to an empty
   * {@link StaticKeyResolver} — any `KeyRef.kid` request fails with
   * `key_not_found`. Wire a real resolver here when the verifier is meant
   * to look keys up by identifier.
   */
  keyResolver?: KeyResolver;
}

export class WebCryptoVerifier implements Verifier {
  private adapterInfo: AdapterInfo;
  private keyResolver: KeyResolver;

  constructor(options: WebCryptoVerifierOptions = {}) {
    this.adapterInfo = { id: uri(ADAPTER_ID), version: semVer(ADAPTER_VERSION) };
    this.keyResolver = options.keyResolver ?? new StaticKeyResolver();
  }

  async verify(
    request: VerifyRequest,
    registry: SignatureMethodRegistry,
  ): Promise<VerificationReceipt> {
    const entry = resolveRegistryEntry(registry, request.signatureMethod);
    if (!entry) {
      return this.unsupportedReceipt(
        registry,
        request,
        `method not in registry: ${request.signatureMethod}`,
      );
    }

    if (entry.status === 'deprecated') {
      return this.unsupportedReceipt(
        registry,
        request,
        `method deprecated: ${request.signatureMethod}`,
      );
    }

    // Resolve key material from the typed KeyRef. `kid` routes through the
    // resolver; `rawPublicKey` short-circuits (caller has already committed).
    // Resolver `KeyNotFound` / `Internal` bubble out as VerifierError —
    // fs-no9r contract: adapter-internal failures never collapse to 'failed'.
    let keyBytes: Uint8Array;
    try {
      keyBytes = await resolveKeyBytes(request.keyRef, this.keyResolver);
    } catch (e) {
      if (e instanceof KeyResolverError) {
        throw new VerifierError(
          `key resolver: ${sanitizeReason(e.message)}`,
          'internal',
        );
      }
      throw e;
    }

    // Per-alg dispatch. Internal errors (importKey crash, subtle.verify
    // throwing on malformed key) bubble out as VerifierError — the caller MUST
    // see "adapter crashed" as distinct from "signature failed verification".
    const outcome = await this.dispatchAlg(request, entry.alg, keyBytes);

    if (outcome.kind === 'unsupported') {
      return this.unsupportedReceipt(registry, request, outcome.reason);
    }

    const receipt: VerificationReceipt = {
      result: outcome.result,
      method: request.signatureMethod,
      methodRegistryVersion: registry.version,
      adapter: this.adapterInfo,
      key: { ref: keyRefDisplay(request.keyRef) },
      verifiedAt: new Date().toISOString(),
    };

    // Receipt signing is gated on FORMSPEC-SIGN-VERIFY-001; when implemented,
    // it will arrive as a typed ReceiptSigner port (PR-SIG-002), not a
    // private-key field on this adapter.
    return receipt;
  }

  private async dispatchAlg(
    request: VerifyRequest,
    alg: number | null,
    keyBytes: Uint8Array,
  ): Promise<AlgOutcome> {
    // COSE algorithm identifiers from IANA
    // -8 = EdDSA (Ed25519)
    // -7 = ES256 (ECDSA P-256)
    // -37 = PS256 (RSA-PSS SHA-256)
    if (alg === null) {
      return { kind: 'unsupported', reason: 'alg = null (PQC placeholder)' };
    }
    // Per-algorithm key-length validation. Wrong-length keys never reach
    // subtle.importKey or subtle.verify — closes the
    // per-algorithm-length-validation gap from fs-0gzb.
    const lengthError = validateKeyLengthForAlg(alg, keyBytes);
    if (lengthError) {
      return { kind: 'unsupported', reason: lengthError };
    }
    switch (alg) {
      case -8:
        return this.verifyEd25519(request, keyBytes);
      case -7:
        return this.verifyEcdsaP256(request, keyBytes);
      case -37:
        return this.verifyRsaPssSha256(request, keyBytes);
      default:
        return { kind: 'unsupported', reason: `unrecognized alg: ${alg}` };
    }
  }

  private async verifyEd25519(
    request: VerifyRequest,
    keyBytes: Uint8Array,
  ): Promise<AlgOutcome> {
    // Ed25519 via Web Crypto — available in Chrome 117+, Safari 17+, Firefox 130+, Node 18+
    // Three distinct failure modes routed to three distinct caller signals:
    //   importKey throws        -> VerifierError('internal')    [thrown]
    //   decodeCoseSign1 throws  -> unsupported with reason       [returned]
    //   subtle.verify -> false  -> 'failed' verdict              [returned]
    const key = await importPublicKey(
      keyBytes,
      { name: 'Ed25519' },
      'Ed25519',
    );

    const cose = decodeCoseEnvelope(request.signatureBytes);
    if (cose.kind === 'unsupported') {
      return cose;
    }
    if (cose.value.alg !== -8) {
      return { kind: 'unsupported', reason: `cose alg mismatch: expected -8, got ${cose.value.alg}` };
    }
    const methodMismatch = assertMethodUriBinding(request.signatureMethod, cose.value.methodUri);
    if (methodMismatch) {
      return methodMismatch;
    }
    const kidMismatch = assertKidBinding(request.keyRef, cose.value.kid);
    if (kidMismatch) {
      return kidMismatch;
    }

    return verdictFromSubtle(async () => {
      const payload = resolvePayload(cose.value, request.signedBytes);
      const sigStructure = sigStructureBytes(cose.value.protectedHeaderBytes, payload);
      return crypto.subtle.verify(
        { name: 'Ed25519' },
        key,
        cose.value.signature as BufferSource,
        sigStructure as BufferSource,
      );
    }, 'Ed25519');
  }

  private async verifyEcdsaP256(
    request: VerifyRequest,
    keyBytes: Uint8Array,
  ): Promise<AlgOutcome> {
    // ECDSA P-256 via WebCrypto. Key import path: raw SEC1 uncompressed (65 bytes,
    // 0x04 || X || Y) matches the ring adapter's public_key fixture. Signature
    // wire format: IEEE-P1363 r||s (64 bytes) — matches ring's ECDSA_P256_SHA256_FIXED
    // output, which is what we extract from the COSE_Sign1 signature slot.
    const key = await importPublicKey(
      keyBytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      'ECDSA-P256',
    );

    const cose = decodeCoseEnvelope(request.signatureBytes);
    if (cose.kind === 'unsupported') {
      return cose;
    }
    if (cose.value.alg !== -7) {
      return { kind: 'unsupported', reason: `cose alg mismatch: expected -7, got ${cose.value.alg}` };
    }
    const methodMismatch = assertMethodUriBinding(request.signatureMethod, cose.value.methodUri);
    if (methodMismatch) {
      return methodMismatch;
    }
    const kidMismatch = assertKidBinding(request.keyRef, cose.value.kid);
    if (kidMismatch) {
      return kidMismatch;
    }

    return verdictFromSubtle(async () => {
      const payload = resolvePayload(cose.value, request.signedBytes);
      const sigStructure = sigStructureBytes(cose.value.protectedHeaderBytes, payload);
      return crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        cose.value.signature as BufferSource,
        sigStructure as BufferSource,
      );
    }, 'ECDSA-P256');
  }

  private async verifyRsaPssSha256(
    request: VerifyRequest,
    keyBytes: Uint8Array,
  ): Promise<AlgOutcome> {
    // RSA-PSS SHA-256 via WebCrypto.
    //
    // Wire-format parity with the ring adapter:
    //   - keyBytes carry PKCS#1 RSAPublicKey — the bare `SEQUENCE { n, e }`
    //     ring's `key_pair.public_key().as_ref()` returns. This matches the
    //     committed `rsa-pss-sha256.json` fixture so the same vector verifies
    //     cross-runtime.
    //   - WebCrypto's importKey('spki', ...) needs the SubjectPublicKeyInfo
    //     wrapper instead; we wrap PKCS#1 -> SPKI here so callers don't have
    //     to.
    //   - Signature wire is the raw RSA-PSS signature (modulus-length bstr)
    //     inside the COSE_Sign1 envelope, salt = hash length = 32 bytes (PS256
    //     default).
    const spki = wrapPkcs1RsaPublicKeyInSpki(keyBytes);
    let key: CryptoKey;
    try {
      key = await crypto.subtle.importKey(
        'spki',
        spki as BufferSource,
        { name: 'RSA-PSS', hash: 'SHA-256' },
        false,
        ['verify'],
      );
    } catch (e) {
      throw new VerifierError(
        `RSA-PSS-SHA256 key import failed: ${sanitizeReason(String(e))}`,
        'internal',
      );
    }

    const cose = decodeCoseEnvelope(request.signatureBytes);
    if (cose.kind === 'unsupported') {
      return cose;
    }
    if (cose.value.alg !== -37) {
      return { kind: 'unsupported', reason: `cose alg mismatch: expected -37, got ${cose.value.alg}` };
    }
    const methodMismatch = assertMethodUriBinding(request.signatureMethod, cose.value.methodUri);
    if (methodMismatch) {
      return methodMismatch;
    }
    const kidMismatch = assertKidBinding(request.keyRef, cose.value.kid);
    if (kidMismatch) {
      return kidMismatch;
    }

    return verdictFromSubtle(async () => {
      const payload = resolvePayload(cose.value, request.signedBytes);
      const sigStructure = sigStructureBytes(cose.value.protectedHeaderBytes, payload);
      return crypto.subtle.verify(
        { name: 'RSA-PSS', saltLength: 32 },
        key,
        cose.value.signature as BufferSource,
        sigStructure as BufferSource,
      );
    }, 'RSA-PSS-SHA256');
  }

  private unsupportedReceipt(
    registry: SignatureMethodRegistry,
    request: VerifyRequest,
    reason: string,
  ): VerificationReceipt {
    return {
      result: 'unsupported',
      method: request.signatureMethod,
      methodRegistryVersion: registry.version,
      adapter: this.adapterInfo,
      key: { ref: keyRefDisplay(request.keyRef) },
      verifiedAt: new Date().toISOString(),
      reason: sanitizeReason(reason),
    };
  }
}

/**
 * Resolves a {@link KeyRef} to raw key bytes. `KeyRef.kid` flows through the
 * resolver; `KeyRef.rawPublicKey` short-circuits to the embedded bytes
 * (caller has already committed to the key, so there is no resolution to do
 * and no kid to bind against the COSE envelope).
 *
 * Resolver errors propagate as-is — the caller (`WebCryptoVerifier.verify`)
 * funnels them through `VerifierError('internal')` so the adapter contract
 * stays "thrown = verdict not reached".
 */
async function resolveKeyBytes(
  keyRef: KeyRef,
  resolver: KeyResolver,
): Promise<Uint8Array> {
  if (keyRef.kind === 'rawPublicKey') {
    return keyRef.publicKey;
  }
  return resolver.resolve(keyRef);
}

/**
 * fs-skj0 kid-binding check. After COSE decode, assert `cose.kid` matches the
 * `keyRef.kid` from the request — closes the kid-swap vector. `rawPublicKey`
 * skips because there is no identifier to bind.
 *
 * Returns `null` on bind success or non-applicability; otherwise returns an
 * `unsupported` outcome that flows into the standard receipt path.
 */
function assertKidBinding(
  keyRef: KeyRef,
  coseKid: Uint8Array | null,
): AlgOutcome | null {
  if (keyRef.kind !== 'kid') {
    return null;
  }
  if (coseKid === null) {
    return {
      kind: 'unsupported',
      reason: 'kid mismatch: cose envelope has no kid but request.keyRef is Kid',
    };
  }
  if (!bytesEqual(keyRef.kid, coseKid)) {
    return {
      kind: 'unsupported',
      reason: 'kid mismatch: cose.kid != request.keyRef',
    };
  }
  return null;
}

/**
 * ADR 0109 / ADR 0111 method-URI binding check. The caller passes
 * `request.signatureMethod` as the dispatch URI (caller-side derivation per
 * P3-T5 — pre-0109 callers read it from JSON `signatureMethod`, post-0109 they
 * derive it from the signed COSE protected header before invoking verify).
 * The adapter independently decodes `method_uri` from the COSE protected
 * header (label `-65540`); the two MUST agree byte-for-byte. Mismatch routes
 * to `unsupported` — distinct from a forged signature ('failed'), which would
 * imply a real cryptographic check ran and rejected the bytes.
 *
 * The prefix-validating decoder upstream already rejects envelopes missing
 * `method_uri` and envelopes whose URI prefix falls outside the response-
 * signing subspace; this assertion closes the remaining gap inside the
 * subspace: two ed25519 entries with different versions or two distinct
 * URIs sharing the same prefix must not be conflated by a caller-supplied
 * dispatch URI that disagrees with the signed bytes.
 */
function assertMethodUriBinding(
  requestMethod: string,
  coseMethodUri: string | null,
): AlgOutcome | null {
  if (coseMethodUri === null) {
    // The prefix-validating decoder upstream rejects this, so reaching here
    // would be a defense-in-depth catch — keep the named reason consistent.
    return {
      kind: 'unsupported',
      reason: 'method_uri missing from COSE protected header',
    };
  }
  if (requestMethod !== coseMethodUri) {
    return {
      kind: 'unsupported',
      reason: `method_uri mismatch: request ${JSON.stringify(requestMethod)} != cose ${JSON.stringify(coseMethodUri)}`,
    };
  }
  return null;
}

/** Constant-time bytewise comparison (length-aware, not timing-safe — used
 * only on attacker-controlled identifier bytes for *equality*, not for any
 * MAC verification). */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Per-algorithm public-key length validation. Wrong-length keys are rejected
 * with an `unsupported` verdict before reaching `subtle.importKey` or any
 * primitive — closes the per-algorithm length-validation gap (fs-0gzb).
 */
function validateKeyLengthForAlg(alg: number, keyBytes: Uint8Array): string | null {
  switch (alg) {
    case -8:
      if (keyBytes.length !== 32) {
        return `ed25519 key must be 32 bytes; got ${keyBytes.length}`;
      }
      return null;
    case -7:
      if (keyBytes.length !== 65 || keyBytes[0] !== 0x04) {
        return `ecdsa-p256 key must be SEC1 uncompressed (65 bytes, 0x04-prefixed); got ${keyBytes.length} bytes`;
      }
      return null;
    case -37:
      if (keyBytes.length < 100) {
        return `rsa-pss key too short to encode RSAPublicKey; got ${keyBytes.length} bytes`;
      }
      return null;
    default:
      return null;
  }
}

/**
 * Renders a {@link KeyRef} for the receipt's `key.ref` field — a stable
 * marker an audit consumer can correlate against logs. `kid` is base64'd;
 * `rawPublicKey` carries a `raw:` prefix so a consumer can tell the variant
 * at a glance.
 */
function keyRefDisplay(keyRef: KeyRef): KidOrThumbprint {
  if (keyRef.kind === 'kid') {
    return kidOrThumbprint(bytesToBase64Uint8(keyRef.kid));
  }
  return kidOrThumbprint(`raw:${bytesToBase64Uint8(keyRef.publicKey)}`);
}

function bytesToBase64Uint8(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

/**
 * Wraps `crypto.subtle.importKey('raw', ...)` so a malformed key surfaces as
 * `VerifierError('internal')` — distinct from a forged signature. Sanitizes
 * the underlying message via {@link sanitizeReason} before it leaves the
 * adapter (the raw exception text can echo attacker-supplied bytes).
 *
 * Takes raw bytes (post-resolution and post-length-check), not the base64
 * string the request originally carried — fs-0gzb moved decoding upstream
 * into {@link resolveKeyBytes}.
 */
async function importPublicKey(
  keyBytes: Uint8Array,
  algorithm: AlgorithmIdentifier | EcKeyImportParams,
  label: string,
): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey(
      'raw',
      keyBytes as BufferSource,
      algorithm,
      false,
      ['verify'],
    );
  } catch (e) {
    throw new VerifierError(
      `${label} key import failed: ${sanitizeReason(String(e))}`,
      'internal',
    );
  }
}

/**
 * Decodes a Formspec response-signing envelope (ADR 0109 consumer detached
 * shape) and gates on the `urn:formspec:sig-method:*` URI prefix. Malformed
 * envelopes, envelopes missing `method_uri`, and envelopes whose URI lives
 * outside the response-signing subspace all surface as `unsupported` with a
 * sanitized reason — distinct from a forged signature ('failed').
 *
 * Mirrors `decode_cose_sign1_with_method_uri(bytes, FORMSPEC_SIG_METHOD_URI_PREFIX)`
 * in the Rust ring adapter. The returned `value` is the underlying
 * `CoseSign1`; downstream code reads `value.methodUri` to enforce
 * caller-vs-signed-bytes equality (see {@link assertMethodUriBinding}).
 */
function decodeCoseEnvelope(
  signatureBytes: Uint8Array,
):
  | { kind: 'value'; value: CoseSign1 }
  | { kind: 'unsupported'; reason: string } {
  try {
    const { cose } = decodeCoseSign1WithMethodUri(signatureBytes, FORMSPEC_SIG_METHOD_URI_PREFIX);
    return { kind: 'value', value: cose };
  } catch (e) {
    return { kind: 'unsupported', reason: `cose decode failed: ${sanitizeReason(String(e))}` };
  }
}

/**
 * Runs `subtle.verify` and translates the boolean to a verdict. A throw from
 * `subtle.verify` (malformed signature bytes for the chosen alg, internal
 * WebCrypto failure) becomes `VerifierError('internal')` — NOT a 'failed'
 * verdict. This is the security-critical distinction fs-no9r exists to fix:
 * an attacker who finds a `subtle.verify`-crashing input must not get a
 * "signature checked and failed" claim.
 */
async function verdictFromSubtle(
  run: () => Promise<boolean>,
  label: string,
): Promise<AlgOutcome> {
  let isValid: boolean;
  try {
    isValid = await run();
  } catch (e) {
    // Hard-coded prefix `${label} verify crashed:` is trusted source-text;
    // only `String(e)` is attacker-influenced and goes through sanitizeReason.
    // If `label` is ever parameterized from user input, move it inside the
    // sanitized portion or sanitize the whole composed message.
    throw new VerifierError(
      `${label} verify crashed: ${sanitizeReason(String(e))}`,
      'internal',
    );
  }
  return { kind: 'verdict', result: isValid ? 'verified' : 'failed' };
}

/**
 * Wraps a PKCS#1 `RSAPublicKey` (raw DER `SEQUENCE { n, e }`) in an X.509
 * SubjectPublicKeyInfo so it can be imported via `crypto.subtle.importKey('spki', ...)`.
 *
 * The ring adapter ships RSA public keys in PKCS#1 form (what
 * `key_pair.public_key().as_ref()` returns); WebCrypto only accepts SPKI on
 * import. Wrapping here keeps the wire format identical across adapters — the
 * same `keyRef` produced by ring verifies under WebCrypto without bookkeeping
 * at the call site.
 *
 * Output layout (DER, ASN.1):
 *   SEQUENCE {
 *     SEQUENCE {                              -- AlgorithmIdentifier
 *       OBJECT IDENTIFIER 1.2.840.113549.1.1.1,  -- rsaEncryption
 *       NULL
 *     },
 *     BIT STRING (0 unused bits) {            -- the PKCS#1 RSAPublicKey bytes
 *       <pkcs1 input verbatim>
 *     }
 *   }
 *
 * The algorithm OID is `rsaEncryption`, NOT `id-RSASSA-PSS` — this matches the
 * SPKI form openssl produces for plain RSA keys and what WebCrypto's RSA-PSS
 * importer expects when the algorithm/hash parameters are supplied at import
 * time. (RSA-PSS-specific OID would require encoding PSS parameters here too,
 * which WebCrypto does not accept.)
 */
function wrapPkcs1RsaPublicKeyInSpki(pkcs1: Uint8Array): Uint8Array {
  const algorithmIdentifier = new Uint8Array([
    0x30, 0x0d, // SEQUENCE, 13 bytes
    0x06, 0x09, // OBJECT IDENTIFIER, 9 bytes
    0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // 1.2.840.113549.1.1.1
    0x05, 0x00, // NULL
  ]);
  const bitStringLengthBytes = derLengthBytes(pkcs1.length + 1);
  const bitStringHeader = new Uint8Array(1 + bitStringLengthBytes.length + 1);
  bitStringHeader[0] = 0x03; // BIT STRING
  bitStringHeader.set(bitStringLengthBytes, 1);
  bitStringHeader[bitStringHeader.length - 1] = 0x00; // 0 unused bits
  const bitStringTotal = bitStringHeader.length + pkcs1.length;
  const innerLengthBytes = derLengthBytes(algorithmIdentifier.length + bitStringTotal);
  const outerHeader = new Uint8Array(1 + innerLengthBytes.length);
  outerHeader[0] = 0x30; // SEQUENCE
  outerHeader.set(innerLengthBytes, 1);

  const out = new Uint8Array(
    outerHeader.length + algorithmIdentifier.length + bitStringHeader.length + pkcs1.length,
  );
  let offset = 0;
  out.set(outerHeader, offset);
  offset += outerHeader.length;
  out.set(algorithmIdentifier, offset);
  offset += algorithmIdentifier.length;
  out.set(bitStringHeader, offset);
  offset += bitStringHeader.length;
  out.set(pkcs1, offset);
  return out;
}

/**
 * Encodes a DER length field. Short form (<= 127) is a single byte; long form
 * is `0x80 | n` followed by `n` big-endian length bytes. Caller writes the tag
 * itself (we only return the length bytes).
 */
function derLengthBytes(length: number): Uint8Array {
  if (length < 0) {
    throw new RangeError(`negative DER length: ${length}`);
  }
  if (length < 0x80) {
    return new Uint8Array([length]);
  }
  const bytes: number[] = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

export { decodeCoseSign1 } from '@formspec/signature-cose';
