import { describe, expect, it } from 'vitest';
import { snapshotFiniteJson } from '../src/index.js';

const LIMIT = 'Response data exceeds the safe snapshot limit';
function nested(depth: number): unknown {
  let value: unknown = null;
  for (let i = 0; i < depth; i++) value = { child: value };
  return value;
}
describe('finite JSON snapshot limits', () => {
  it('keeps exact node and depth boundaries', () => {
    expect(snapshotFiniteJson(Array(99_999).fill(null))).toHaveLength(99_999);
    expect(() => snapshotFiniteJson(Array(100_000).fill(null))).toThrow(LIMIT);
    expect(() => snapshotFiniteJson(nested(128))).not.toThrow();
    expect(() => snapshotFiniteJson(nested(129))).toThrow(LIMIT);
  });
  it('rejects arrays that cannot fit before bulk reflection or descriptor copying', () => {
    let keyReads = 0;
    let elementDescriptors = 0;
    const oversized = new Proxy(Array(100_000).fill(null), {
      ownKeys() { keyReads++; throw Error('bulk reflection must not run'); },
      getOwnPropertyDescriptor(target, key) {
        if (key !== 'length') elementDescriptors++;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    expect(() => snapshotFiniteJson(oversized)).toThrow(LIMIT);
    expect(keyReads).toBe(0); expect(elementDescriptors).toBe(0);
    // The budget refusal precedes the shape refusal for impossible arrays.
    expect(() => snapshotFiniteJson(Object.assign(Array(100_000), { extra: true }))).toThrow(LIMIT);
  });
  it.each([
    [NaN, 'Response data contains a non-finite number'],
    [Array(1), 'Response data contains a sparse or accessor array'],
    [Object.assign([], { extra: true }), 'Response data contains a non-JSON array property'],
    [Object.defineProperty([null], '0', { value: null, enumerable: false }), 'Response data contains a sparse or accessor array'],
  ])('keeps shape refusals', (value, message) => {
    expect(() => snapshotFiniteJson(value)).toThrow(message as string);
  });
  it('never invokes array getters', () => {
    let calls = 0;
    const array = [null]; Object.defineProperty(array, '0', { get() { calls++; return null; } });
    expect(() => snapshotFiniteJson(array)).toThrow('Response data contains a sparse or accessor array');
    expect(calls).toBe(0);
  });
});
