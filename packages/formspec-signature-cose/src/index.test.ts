/** @filedesc Unit tests for the Formspec COSE_Sign1 shim. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COSE_LABEL_METHOD_URI,
  FORMSPEC_RECEIPT_METHOD_URI_PREFIX,
  FORMSPEC_SIG_METHOD_URI_PREFIX,
  decodeCoseSign1,
  decodeCoseSign1WithMethodUri,
  encodeCoseSign1,
  extractMethodUri,
  protectedHeaderBytes,
  resolvePayload,
  sigStructureBytes,
} from './index';
import { protectedHeaderBytesForAlg } from '@integrity-stack/cose';

const SIG_METHOD_ED25519 = 'urn:formspec:sig-method:ed25519-cose-sign1@1';
const RECEIPT_METHOD_ED25519 = 'urn:formspec:receipt-method:ed25519-cose-sign1@1';
const __dirname = dirname(fileURLToPath(import.meta.url));
const METHOD_URI_FIXTURE_DIR = resolve(
  __dirname,
  '../../../tests/fixtures/signature-method-uri-fail-closed',
);

interface MethodUriFixture {
  id: string;
  methodUri: string;
  expectedPrefix: string;
  expectedReason: 'method_unsupported' | 'wrong_method_uri_prefix';
  protectedHeaderHex: string;
  signatureBytesCoseSign1Hex: string;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function loadMethodUriFixture(name: string): MethodUriFixture {
  return JSON.parse(
    readFileSync(resolve(METHOD_URI_FIXTURE_DIR, `${name}.json`), 'utf8'),
  ) as MethodUriFixture;
}

describe('Formspec COSE_Sign1 shim', () => {
  it('emits MAP_3 with method_uri at label -65540', () => {
    const protectedHeader = protectedHeaderBytes(
      -8,
      new Uint8Array(16).fill(0xaa),
      SIG_METHOD_ED25519,
    );

    expect(protectedHeader[0]).toBe(0xa3);
    // Confirm method_uri label appears (dCBOR 5-byte form for -65540).
    expect(Array.from(protectedHeader.slice(21, 26))).toEqual([0x3a, 0x00, 0x01, 0x00, 0x03]);
  });

  it('decodes a Formspec sig-method envelope via decodeCoseSign1WithMethodUri', () => {
    const protectedHeader = protectedHeaderBytes(
      -8,
      new Uint8Array(16).fill(0x11),
      SIG_METHOD_ED25519,
    );
    const signature = new Uint8Array(64).fill(7);
    const encoded = encodeCoseSign1(protectedHeader, null, signature);

    const { cose, methodUri } = decodeCoseSign1WithMethodUri(
      encoded,
      FORMSPEC_SIG_METHOD_URI_PREFIX,
    );

    expect(cose.alg).toBe(-8);
    expect(cose.kid).toEqual(new Uint8Array(16).fill(0x11));
    expect(cose.methodUri).toBe(SIG_METHOD_ED25519);
    expect(methodUri).toBe(SIG_METHOD_ED25519);
    expect(cose.payload).toBeNull();
    expect(cose.signature).toEqual(signature);
    expect(resolvePayload(cose, new Uint8Array([9]))).toEqual(new Uint8Array([9]));
  });

  it('decodes a Formspec receipt-method envelope via decodeCoseSign1WithMethodUri', () => {
    const protectedHeader = protectedHeaderBytes(
      -8,
      new Uint8Array(16).fill(0x22),
      RECEIPT_METHOD_ED25519,
    );
    const encoded = encodeCoseSign1(protectedHeader, null, new Uint8Array(64));

    const { methodUri } = decodeCoseSign1WithMethodUri(
      encoded,
      FORMSPEC_RECEIPT_METHOD_URI_PREFIX,
    );

    expect(methodUri).toBe(RECEIPT_METHOD_ED25519);
  });

  it('extractMethodUri returns the URI when prefix matches', () => {
    const protectedHeader = protectedHeaderBytes(
      -8,
      new Uint8Array(16).fill(0xbb),
      SIG_METHOD_ED25519,
    );
    const encoded = encodeCoseSign1(protectedHeader, new Uint8Array([1]), new Uint8Array(64));

    expect(extractMethodUri(encoded, FORMSPEC_SIG_METHOD_URI_PREFIX)).toBe(SIG_METHOD_ED25519);
  });

  it('rejects missing method_uri (legacy alg-only header)', () => {
    const protectedHeader = protectedHeaderBytesForAlg(-8, new Uint8Array([1, 2, 3]));
    const encoded = encodeCoseSign1(protectedHeader, null, new Uint8Array(64));

    expect(() => decodeCoseSign1WithMethodUri(encoded, FORMSPEC_SIG_METHOD_URI_PREFIX)).toThrow(
      new RegExp(`missing method_uri protected header \\(label ${COSE_LABEL_METHOD_URI}\\)`),
    );
  });

  it('rejects sig-method URI routed through the receipt-method prefix', () => {
    // ADR 0111 invariant: disjoint subspaces; cross-domain reuse forbidden.
    const protectedHeader = protectedHeaderBytes(
      -8,
      new Uint8Array(16).fill(0xcc),
      SIG_METHOD_ED25519,
    );
    const encoded = encodeCoseSign1(protectedHeader, null, new Uint8Array(64));

    expect(() =>
      decodeCoseSign1WithMethodUri(encoded, FORMSPEC_RECEIPT_METHOD_URI_PREFIX),
    ).toThrow(/does not match expected prefix/);
  });

  it('rejects receipt-method URI routed through the sig-method prefix', () => {
    // Inverse of the prior case — both directions of the subspace boundary
    // must reject. Mirrors the Rust signature-cose cross-domain tests.
    const protectedHeader = protectedHeaderBytes(
      -8,
      new Uint8Array(16).fill(0xdd),
      RECEIPT_METHOD_ED25519,
    );
    const encoded = encodeCoseSign1(protectedHeader, null, new Uint8Array(64));

    expect(() => decodeCoseSign1WithMethodUri(encoded, FORMSPEC_SIG_METHOD_URI_PREFIX)).toThrow(
      /does not match expected prefix/,
    );
  });

  it('rejects embedded payload mismatch', () => {
    const protectedHeader = protectedHeaderBytes(
      -8,
      new Uint8Array(16).fill(0xee),
      SIG_METHOD_ED25519,
    );
    const encoded = encodeCoseSign1(protectedHeader, new Uint8Array([1]), new Uint8Array([2]));
    const decoded = decodeCoseSign1(encoded);
    expect(() => resolvePayload(decoded, new Uint8Array([3]))).toThrow(
      /embedded COSE payload does not match/,
    );
  });

  it('rejects duplicate protected-header labels', () => {
    const protectedHeader = new Uint8Array([0xa2, 0x01, 0x27, 0x01, 0x26]);
    const encoded = encodeCoseSign1(protectedHeader, null, new Uint8Array([1, 2, 3]));
    expect(() => decodeCoseSign1(encoded)).toThrow(/duplicate protected-header label/);
  });

  it('classifies the committed method_uri rejection fixtures', () => {
    for (const name of ['unknown-exact', 'unknown-prefix', 'receipt-on-response', 'sig-on-receipt']) {
      const fixture = loadMethodUriFixture(name);
      const protectedHeader = protectedHeaderBytes(
        -8,
        new Uint8Array(16).fill(0xaa),
        fixture.methodUri,
      );
      expect(protectedHeader).toEqual(hexToBytes(fixture.protectedHeaderHex));

      const encoded = hexToBytes(fixture.signatureBytesCoseSign1Hex);
      expect(encodeCoseSign1(protectedHeader, null, new Uint8Array(64))).toEqual(encoded);
      if (fixture.expectedReason === 'method_unsupported') {
        const { methodUri } = decodeCoseSign1WithMethodUri(encoded, fixture.expectedPrefix);
        expect(methodUri).toBe(fixture.methodUri);
      } else {
        expect(() => decodeCoseSign1WithMethodUri(encoded, fixture.expectedPrefix)).toThrow(
          /does not match expected prefix/,
        );
      }
    }
  });

  it('property-checks unknown prefixes as a distinct prefix rejection reason', () => {
    for (let i = 0; i < 64; i += 1) {
      const methodUri = `urn:example:sig-method:ed25519-cose-sign1@${i}`;
      const protectedHeader = protectedHeaderBytes(-8, new Uint8Array(16).fill(0xaa), methodUri);
      const encoded = encodeCoseSign1(protectedHeader, null, new Uint8Array(64));
      expect(() => decodeCoseSign1WithMethodUri(encoded, FORMSPEC_SIG_METHOD_URI_PREFIX)).toThrow(
        /does not match expected prefix/,
      );
    }
  });

  it('builds expected Sig_structure shape', () => {
    expect(
      Array.from(sigStructureBytes(new Uint8Array([0xa1, 0x01, 0x27]), new Uint8Array([1, 2]))),
    ).toEqual([
      0x84, 0x6a, 0x53, 0x69, 0x67, 0x6e, 0x61, 0x74, 0x75, 0x72, 0x65, 0x31, 0x43, 0xa1, 0x01,
      0x27, 0x40, 0x42, 0x01, 0x02,
    ]);
  });
});
