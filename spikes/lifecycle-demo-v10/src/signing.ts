/**
 * @filedesc Stage 4/5 — a Formspec-native authored signature over the bundle
 * export, and its offline verification.
 *
 * **Everything cryptographic here is shipped substrate.** JCS canonicalization
 * (`canonicalize`, the same package `studio-core` uses for trace digests), the
 * COSE_Sign1 byte helpers (`@integrity-stack/cose`), the verifier adapter
 * (`@integrity-stack/signature-adapter-webcrypto`), and the method registry
 * (`formspec/registries/signature-method-registry.json`) are all read, not
 * reimplemented. The only thing the spike supplies is a dev key and a domain
 * tag — see the recorded choice below.
 *
 * ## The recorded choice (spike doc §Bar 2)
 *
 * ADR 0083 is `Accepted` and owns `Response.authoredSignatures`.
 * `formspec/specs/core/spec.md` §2.1.N pins the preimage as
 * `formspec.response.signed-payload.v1 || 0x00 || JCS(response_without_authoredSignatures)`
 * with method `urn:formspec:sig-method:ed25519-cose-sign1@1`.
 *
 * That profile signs a **Response** — a filled instance. This demo signs a
 * **bundle export**, which no shipped canonicalization profile covers, and
 * ADR 0111 forbids reusing a domain tag across domains. So the spike keeps every
 * primitive and mints ONE spike-local domain tag:
 *
 *     formspec.spike-v10.bundle-export.signed-payload.v1 || 0x00 || JCS(export)
 *
 * The resulting record conforms to `response.schema.json` `$defs/AuthoredSignature`
 * and is Ajv-validated against it. **The domain tag is spike-local and is not a
 * promotion candidate**; a real bundle-signing profile is a spec change.
 *
 * ## Why detached
 *
 * The COSE envelope carries `payload = null` (ADR 0109 consumer detached shape,
 * `detachedSignatureProtectedHeader`). The payload is the exported bundle, which
 * is already committed as its own evidence file. A detached signature makes the
 * offline check mean what bar 2 asks: the verifier must rebuild the preimage
 * from the export on disk, so a tampered export cannot verify against a
 * signature that carries its own copy of the original bytes.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import canonicalize from 'canonicalize';
import {
  decodeCoseSign1WithMethodUri,
  detachedSignatureProtectedHeader,
  deriveKid,
  encodeCoseSign1,
  sigStructureBytes,
} from '@integrity-stack/cose';
import { WebCryptoVerifier } from '@integrity-stack/signature-adapter-webcrypto';
import { keyRefRawPublicKey, uri, type SignatureMethodRegistry } from '@integrity-stack/signature-port';
import { SPIKE_ROOT } from './harness.js';

/** ADR 0111 domain separation. Spike-local; see the file docstring. */
export const BUNDLE_EXPORT_DOMAIN = 'formspec.spike-v10.bundle-export.signed-payload.v1';
export const DOMAIN_SEPARATOR_BYTE = 0x00;
export const SIG_METHOD_URI = 'urn:formspec:sig-method:ed25519-cose-sign1@1';
export const CANONICALIZATION_ID = 'formspec-spike-v10-bundle-export-signing-v1';
export const COSE_ALG_EDDSA = -8;
export const SUITE_ID = 1;

/** The shipped registry — read, never inlined, so a registry edit breaks this. */
export function signatureMethodRegistry(): SignatureMethodRegistry {
  const path = resolve(SPIKE_ROOT, '..', '..', 'registries', 'signature-method-registry.json');
  return JSON.parse(readFileSync(path, 'utf8')) as SignatureMethodRegistry;
}

/** RFC 8785 JCS bytes, framed `domain || NUL || JCS(value)`. */
export function canonicalBundleBytes(value: unknown): Uint8Array {
  const jcs = canonicalize(value);
  if (jcs === undefined) throw new Error('JCS canonicalization returned undefined');
  const domain = new TextEncoder().encode(BUNDLE_EXPORT_DOMAIN);
  const payload = new TextEncoder().encode(jcs);
  const out = new Uint8Array(domain.length + 1 + payload.length);
  out.set(domain, 0);
  out[domain.length] = DOMAIN_SEPARATOR_BYTE;
  out.set(payload, domain.length + 1);
  return out;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes as BufferSource));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function fromBase64(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'base64'));
}

export interface DevKeyPair {
  privateKey: CryptoKey;
  publicKeyRaw: Uint8Array;
  kid: Uint8Array;
}

/**
 * A dev key, generated per run. Nothing in this spike is a production key
 * ceremony; the key exists so the signature can be produced and checked, and
 * the public half is committed with the evidence so the offline verification is
 * reproducible from the evidence set alone.
 */
export async function generateDevKey(): Promise<DevKeyPair> {
  const pair = (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const publicKeyRaw = new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey));
  const kid = await deriveKid(SUITE_ID, publicKeyRaw);
  return { privateKey: pair.privateKey, publicKeyRaw, kid };
}

/** The `AuthoredSignature` record plus the wire bytes that back it. */
export interface SignOutcome {
  /** Conforms to `response.schema.json` `$defs/AuthoredSignature`. */
  record: Record<string, unknown>;
  /** Detached COSE_Sign1 envelope, base64. */
  coseSign1Base64: string;
  /** Public key, base64 — committed so verification needs no live process. */
  publicKeyBase64: string;
  kidBase64: string;
  /** SHA-256 of the framed canonical preimage, hex. */
  digest: string;
}

export interface SignInput {
  /** The `exportBundle()` result, verbatim. */
  bundleExport: unknown;
  bundleId: string;
  /** `AuthoredSignature.documentId` — pattern `^[a-zA-Z][a-zA-Z0-9_-]*$`, so not a URL. */
  documentId: string;
  signerId: string;
  signerName: string;
  signedAt: string;
  affirmationText: string;
  ceremonyId: string;
}

