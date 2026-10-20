/** @filedesc Genuine COSE signing, immutable snapshots, and checked document/witness evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FormEngine, prepareDocumentAttestations, finalizeDocumentAttestations,
  verifyDocumentAttestations,
} from '../dist/index.js';
import { canonicalResponseSignedPayloadBytes } from '@formspec-org/integrity-canonical';
import { protectedHeaderBytes, sigStructureBytes, encodeCoseSign1 } from '@formspec/signature-cose';
import { keyRefKid, keyRefRawPublicKey, StaticKeyResolver } from '@formspec/signature-port';
import { WebCryptoVerifier } from '@formspec/signature-adapter-webcrypto';

const EXTENSION = 'x-formspec-document-attestations';
const METHOD = 'urn:formspec:sig-method:ed25519-cose-sign1@1';
const RECEIPT_METHOD = 'urn:formspec:receipt-method:ed25519-cose-sign1@1';
const load = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const definitionFixture = load('../../../tests/fixtures/document-attestations/definition.json');
const responseFixture = load('../../../tests/fixtures/document-attestations/prepared-response.json');
const registryFixture = load('../../../registries/signature-method-registry.json');
const copy = value => structuredClone(value);
const registry = () => ({ version: registryFixture.version, entries: copy(registryFixture.entries) });
const verifier = new WebCryptoVerifier();
const sha256 = async bytes => Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');

async function signer() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return {
    keyRef: keyRefRawPublicKey(publicKey), publicKey,
    async sign(bytes, { method = METHOD, kid = new TextEncoder().encode('document-signer') } = {}) {
      const header = protectedHeaderBytes(-8, kid, method);
      const signature = new Uint8Array(await crypto.subtle.sign(
        { name: 'Ed25519' }, pair.privateKey, sigStructureBytes(header, bytes),
      ));
      return encodeCoseSign1(header, null, signature);
    },
  };
}
const signerPromise = signer();

function inputs({ id = 'response-gesture-1', act = 'act-applicant-1' } = {}) {
  const definition = copy(definitionFixture);
  const fixture = copy(responseFixture);
  const resolvedDocuments = fixture.resolvedDocuments;
  const commitment = fixture.extensions[EXTENSION];
  // The positive route starts at the actual engine's completed Response emitter.
  const engine = new FormEngine(definition);
  const response = engine.getResponse({ id, profile: 'on-submit' });
  assert.equal(response.status, 'completed');
  response.extensions = { 'x-other': { keep: true } };
  commitment.signingActId = act;
  commitment.attestations.forEach((selection, i) => { selection.signatureId = `${act}-sig-${i + 1}`; });
  return { response, definition, resolvedDocuments, commitment };
}

async function prepared(options) {
  const input = inputs(options);
  const result = await prepareDocumentAttestations(input);
  return { ...result, definition: input.definition };
}

async function signed(options, witnesses = []) {
  const material = await signerPromise;
  const snapshot = await prepared(options);
  const signatureBytes = await material.sign(snapshot.signedBytes);
  const result = await finalizeDocumentAttestations({
    response: snapshot.response, definition: snapshot.definition, signatureBytes,
    keyRef: material.keyRef, registry: registry(), verifier, witnesses,
  });
  return { ...result, definition: snapshot.definition, keyRef: material.keyRef };
}

async function primitive(response, keyRef, methodUri = METHOD) {
  const bytes = canonicalResponseSignedPayloadBytes(response);
  const signatureBytes = new Uint8Array(Buffer.from(response.authoredSignatures[0].signatureValue, 'base64'));
  return verifier.verify({ signedBytes: bytes, signatureBytes, methodUri, keyRef }, registry());
}

function verify(snapshot, overrides = {}) {
  return verifyDocumentAttestations({ ...snapshot, registry: registry(), verifier, ...overrides });
}

// Negative fixtures are genuinely re-signed, so a failed evidence join cannot hide
// behind a bad primitive signature. Production emission still uses finalize above.
async function resign(response, material = undefined) {
  material ??= await signerPromise;
  const bytes = canonicalResponseSignedPayloadBytes(response);
  const digest = await sha256(bytes);
  const value = Buffer.from(await material.sign(bytes)).toString('base64');
  for (const record of response.authoredSignatures) {
    record.signatureValue = value;
    record.signedPayload.digest = digest;
  }
  assert.equal((await primitive(response, material.keyRef)).result, 'verified');
  return response;
}

function reference(snapshot, index = 0) {
  const record = snapshot.response.authoredSignatures[index];
  return { responseId: snapshot.response.id, signatureId: record.signatureId, signedPayloadDigest: record.signedPayload.digest };
}

async function witnessed(principal) {
  const material = await signerPromise;
  const input = inputs({ id: 'response-witness-1', act: 'act-witness-1' });
  input.commitment.attestations[0].witnessedSignatureRef = reference(principal);
  const snapshot = await prepareDocumentAttestations(input);
  const result = await finalizeDocumentAttestations({
    response: snapshot.response, definition: input.definition,
    signatureBytes: await material.sign(snapshot.signedBytes), keyRef: material.keyRef,
    registry: registry(), verifier, witnesses: [principal],
  });
  return { ...result, definition: input.definition, keyRef: material.keyRef };
}

test('actual engine → prepare → genuine two-document COSE → JSON roundtrip verifies exact selected locales', async () => {
  const snapshot = await signed();
  const result = await verify({ ...snapshot, response: JSON.parse(JSON.stringify(snapshot.response)) });
  assert.equal(result.receipt.result, 'verified');
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records.map(record => record.documentRef), [
    { documentId: 'terms-v2', locale: 'es-US' }, { documentId: 'privacy-v1', locale: 'en' },
  ]);
  assert.equal(new Set(result.records.map(record => record.signatureId)).size, 2);
  assert.equal(new Set(result.records.map(record => record.signatureValue)).size, 1);
  assert.equal(new Set(result.records.map(record => record.signedPayload.digest)).size, 1);
  assert.equal(result.records[0].signingActId, 'act-applicant-1');
  assert.equal(result.records[0].documentHash, responseFixture.resolvedDocuments[0].documentHash);
  assert.equal(result.records[0].presentationHash, responseFixture.resolvedDocuments[0].presentationHash);
  assert.deepEqual(result.response.extensions['x-other'], { keep: true });
  assert.deepEqual(canonicalResponseSignedPayloadBytes(result.response), canonicalResponseSignedPayloadBytes(snapshot.response));
});

test('unchanged v1 bytes omit only top-level authoredSignatures; root changes invalidate the earlier signature', async () => {
  const earlier = await signed();
  const bytes = canonicalResponseSignedPayloadBytes(earlier.response);
  const noRecords = copy(earlier.response); delete noRecords.authoredSignatures;
  assert.deepEqual(canonicalResponseSignedPayloadBytes(noRecords), bytes);
  const outer = copy(earlier.response); outer.authoredSignatures[0].signerName = 'Unsigned replacement';
  assert.deepEqual(canonicalResponseSignedPayloadBytes(outer), bytes);
  assert.equal((await primitive(outer, earlier.keyRef)).result, 'verified');
  const later = copy(earlier.response); later.extensions['x-other'].keep = false;
  assert.notDeepEqual(canonicalResponseSignedPayloadBytes(later), bytes);
  assert.equal((await primitive(later, earlier.keyRef)).result, 'failed');
  await assert.rejects(verify({ ...earlier, response: later }));
  assert.equal((await verify(earlier)).receipt.result, 'verified');
  const fresh = await signed({ id: 'response-gesture-2', act: 'act-applicant-2' });
  assert.equal((await verify(fresh)).receipt.result, 'verified');
  const grafted = copy(fresh.response); grafted.authoredSignatures = copy(earlier.records);
  await assert.rejects(verify({ ...fresh, response: grafted }));
});

test('each root act, document, locale, source, raw hash, presentation and witness choice is covered by real crypto', async t => {
  const snapshot = await signed();
  for (const [name, change] of [
    ['act', r => { r.extensions[EXTENSION].signingActId = 'different-act'; }],
    ['document', r => { r.resolvedDocuments[0].documentId = 'privacy-v1'; }],
    ['locale', r => { r.resolvedDocuments[0].locale = 'en-US'; }],
    ['source', r => { r.resolvedDocuments[0].source.data = 'SGVsbG8='; }],
    ['raw hash', r => { r.resolvedDocuments[0].documentHash = '0'.repeat(64); }],
    ['presentation', r => { r.resolvedDocuments[0].presentationHash = '0'.repeat(64); }],
    ['witness', r => { r.extensions[EXTENSION].attestations[0].witnessedSignatureRef = reference(snapshot); }],
  ]) await t.test(name, async () => {
    const response = copy(snapshot.response); change(response);
    assert.equal((await primitive(response, snapshot.keyRef)).result, 'failed');
    await assert.rejects(verify({ ...snapshot, response }));
  });
});

test('outer mirror and membership tampering refuse even while the original COSE remains valid', async t => {
  const snapshot = await signed();
  for (const [name, change] of [
    ['signer', r => { r.authoredSignatures[0].signerName = 'Someone else'; }],
    ['consent', r => { r.authoredSignatures[0].consentTextRef = 'urn:other:consent'; }],
    ['act', r => { r.authoredSignatures[0].signingActId = 'different-act'; }],
    ['document reference', r => { r.authoredSignatures[0].documentRef.locale = 'en-US'; }],
    ['raw document hash', r => { r.authoredSignatures[0].documentHash = '0'.repeat(64); }],
    ['presentation presence', r => { delete r.authoredSignatures[0].presentationHash; }],
    ['optional metadata presence', r => { r.authoredSignatures[0].identityProofRef = 'urn:unsigned:proof'; }],
    ['payload pin', r => { r.authoredSignatures[0].signedPayload.responseId = 'different-response'; }],
    ['payload time', r => { r.authoredSignatures[0].signedPayload.signedAt = '2026-10-20T19:02:00Z'; }],
    ['witness mirror', r => { r.authoredSignatures[0].witnessedSignatureRef = reference(snapshot); }],
    ['missing record', r => { r.authoredSignatures.pop(); }],
    ['extra record', r => { r.authoredSignatures.push(copy(r.authoredSignatures[1])); }],
    ['duplicate ID', r => { r.authoredSignatures[1].signatureId = r.authoredSignatures[0].signatureId; }],
  ]) await t.test(name, async () => {
    const response = copy(snapshot.response); change(response);
    assert.equal((await primitive(response, snapshot.keyRef)).result, 'verified');
    await assert.rejects(verify({ ...snapshot, response }));
  });
});

test('expected key, protected kid and method dispatch remain actual verifier boundaries', async () => {
  const material = await signerPromise;
  const snapshot = await prepared();
  const stranger = await signer();
  const cose = await material.sign(snapshot.signedBytes);
  const base = { response: snapshot.response, definition: snapshot.definition, signatureBytes: cose, registry: registry(), verifier };
  await assert.rejects(finalizeDocumentAttestations({ ...base, keyRef: stranger.keyRef }), /failed/);
  const kid = new TextEncoder().encode('document-signer');
  const wrongKid = new TextEncoder().encode('other-signer');
  const resolver = new StaticKeyResolver(); resolver.insert(kid, material.publicKey); resolver.insert(wrongKid, material.publicKey);
  const kidVerifier = new WebCryptoVerifier({ keyResolver: resolver });
  assert.equal((await finalizeDocumentAttestations({ ...base, keyRef: keyRefKid(kid), verifier: kidVerifier })).receipt.result, 'verified');
  await assert.rejects(finalizeDocumentAttestations({ ...base, keyRef: keyRefKid(wrongKid), verifier: kidVerifier }), /unsupported/);
  const receiptMethodCose = await material.sign(snapshot.signedBytes, { method: RECEIPT_METHOD });
  await assert.rejects(finalizeDocumentAttestations({ ...base, signatureBytes: receiptMethodCose, keyRef: material.keyRef }));
  assert.notEqual((await verifier.verify({ signedBytes: snapshot.signedBytes, signatureBytes: cose, methodUri: 'urn:formspec:sig-method:rsa-pss-sha256-cose-sign1@1', keyRef: material.keyRef }, registry())).result, 'verified');
  const unavailable = new Error('provider is unavailable');
  await assert.rejects(finalizeDocumentAttestations({ ...base, keyRef: material.keyRef, verifier: { verify: async () => { throw unavailable; } } }), error => error === unavailable);
});

test('explicit retained committed principal verifies; missing, foreign and wrong-digest tuples refuse despite valid crypto', async t => {
  const principal = await signed({ id: 'principal-response', act: 'principal-act' });
  const witness = await witnessed(principal);
  assert.equal((await verify(witness, { witnesses: [principal] })).receipt.result, 'verified');
  assert.equal((await primitive(witness.response, witness.keyRef)).result, 'verified');
  await assert.rejects(verify(witness), /Witness selection/);
  await assert.rejects(verify(witness, { witnesses: [principal, principal] }), /Duplicate retained witness tuple/);
  for (const [name, change] of [
    ['foreign response', ref => { ref.responseId = 'foreign-response'; }],
    ['foreign record', ref => { ref.signatureId = 'foreign-signature'; }],
    ['wrong digest', ref => { ref.signedPayloadDigest = '0'.repeat(64); }],
  ]) await t.test(name, async () => {
    const response = copy(witness.response);
    const ref = response.extensions[EXTENSION].attestations[0].witnessedSignatureRef;
    change(ref); response.authoredSignatures[0].witnessedSignatureRef = copy(ref);
    await resign(response);
    await assert.rejects(verify({ ...witness, response }, { witnesses: [principal] }), /Witness selection/);
  });
  const wrongPrincipal = copy(principal); wrongPrincipal.keyRef = (await signer()).keyRef;
  await assert.rejects(verify(witness, { witnesses: [wrongPrincipal] }), /failed/);
});

test('genuinely signed legacy evidence cannot qualify unsigned outer metadata as a document principal', async () => {
  const principal = await signed({ id: 'legacy-principal', act: 'legacy-act' });
  const legacy = copy(principal);
  delete legacy.response.resolvedDocuments; delete legacy.response.extensions[EXTENSION];
  for (const record of legacy.response.authoredSignatures) {
    for (const key of ['signingActId', 'documentRef', 'witnessedSignatureRef', 'presentationHash']) delete record[key];
  }
  await resign(legacy.response);
  const witness = await witnessed(principal);
  const response = copy(witness.response);
  const ref = reference(legacy);
  response.extensions[EXTENSION].attestations[0].witnessedSignatureRef = ref;
  response.authoredSignatures[0].witnessedSignatureRef = copy(ref);
  await resign(response);
  await assert.rejects(verify({ ...witness, response }, { witnesses: [legacy] }), /typed root commitment/);
});

function deferredVerifier(pauseAt) {
  let release;
  const resumed = new Promise(resolve => { release = resolve; });
  let enter;
  const entered = new Promise(resolve => { enter = resolve; });
  const receipts = [];
  let calls = 0;
  return {
    entered, release, receipts,
    verifier: { async verify(request, methods) {
      if (++calls === pauseAt) { enter(); await resumed; }
      const receipt = await verifier.verify(request, methods);
      assert.equal(receipt.result, 'verified', 'deferred control must execute genuine crypto');
      receipts.push(receipt);
      return receipt;
    } },
  };
}

test('finalize captures main claims, signature/key arrays, registry and retained witnesses before real deferred verification', { timeout: 10000 }, async () => {
  const material = await signerPromise;
  const principal = await signed({ id: 'deferred-principal', act: 'deferred-principal-act' });
  const input = inputs({ id: 'deferred-witness', act: 'deferred-witness-act' });
  input.commitment.attestations[0].witnessedSignatureRef = reference(principal);
  const snapshot = await prepareDocumentAttestations(input);
  const signatureBytes = await material.sign(snapshot.signedBytes);
  const keyRef = keyRefRawPublicKey(new Uint8Array(material.publicKey));
  const methods = registry();
  const retained = copy(principal);
  const gate = deferredVerifier(1);
  const pending = finalizeDocumentAttestations({ response: snapshot.response, definition: input.definition,
    signatureBytes, keyRef, registry: methods, verifier: gate.verifier, witnesses: [retained] });
  await gate.entered;
  try {
    snapshot.response.extensions[EXTENSION].signerName = 'Mutated caller';
    input.definition.documents = {};
    signatureBytes.fill(0); keyRef.publicKey.fill(0); methods.entries.length = 0;
    retained.response.id = 'mutated-principal'; retained.definition.documents = {};
    retained.keyRef.publicKey.fill(0);
  } finally { gate.release(); }
  const result = await pending;
  assert.equal(gate.receipts.length, 2);
  assert.equal(result.receipt.result, 'verified');
  assert.equal(result.records[0].signerName, responseFixture.extensions[EXTENSION].signerName);
  assert.deepEqual(result.records[0].witnessedSignatureRef, reference(principal));
  assert.equal((await verify({ response: result.response, definition: definitionFixture, keyRef: material.keyRef }, { witnesses: [principal] })).receipt.result, 'verified');
});

test('verification copies an earlier receipt before awaiting retained-principal crypto', { timeout: 10000 }, async () => {
  const principal = await signed({ id: 'receipt-principal', act: 'receipt-principal-act' });
  const witness = await witnessed(principal);
  const gate = deferredVerifier(2);
  const pending = verify(witness, { verifier: gate.verifier, witnesses: [principal] });
  await gate.entered;
  try { gate.receipts[0].result = 'failed'; } finally { gate.release(); }
  const result = await pending;
  assert.equal(gate.receipts.length, 2);
  assert.equal(result.receipt.result, 'verified');
});
