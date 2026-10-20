/** @filedesc Atomic declared-document signing over unchanged Integrity whole-Response v1 bytes. */
import type {
    AuthoredSignature, DocumentAttestationCommitment, FormDefinition,
    FormResponse, ResolvedDocument, WitnessedSignatureReference,
} from '@formspec-org/types';
import { canonicalResponseHandoffBytes, canonicalResponseSignedPayloadBytes } from '@formspec-org/integrity-canonical';
import { extractMethodUri, FORMSPEC_SIG_METHOD_URI_PREFIX } from '@formspec/signature-cose';
import { uri, type KeyRef, type SignatureMethodRegistry, type VerificationReceipt, type Verifier } from '@formspec/signature-port';
import { cloneSourceJson } from './engine/instance-source.js';
import { toNormalizedAuthoredSignatureRecord } from './engine/response-assembly.js';
import type { AuthoredSignatureInput } from './interfaces.js';
import { lintDocument } from './fel/fel-api-tools.js';

const EXTENSION = 'x-formspec-document-attestations';

/** A retained principal snapshot and the key the host actually expects for it. */
export interface DocumentAttestationWitness {
    response: FormResponse;
    definition: FormDefinition;
    keyRef: KeyRef;
}

/** The verifier is a host capability; registry/key inputs are captured before awaits. */
export interface DocumentAttestationVerification extends DocumentAttestationWitness {
    registry: SignatureMethodRegistry;
    verifier: Verifier;
    witnesses?: readonly DocumentAttestationWitness[];
}

export interface VerifiedDocumentAttestations {
    response: FormResponse;
    records: AuthoredSignature[];
    /** Actual verifier output, separate from any authenticated receipt claim. */
    receipt: VerificationReceipt;
}

/** Admit JSON with the maintained canonical owner, then reuse the engine's detached copier. */
function capture<T>(value: T): T {
    canonicalResponseHandoffBytes({ value });
    return cloneSourceJson(value) as T;
}

function copyKey(key: KeyRef): KeyRef {
    if (key.kind === 'kid') return { kind: 'kid', kid: new Uint8Array(key.kid) };
    if (key.kind === 'rawPublicKey') return { kind: 'rawPublicKey', publicKey: new Uint8Array(key.publicKey) };
    throw new Error('Unsupported expected key reference');
}

function captureWitness(input: DocumentAttestationWitness): DocumentAttestationWitness {
    return { response: capture(input.response), definition: capture(input.definition), keyRef: copyKey(input.keyRef) };
}

function captureVerification(input: DocumentAttestationVerification) {
    return {
        ...captureWitness(input), registry: capture(input.registry), verifier: input.verifier,
        witnesses: (input.witnesses ?? []).map(captureWitness),
    };
}

function commitment(response: FormResponse): DocumentAttestationCommitment {
    const value = response.extensions?.[EXTENSION];
    if (!value) throw new Error('Declared-document evidence requires its typed root commitment');
    return value;
}

function validate(response: FormResponse, definition: FormDefinition): void {
    if (response.status !== 'completed' || !response.id) throw new Error('Declared-document signing requires a completed Response with a stable id');
    const report = lintDocument(response, { definitionDocument: definition });
    if (!report.valid) {
        const failures = report.diagnostics.filter(diagnostic => diagnostic.severity === 'error');
        throw new Error(`Invalid declared-document evidence: ${JSON.stringify(failures)}`);
    }
}

async function digest(bytes: Uint8Array): Promise<string> {
    const result = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
    return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Prepare one immutable signing gesture. This does not sign or verify anything.
 * The returned bytes use the maintained v1 rule; only top-level authoredSignatures
 * is excluded. The caller must present these exact committed claims for assent.
 */
export async function prepareDocumentAttestations(input: {
    response: FormResponse;
    definition: FormDefinition;
    resolvedDocuments: [ResolvedDocument, ...ResolvedDocument[]];
    commitment: DocumentAttestationCommitment;
}): Promise<{ response: FormResponse; signedBytes: Uint8Array; digest: string }> {
    // Capture every caller-owned input before digest introduces an async boundary.
    const response = capture(input.response);
    const definition = capture(input.definition);
    const documents = capture(input.resolvedDocuments);
    const gesture = capture(input.commitment);
    if (response.authoredSignatures !== undefined || response.extensions?.[EXTENSION] !== undefined) {
        throw new Error('Prepare requires a Response without signatures or an existing document commitment');
    }
    if (response.resolvedDocuments !== undefined) throw new Error('Prepare requires explicit fresh resolved document selections');
    response.resolvedDocuments = documents;
    response.extensions = { ...response.extensions, [EXTENSION]: gesture };
    validate(response, definition);
    const signedBytes = canonicalResponseSignedPayloadBytes(response);
    return { response, signedBytes, digest: await digest(signedBytes) };
}

function toBase64(bytes: Uint8Array): string {
    // Avoid spread/apply argument limits for provider-sized COSE values.
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
    const bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0));
    if (toBase64(bytes) !== value) throw new Error('COSE signatureValue must use canonical standard base64');
    return bytes;
}

