/**
 * @filedesc Raw signed-export inputs owned by the spike host.
 *
 * Nothing here imports shell core or a binding. The host must read and parse
 * these exact bytes to build the signature preimage, but it does not admit
 * their contents to shell code until verification succeeds.
 */
import bundleRaw from '../../lifecycle-demo-v10/evidence/stage-4-signoff.bundle-export.json?raw';
import signatureRaw from '../../lifecycle-demo-v10/evidence/stage-4-signoff.authored-signature.json?raw';
import type { BundleExport } from '@formspec-org/surface';

/** Where each input came from. Surfaced in the UI so "read in place" is checkable. */
export const INPUT_PATHS = {
  bundle: 'formspec/spikes/lifecycle-demo-v10/evidence/stage-4-signoff.bundle-export.json',
  signature: 'formspec/spikes/lifecycle-demo-v10/evidence/stage-4-signoff.authored-signature.json',
  methodRegistry: 'formspec/registries/signature-method-registry.json',
} as const;

export interface AuthoredSignatureFile {
  record: Record<string, unknown>;
  coseSign1Base64: string;
  publicKeyBase64: string;
  kidBase64: string;
  schemaValid: boolean;
  schemaIssues?: { code: string; message: string; path: string }[];
}

/** Parsed only so the host can canonicalize and verify the committed bytes. */
export const bundleExport = JSON.parse(bundleRaw) as BundleExport;
export const authoredSignature = JSON.parse(signatureRaw) as AuthoredSignatureFile;
