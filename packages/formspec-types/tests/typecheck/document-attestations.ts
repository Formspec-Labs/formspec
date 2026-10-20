/** @filedesc Public Response document selections use the single generated schema vocabulary. */
import type { FormResponse, DocumentAttestationCommitment, DocumentAttestationSelection, ResolvedDocument } from '../../src/index.js';
const selection: DocumentAttestationSelection = { signatureId: 's1', documentRef: { documentId: 'terms', locale: 'en' }, witnessedSignatureRef: null };
const document: ResolvedDocument = { documentId: 'terms', locale: 'en', source: { kind: 'inline', data: 'SGVsbG8=' }, mediaType: 'text/plain', documentHash: 'a'.repeat(64), pinnedAt: '2026-10-20T19:00:00Z' };
const gesture: DocumentAttestationCommitment = { version: '1.0', signingActId: 'act', fieldPath: 'signature', signerId: 'signer', signerName: 'Ada', signedAt: document.pinnedAt, signingIntent: 'urn:intent', consentAccepted: true, consentTextRef: 'urn:consent', consentVersion: '1', affirmationText: 'I agree', signatureProvider: 'urn:provider', ceremonyId: 'ceremony', attestations: [selection] };
const response: FormResponse = { $formspecResponse: '1.0', id: 'response', definitionUrl: 'urn:def', definitionVersion: '1', status: 'completed', authored: document.pinnedAt, data: {}, resolvedDocuments: [document], extensions: { 'x-formspec-document-attestations': gesture } };
// @ts-expect-error A non-witness selection must explicitly contain null.
const missingWitness: DocumentAttestationSelection = { signatureId: 's2', documentRef: selection.documentRef };
// @ts-expect-error Intrinsic principal references retain their digest, not a WOS record id.
selection.witnessedSignatureRef = { affirmationId: 'wos-record' };
// @ts-expect-error Exact resolved selections contain a source, never a bare URL.
document.source = 'https://example.invalid/terms';
// @ts-expect-error Version1 document assent requires consent true.
gesture.consentAccepted = false;
void [response, missingWitness];