/**
 * Signs the canonical bundle export. Produces the COSE envelope AND the
 * schema-shaped `AuthoredSignature` record; the two carry the same digest, and
 * bar 2's offline check recomputes both from the committed export.
 */
export async function signBundleExport(input: SignInput, key: DevKeyPair): Promise<SignOutcome> {
  const preimage = canonicalBundleBytes(input.bundleExport);
  const digest = await sha256Hex(preimage);

  const protectedHeader = detachedSignatureProtectedHeader(COSE_ALG_EDDSA, key.kid, SIG_METHOD_URI);
  const toBeSigned = sigStructureBytes(protectedHeader, preimage);
  const signature = new Uint8Array(
    await webcrypto.subtle.sign({ name: 'Ed25519' }, key.privateKey, toBeSigned as BufferSource),
  );
  const envelope = encodeCoseSign1(protectedHeader, null, signature);

  const record: Record<string, unknown> = {
    signatureId: `sig-lifecycle-v10-${input.ceremonyId}`,
    documentId: input.documentId,
    signingIntent: 'urn:formspec:spike-v10:signing-intent:release-sign-off:v1',
    signatureValue: toBase64(envelope),
    signerId: input.signerId,
    signerName: input.signerName,
    consentAccepted: true,
    consentTextRef: 'urn:formspec:spike-v10:consent:release-sign-off:v1',
    consentVersion: '1.0.0',
    affirmationText: input.affirmationText,
    signedPayload: {
      canonicalization: CANONICALIZATION_ID,
      digestAlgorithm: 'sha-256',
      digest,
      responseId: input.bundleId,
      definitionUrl: input.bundleId,
      definitionVersion: '1.0.0',
      signedAt: input.signedAt,
      signingIntent: 'urn:formspec:spike-v10:signing-intent:release-sign-off:v1',
    },
    documentHash: digest,
    documentHashAlgorithm: 'sha-256',
    signatureProvider: 'urn:formspec:spike-v10:signature:provider:in-repo-ed25519',
    ceremonyId: input.ceremonyId,
  };

  return {
    record,
    coseSign1Base64: toBase64(envelope),
    publicKeyBase64: toBase64(key.publicKeyRaw),
    kidBase64: toBase64(key.kid),
    digest,
  };
}

export interface OfflineVerifyResult {
  /** The verifier adapter's own verdict. */
  result: 'verified' | 'failed' | 'unsupported';
  /** The adapter's sanitized diagnostic, present only on non-`verified` verdicts. */
  reason?: string;
  /** Recomputed digest of the export on disk. */
  recomputedDigest: string;
  /** Whether that digest equals the one the signature record claims. */
  digestMatches: boolean;
  /** The method URI read out of the COSE protected header, not the record. */
  methodUriFromEnvelope: string;
  /** The shipped registry version the verdict was reached under. */
  methodRegistryVersion: string;
  adapter: { id: string; version: string };
  /** Every input this check read. Named so "offline" is checkable, not claimed. */
  inputsRead: string[];
}

/**
 * The offline check bar 2 turns on.
 *
 * Reads ONLY plain values — the exported bundle, the signature record, the
 * committed public key. No kernel, no MCP, no live signing state. It
 * recanonicalizes the export from scratch, reconstructs the COSE
 * `Sig_structure`, and hands the bytes to the shipped WebCrypto adapter with the
 * shipped method registry.
 *
 * The method URI is read out of the **protected header**, not out of the JSON
 * record, so a record claiming a method the envelope does not carry cannot pass.
 */
export async function verifyOffline(args: {
  bundleExport: unknown;
  signatureRecord: Record<string, unknown>;
  publicKeyBase64: string;
  inputsRead: string[];
}): Promise<OfflineVerifyResult> {
  const preimage = canonicalBundleBytes(args.bundleExport);
  const recomputedDigest = await sha256Hex(preimage);
  const claimedDigest = (args.signatureRecord.signedPayload as { digest?: string } | undefined)?.digest ?? '';

  const envelope = fromBase64(String(args.signatureRecord.signatureValue));
  // The method URI comes out of the COSE protected header, never out of the JSON
  // record: a record claiming a method the envelope does not carry must not pass.
  const methodUriFromEnvelope = decodeCoseSign1WithMethodUri(envelope, 'urn:formspec:sig-method:').methodUri;

  // The adapter's own contract (`verifyEd25519`): `signatureBytes` is the whole
  // COSE_Sign1 envelope and `signedBytes` is the DETACHED payload. The adapter
  // rebuilds the `Sig_structure` itself from the envelope's protected-header
  // bytes — which is the point of using it rather than hand-rolling the check.
  const registry = signatureMethodRegistry();
  const verifier = new WebCryptoVerifier({ methodUriPrefix: 'urn:formspec:sig-method:' });
  const receipt = await verifier.verify(
    {
      signedBytes: preimage,
      signatureBytes: envelope,
      methodUri: uri(methodUriFromEnvelope),
      keyRef: keyRefRawPublicKey(fromBase64(args.publicKeyBase64)),
    },
    registry,
  );

  return {
    result: receipt.result,
    ...(receipt.reason !== undefined ? { reason: receipt.reason } : {}),
    recomputedDigest,
    digestMatches: recomputedDigest === claimedDigest,
    methodUriFromEnvelope,
    methodRegistryVersion: String(receipt.methodRegistryVersion),
    adapter: { id: String(receipt.adapter.id), version: String(receipt.adapter.version) },
    inputsRead: args.inputsRead,
  };
}
