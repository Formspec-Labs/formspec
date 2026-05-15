/** @filedesc Unit tests for shared COSE_Sign1 helpers. */
import { describe, expect, it } from 'vitest';
import {
  FORMSPEC_PROFILE_ID,
  decodeCoseSign1,
  encodeCoseSign1,
  extractProfileId,
  protectedHeaderBytes,
  resolvePayload,
  sigStructureBytes,
} from './index';
import {
  protectedHeaderBytesForAlg,
  protectedHeaderBytesForAlgWithProfileId,
} from '@integrity-stack/cose';

describe('COSE_Sign1 helpers', () => {
  it('decodes detached COSE_Sign1', () => {
    const protectedHeader = protectedHeaderBytes(-8, new Uint8Array([1, 2, 3]));
    const signature = new Uint8Array(64).fill(7);
    const encoded = encodeCoseSign1(protectedHeader, null, signature);

    const decoded = decodeCoseSign1(encoded);

    expect(decoded.alg).toBe(-8);
    expect(decoded.kid).toEqual(new Uint8Array([1, 2, 3]));
    expect(decoded.profileId).toBe(FORMSPEC_PROFILE_ID);
    expect(decoded.payload).toBeNull();
    expect(decoded.signature).toEqual(signature);
    expect(resolvePayload(decoded, new Uint8Array([9]))).toEqual(new Uint8Array([9]));
  });

  it('emits and extracts the Formspec profile id', () => {
    const protectedHeader = protectedHeaderBytes(-8, new Uint8Array(16).fill(0xaa));
    const encoded = encodeCoseSign1(protectedHeader, new Uint8Array([1]), new Uint8Array(64));

    expect(extractProfileId(encoded)).toBe(FORMSPEC_PROFILE_ID);
  });

  it('rejects missing Formspec profile id', () => {
    const protectedHeader = protectedHeaderBytesForAlg(-8, new Uint8Array([1, 2, 3]));
    const encoded = encodeCoseSign1(protectedHeader, null, new Uint8Array(64));

    expect(() => decodeCoseSign1(encoded)).toThrow(/missing Formspec profile_id/);
  });

  it('rejects wrong Formspec profile id', () => {
    const protectedHeader = protectedHeaderBytesForAlgWithProfileId(
      -8,
      new Uint8Array([1, 2, 3]),
      1,
    );
    const encoded = encodeCoseSign1(protectedHeader, null, new Uint8Array(64));

    expect(() => decodeCoseSign1(encoded)).toThrow(/wrong Formspec profile_id: expected 2, got 1/);
  });

  it('rejects embedded payload mismatch', () => {
    const protectedHeader = protectedHeaderBytes(-8);
    const encoded = encodeCoseSign1(
      protectedHeader,
      new Uint8Array([1]),
      new Uint8Array([2]),
    );
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

  it('builds expected Sig_structure shape', () => {
    expect(
      Array.from(sigStructureBytes(new Uint8Array([0xa1, 0x01, 0x27]), new Uint8Array([1, 2]))),
    ).toEqual([
      0x84, 0x6a, 0x53, 0x69, 0x67, 0x6e, 0x61, 0x74, 0x75, 0x72, 0x65, 0x31,
      0x43, 0xa1, 0x01, 0x27, 0x40, 0x42, 0x01, 0x02,
    ]);
  });
});
