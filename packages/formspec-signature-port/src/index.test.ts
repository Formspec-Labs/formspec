import { describe, expect, it } from 'vitest';

import {
  StaticKeyResolver,
  keyRefKid,
  resolveRegistryEntry,
  uri,
  type SignatureMethodRegistry,
} from './index.js';

describe('formspec signature port facade', () => {
  it('re-exports integrity-stack key resolver helpers', async () => {
    const kid = new Uint8Array([4, 5, 6]);
    const publicKey = new Uint8Array([6, 5, 4]);
    const resolver = new StaticKeyResolver([[kid, publicKey]]);

    await expect(resolver.resolve(keyRefKid(new Uint8Array([4, 5, 6])))).resolves.toEqual(publicKey);
  });

  it('re-exports registry lookup helpers', () => {
    const method = uri('urn:formspec:signature-method:test@1');
    const registry: SignatureMethodRegistry = {
      version: '1.0.0' as SignatureMethodRegistry['version'],
      entries: [{ id: method, suite: 'test', wire: 'detached', alg: null, status: 'registered' }],
    };

    expect(resolveRegistryEntry(registry, method)?.wire).toBe('detached');
  });
});
