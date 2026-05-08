/** @filedesc Response envelope, validation report, changelog migration, and pinned-definition resolution. */

import type { FormDefinition } from '@formspec-org/types';
import type { ValidationReport, ValidationResult } from '@formspec-org/types';
import type { EvalResult } from '../diff.js';
import type {
    AuthoredSignatureIdentityBinding,
    AuthoredSignatureInput,
    AuthoredSignatureSignedPayload,
    PinnedResponseReference,
} from '../interfaces.js';
import { wasmApplyMigrationsToResponseData } from '../wasm-bridge-runtime.js';
import { toValidationResult } from './helpers.js';
import type { EvalShapeTiming } from './wasm-fel.js';

function resolveResponseId(
    explicitId: string | undefined,
    authoredSignatures: AuthoredSignatureInput[] | undefined,
): string | undefined {
    if (explicitId) {
        return explicitId;
    }
    if (!authoredSignatures || authoredSignatures.length === 0) {
        return undefined;
    }
    const responseIds = new Set(
        authoredSignatures
            .map((signature) => signature.signedPayload?.responseId)
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    );
    if (responseIds.size === 0) {
        throw new Error(
            'authoredSignatures require meta.id on getResponse(), or a single agreed non-empty signedPayload.responseId among signature records',
        );
    }
    if (responseIds.size > 1) {
        throw new Error('authoredSignatures must agree on a single signedPayload.responseId');
    }
    return [...responseIds][0];
}

function pickIdentityBinding(
    binding: AuthoredSignatureIdentityBinding | undefined,
): Record<string, unknown> | undefined {
    if (!binding) {
        return undefined;
    }
    const out: Record<string, unknown> = {
        method: binding.method,
        assuranceLevel: binding.assuranceLevel,
    };
    if (binding.providerRef !== undefined) {
        out.providerRef = binding.providerRef;
    }
    if (binding.externalAttestationRef !== undefined) {
        out.externalAttestationRef = binding.externalAttestationRef;
    }
    return out;
}

