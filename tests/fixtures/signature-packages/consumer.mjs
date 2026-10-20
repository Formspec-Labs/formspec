/** @filedesc Native ESM consumer of packed signature packages, without workspace source aliases. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as port from '@formspec/signature-port';
import * as cose from '@formspec/signature-cose';
import { WebCryptoVerifier, decodeCoseSign1 } from '@formspec/signature-adapter-webcrypto';

const json = name => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'));
const bytes = hex => new Uint8Array(Buffer.from(hex, 'hex'));
const registryFile = json('registry.json');
const registry = { ...registryFile, version: port.semVer(registryFile.version),
  entries: registryFile.entries.map(entry => ({ ...entry, id: port.uri(entry.id) })) };
assert.equal(cose.FORMSPEC_SIG_METHOD_URI_PREFIX, 'urn:formspec:sig-method:');
assert.equal(cose.FORMSPEC_RECEIPT_METHOD_URI_PREFIX, 'urn:formspec:receipt-method:');
assert.notEqual(cose.FORMSPEC_SIG_METHOD_URI_PREFIX, cose.FORMSPEC_RECEIPT_METHOD_URI_PREFIX);
assert.equal(typeof cose.protectedHeaderBytes, 'function');
assert.equal(decodeCoseSign1, cose.decodeCoseSign1);
const resolver = new port.StaticKeyResolver([[new Uint8Array([1]), new Uint8Array([2])]]);
assert.deepEqual(await resolver.resolve(port.keyRefKid(new Uint8Array([1]))), new Uint8Array([2]));

for (const name of ['ecdsa-p256-sha256', 'rsa-pss-sha256']) {
  const fixture = json(`${name}.json`);
  const request = { signedBytes: bytes(fixture.signed_bytes.hex),
    signatureBytes: bytes(fixture.signature_bytes_cose_sign1.hex),
    methodUri: port.uri(fixture.method_uri), keyRef: port.keyRefRawPublicKey(bytes(fixture.public_key.hex)) };
  const receipt = await new WebCryptoVerifier().verify(request, registry);
  assert.equal(receipt.result, 'verified', `${name}: ${JSON.stringify(receipt)}`);
  assert.deepEqual(receipt.adapter, { id: 'urn:formspec:adapter:webcrypto@1', version: '0.1.0' });
  const custom = await new WebCryptoVerifier({ adapterId: 'urn:test:adapter', adapterVersion: '9.8.7' }).verify(request, registry);
  assert.equal(custom.result, 'verified');
  assert.deepEqual(custom.adapter, { id: 'urn:test:adapter', version: '9.8.7' });
  const otherDomain = await new WebCryptoVerifier({ methodUriPrefix: cose.FORMSPEC_RECEIPT_METHOD_URI_PREFIX }).verify(request, registry);
  assert.equal(otherDomain.result, 'unsupported');
  assert.match(otherDomain.reason, /does not match expected prefix/);
  const altered = request.signedBytes.slice();
  altered[0] ^= 1;
  assert.equal((await new WebCryptoVerifier().verify({ ...request, signedBytes: altered }, registry)).result, 'failed');
  const malformed = await new WebCryptoVerifier().verify({ ...request, signatureBytes: new Uint8Array([0xff]) }, registry);
  assert.equal(malformed.result, 'unsupported');
}

for (const name of ['receipt-on-response', 'sig-on-receipt']) {
  const fixture = json(`${name}.json`);
  assert.throws(() => cose.decodeCoseSign1WithMethodUri(bytes(fixture.signatureBytesCoseSign1Hex), fixture.expectedPrefix), /does not match expected prefix/);
}
for (const name of ['signature-port', 'signature-cose', 'signature-adapter-webcrypto']) {
  for (const path of ['src/index.ts', 'dist/index.js']) {
    await assert.rejects(import(`@formspec/${name}/${path}`), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  }
}
console.log('PASS: packed native ESM imports, ring fixtures, overrides, failure boundaries and restricted exports');
