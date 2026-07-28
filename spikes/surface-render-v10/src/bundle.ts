/**
 * @filedesc The signed bundle export, read in place and dereferenced.
 *
 * **Nothing here is copied.** The two evidence files are imported `?raw` from
 * the lifecycle spike's own directory, so the bytes the browser parses,
 * canonicalizes, and verifies are the bytes committed there. That matters for
 * bar R1: if the shell held its own copy, "zero hand-copied content" would be a
 * claim about discipline rather than a fact about the build.
 *
 * **The dereferencing is no longer here.** Walking `manifest.definitions /
 * experience / theme / registries / responseActions / surfaces`, looking each
 * `url` up in `documents` and reporting what is absent is
 * `dereferenceBundleExport` in `@formspec-org/surface` — gap ledger
 * `bundle-manifest-dereference`, resolved. What is left is the spike-specific
 * part: which two files on disk are read, and the raw text the signature check
 * needs.
 */
import bundleRaw from '../../lifecycle-demo-v10/evidence/stage-4-signoff.bundle-export.json?raw';
import signatureRaw from '../../lifecycle-demo-v10/evidence/stage-4-signoff.authored-signature.json?raw';
import { dereferenceBundleExport, type BundleExport } from '@formspec-org/surface';

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

/** The parsed export, exactly as committed. Also the verification preimage source. */
export const bundleExport = JSON.parse(bundleRaw) as BundleExport;
export const authoredSignature = JSON.parse(signatureRaw) as AuthoredSignatureFile;

/**
 * Every artifact the manifest names, typed, plus a diagnostic for anything it
 * names and does not carry.
 *
 * `tenantTheme` lives on this object and is read by exactly one thing —
 * `createThemeAuthority`, constructed once in `app.tsx`. Nothing else in the app
 * touches it, which is what makes bar R3 structural rather than careful.
 */
export const resolvedBundle = dereferenceBundleExport(bundleExport);