function requireNonEmptyString(value: string | undefined, label: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${label} is required`);
    }
    return value;
}

function normalizeSignedPayload(
    signature: AuthoredSignatureInput,
    index: number,
    responseId: string,
    definitionUrl: string,
    definitionVersion: string,
): AuthoredSignatureSignedPayload {
    const signedPayload = signature.signedPayload;
    if (!signedPayload) {
        throw new Error(`authoredSignatures[${index}].signedPayload is required`);
    }
    if (signedPayload.canonicalization !== 'formspec-response-signing-v1') {
        throw new Error(
            `authoredSignatures[${index}].signedPayload.canonicalization must be formspec-response-signing-v1`,
        );
    }
    requireNonEmptyString(
        signedPayload.digestAlgorithm,
        `authoredSignatures[${index}].signedPayload.digestAlgorithm`,
    );
    requireNonEmptyString(
        signedPayload.digest,
        `authoredSignatures[${index}].signedPayload.digest`,
    );
    if (signedPayload.responseId !== responseId) {
        throw new Error(
            `SIGNED_PAYLOAD_RESPONSE_ID_MISMATCH: authoredSignatures[${index}].signedPayload.responseId must match the Response id`,
        );
    }
    if (signedPayload.definitionUrl !== definitionUrl) {
        throw new Error(
            `SIGNED_PAYLOAD_DEFINITION_URL_MISMATCH: authoredSignatures[${index}].signedPayload.definitionUrl must match the Response definitionUrl`,
        );
    }
    if (signedPayload.definitionVersion !== definitionVersion) {
        throw new Error(
            `SIGNED_PAYLOAD_DEFINITION_VERSION_MISMATCH: authoredSignatures[${index}].signedPayload.definitionVersion must match the Response definitionVersion`,
        );
    }
    if (signedPayload.signingIntent !== signature.signingIntent) {
        throw new Error(
            `SIGNED_PAYLOAD_SIGNING_INTENT_MISMATCH: authoredSignatures[${index}].signedPayload.signingIntent must match the authored signature signingIntent`,
        );
    }
    if (signedPayload.signedAt !== signature.signedAt) {
        throw new Error(
            `SIGNED_PAYLOAD_SIGNED_AT_MISMATCH: authoredSignatures[${index}].signedPayload.signedAt must match the authored signature signedAt input`,
        );
    }
    return {
        canonicalization: signedPayload.canonicalization,
        digestAlgorithm: signedPayload.digestAlgorithm,
        digest: signedPayload.digest,
        responseId: signedPayload.responseId,
        definitionUrl: signedPayload.definitionUrl,
        definitionVersion: signedPayload.definitionVersion,
        signedAt: signedPayload.signedAt,
        signingIntent: signedPayload.signingIntent,
    };
}

/** Emit only JSON-Schema–declared AuthoredSignature properties (additionalProperties: false). */
function toNormalizedAuthoredSignatureRecord(
    signature: AuthoredSignatureInput,
    index: number,
    responseId: string,
    definitionUrl: string,
    definitionVersion: string,
    meta: { author?: { id: string; name?: string } } | undefined,
): Record<string, unknown> {
    const signerName = signature.signerName ?? meta?.author?.name;
    if (!signerName || !signerName.trim()) {
        throw new Error(`authoredSignatures[${index}] requires signerName or meta.author.name`);
    }
    const signatureId = requireNonEmptyString(
        signature.signatureId,
        `authoredSignatures[${index}].signatureId`,
    );
    const signingIntent = requireNonEmptyString(
        signature.signingIntent,
        `authoredSignatures[${index}].signingIntent`,
    );
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(signingIntent)) {
        throw new Error(
            `SIGNED_PAYLOAD_SIGNING_INTENT_MISSING: authoredSignatures[${index}].signingIntent must be a valid URI`,
        );
    }
    if (
        typeof signature.signedAt !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(signature.signedAt)
    ) {
        throw new Error(
            `SIGNED_PAYLOAD_SIGNED_AT_INVALID: authoredSignatures[${index}].signedAt must be a valid RFC 3339 timestamp`,
        );
    }
    const signedPayload = normalizeSignedPayload(
        signature,
        index,
        responseId,
        definitionUrl,
        definitionVersion,
    );
    const signerId = signature.signerId ?? meta?.author?.id;

    const record: Record<string, unknown> = {
        signatureId,
        documentId: signature.documentId,
        signingIntent,
        signatureValue: signature.signatureValue,
        signatureMethod: signature.signatureMethod,
        signerName: signerName.trim(),
        consentAccepted: signature.consentAccepted,
        consentTextRef: signature.consentTextRef,
        consentVersion: signature.consentVersion,
        affirmationText: signature.affirmationText,
        signedPayload,
        documentHash: signature.documentHash,
        documentHashAlgorithm: signature.documentHashAlgorithm,
        signatureProvider: signature.signatureProvider,
        ceremonyId: signature.ceremonyId,
    };
    if (signerId !== undefined) {
        record.signerId = signerId;
    }
    if (signature.identityProofRef !== undefined) {
        record.identityProofRef = signature.identityProofRef;
    }
    const identityBinding = pickIdentityBinding(signature.identityBinding);
    if (identityBinding) {
        record.identityBinding = identityBinding;
    }
    return record;
}

function prepareAuthoredSignaturesSection(meta: {
    id?: string;
    author?: { id: string; name?: string };
    subject?: { id: string; type?: string };
    authoredSignatures?: AuthoredSignatureInput[];
} | undefined, responsePins: {
    definitionUrl: string;
    definitionVersion: string;
}): {
    authoredSignatures: Record<string, unknown>[] | undefined;
    envelopeResponseId: string | undefined;
} {
    const signatures = meta?.authoredSignatures;
    if (!signatures || signatures.length === 0) {
        return { authoredSignatures: undefined, envelopeResponseId: meta?.id };
    }
    const responseId = resolveResponseId(meta?.id, signatures);
    if (!responseId) {
        throw new Error('authoredSignatures require a stable response id');
    }
    const normalized = signatures.map((sig, i) =>
        toNormalizedAuthoredSignatureRecord(
            sig,
            i,
            responseId,
            responsePins.definitionUrl,
            responsePins.definitionVersion,
            meta,
        ),
    );
    return { authoredSignatures: normalized, envelopeResponseId: responseId };
}

export function buildFormspecResponseEnvelope(options: {
    definition: FormDefinition;
    data: Record<string, unknown>;
    report: ValidationReport;
    timestamp: string;
    meta?: {
        id?: string;
        author?: { id: string; name?: string };
        subject?: { id: string; type?: string };
        authoredSignatures?: AuthoredSignatureInput[];
    };
}): Record<string, unknown> {
    const definitionUrl = options.definition.url ?? 'http://example.org/form';
    const definitionVersion = options.definition.version ?? '1.0.0';
    const { authoredSignatures, envelopeResponseId } = prepareAuthoredSignaturesSection(options.meta, {
        definitionUrl,
        definitionVersion,
    });
    const response: Record<string, unknown> = {
        $formspecResponse: '1.0',
        definitionUrl,
        definitionVersion,
        status: options.report.valid ? 'completed' : 'in-progress',
        data: options.data,
        validationResults: options.report.results,
        authored: options.timestamp,
    };

    if (envelopeResponseId) {
        response.id = envelopeResponseId;
    }
    if (options.meta?.author) {
        response.author = options.meta.author;
    }
    if (options.meta?.subject) {
        response.subject = options.meta.subject;
    }
    if (authoredSignatures) {
        response.authoredSignatures = authoredSignatures;
    }

    return response;
}

/** Shape validations that only run on submit, from a WASM eval with `trigger: 'submit'`. */
export function collectSubmitModeShapeValidationResults(
    submitEval: EvalResult,
    shapeTiming: Map<string, EvalShapeTiming>,
): ValidationResult[] {
    const results: ValidationResult[] = [];
    for (const validation of submitEval.validations) {
        if (!validation.shapeId) {
            continue;
        }
        if ((shapeTiming.get(validation.shapeId) ?? 'continuous') === 'submit') {
            results.push(toValidationResult(validation));
        }
    }
    return results;
}

/** Strip optional cardinality `source`, compute counts, and wrap the spec envelope. */
export function buildValidationReportEnvelope(
    results: ValidationResult[],
    timestamp: string,
): ValidationReport {
    const finalResults = results.map((result) => {
        if (result.constraintKind === 'cardinality') {
            const { source: _source, ...rest } = result as ValidationResult & { source?: string };
            return rest as ValidationResult;
        }
        return result;
    });

    const counts = { error: 0, warning: 0, info: 0 };
    for (const result of finalResults) {
        counts[result.severity as keyof typeof counts] += 1;
    }

    return {
        $formspecValidationReport: '1.0',
        valid: counts.error === 0,
        results: finalResults,
        counts,
        timestamp,
    };
}

export function migrateResponseData(
    definition: FormDefinition,
    responseData: Record<string, any>,
    fromVersion: string,
    options: { nowIso: string },
): Record<string, any> {
    if (!Array.isArray(definition.migrations)) {
        return responseData;
    }
    return JSON.parse(
        wasmApplyMigrationsToResponseData(
            JSON.stringify(definition),
            JSON.stringify(responseData),
            fromVersion,
            options.nowIso,
        ),
    ) as Record<string, any>;
}

export function resolvePinnedDefinition<T extends { url?: string; version?: string }>(
    response: PinnedResponseReference,
    definitions: T[],
): T {
    const exact = definitions.find(
        (definition) =>
            definition.url === response.definitionUrl
            && definition.version === response.definitionVersion,
    );
    if (exact) {
        return exact;
    }

    const availableVersions = definitions
        .filter((definition) => definition.url === response.definitionUrl)
        .map((definition) => definition.version)
        .filter((version): version is string => typeof version === 'string')
        .sort();

    let message = `No definition found for pinned response ${response.definitionUrl}@${response.definitionVersion}`;
    if (availableVersions.length > 0) {
        message += `; available versions: ${availableVersions.join(', ')}`;
    }
    throw new Error(message);
}
