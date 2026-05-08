/** @filedesc Unit tests for WebCryptoVerifier and decodeCoseSign1 */
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

const TEST_REGISTRY: SignatureMethodRegistry = {
  version: semVer('1.0.0'),
  entries: [
    {
      id: uri('urn:formspec:sig-method:ed25519-cose-sign1@1'),
      suite: 'Ed25519',
      wire: 'COSE_Sign1 with alg = -8 (EdDSA)',
      alg: -8,
      status: 'registered',
    },
    {
      id: uri('urn:formspec:sig-method:ecdsa-p256-cose-sign1@1'),
      suite: 'ECDSA-P256',
      wire: 'COSE_Sign1 with alg = -7 (ES256)',
      alg: -7,
      status: 'registered',
    },
    {
      id: uri('urn:formspec:sig-method:rsa-pss-sha256-cose-sign1@1'),
      suite: 'RSA-PSS-SHA256',
      wire: 'COSE_Sign1 with alg = -37 (PS256)',
      alg: -37,
      status: 'registered',
    },
    {
      id: uri('urn:formspec:sig-method:ml-dsa-65-cose-sign1@1'),
      suite: 'ML-DSA-65 (FIPS 204)',
      wire: 'COSE_Sign1 with alg = TBD',
      alg: null,
      status: 'registered',
    },
  ],
};

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

  it('returns unsupported for ECDSA P-256 stub', async () => {
    const verifier = new WebCryptoVerifier();
    const receipt = await verifier.verify(
      {
        signedBytes: new Uint8Array([1, 2, 3]),
        signatureBytes: new Uint8Array([4, 5, 6]),
        signatureMethod: uri('urn:formspec:sig-method:ecdsa-p256-cose-sign1@1'),
        keyRef: kidOrThumbprint('a2V5LWRhdGE='),
      },
      TEST_REGISTRY,
    );
    expect(receipt.result).toBe('unsupported');
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
