/** @filedesc Verify Core explanation preimages and hashes with independent TypeScript canonicalization. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalJsonBytes, parseJsonExact } from '@formspec-org/integrity-canonical';
import { expect, test } from 'vitest';

interface Vector {
  preimageHex: string;
  digest: string;
}

type Input = [string, string];
const vectors: {
  refDigests: Record<string, Vector & { json: string }>;
  instance: Vector & { input: { shapeId: string; path: string; inputs: Input[] } };
  group: Vector & { input: { code: string; firings: [string, string, Input[]][] } };
} = JSON.parse(readFileSync(new URL(
  '../../../tests/conformance/fixtures/explanations/basis-vectors.json', import.meta.url,
), 'utf8'));

function checkVector(domain: string, value: unknown, vector: Vector): string {
  const bytes = Buffer.concat([Buffer.from(domain + '\0', 'utf8'), canonicalJsonBytes(value)]);
  const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  expect(bytes.toString('hex')).toBe(vector.preimageHex);
  expect(digest).toBe(vector.digest);
  return digest;
}

function checkedReference(key: string): string {
  const vector = vectors.refDigests[key];
  return checkVector('formspec.explanation.ref.v1', parseJsonExact(vector.json), vector);
}

function checkedInputs(inputs: Input[]): Input[] {
  return inputs.map(([key]) => [key, checkedReference(key)]);
}

test.each(Object.keys(vectors.refDigests))('reference %s matches its exact bytes and digest', key => {
  checkedReference(key);
});

test('instance basis commits to the resolved reference digests', () => {
  const { input } = vectors.instance;
  const value = { ...input, inputs: checkedInputs(input.inputs) };
  expect(value).toEqual(input);
  checkVector('formspec.explanation.basis.v1', value, vectors.instance);
});

test('group basis commits to each firing and its resolved reference digests', () => {
  const { input } = vectors.group;
  const firings = input.firings.map(([shapeId, path, inputs]) => [shapeId, path, checkedInputs(inputs)]);
  const value = { code: input.code, firings };
  expect(value).toEqual(input);
  checkVector('formspec.explanation.group-basis.v1', value, vectors.group);
});
