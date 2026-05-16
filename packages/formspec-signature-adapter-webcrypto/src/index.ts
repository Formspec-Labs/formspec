/** @filedesc WebCrypto adapter implementing the Verifier interface for Ed25519 COSE_Sign1 verification. */
import {
  decodeCoseSign1,
  resolvePayload,
  sigStructureBytes,
} from '@formspec/signature-cose';
import {
  Verifier,
  VerificationReceipt,
  VerifyRequest,
  SignatureMethodRegistry,
  resolveRegistryEntry,
  type VerificationResult,
  type AdapterInfo,
  semVer,
  uri,
} from '@formspec/signature-port';

const ADAPTER_ID = 'urn:formspec:adapter:webcrypto@1';
const ADAPTER_VERSION = '0.1.0';

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

    try {
      const result = await this.verifySignature(request, entry.alg);
      const receipt: VerificationReceipt = {
        result,
        method: request.signatureMethod,
        methodRegistryVersion: registry.version,
        adapter: this.adapterInfo,
        key: { ref: request.keyRef },
        verifiedAt: new Date().toISOString(),
      };

      if (result === 'verified' && this.receiptSigningKey) {
        // TODO: sign receipt with COSE_Sign1 using receiptSigningKey
        // receipt.receiptBytes = await signCoseReceipt(receipt, this.receiptSigningKey);
      }

      return receipt;
    } catch (e) {
      return this.failedReceipt(registry, request, String(e));
    }
  }

  private async verifySignature(
    request: VerifyRequest,
    alg: number | null,
  ): Promise<VerificationResult> {
    // COSE algorithm identifiers from IANA
    // -8 = EdDSA (Ed25519)
    // -7 = ES256 (ECDSA P-256)
    // -37 = PS256 (RSA-PSS SHA-256)
    if (alg === null) {
      return 'unsupported';
    }

    switch (alg) {
      case -8:
        return this.verifyEd25519(request);
      case -7:
        return this.verifyEcdsaP256(request);
      case -37:
        return this.verifyRsaPssSha256(request);
      default:
        return 'unsupported';
    }
  }

  private async verifyEd25519(request: VerifyRequest): Promise<VerificationResult> {
    // Ed25519 via Web Crypto — available in Chrome 117+, Safari 17+, Firefox 130+, Node 18+
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        base64ToBytes(request.keyRef),
        { name: 'Ed25519' },
        false,
        ['verify'],
      );

      const cose = decodeCoseSign1(request.signatureBytes);
      if (cose.alg !== -8) {
        return 'failed';
      }
      const payload = resolvePayload(cose, request.signedBytes);
      const sigStructure = sigStructureBytes(cose.protectedHeaderBytes, payload);
      const isValid = await crypto.subtle.verify(
        { name: 'Ed25519' },
        key,
        cose.signature as BufferSource,
        sigStructure as BufferSource,
      );
      return isValid ? 'verified' : 'failed';
    } catch {
      return 'failed';
    }
  }

  private async verifyEcdsaP256(request: VerifyRequest): Promise<VerificationResult> {
    // ECDSA P-256 via WebCrypto. Key import path: raw SEC1 uncompressed (65 bytes,
    // 0x04 || X || Y) matches the ring adapter's public_key fixture. Signature
    // wire format: IEEE-P1363 r||s (64 bytes) — matches ring's ECDSA_P256_SHA256_FIXED
    // output, which is what we extract from the COSE_Sign1 signature slot.
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        base64ToBytes(request.keyRef),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );

      const cose = decodeCoseSign1(request.signatureBytes);
      if (cose.alg !== -7) {
        return 'failed';
      }
      const payload = resolvePayload(cose, request.signedBytes);
      const sigStructure = sigStructureBytes(cose.protectedHeaderBytes, payload);
      const isValid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        cose.signature as BufferSource,
        sigStructure as BufferSource,
      );
      return isValid ? 'verified' : 'failed';
    } catch {
      return 'failed';
    }
  }

  // TODO: implement RSA-PSS once key import and fixture vectors are fixed.
  private async verifyRsaPssSha256(_request: VerifyRequest): Promise<VerificationResult> {
    return 'unsupported';
  }

  private unsupportedReceipt(
    registry: SignatureMethodRegistry,
    request: VerifyRequest,
    _reason: string,
  ): VerificationReceipt {
    return {
      result: 'unsupported',
      method: request.signatureMethod,
      methodRegistryVersion: registry.version,
      adapter: this.adapterInfo,
      key: { ref: request.keyRef },
      verifiedAt: new Date().toISOString(),
    };
  }

  private failedReceipt(
    registry: SignatureMethodRegistry,
    request: VerifyRequest,
    _reason: string,
  ): VerificationReceipt {
    return {
      result: 'failed',
      method: request.signatureMethod,
      methodRegistryVersion: registry.version,
      adapter: this.adapterInfo,
      key: { ref: request.keyRef },
      verifiedAt: new Date().toISOString(),
    };
  }
}

function base64ToBytes(base64: string): ArrayBuffer {
  const binString = atob(base64);
  return Uint8Array.from(binString, (c) => c.charCodeAt(0)).buffer;
}

export { decodeCoseSign1 } from '@formspec/signature-cose';
