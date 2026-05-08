/** @filedesc Response contract and pruning: getResponse() omits non-relevant fields and meets the response shape contract */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

const SIGNATURE_DIGEST = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function signedPayload(responseId, definitionUrl = 'https://example.org/forms/signature-attestation', definitionVersion = '1.0.0') {
  return {
    canonicalization: 'formspec-response-signing-v1',
    digestAlgorithm: 'sha-256',
    digest: SIGNATURE_DIGEST,
    responseId,
    definitionUrl,
    definitionVersion
  };
}

test('should prune non-relevant leaf fields when calling getResponse()', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Leaf Pruning',
    items: [
      { key: 'show', type: 'field', dataType: 'boolean', label: 'Show' },
      { key: 'hiddenField', type: 'field', dataType: 'string', label: 'Hidden', initialValue: 'Secret' }
    ],
    binds: [{ path: 'hiddenField', relevant: 'show == true' }]
  });

  let response = engine.getResponse();
  assert.equal(response.data.hiddenField, undefined);

  engine.setValue('show', true);
  response = engine.getResponse();
  assert.equal(response.data.hiddenField, 'Secret');

  engine.setValue('show', false);
  response = engine.getResponse();
  assert.equal(response.data.hiddenField, undefined);
});

test('should deep-prune hidden groups from response data when parent visibility turns false', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test-deep-prune',
    version: '1.0.0',
    title: 'Deep Pruning',
    items: [
      { type: 'field', dataType: 'boolean', key: 'showParent', label: 'Show Parent' },
      {
        type: 'group',
        key: 'parent',
        label: 'Parent',
        visible: 'showParent == true',
        children: [{ type: 'field', dataType: 'string', key: 'child', label: 'Child' }]
      }
    ]
  });

  engine.setValue('showParent', true);
  engine.setValue('parent.child', 'Hello');
  engine.setValue('showParent', false);

  const response = engine.getResponse();
  assert.equal(response.data.parent, undefined);
});

test('should emit required top-level response fields when generating responses', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/forms/shopping-cart',
    version: '1.0.0',
    title: 'Shopping Cart',
    items: [
      { type: 'field', dataType: 'decimal', key: 'price', label: 'Price' },
      { type: 'field', dataType: 'decimal', key: 'quantity', label: 'Quantity' }
    ]
  });

  const response = engine.getResponse();

  assert.ok(Object.hasOwn(response, 'definitionUrl'));
  assert.ok(Object.hasOwn(response, 'definitionVersion'));
  assert.ok(Object.hasOwn(response, 'status'));
  assert.ok(Object.hasOwn(response, 'data'));
  assert.ok(Object.hasOwn(response, 'authored'));
  assert.ok(Object.hasOwn(response, 'validationResults'));
  assert.equal(typeof response.definitionUrl, 'string');
  assert.equal(typeof response.authored, 'string');
  assert.notEqual(new Date(response.authored).toString(), 'Invalid Date');
});

test('should include authored signatures in the response envelope and normalize response identity', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'https://example.org/forms/signature-attestation',
    version: '1.0.0',
    title: 'Signature Attestation',
    items: [
      { type: 'field', dataType: 'string', key: 'signerName', label: 'Signer name' },
      { type: 'field', dataType: 'boolean', key: 'consentAccepted', label: 'Consent accepted' },
      { type: 'field', dataType: 'attachment', key: 'signatureCapture', label: 'Signature capture' }
    ]
  });

  engine.setValue('signerName', 'Ada Lovelace');
  engine.setValue('consentAccepted', true);
  engine.setValue('signatureCapture', 'data:image/png;base64,AAA=');

  const response = engine.getResponse({
    author: { id: 'applicant', name: 'Ada Lovelace' },
    authoredSignatures: [
      {
        signatureId: 'sig-2026-0001',
        documentId: 'benefitsApplication',
        signingIntent: 'urn:agency.gov:signing-intent:benefits-application-certification:v1',
        signatureValue: 'data:image/png;base64,AAA=',
        signatureMethod: 'drawn',
        signedAt: '2026-04-22T12:00:00Z',
        consentAccepted: true,
        consentTextRef: 'urn:agency.gov:consent:esign-benefits:v1',
        consentVersion: '1.0.0',
        affirmationText: 'I certify under penalty of perjury that this submission is true and complete.',
        signedPayload: signedPayload('resp-2026-0001'),
        documentHash: SIGNATURE_DIGEST,
        documentHashAlgorithm: 'sha-256',
        identityProofRef: 'urn:agency.gov:identity-proof:case-2026-0042',
        identityBinding: {
          method: 'email-otp',
          assuranceLevel: 'standard',
          providerRef: 'urn:agency.gov:identity:providers:email-otp'
        },
        signatureProvider: 'urn:agency.gov:signature:providers:formspec',
        ceremonyId: 'ceremony-2026-0001'
      }
    ]
  });

  assert.equal(response.id, 'resp-2026-0001');
  assert.ok(Array.isArray(response.authoredSignatures));
  assert.equal(response.authoredSignatures.length, 1);
  assert.equal(response.authoredSignatures[0].signatureId, 'sig-2026-0001');
  assert.equal(response.authoredSignatures[0].signingIntent, 'urn:agency.gov:signing-intent:benefits-application-certification:v1');
  assert.equal(response.authoredSignatures[0].signedPayload.responseId, 'resp-2026-0001');
  assert.equal(response.authoredSignatures[0].signerId, 'applicant');
  assert.equal(response.authoredSignatures[0].signerName, 'Ada Lovelace');
});

