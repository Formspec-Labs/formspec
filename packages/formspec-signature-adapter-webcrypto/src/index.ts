/** @filedesc WebCrypto adapter implementing the Verifier interface for Ed25519 COSE_Sign1 verification. */
import {
  decodeCoseSign1,
  resolvePayload,
  sigStructureBytes,
} from '@formspec/signature-cose';
import {
  Verifier,
  VerificationReceipt,
  VerifierError,
  VerifyRequest,
  SignatureMethodRegistry,
  resolveRegistryEntry,
  sanitizeReason,
  type VerificationResult,
  type AdapterInfo,
  semVer,
  uri,
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

export class WebCryptoVerifier implements Verifier {
  private receiptSigningKey: CryptoKeyPair | null;
  private adapterInfo: AdapterInfo;

  constructor(receiptSigningKey?: CryptoKeyPair) {
    this.receiptSigningKey = receiptSigningKey ?? null;
    this.adapterInfo = { id: uri(ADAPTER_ID), version: semVer(ADAPTER_VERSION) };
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

    // Per-alg dispatch. Internal errors (importKey crash, subtle.verify
    // throwing on malformed key) bubble out as VerifierError — the caller MUST
    // see "adapter crashed" as distinct from "signature failed verification".
    const outcome = await this.dispatchAlg(request, entry.alg);

    if (outcome.kind === 'unsupported') {
      return this.unsupportedReceipt(registry, request, outcome.reason);
    }

    const receipt: VerificationReceipt = {
      result: outcome.result,
      method: request.signatureMethod,
      methodRegistryVersion: registry.version,
      adapter: this.adapterInfo,
      key: { ref: request.keyRef },
      verifiedAt: new Date().toISOString(),
    };

    if (outcome.result === 'verified' && this.receiptSigningKey) {
      // TODO: sign receipt with COSE_Sign1 using receiptSigningKey
      // receipt.receiptBytes = await signCoseReceipt(receipt, this.receiptSigningKey);
    }

    return receipt;
  }

  private async dispatchAlg(
    request: VerifyRequest,
    alg: number | null,
  ): Promise<AlgOutcome> {
    // COSE algorithm identifiers from IANA
    // -8 = EdDSA (Ed25519)
    // -7 = ES256 (ECDSA P-256)
    // -37 = PS256 (RSA-PSS SHA-256)
    if (alg === null) {
      return { kind: 'unsupported', reason: 'alg = null (PQC placeholder)' };
    }
    switch (alg) {
      case -8:
        return this.verifyEd25519(request);
      case -7:
        return this.verifyEcdsaP256(request);
      case -37:
        return this.verifyRsaPssSha256(request);
      default:
        return { kind: 'unsupported', reason: `unrecognized alg: ${alg}` };
    }
  }

  private async verifyEd25519(request: VerifyRequest): Promise<AlgOutcome> {
    // Ed25519 via Web Crypto — available in Chrome 117+, Safari 17+, Firefox 130+, Node 18+
    // Three distinct failure modes routed to three distinct caller signals:
    //   importKey throws        -> VerifierError('internal')    [thrown]
    //   decodeCoseSign1 throws  -> unsupported with reason       [returned]
    //   subtle.verify -> false  -> 'failed' verdict              [returned]
    const key = await importRawPublicKey(
      request.keyRef,
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

  private async verifyEcdsaP256(request: VerifyRequest): Promise<AlgOutcome> {
    // ECDSA P-256 via WebCrypto. Key import path: raw SEC1 uncompressed (65 bytes,
    // 0x04 || X || Y) matches the ring adapter's public_key fixture. Signature
    // wire format: IEEE-P1363 r||s (64 bytes) — matches ring's ECDSA_P256_SHA256_FIXED
    // output, which is what we extract from the COSE_Sign1 signature slot.
    const key = await importRawPublicKey(
      request.keyRef,
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

  // TODO: implement RSA-PSS once key import and fixture vectors are fixed.
  private async verifyRsaPssSha256(_request: VerifyRequest): Promise<AlgOutcome> {
    return { kind: 'unsupported', reason: 'RSA-PSS SHA-256 adapter path not implemented' };
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
      key: { ref: request.keyRef },
      verifiedAt: new Date().toISOString(),
      reason: sanitizeReason(reason),
    };
  }
}

/**
 * Wraps `crypto.subtle.importKey('raw', ...)` so a malformed key surfaces as
 * `VerifierError('internal')` — distinct from a forged signature. Sanitizes
 * the underlying message via {@link sanitizeReason} before it leaves the
 * adapter (the raw exception text can echo attacker-supplied bytes).
 */
async function importRawPublicKey(
  keyRef: string,
  algorithm: AlgorithmIdentifier | EcKeyImportParams,
  label: string,
): Promise<CryptoKey> {
  let keyBytes: ArrayBuffer;
  try {
    keyBytes = base64ToBytes(keyRef);
  } catch (e) {
    throw new VerifierError(
      `${label} key import failed (invalid base64): ${sanitizeReason(String(e))}`,
      'internal',
    );
  }
  try {
    return await crypto.subtle.importKey('raw', keyBytes, algorithm, false, ['verify']);
  } catch (e) {
    throw new VerifierError(
      `${label} key import failed: ${sanitizeReason(String(e))}`,
      'internal',
    );
  }
}

/**
 * Wraps `decodeCoseSign1` so a malformed envelope produces an `unsupported`
 * verdict with a sanitized reason — caller can distinguish "bytes did not
 * decode as COSE_Sign1" from "signature decoded fine but did not verify".
 */
function decodeCoseEnvelope(
  signatureBytes: Uint8Array,
):
  | { kind: 'value'; value: ReturnType<typeof decodeCoseSign1> }
  | { kind: 'unsupported'; reason: string } {
  try {
    return { kind: 'value', value: decodeCoseSign1(signatureBytes) };
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
    throw new VerifierError(
      `${label} verify crashed: ${sanitizeReason(String(e))}`,
      'internal',
    );
  }
  return { kind: 'verdict', result: isValid ? 'verified' : 'failed' };
}

function base64ToBytes(base64: string): ArrayBuffer {
  const binString = atob(base64);
  return Uint8Array.from(binString, (c) => c.charCodeAt(0)).buffer;
}

export { decodeCoseSign1 } from '@formspec/signature-cose';
