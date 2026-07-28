/**
 * @filedesc Browser-side verification of the authored signature over the bundle
 * export. Runs BEFORE anything renders.
 *
 * **Every cryptographic primitive here is shipped substrate, unchanged.** JCS
 * (`canonicalize`), the COSE_Sign1 helpers (`@integrity-stack/cose`), the
 * verifier adapter (`@integrity-stack/signature-adapter-webcrypto`) and the
 * shipped method registry (`formspec/registries/signature-method-registry.json`)
 * are read, not reimplemented. The domain tag is the lifecycle spike's
 * spike-local tag; this file is its second consumer, which is the point — a
 * signature only means something if a party that did not produce it can check
 * it.
 *
 * What is NEW, and what the gap ledger records under `browser-bundle-verification`:
 * the caller. Nothing in the stack loads an export plus its signature in a
 * browser and gates rendering on the verdict. Everything below the primitives
 * is this spike.
 *
 * The method URI is read out of the COSE **protected header**, never out of the
 * JSON record, so a record claiming a method the envelope does not carry cannot
 * pass. Same rule the lifecycle spike's offline check runs on.
 */
import canonicalize from 'canonicalize';
import { decodeCoseSign1WithMethodUri } from '@integrity-stack/cose';
import { WebCryptoVerifier } from '@integrity-stack/signature-adapter-webcrypto';
import {
  keyRefRawPublicKey,
  uri,
  type SignatureMethodRegistry,
} from '@integrity-stack/signature-port';
import methodRegistry from '../../../registries/signature-method-registry.json';
import { INPUT_PATHS, authoredSignature, bundleExport } from './bundle.ts';

/** ADR 0111 domain separation. Minted by the lifecycle spike; spike-local. */
const BUNDLE_EXPORT_DOMAIN = 'formspec.spike-v10.bundle-export.signed-payload.v1';
const DOMAIN_SEPARATOR_BYTE = 0x00;
const METHOD_URI_PREFIX = 'urn:formspec:sig-method:';

export interface VerificationOutcome {
  /** The adapter's verdict, verbatim. Never softened. */
  result: 'verified' | 'failed' | 'unsupported';
  reason?: string;
  /** Recomputed from the export on disk. */
  recomputedDigest: string;
  claimedDigest: string;
  digestMatches: boolean;
  /** Read out of the COSE protected header. */
  methodUriFromEnvelope: string;
  methodRegistryVersion: string;
  adapter: { id: string; version: string };
  signerName: string;
  signerId: string;
  signedAt: string;
  affirmationText: string;
  inputsRead: readonly string[];
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** `domain || NUL || JCS(value)` — RFC 8785 canonical bytes, domain-framed. */
function canonicalBundleBytes(value: unknown): Uint8Array {
  const jcs = canonicalize(value);
  if (jcs === undefined) throw new Error('JCS canonicalization returned undefined');
  const encoder = new TextEncoder();
  const domain = encoder.encode(BUNDLE_EXPORT_DOMAIN);
  const payload = encoder.encode(jcs);
  const out = new Uint8Array(domain.length + 1 + payload.length);
  out.set(domain, 0);
  out[domain.length] = DOMAIN_SEPARATOR_BYTE;
  out.set(payload, domain.length + 1);
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Rebuilds the preimage from the committed export, reconstructs the COSE
 * structure, and hands the bytes to the shipped adapter. No network, no server,
 * no trust in anything the signature record says about itself beyond the bytes
 * it carries.
 */
export async function verifyBundleSignature(
  /**
   * Override the bytes being checked. Exists so the gate is falsifiable: a
   * probe can hand in a one-character-altered export and confirm the app
   * refuses to render it. Defaults to the committed export.
   */
  exportUnderCheck: unknown = bundleExport,
): Promise<VerificationOutcome> {
  const record = authoredSignature.record as {
    signatureValue: string;
    signerName: string;
    signerId: string;
    affirmationText: string;
    signedPayload: { digest: string; signedAt: string };
  };

  const preimage = canonicalBundleBytes(exportUnderCheck);
  const recomputedDigest = await sha256Hex(preimage);
  const claimedDigest = record.signedPayload.digest;

  const envelope = base64ToBytes(record.signatureValue);
  const methodUriFromEnvelope = decodeCoseSign1WithMethodUri(envelope, METHOD_URI_PREFIX).methodUri;

  const verifier = new WebCryptoVerifier({ methodUriPrefix: METHOD_URI_PREFIX });
  const receipt = await verifier.verify(
    {
      signedBytes: preimage,
      signatureBytes: envelope,
      methodUri: uri(methodUriFromEnvelope),
      keyRef: keyRefRawPublicKey(base64ToBytes(authoredSignature.publicKeyBase64)),
    },
    methodRegistry as unknown as SignatureMethodRegistry,
  );

  return {
    result: receipt.result,
    ...(receipt.reason !== undefined ? { reason: receipt.reason } : {}),
    recomputedDigest,
    claimedDigest,
    digestMatches: recomputedDigest === claimedDigest,
    methodUriFromEnvelope,
    methodRegistryVersion: String(receipt.methodRegistryVersion),
    adapter: { id: String(receipt.adapter.id), version: String(receipt.adapter.version) },
    signerName: record.signerName,
    signerId: record.signerId,
    signedAt: record.signedPayload.signedAt,
    affirmationText: record.affirmationText,
    inputsRead: [INPUT_PATHS.bundle, INPUT_PATHS.signature, INPUT_PATHS.methodRegistry],
  };
}

/** True only when the crypto verdict AND the digest agree. Both, or neither. */
export function isTrustworthy(outcome: VerificationOutcome): boolean {
  return outcome.result === 'verified' && outcome.digestMatches;
}