/** Emit all selected document records atomically only after genuine verification. */
export async function finalizeDocumentAttestations(input: DocumentAttestationVerification & {
    signatureBytes: Uint8Array;
}): Promise<VerifiedDocumentAttestations> {
    const captured = captureVerification(input);
    const signatureBytes = new Uint8Array(input.signatureBytes);
    const response = captured.response;
    if (response.authoredSignatures !== undefined) throw new Error('Finalize requires unsigned prepared data');
    validate(response, captured.definition);
    const gesture = commitment(response);
    const signedBytes = canonicalResponseSignedPayloadBytes(response);
    const payloadDigest = await digest(signedBytes);
    const signatureValue = toBase64(signatureBytes);
    const records = gesture.attestations.map((selection, index) => {
        const document = response.resolvedDocuments!.find(entry =>
            entry.documentId === selection.documentRef.documentId
            && entry.locale.toLowerCase() === selection.documentRef.locale.toLowerCase())!;
        const { attestations: _selections, fieldPath: _path, version: _version, ...shared } = gesture;
        const signature: AuthoredSignatureInput = {
            ...shared, ...selection, signatureValue,
            documentId: selection.documentRef.documentId,
            documentHash: document.documentHash, documentHashAlgorithm: 'sha-256',
            ...(document.presentationHash === undefined ? {} : { presentationHash: document.presentationHash }),
            signedPayload: {
                canonicalization: 'formspec-response-signing-v1', digestAlgorithm: 'sha-256',
                digest: payloadDigest, responseId: response.id!, definitionUrl: response.definitionUrl,
                definitionVersion: response.definitionVersion, signedAt: gesture.signedAt,
                signingIntent: gesture.signingIntent,
            },
        };
        return toNormalizedAuthoredSignatureRecord(signature, index, response.id!,
            response.definitionUrl, response.definitionVersion, undefined) as unknown as AuthoredSignature;
    });
    response.authoredSignatures = records as [AuthoredSignature, ...AuthoredSignature[]];
    // All further reads use captured state, including witnesses and copied key bytes.
    return verifyCaptured(captured);
}

/** Verify serialized declared-document evidence and its explicitly retained witnesses. */
export async function verifyDocumentAttestations(input: DocumentAttestationVerification): Promise<VerifiedDocumentAttestations> {
    return verifyCaptured(captureVerification(input));
}

type CapturedVerification = ReturnType<typeof captureVerification>;

async function verifyOne(
    input: DocumentAttestationWitness,
    verifier: Verifier,
    registry: SignatureMethodRegistry,
): Promise<VerifiedDocumentAttestations> {
    validate(input.response, input.definition);
    commitment(input.response); // A legacy signature cannot qualify excluded document/signer metadata.
    const records = input.response.authoredSignatures;
    if (!records?.length) throw new Error('Prepared data has no verified authored records');
    const signedBytes = canonicalResponseSignedPayloadBytes(input.response);
    const payloadDigest = await digest(signedBytes);
    if (records.some(record => record.signedPayload.digest !== payloadDigest)) {
        throw new Error('Signed-payload digest differs from the immutable Response snapshot');
    }
    const signatureBytes = fromBase64(records[0].signatureValue);
    const methodUri = uri(extractMethodUri(signatureBytes, FORMSPEC_SIG_METHOD_URI_PREFIX));
    const receipt = capture(await verifier.verify({ signedBytes, signatureBytes, methodUri, keyRef: input.keyRef }, registry));
    if (receipt.result !== 'verified') throw new Error(`Declared-document signature verification ${receipt.result}`);
    return { response: input.response, records, receipt };
}

function tupleKey(reference: WitnessedSignatureReference): string {
    return JSON.stringify([reference.responseId, reference.signatureId, reference.signedPayloadDigest]);
}

/** Finite verification: each supplied snapshot once, then exact tuple joins, never recursion. */
async function verifyCaptured(input: CapturedVerification): Promise<VerifiedDocumentAttestations> {
    const main = await verifyOne(input, input.verifier, input.registry);
    const witnesses: VerifiedDocumentAttestations[] = [];
    const index = new Map<string, AuthoredSignature>();
    for (const witness of input.witnesses) {
        const verified = await verifyOne(witness, input.verifier, input.registry);
        witnesses.push(verified);
        for (const record of verified.records) {
            const key = tupleKey({ responseId: verified.response.id!, signatureId: record.signatureId,
                signedPayloadDigest: record.signedPayload.digest });
            if (index.has(key)) throw new Error('Duplicate retained witness tuple');
            index.set(key, record);
        }
    }
    for (const verified of [main, ...witnesses]) {
        for (const record of verified.records) {
            if (record.witnessedSignatureRef && !index.has(tupleKey(record.witnessedSignatureRef))) {
                throw new Error('Witness selection does not resolve to one verified committed-document record');
            }
        }
    }
    return main;
}
