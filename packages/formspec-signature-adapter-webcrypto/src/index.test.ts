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
  VerifierError,
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
const RING_RSA_PSS_FIXTURE_PATH = resolve(
  __dirname,
  '../../../crates/formspec-signature-adapter-ring/tests/fixtures/golden-vectors/rsa-pss-sha256.json',
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

interface RingGoldenVector {
  signature_method: string;
  public_key: { hex: string; base64: string };
  signed_bytes: { hex: string; base64: string };
  signature_bytes_cose_sign1: { hex: string; base64: string };
}

function loadRingEcdsaFixture(): RingGoldenVector {
  return JSON.parse(readFileSync(RING_ECDSA_FIXTURE_PATH, 'utf8')) as RingGoldenVector;
}

function loadRingRsaPssFixture(): RingGoldenVector {
  return JSON.parse(readFileSync(RING_RSA_PSS_FIXTURE_PATH, 'utf8')) as RingGoldenVector;
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

  it('returns unsupported (not failed) when COSE_Sign1 bytes are malformed (fs-no9r)', async () => {
    // Security-critical: a malformed COSE envelope is NOT the same caller signal
    // as a successfully-decoded-but-forged signature. Previously a bare catch{}
    // collapsed both into 'failed' (fs-no9r). Now decode failures route to
    // 'unsupported' with a sanitized reason; only a real subtle.verify -> false
    // produces 'failed'.
    //
    // The key bytes here are 32-byte raw Ed25519 (importKey succeeds), so we
    // hit the decode branch specifically and not the importKey-internal-error
    // branch (covered separately below).
    const verifier = new WebCryptoVerifier();
    const validKeyB64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const receipt = await verifier.verify(
      {
        signedBytes: new TextEncoder().encode('any payload'),
        signatureBytes: new Uint8Array([0xff, 0xff, 0xff, 0xff]),
        signatureMethod: uri('urn:formspec:sig-method:ed25519-cose-sign1@1'),
        keyRef: kidOrThumbprint(validKeyB64),
      },
      TEST_REGISTRY,
    );

    expect(receipt.result).toBe('unsupported');
    expect(receipt.reason).toMatch(/cose decode/i);
    expect(receipt.adapter.id).toBe('urn:formspec:adapter:webcrypto@1');
    expect(receipt.method).toBe('urn:formspec:sig-method:ed25519-cose-sign1@1');
  });

  it('throws VerifierError(internal) when importKey fails — distinct from verify-false (fs-no9r)', async () => {
    // Wrong-length key bytes (5 raw bytes) make subtle.importKey reject. The
    // adapter MUST surface this as an internal error, not collapse it into a
    // 'failed' receipt that would imply "signature was checked and is forged".
    // An attacker who finds an importKey-crashing input could otherwise mint
    // a false-positive failure record.
    const verifier = new WebCryptoVerifier();
    const malformedKeyB64 = 'AAECAwQ='; // 5 bytes, not 32 — Ed25519 import rejects.
    let thrown: unknown;
    try {
      await verifier.verify(
        {
          signedBytes: new TextEncoder().encode('any payload'),
          signatureBytes: new Uint8Array([0xff, 0xff, 0xff, 0xff]),
          signatureMethod: uri('urn:formspec:sig-method:ed25519-cose-sign1@1'),
          keyRef: kidOrThumbprint(malformedKeyB64),
        },
        TEST_REGISTRY,
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(VerifierError);
    expect((thrown as VerifierError).code).toBe('internal');
    expect((thrown as VerifierError).message).toMatch(/key import failed/i);
  });

  it('produces distinguishable signals for importKey-crash vs verify-failure (fs-no9r)', async () => {
    // Paired assertion: same registry, same method, two inputs that previously
    // collapsed into identical 'failed' receipts. After fs-no9r the caller can
    // tell them apart — one throws VerifierError, the other returns a
    // 'failed' verdict.
    //
    // For the verify-failure half we generate a real keypair (importKey
    // succeeds) but stuff a bogus signature into the COSE envelope so
    // subtle.verify returns false rather than throwing.
    const keyPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify'],
    );
    const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
    const validKeyRef = bytesToBase64(publicKey);
    const protectedHeader = protectedHeaderBytes(-8, new TextEncoder().encode('test-kid'));
    // Random non-matching 64-byte signature (deterministic so the test stays stable).
    const bogusSignature = new Uint8Array(64);
    for (let i = 0; i < bogusSignature.length; i += 1) bogusSignature[i] = (i * 7 + 13) & 0xff;
    const cose = encodeCoseSign1(protectedHeader, null, bogusSignature);
    const verifier = new WebCryptoVerifier();
    const malformedKeyB64 = 'AAECAwQ='; // 5 raw bytes → importKey rejects.

    await expect(
      verifier.verify(
        {
          signedBytes: new TextEncoder().encode('payload'),
          signatureBytes: cose,
          signatureMethod: uri('urn:formspec:sig-method:ed25519-cose-sign1@1'),
          keyRef: kidOrThumbprint(malformedKeyB64),
        },
        TEST_REGISTRY,
      ),
    ).rejects.toBeInstanceOf(VerifierError);

    const failedReceipt = await verifier.verify(
      {
        signedBytes: new TextEncoder().encode('payload'),
        signatureBytes: cose,
        signatureMethod: uri('urn:formspec:sig-method:ed25519-cose-sign1@1'),
        keyRef: kidOrThumbprint(validKeyRef),
      },
      TEST_REGISTRY,
    );
    expect(failedReceipt.result).toBe('failed');
    expect(failedReceipt.reason).toBeUndefined();
  });

  it('surfaces sanitized reason on unsupported receipts (registry / cose) (fs-no9r)', async () => {
    // VerificationReceipt.reason is the structured replacement for what used
    // to be discarded `_reason` parameters. Must be set, must be sanitized
    // (no control chars / overlong CBOR error spew), must not leak on verified
    // receipts.
    const verifier = new WebCryptoVerifier();
    const unknownMethod = await verifier.verify(
      {
        signedBytes: new Uint8Array([1]),
        signatureBytes: new Uint8Array([2]),
        signatureMethod: uri('urn:formspec:sig-method:unknown@1'),
        keyRef: kidOrThumbprint('deadbeef'),
      },
      TEST_REGISTRY,
    );
    expect(unknownMethod.result).toBe('unsupported');
    expect(unknownMethod.reason).toContain('method not in registry');
    // Sanitization: no control chars / multi-line spew.
    expect(unknownMethod.reason ?? '').not.toMatch(/[\x00-\x1f]/);
  });

  it('produces receipt with correct adapter info', async () => {
    // Unsupported-method path: no key import / no COSE decode runs, so we
    // get a stable receipt back regardless of key/signature bytes. Lets the
    // assertion focus on adapter-info shape rather than crypto wiring.
    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes: new Uint8Array([1]),
        signatureBytes: new Uint8Array([2]),
        signatureMethod: uri('urn:formspec:sig-method:unknown@1'),
        keyRef: kidOrThumbprint('key123'),
      },
      TEST_REGISTRY,
    );
    expect(receipt.adapter.id).toBe('urn:formspec:adapter:webcrypto@1');
    expect(receipt.adapter.version).toBe('0.1.0');
    expect(receipt.key.ref).toBe('key123');
    expect(receipt.verifiedAt).toBeTruthy();
  });

  it('verifies a self-signed RSA-PSS SHA-256 COSE_Sign1 signature (round-trip)', async () => {
    // Generates a fresh key, signs a payload, builds a COSE_Sign1 envelope,
    // then verifies via the adapter. Public key is exported in SPKI form,
    // unwrapped to PKCS#1 RSAPublicKey for the keyRef — matching the ring
    // adapter's wire format. The adapter rewraps PKCS#1 -> SPKI internally
    // for WebCrypto import. This contract — keyRef = PKCS#1 base64 — is the
    // load-bearing parity invariant for cross-runtime verification.
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const signedBytes = new TextEncoder().encode('formspec rsa-pss round-trip payload');
    const protectedHeader = protectedHeaderBytes(-37, new TextEncoder().encode('test-kid'));
    const sigStructure = sigStructureBytes(protectedHeader, signedBytes);
    const primitiveSignature = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'RSA-PSS', saltLength: 32 },
        keyPair.privateKey,
        sigStructure as BufferSource,
      ),
    );
    const signatureBytes = encodeCoseSign1(protectedHeader, null, primitiveSignature);
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
    const pkcs1 = unwrapSpkiToPkcs1RsaPublicKey(spki);
    const keyRef = kidOrThumbprint(bytesToBase64(pkcs1));

    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes,
        signatureBytes,
        signatureMethod: uri('urn:formspec:sig-method:rsa-pss-sha256-cose-sign1@1'),
        keyRef,
      },
      TEST_REGISTRY,
    );

    expect(receipt.result).toBe('verified');
    expect(receipt.adapter.id).toBe('urn:formspec:adapter:webcrypto@1');
  });

  it('verifies the ring-generated RSA-PSS SHA-256 golden vector', async () => {
    // Cross-adapter byte-equivalence: bytes signed by the ring adapter
    // (RSA-PSS SHA-256, salt = 32) must verify under WebCrypto. Public key is
    // PKCS#1 RSAPublicKey (raw SEQUENCE { n, e }); adapter rewraps -> SPKI.
    const fixture = loadRingRsaPssFixture();
    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes: hexToBytes(fixture.signed_bytes.hex),
        signatureBytes: hexToBytes(fixture.signature_bytes_cose_sign1.hex),
        signatureMethod: uri('urn:formspec:sig-method:rsa-pss-sha256-cose-sign1@1'),
        keyRef: kidOrThumbprint(fixture.public_key.base64),
      },
      TEST_REGISTRY,
    );
    expect(receipt.result).toBe('verified');
    expect(receipt.adapter.id).toBe('urn:formspec:adapter:webcrypto@1');
  });

  it('fails when the ring RSA-PSS golden vector signature is tampered', async () => {
    // Negative twin to the positive RSA-PSS golden-vector test. Flips the
    // final byte of the COSE envelope (inside the raw RSA-PSS signature bstr)
    // to invalidate without changing framing — mirrors the ring crate's
    // `flip_inner_signature` invariant. Without this case a regression in the
    // RSA-PSS branch's key import or salt-length parameter could pass the
    // positive vector trivially and still leak by accepting forgeries.
    const fixture = loadRingRsaPssFixture();
    const tampered = hexToBytes(fixture.signature_bytes_cose_sign1.hex);
    tampered[tampered.length - 1] ^= 0x01;

    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes: hexToBytes(fixture.signed_bytes.hex),
        signatureBytes: tampered,
        signatureMethod: uri('urn:formspec:sig-method:rsa-pss-sha256-cose-sign1@1'),
        keyRef: kidOrThumbprint(fixture.public_key.base64),
      },
      TEST_REGISTRY,
    );
    expect(receipt.result).toBe('failed');
    expect(receipt.adapter.id).toBe('urn:formspec:adapter:webcrypto@1');
  });

  it('returns unsupported when COSE alg id disagrees with the requested method (RSA-PSS)', async () => {
    // The adapter pre-checks the COSE alg label against the registry entry's
    // expected alg id BEFORE invoking subtle.verify. Feeding a -7 (ECDSA)
    // envelope under the rsa-pss-sha256 method must route to 'unsupported'
    // with a sanitized reason, not 'failed' (which would imply a real
    // cryptographic check was performed against the RSA key).
    const fixture = loadRingEcdsaFixture();
    const rsaFixture = loadRingRsaPssFixture();
    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes: hexToBytes(fixture.signed_bytes.hex),
        signatureBytes: hexToBytes(fixture.signature_bytes_cose_sign1.hex),
        signatureMethod: uri('urn:formspec:sig-method:rsa-pss-sha256-cose-sign1@1'),
        keyRef: kidOrThumbprint(rsaFixture.public_key.base64),
      },
      TEST_REGISTRY,
    );
    expect(receipt.result).toBe('unsupported');
    expect(receipt.reason).toMatch(/cose alg mismatch/i);
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

