import { describe, expect, it } from 'vitest';
import { snapshotFiniteJson, canonicalFiniteJson, FiniteJsonSnapshotError, finiteJsonSnapshotRefusalReason } from '../src/index.js';

function refusal(value: unknown, reason: string, message: string) {
  let caught: unknown;
  try { snapshotFiniteJson(value); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(TypeError);
  expect(caught).toBeInstanceOf(FiniteJsonSnapshotError);
  expect((caught as Error).name).toBe('TypeError');
  expect((caught as Error).message).toBe(message);
  expect(finiteJsonSnapshotRefusalReason(caught)).toBe(reason);
  return caught as FiniteJsonSnapshotError;
}
function nested(depth: number): unknown {
  let value: unknown = null;
  for (let i = 0; i < depth; i++) value = { child: value };
  return value;
}
describe('finite JSON refusal diagnostics', () => {
  it('keeps exact node and depth boundaries and node-first precedence', () => {
    expect(snapshotFiniteJson(Array(99_999).fill(null))).toHaveLength(99_999);
    refusal(Array(100_000).fill(null), 'node-limit', 'Response data exceeds the safe snapshot limit');
    expect(() => snapshotFiniteJson(nested(128))).not.toThrow();
    refusal(nested(129), 'depth-limit', 'Response data exceeds the safe snapshot limit');
    // Root + 99,871 leaves + 128 containers reaches both guards at the last leaf.
    refusal([...Array(99_871).fill(null), nested(128)], 'node-limit', 'Response data exceeds the safe snapshot limit');
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
    refusal(oversized, 'node-limit', 'Response data exceeds the safe snapshot limit');
    expect(keyReads).toBe(0); expect(elementDescriptors).toBe(0);
    // Budget refusal now precedes shape refusal for impossible arrays.
    refusal(Object.assign(Array(100_000), { extra: true }), 'node-limit', 'Response data exceeds the safe snapshot limit');
  });
  it.each([NaN, Infinity, -Infinity, JSON.parse('1e400')])('classifies non-finite numbers', value => {
    refusal(value, 'non-finite-number', 'Response data contains a non-finite number');
  });
  it.each([
    [undefined, 'Response data contains a non-JSON value'],
    [1n, 'Response data contains a non-JSON value'],
    [Symbol('private'), 'Response data contains a non-JSON value'],
    [() => {}, 'Response data contains a non-JSON value'],
    [new Date(), 'Response data contains a non-JSON object'],
    [Array(1), 'Response data contains a sparse or accessor array'],
    [Object.assign([], { extra: true }), 'Response data contains a non-JSON array property'],
    [Object.assign([], { [Symbol('private')]: true }), 'Response data contains a symbol-keyed property'],
    [Object.assign({}, { [Symbol('private')]: true }), 'Response data objects must contain enumerable string keys only'],
    [Object.defineProperty([null], '0', { value: null, enumerable: false }), 'Response data contains a sparse or accessor array'],
    [Object.defineProperty({}, 'hidden', { value: true }), 'Response data objects must contain enumerable string keys only'],
  ])('retains JSON shape refusals', (value, message) => {
    refusal(value, 'invalid-json-shape', message as string);
  });
  it('refuses cycles but accepts shared detached objects', () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    refusal(cycle, 'invalid-json-shape', 'Response data contains a cycle');
    const shared = { ok: true }; const copy = snapshotFiniteJson({ a: shared, b: shared }) as any;
    expect(copy.a).toEqual(shared); expect(copy.a).not.toBe(copy.b);
  });
  it('never invokes getters and preserves mutable/default immutable snapshots', () => {
    let calls = 0;
    const getter = { get secret() { calls++; return 'private'; } };
    refusal(getter, 'invalid-json-shape', 'Response data contains an accessor property');
    const array = [null]; Object.defineProperty(array, '0', { get() { calls++; return null; } });
    refusal(array, 'invalid-json-shape', 'Response data contains a sparse or accessor array');
    expect(calls).toBe(0);
    const source = Object.assign(Object.create(null), { nested: [true, null, 'text', 4] });
    const frozen = snapshotFiniteJson(source) as any;
    expect(Object.getPrototypeOf(frozen)).toBeNull();
    expect(Object.isFrozen(frozen)).toBe(true); expect(Object.isFrozen(frozen.nested)).toBe(true);
    const mutable = snapshotFiniteJson(source, false) as any;
    expect(Object.isFrozen(mutable)).toBe(false); mutable.nested[0] = false;
    expect(source.nested[0]).toBe(true);
    expect(canonicalFiniteJson(frozen)).toBe('{"nested":[true,null,"text",4]}');
  });
  it('retains the canonicalizer explicit refusal without widening its validation', () => {
    let error: unknown;
    try { canonicalFiniteJson(undefined as any); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toBe('Response snapshot cannot be canonicalized');
    expect(finiteJsonSnapshotRefusalReason(error)).toBe('invalid-json-shape');
  });
  it('exposes only immutable owning categories, ignoring spoofed and proxy errors', () => {
    const error = refusal(undefined, 'invalid-json-shape', 'Response data contains a non-JSON value');
    expect(Reflect.set(error, 'reason', 'private')).toBe(false);
    expect(Object.getOwnPropertyDescriptor(error, 'reason')).toMatchObject({ writable: false, configurable: false, enumerable: false });
    expect(() => new FiniteJsonSnapshotError('private' as any, 'unused')).toThrow(TypeError);
    let reads = 0;
    const spoof = { get reason() { reads++; throw Error('private'); } };
    for (const unknown of [spoof, new TypeError('Response data contains a cycle'), Object.create(FiniteJsonSnapshotError.prototype), null, 1]) {
      expect(finiteJsonSnapshotRefusalReason(unknown)).toBeUndefined();
    }
    const nativeError = new Error('private');
    const proxy = new Proxy({}, { getPrototypeOf() { throw nativeError; } });
    expect(() => snapshotFiniteJson(proxy)).toThrow(nativeError);
    expect(finiteJsonSnapshotRefusalReason(nativeError)).toBeUndefined(); expect(reads).toBe(0);
  });
});