test('should reject authored signatures that disagree on response identity', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'https://example.org/forms/signature-attestation',
    version: '1.0.0',
    title: 'Signature Attestation',
    items: [{ type: 'field', dataType: 'string', key: 'signerName', label: 'Signer name' }]
  });

  assert.throws(
    () => engine.getResponse({
      authoredSignatures: [
        {
          signatureId: 'sig-1',
          documentId: 'benefitsApplication',
          signingIntent: 'urn:agency.gov:signing-intent:benefits-application-certification:v1',
          signatureValue: 'urn:agency.gov:signature:primary',
          signatureMethod: 'provider-managed',
          signerName: 'Ada Lovelace',
          signedAt: '2026-04-22T12:00:00Z',
          consentAccepted: true,
          consentTextRef: 'urn:agency.gov:consent:esign-benefits:v1',
          consentVersion: '1.0.0',
          affirmationText: 'I certify under penalty of perjury that this submission is true and complete.',
          signedPayload: signedPayload('resp-1'),
          documentHash: SIGNATURE_DIGEST,
          documentHashAlgorithm: 'sha-256',
          signatureProvider: 'urn:agency.gov:signature:providers:formspec',
          ceremonyId: 'ceremony-1'
        },
        {
          signatureId: 'sig-2',
          documentId: 'benefitsApplication',
          signingIntent: 'urn:agency.gov:signing-intent:benefits-application-certification:v1',
          signatureValue: 'urn:agency.gov:signature:secondary',
          signatureMethod: 'provider-managed',
          signerName: 'Ada Lovelace',
          signedAt: '2026-04-22T12:05:00Z',
          consentAccepted: true,
          consentTextRef: 'urn:agency.gov:consent:esign-benefits:v1',
          consentVersion: '1.0.0',
          affirmationText: 'I certify under penalty of perjury that this submission is true and complete.',
          signedPayload: signedPayload('resp-2'),
          documentHash: SIGNATURE_DIGEST,
          documentHashAlgorithm: 'sha-256',
          signatureProvider: 'urn:agency.gov:signature:providers:formspec',
          ceremonyId: 'ceremony-2'
        }
      ]
    }),
    /single signedPayload\.responseId/
  );
});

test('should reject authored signatures with mismatched signed payload definition pins', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'https://example.org/forms/signature-attestation',
    version: '1.0.0',
    title: 'Signature Attestation',
    items: [{ type: 'field', dataType: 'string', key: 'signerName', label: 'Signer name' }]
  });

  assert.throws(
    () => engine.getResponse({
      id: 'resp-2026-0001',
      authoredSignatures: [
        {
          signatureId: 'sig-2026-0001',
          documentId: 'benefitsApplication',
          signingIntent: 'urn:agency.gov:signing-intent:benefits-application-certification:v1',
          signatureValue: 'urn:agency.gov:signature:primary',
          signatureMethod: 'provider-managed',
          signerName: 'Ada Lovelace',
          signedAt: '2026-04-22T12:00:00Z',
          consentAccepted: true,
          consentTextRef: 'urn:agency.gov:consent:esign-benefits:v1',
          consentVersion: '1.0.0',
          affirmationText: 'I certify under penalty of perjury that this submission is true and complete.',
          signedPayload: signedPayload('resp-2026-0001', 'https://example.org/forms/other-form'),
          documentHash: SIGNATURE_DIGEST,
          documentHashAlgorithm: 'sha-256',
          signatureProvider: 'urn:agency.gov:signature:providers:formspec',
          ceremonyId: 'ceremony-1'
        }
      ]
    }),
    /signedPayload\.definitionUrl must match/
  );
});

test('should reject authored signatures missing signing intent before envelope emission', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'https://example.org/forms/signature-attestation',
    version: '1.0.0',
    title: 'Signature Attestation',
    items: [{ type: 'field', dataType: 'string', key: 'signerName', label: 'Signer name' }]
  });

  assert.throws(
    () => engine.getResponse({
      id: 'resp-2026-0001',
      authoredSignatures: [
        {
          signatureId: 'sig-2026-0001',
          documentId: 'benefitsApplication',
          signatureValue: 'urn:agency.gov:signature:primary',
          signatureMethod: 'provider-managed',
          signerName: 'Ada Lovelace',
          signedAt: '2026-04-22T12:00:00Z',
          consentAccepted: true,
          consentTextRef: 'urn:agency.gov:consent:esign-benefits:v1',
          consentVersion: '1.0.0',
          affirmationText: 'I certify under penalty of perjury that this submission is true and complete.',
          signedPayload: signedPayload('resp-2026-0001'),
          documentHash: SIGNATURE_DIGEST,
          documentHashAlgorithm: 'sha-256',
          signatureProvider: 'urn:agency.gov:signature:providers:formspec',
          ceremonyId: 'ceremony-1'
        }
      ]
    }),
    /signingIntent is required/
  );
});

