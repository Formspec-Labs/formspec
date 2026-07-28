/**
 * @filedesc The signed bundle export, read in place and indexed for rendering.
 *
 * **Nothing here is copied.** The two evidence files are imported `?raw` from
 * the lifecycle spike's own directory, so the bytes the browser parses,
 * canonicalizes, and verifies are the bytes committed there. That matters for
 * bar R1: if the shell held its own copy, "zero hand-copied content" would be
 * a claim about discipline rather than a fact about the build.
 *
 * The manifest indirects everything through URLs. `documents` holds each
 * artifact keyed by that URL. This module does the dereferencing, and does it
 * strictly: a missing document throws rather than degrading, because a shell
 * that renders half a bundle is worse than one that refuses.
 */
import bundleRaw from '../../lifecycle-demo-v10/evidence/stage-4-signoff.bundle-export.json?raw';
import signatureRaw from '../../lifecycle-demo-v10/evidence/stage-4-signoff.authored-signature.json?raw';
import type {
  ExperienceDocument,
  FormDefinition,
  RegistryDocument,
  SurfaceDocument,
  ThemeDocument,
} from '@formspec-org/types';

/** Where each input came from. Surfaced in the UI so "read in place" is checkable. */
export const INPUT_PATHS = {
  bundle: 'formspec/spikes/lifecycle-demo-v10/evidence/stage-4-signoff.bundle-export.json',
  signature: 'formspec/spikes/lifecycle-demo-v10/evidence/stage-4-signoff.authored-signature.json',
  methodRegistry: 'formspec/registries/signature-method-registry.json',
} as const;

interface ArtifactRef {
  url: string;
  version?: string;
}

export interface BundleManifest {
  $formspecBundle: string;
  version: string;
  id: string;
  title: string;
  definitions: ArtifactRef[];
  experience?: { url: string };
  theme?: ArtifactRef;
  registries?: ArtifactRef[];
  surfaces: ArtifactRef[];
  modules?: { id: string; version: string }[];
  sessions?: unknown[];
}

export interface BundleExport {
  manifest: BundleManifest;
  documents: Record<string, unknown>;
}

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

function document<T>(url: string, what: string): T {
  const found = bundleExport.documents[url];
  if (found === undefined) {
    throw new Error(`Bundle export is missing its ${what}: no document at ${url}`);
  }
  return found as T;
}

/** Both Surfaces in manifest order — respondent first, then staff. */
export const surfaces: SurfaceDocument[] = bundleExport.manifest.surfaces.map((ref) =>
  document<SurfaceDocument>(ref.url, `Surface ${ref.url}`),
);

export const experience: ExperienceDocument | undefined = bundleExport.manifest.experience
  ? document<ExperienceDocument>(bundleExport.manifest.experience.url, 'Experience')
  : undefined;

/** The TENANT theme. Which routes may see it is decided in `theme-grant.ts`. */
export const tenantTheme: ThemeDocument | undefined = bundleExport.manifest.theme
  ? document<ThemeDocument>(bundleExport.manifest.theme.url, 'Theme')
  : undefined;

export const registries: RegistryDocument[] = (bundleExport.manifest.registries ?? []).map((ref) =>
  document<RegistryDocument>(ref.url, `Registry ${ref.url}`),
);

export function definitionByRef(definitionRef: string): FormDefinition {
  return document<FormDefinition>(definitionRef, `Definition ${definitionRef}`);
}

/** Registry entry for a widget name, if the bundle declares one. */
export function widgetRegistryEntry(widgetName: string): Record<string, unknown> | undefined {
  for (const registry of registries) {
    const entry = (registry.entries as { name?: string; category?: string }[] | undefined)?.find(
      (candidate) => candidate.name === widgetName && candidate.category === 'widget',
    );
    if (entry) return entry as Record<string, unknown>;
  }
  return undefined;
}

export type ExperienceUnit = NonNullable<ExperienceDocument['units']>[number];

/** Experience unit by id, for `experience-unit` slots. */
export function experienceUnit(unitRef: string): ExperienceUnit | undefined {
  return experience?.units?.find((unit) => unit.id === unitRef);
}
