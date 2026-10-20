/** @filedesc Public attachment preserves completed Response content and rejects incomplete evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import canonicalize from 'canonicalize';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
for (const name of ['common', 'issuer', 'definition', 'validation-result', 'verification-receipt']) {
  ajv.addSchema(
    JSON.parse(
      readFileSync(
        new URL(`../../../schemas/${name}.schema.json`, import.meta.url),
        'utf8'
      )
    )
  );
}
const validate = ajv.compile(
  JSON.parse(
    readFileSync(
      new URL('../../../schemas/response.schema.json', import.meta.url),
      'utf8'
    )
  )
);
import { attachAuthoredSignature } from '../dist/index.js';
import { attachAuthoredSignature as renderAttach } from '../dist/engine-render-entry.js';
const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../tests/fixtures/signature-responses/valid-single.response.json',
      import.meta.url
    ),
    'utf8'
  )
);
function inputs() {
  const response = structuredClone(fixture);
  const [signature] = response.authoredSignatures;
  delete response.authoredSignatures;
  return {
    response,
    signature: { ...signature, signedAt: signature.signedPayload.signedAt },
  };
}
function freeze(v) {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function payload(r) {
  const { authoredSignatures, ...rest } = r;
  return canonicalize(rest);
}
test('root and render export the same helper', () =>
  assert.equal(renderAttach, attachAuthoredSignature));
test('frozen snapshot preserves canonical payload and all metadata with independent nested copies', () => {
  const { response, signature } = inputs();
  response.displayedLocale = { locale: 'es', version: '1.0.0' };
  response.displayedIssuer = { version: '1.0.0', url: 'https://example.org' };
  response.author = { id: 'author', name: 'Original' };
  response.subject = { id: 'subject' };
  signature.signerEvidence = { kind: 'typed', value: 'Ada' };
  const before = structuredClone(response);
  freeze(response);
  freeze(signature);
  const result = attachAuthoredSignature(response, signature);
  assert.equal(validate(result), true, JSON.stringify(validate.errors));
  assert.equal(payload(result), payload(before));
  assert.deepEqual(response, before);
  assert.deepEqual(
    result.authoredSignatures[0].signerEvidence,
    signature.signerEvidence
  );
  assert.equal('signedAt' in result.authoredSignatures[0], false);
  assert.notEqual(
    result.authoredSignatures[0].signedPayload,
    signature.signedPayload
  );
  result.data.signerName = 'changed';
  result.authoredSignatures[0].signerEvidence.value = 'changed';
  assert.equal(response.data.signerName, 'Ada Lovelace');
  assert.equal(signature.signerEvidence.value, 'Ada');
});
test('append preserves prior evidence and refuses duplicate IDs', () => {
  const { response, signature } = inputs();
  const first = attachAuthoredSignature(response, signature);
  const second = attachAuthoredSignature(freeze(first), {
    ...signature,
    signatureId: 'second',
  });
  assert.equal(payload(second), payload(response));
  assert.deepEqual(second.authoredSignatures[0], first.authoredSignatures[0]);
  assert.notEqual(second.authoredSignatures[0], first.authoredSignatures[0]);
  assert.throws(() => attachAuthoredSignature(first, signature), /Duplicate/);
});
for (const field of [
  'signatureId',
  'documentId',
  'signerName',
  'signatureValue',
  'consentTextRef',
  'consentVersion',
  'affirmationText',
  'documentHash',
  'documentHashAlgorithm',
  'signatureProvider',
  'ceremonyId',
])
  test(`missing ${field} rejected`, () => {
    const { response, signature } = inputs();
    delete signature[field];
    assert.throws(
      () => attachAuthoredSignature(response, signature),
      new RegExp(field)
    );
  });
for (const [field, value] of [
  ['responseId', 'other'],
  ['definitionUrl', 'https://other.test'],
  ['definitionVersion', '2'],
  ['signedAt', '2026-04-23T12:00:00Z'],
  ['signingIntent', 'urn:other'],
  ['canonicalization', 'formspec-response-section-signing-v1'],
  ['digestAlgorithm', 'sha-512'],
  ['digest', 'bad'],
])
  test(`payload ${field} mismatch rejected`, () => {
    const { response, signature } = inputs();
    signature.signedPayload[field] = value;
    assert.throws(() => attachAuthoredSignature(response, signature));
  });
test('snapshot, consent, encoding, date and section boundaries reject invalid inputs', () => {
  for (const change of [
    (r) => delete r.id,
    (r) => (r.status = 'in-progress'),
    (r) => (r.authoredSignatures = {}),
  ]) {
    const { response, signature } = inputs();
    change(response);
    assert.throws(() => attachAuthoredSignature(response, signature));
  }
  for (const change of [
    (s) => (s.consentAccepted = false),
    (s) => (s.signatureValue = 'bad bytes'),
    (s) => (s.consentTextRef = 'relative'),
    (s) => (s.signedAt = s.signedPayload.signedAt = '2026-02-30T12:00:00Z'),
    (s) => (s.signedAt = s.signedPayload.signedAt = '2026-04-22T24:00:00Z'),
    (s) => (s.partyRole = undefined),
    (s) => (s.coveredPaths = []),
  ]) {
    const { response, signature } = inputs();
    change(signature);
    assert.throws(() => attachAuthoredSignature(response, signature));
  }
});

test('appended complete evidence meets the maintained Response schema', () => {
  const { response, signature } = inputs();
  signature.signerEvidence = { kind: 'typed', value: 'Ada' };
  const result = attachAuthoredSignature(response, signature);
  assert.equal(validate(result), true, JSON.stringify(validate.errors));
});

test('signer evidence strips unsupported provider properties', () => {
  const { response, signature } = inputs();
  signature.signerEvidence = {
    kind: 'typed',
    value: 'Ada',
    internalProviderData: 'omit',
  };
  const result = attachAuthoredSignature(response, signature);
  assert.deepEqual(result.authoredSignatures[0].signerEvidence, {
    kind: 'typed',
    value: 'Ada',
  });
  assert.equal(validate(result), true, JSON.stringify(validate.errors));
});

for (const [field, value] of Object.entries({ signingActId: 'act-1', documentRef: { documentId: 'terms-v2', locale: 'en' }, presentationHash: 'a'.repeat(64), witnessedSignatureRef: null })) {
  test(`legacy attachment refuses declared-document ${field} instead of dropping it`, () => {
    const { response, signature } = inputs();
    assert.throws(() => attachAuthoredSignature(response, { ...signature, [field]: value }), /finalizeDocumentAttestations/);
  });
}
test('legacy attachment refuses a prepared committed root', () => {
  const { response, signature } = inputs();
  response.extensions = { 'x-formspec-document-attestations': {} };
  assert.throws(() => attachAuthoredSignature(response, signature), /finalizeDocumentAttestations/);
});