test('should use meta.id when authored signatures provide matching signedPayload response pins', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'https://example.org/forms/signature-attestation',
    version: '1.0.0',
    title: 'Signature Attestation',
    items: [{ type: 'field', dataType: 'string', key: 'signerName', label: 'Signer name' }]
  });

  const baseSig = {
    signatureId: 'sig-1',
    documentId: 'benefitsApplication',
    signingIntent: 'urn:agency.gov:signing-intent:benefits-application-certification:v1',
    signatureValue: 'urn:agency.gov:signature:primary',
    signatureMethod: 'provider-managed',
    signerName: 'Ada Lovelace',
    signedAt: '2026-04-22T12:00:00Z',
    consentAccepted: true,
    consentTextRef: 'urn:agency.gov:consent:esign-benefits:v1',
    consentVersion: '1.0.0',
    affirmationText: 'I certify under penalty of perjury that this submission is true and complete.',
    signedPayload: signedPayload('resp-from-meta'),
    documentHash: SIGNATURE_DIGEST,
    documentHashAlgorithm: 'sha-256',
    signatureProvider: 'urn:agency.gov:signature:providers:formspec',
    ceremonyId: 'ceremony-1'
  };

  const response = engine.getResponse({
    id: 'resp-from-meta',
    author: { id: 'applicant', name: 'Ada Lovelace' },
    authoredSignatures: [
      { ...baseSig, signatureValue: 'urn:agency.gov:signature:primary' },
      { ...baseSig, signatureId: 'sig-2', signatureValue: 'urn:agency.gov:signature:secondary', signedAt: '2026-04-22T12:05:00Z', ceremonyId: 'ceremony-2' }
    ]
  });

  assert.equal(response.id, 'resp-from-meta');
  assert.equal(response.authoredSignatures[0].signedPayload.responseId, 'resp-from-meta');
  assert.equal(response.authoredSignatures[1].signedPayload.responseId, 'resp-from-meta');
});

test('should infer signerName from meta.author.name when omitted on signatures', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'https://example.org/forms/signature-attestation',
    version: '1.0.0',
    title: 'Signature Attestation',
    items: [{ type: 'field', dataType: 'string', key: 'signerName', label: 'Signer name' }]
  });

  const response = engine.getResponse({
    id: 'resp-2026-0002',
    author: { id: 'applicant', name: 'Grace Hopper' },
    authoredSignatures: [
      {
        signatureId: 'sig-2026-0002',
        documentId: 'benefitsApplication',
        signingIntent: 'urn:agency.gov:signing-intent:benefits-application-certification:v1',
        signatureValue: 'data:image/png;base64,AAA=',
        signatureMethod: 'drawn',
        signedAt: '2026-04-22T12:00:00Z',
        consentAccepted: true,
        consentTextRef: 'urn:agency.gov:consent:esign-benefits:v1',
        consentVersion: '1.0.0',
        affirmationText: 'I certify under penalty of perjury that this submission is true and complete.',
        signedPayload: signedPayload('resp-2026-0002'),
        documentHash: SIGNATURE_DIGEST,
        documentHashAlgorithm: 'sha-256',
        signatureProvider: 'urn:agency.gov:signature:providers:formspec',
        ceremonyId: 'ceremony-2026-0001'
      }
    ]
  });

  assert.equal(response.authoredSignatures[0].signerName, 'Grace Hopper');
});

test('should strip unknown properties from authored signature inputs', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'https://example.org/forms/signature-attestation',
    version: '1.0.0',
    title: 'Signature Attestation',
    items: [{ type: 'field', dataType: 'string', key: 'signerName', label: 'Signer name' }]
  });

  const response = engine.getResponse({
    id: 'resp-2026-0003',
    author: { id: 'applicant', name: 'Ada Lovelace' },
    authoredSignatures: [
      {
        signatureId: 'sig-2026-0003',
        documentId: 'benefitsApplication',
        signingIntent: 'urn:agency.gov:signing-intent:benefits-application-certification:v1',
        signatureValue: 'urn:agency.gov:signature:primary',
        signatureMethod: 'provider-managed',
        signerName: 'Ada Lovelace',
        signedAt: '2026-04-22T12:00:00Z',
        consentAccepted: true,
        consentTextRef: 'urn:agency.gov:consent:esign-benefits:v1',
        consentVersion: '1.0.0',
        affirmationText: 'I certify under penalty of perjury that this submission is true and complete.',
        signedPayload: signedPayload('resp-2026-0003'),
        documentHash: SIGNATURE_DIGEST,
        documentHashAlgorithm: 'sha-256',
        signatureProvider: 'urn:agency.gov:signature:providers:formspec',
        ceremonyId: 'ceremony-1',
        clientOpaqueAuditToken: 'should-not-appear-in-envelope'
      }
    ]
  });

  assert.ok(!Object.hasOwn(response.authoredSignatures[0], 'clientOpaqueAuditToken'));
});