/**
 * Strips the X.509 SubjectPublicKeyInfo wrapper off a WebCrypto-exported RSA
 * public key, leaving the embedded PKCS#1 RSAPublicKey (`SEQUENCE { n, e }`).
 * The round-trip test uses this to pin the parity invariant: the adapter
 * accepts what the ring adapter would emit, not what WebCrypto's exporter
 * emits.
 *
 * SPKI shape (skipped here):
 *   SEQUENCE {
 *     SEQUENCE { OID rsaEncryption, NULL },   -- AlgorithmIdentifier
 *     BIT STRING (0 unused bits) { <pkcs1> }  -- the bytes we extract
 *   }
 *
 * Test-only utility — assertions over malformed DER suffice. The production
 * unwrap path lives in the reverse direction (PKCS#1 -> SPKI) inside the
 * adapter's `wrapPkcs1RsaPublicKeyInSpki`.
 */
function unwrapSpkiToPkcs1RsaPublicKey(spki: Uint8Array): Uint8Array {
  let offset = 0;
  if (spki[offset] !== 0x30) {
    throw new Error('SPKI: expected outer SEQUENCE');
  }
  offset += 1;
  offset += derLengthFieldSize(spki, offset);
  // AlgorithmIdentifier — skip it.
  if (spki[offset] !== 0x30) {
    throw new Error('SPKI: expected AlgorithmIdentifier SEQUENCE');
  }
  const algIdSize = 1 + derLengthFieldSize(spki, offset + 1) + derContentLength(spki, offset + 1);
  offset += algIdSize;
  // BIT STRING containing the PKCS#1 RSAPublicKey.
  if (spki[offset] !== 0x03) {
    throw new Error('SPKI: expected BIT STRING');
  }
  offset += 1;
  const bitStringLengthSize = derLengthFieldSize(spki, offset);
  const bitStringContentLength = derContentLength(spki, offset);
  offset += bitStringLengthSize;
  // Skip the single "unused bits" byte (always 0x00 for byte-aligned keys).
  offset += 1;
  return spki.slice(offset, offset + bitStringContentLength - 1);
}

function derLengthFieldSize(buf: Uint8Array, at: number): number {
  return buf[at] < 0x80 ? 1 : 1 + (buf[at] & 0x7f);
}

function derContentLength(buf: Uint8Array, at: number): number {
  const first = buf[at];
  if (first < 0x80) return first;
  const lengthBytes = first & 0x7f;
  let value = 0;
  for (let i = 0; i < lengthBytes; i += 1) {
    value = (value << 8) | buf[at + 1 + i];
  }
  return value;
}
