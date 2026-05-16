/** @filedesc Unit tests for WebCryptoVerifier and decodeCoseSign1 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  encodeCoseSign1,
  protectedHeaderBytes,
  sigStructureBytes,
} from '@formspec/signature-cose';
import { WebCryptoVerifier, decodeCoseSign1 } from './index';
import {
  kidOrThumbprint,
  semVer,
  SignatureMethodRegistry,
  uri,
} from '@formspec/signature-port';

// Pulls the production registry so the test matrix tracks the canonical source.
// Avoids drift between registries/signature-method-registry.json and an inline copy.
const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = resolve(
  __dirname,
  '../../../registries/signature-method-registry.json',
);
const RING_ECDSA_FIXTURE_PATH = resolve(
  __dirname,
  '../../../crates/formspec-signature-adapter-ring/tests/fixtures/golden-vectors/ecdsa-p256-sha256.json',
);

interface RegistryFileEntry {
  id: string;
  suite: string;
  wire: string;
  alg: number | null;
  status: 'registered' | 'deprecated';
  deprecationNotice?: string;
}
interface RegistryFile {
  version: string;
  entries: RegistryFileEntry[];
}

function loadRegistry(): SignatureMethodRegistry {
  const raw = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as RegistryFile;
  return {
    version: semVer(raw.version),
    entries: raw.entries.map((e) => ({
      id: uri(e.id),
      suite: e.suite,
      wire: e.wire,
      alg: e.alg,
      status: e.status,
      deprecationNotice: e.deprecationNotice,
    })),
  };
}

const TEST_REGISTRY: SignatureMethodRegistry = loadRegistry();

interface RingEcdsaFixture {
  signature_method: string;
  public_key: { hex: string; base64: string };
  signed_bytes: { hex: string; base64: string };
  signature_bytes_cose_sign1: { hex: string; base64: string };
}

function loadRingEcdsaFixture(): RingEcdsaFixture {
  return JSON.parse(readFileSync(RING_ECDSA_FIXTURE_PATH, 'utf8')) as RingEcdsaFixture;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

describe('WebCryptoVerifier', () => {
  it('returns unsupported for unknown method', async () => {
    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes: new Uint8Array([1, 2, 3]),
        signatureBytes: new Uint8Array([4, 5, 6]),
        signatureMethod: uri('urn:formspec:sig-method:unknown@1'),
        keyRef: kidOrThumbprint('deadbeef'),
      },
      TEST_REGISTRY,
    );
    expect(receipt.result).toBe('unsupported');
    expect(receipt.adapter.id).toBe('urn:formspec:adapter:webcrypto@1');
  });

  it('returns unsupported for PQC method (alg = null)', async () => {
    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes: new Uint8Array([1, 2, 3]),
        signatureBytes: new Uint8Array([4, 5, 6]),
        signatureMethod: uri('urn:formspec:sig-method:ml-dsa-65-cose-sign1@1'),
        keyRef: kidOrThumbprint('deadbeef'),
      },
      TEST_REGISTRY,
    );
    expect(receipt.result).toBe('unsupported');
  });

  it('returns unsupported for deprecated method', async () => {
    const deprecatedRegistry: SignatureMethodRegistry = {
      version: semVer('1.0.0'),
      entries: [
        {
          id: uri('urn:formspec:sig-method:ed25519-cose-sign1@1'),
          suite: 'Ed25519',
          wire: 'COSE_Sign1 with alg = -8',
          alg: -8,
          status: 'deprecated',
          deprecationNotice: 'Use ed25519-cose-sign1@2',
        },
      ],
    };
    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes: new Uint8Array([1, 2, 3]),
        signatureBytes: new Uint8Array([4, 5, 6]),
        signatureMethod: uri('urn:formspec:sig-method:ed25519-cose-sign1@1'),
        keyRef: kidOrThumbprint('deadbeef'),
      },
      deprecatedRegistry,
    );
    expect(receipt.result).toBe('unsupported');
  });

  it('verifies a real Ed25519 COSE_Sign1 signature', async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify'],
    );
    const signedBytes = new TextEncoder().encode('formspec signed payload');
    const protectedHeader = protectedHeaderBytes(-8, new TextEncoder().encode('test-kid'));
    const sigStructure = sigStructureBytes(protectedHeader, signedBytes);
    const primitiveSignature = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        keyPair.privateKey,
        sigStructure as BufferSource,
      ),
    );
    const signatureBytes = encodeCoseSign1(protectedHeader, null, primitiveSignature);
    const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
    const keyRef = kidOrThumbprint(bytesToBase64(publicKey));

    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes,
        signatureBytes,
        signatureMethod: uri('urn:formspec:sig-method:ed25519-cose-sign1@1'),
        keyRef,
      },
      TEST_REGISTRY,
    );

    expect(receipt.result).toBe('verified');
  });

  it('fails when the ring ECDSA-P256 golden vector signature is tampered', async () => {
    // ECDSA-specific negative twin to the Ed25519 tamper test. Reuses the
    // committed ring fixture; flips the final byte of `signature_bytes_cose_sign1`
    // (inside the 64-byte IEEE-P1363 r||s signature bstr trailing the COSE_Sign1
    // envelope — see fs-wxoz harness `flip_inner_signature` invariant). Without
    // this case, a regression in the ECDSA branch's key import or signature
    // wire format would only be caught by the happy path.
    const fixture = loadRingEcdsaFixture();
    const tampered = hexToBytes(fixture.signature_bytes_cose_sign1.hex);
    tampered[tampered.length - 1] ^= 0x01;

    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes: hexToBytes(fixture.signed_bytes.hex),
        signatureBytes: tampered,
        signatureMethod: uri('urn:formspec:sig-method:ecdsa-p256-cose-sign1@1'),
        keyRef: kidOrThumbprint(fixture.public_key.base64),
      },
      TEST_REGISTRY,
    );
    expect(receipt.result).toBe('failed');
    expect(receipt.adapter.id).toBe('urn:formspec:adapter:webcrypto@1');
  });

  it('verifies the ring-generated ECDSA-P256 golden vector', async () => {
    // Cross-adapter byte-equivalence: bytes signed by the ring adapter
    // (fixed-format ECDSA P-256 SHA-256, IEEE-P1363 r||s) must verify under
    // WebCrypto. Public key is raw SEC1 uncompressed (65 bytes, 0x04 || X || Y).
    const fixture = loadRingEcdsaFixture();
    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes: hexToBytes(fixture.signed_bytes.hex),
        signatureBytes: hexToBytes(fixture.signature_bytes_cose_sign1.hex),
        signatureMethod: uri('urn:formspec:sig-method:ecdsa-p256-cose-sign1@1'),
        keyRef: kidOrThumbprint(fixture.public_key.base64),
      },
      TEST_REGISTRY,
    );
    expect(receipt.result).toBe('verified');
    expect(receipt.adapter.id).toBe('urn:formspec:adapter:webcrypto@1');
  });

  it('fails when the signature bytes are tampered (Ed25519)', async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify'],
    );
    const signedBytes = new TextEncoder().encode('formspec signed payload');
    const protectedHeader = protectedHeaderBytes(-8, new TextEncoder().encode('test-kid'));
    const sigStructure = sigStructureBytes(protectedHeader, signedBytes);
    const primitiveSignature = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        keyPair.privateKey,
        sigStructure as BufferSource,
      ),
    );
    const signatureBytes = encodeCoseSign1(protectedHeader, null, primitiveSignature);
    // Flip the final byte (inside the COSE signature slot) to invalidate the MAC.
    const tampered = new Uint8Array(signatureBytes);
    tampered[tampered.length - 1] ^= 0x01;
    const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));

    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes,
        signatureBytes: tampered,
        signatureMethod: uri('urn:formspec:sig-method:ed25519-cose-sign1@1'),
        keyRef: kidOrThumbprint(bytesToBase64(publicKey)),
      },
      TEST_REGISTRY,
    );

    expect(receipt.result).toBe('failed');
  });

  it('fails when verifying with a mismatched public key (Ed25519)', async () => {
    const signingPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify'],
    );
    const wrongPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify'],
    );
    const signedBytes = new TextEncoder().encode('formspec signed payload');
    const protectedHeader = protectedHeaderBytes(-8, new TextEncoder().encode('test-kid'));
    const sigStructure = sigStructureBytes(protectedHeader, signedBytes);
    const primitiveSignature = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        signingPair.privateKey,
        sigStructure as BufferSource,
      ),
    );
    const signatureBytes = encodeCoseSign1(protectedHeader, null, primitiveSignature);
    const wrongPublicKey = new Uint8Array(
      await crypto.subtle.exportKey('raw', wrongPair.publicKey),
    );

    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes,
        signatureBytes,
        signatureMethod: uri('urn:formspec:sig-method:ed25519-cose-sign1@1'),
        keyRef: kidOrThumbprint(bytesToBase64(wrongPublicKey)),
      },
      TEST_REGISTRY,
    );

    expect(receipt.result).toBe('failed');
  });

  it('fails when COSE_Sign1 bytes are malformed garbage', async () => {
    // Garbage bytes should not crash the verifier — they must surface as a
    // 'failed' receipt with the adapter shape preserved. The per-alg verify
    // method (verifyEd25519 here) catches the decode throw internally and
    // returns 'failed' as a VerificationResult; the outer try in `verify()`
    // never fires for this path. Receipt result is 'failed' either way.
    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes: new TextEncoder().encode('any payload'),
        signatureBytes: new Uint8Array([0xff, 0xff, 0xff, 0xff]),
        signatureMethod: uri('urn:formspec:sig-method:ed25519-cose-sign1@1'),
        keyRef: kidOrThumbprint('a2V5LWRhdGE='),
      },
      TEST_REGISTRY,
    );

    expect(receipt.result).toBe('failed');
    expect(receipt.adapter.id).toBe('urn:formspec:adapter:webcrypto@1');
    expect(receipt.method).toBe('urn:formspec:sig-method:ed25519-cose-sign1@1');
  });

  it('produces receipt with correct adapter info', async () => {
    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes: new Uint8Array([1]),
        signatureBytes: new Uint8Array([2]),
        signatureMethod: uri('urn:formspec:sig-method:ecdsa-p256-cose-sign1@1'),
        keyRef: kidOrThumbprint('key123'),
      },
      TEST_REGISTRY,
    );
    expect(receipt.adapter.id).toBe('urn:formspec:adapter:webcrypto@1');
    expect(receipt.adapter.version).toBe('0.1.0');
    expect(receipt.key.ref).toBe('key123');
    expect(receipt.verifiedAt).toBeTruthy();
  });

  it('returns unsupported for RSA-PSS SHA-256 stub', async () => {
    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes: new Uint8Array([1, 2, 3]),
        signatureBytes: new Uint8Array([4, 5, 6]),
        signatureMethod: uri('urn:formspec:sig-method:rsa-pss-sha256-cose-sign1@1'),
        keyRef: kidOrThumbprint('a2V5LWRhdGE='),
      },
      TEST_REGISTRY,
    );
    expect(receipt.result).toBe('unsupported');
  });
});

describe('decodeCoseSign1', () => {
  it('throws for empty bytes', () => {
    expect(() => decodeCoseSign1(new Uint8Array([]))).toThrow();
  });

  it('throws for malformed input', () => {
    expect(() => decodeCoseSign1(new Uint8Array([0xff, 0xff, 0xff]))).toThrow();
  });
});

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
