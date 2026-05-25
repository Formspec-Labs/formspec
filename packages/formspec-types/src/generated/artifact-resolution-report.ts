/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * This interface was referenced by `ArtifactResolutionReport`'s JSON-Schema
 * via the `definition` "ArtifactResolutionHandleStatus".
 */
export type ArtifactResolutionHandleStatus =
  | ('loaded' | 'missing' | 'unsupported' | 'invalid-discriminator')
  | `x-${string}`;
/**
 * This interface was referenced by `ArtifactResolutionReport`'s JSON-Schema
 * via the `definition` "ArtifactResolutionSeverity".
 */
export type ArtifactResolutionSeverity = 'error' | 'warning' | 'info';
/**
 * This interface was referenced by `ArtifactResolutionReport`'s JSON-Schema
 * via the `definition` "ArtifactResolutionPhase".
 */
export type ArtifactResolutionPhase = 'artifact-resolution';
/**
 * This interface was referenced by `ArtifactResolutionReport`'s JSON-Schema
 * via the `definition` "ArtifactResolutionOrigin".
 */
export type ArtifactResolutionOrigin = 'artifact-resolver';
/**
 * This interface was referenced by `ArtifactResolutionReport`'s JSON-Schema
 * via the `definition` "ArtifactResolutionPhaseStatusValue".
 */
export type ArtifactResolutionPhaseStatusValue = 'completed' | 'skipped' | 'not-run';

/**
 * Deterministic ArtifactResolver output for the artifact-resolution phase. This schema covers resolved manifest and sibling artifact handles, resolver diagnostics, phase status, and summary counts. It is a data contract only: it does not schema resolver requests, source artifact payloads, loader implementations, runtime fetch/cache policy, rendered output, credentials, or local fixture paths.
 */
export interface ArtifactResolutionReport {
  /**
   * true only when the report contains no error-severity artifact-resolution diagnostics. JSON Schema cannot derive this from diagnostics; report producers enforce the invariant.
   */
  ok: boolean;
  manifest: ArtifactResolutionHandle;
  artifacts: ArtifactResolutionArtifacts;
  /**
   * Resolver diagnostics normalized to origin artifact-resolver and phase artifact-resolution.
   */
  diagnostics: ArtifactResolutionDiagnostic[];
  summary: ArtifactResolutionSummary;
  phase: ArtifactResolutionPhaseStatus;
}
/**
 * This interface was referenced by `ArtifactResolutionReport`'s JSON-Schema
 * via the `definition` "ArtifactResolutionHandle".
 */
export interface ArtifactResolutionHandle {
  slot: string;
  artifactKind: string;
  status: ArtifactResolutionHandleStatus;
  ref?: ArtifactResolutionRef;
  schemaId?: string;
  /**
   * Opaque loaded source document. ArtifactResolutionReport preserves this only as data evidence and does not validate artifact-specific payload schemas here.
   */
  document?: unknown;
  identity?: ArtifactResolutionIdentity;
  /**
   * Host source label for diagnostics only. It MUST NOT become identity authority.
   */
  source?: string;
  digest?: string;
  diagnostics?: ArtifactResolutionDiagnostic[];
}
/**
 * App Manifest sibling reference evidence. The resolver preserves url/version plus slot-specific handle or locale evidence. Only x-* extension keys may extend this shape; local paths, fixture names, and path-derived identity flags are intentionally rejected.
 *
 * This interface was referenced by `ArtifactResolutionReport`'s JSON-Schema
 * via the `definition` "ArtifactResolutionRef".
 */
export interface ArtifactResolutionRef {
  url?: string;
  version?: string;
  /**
   * ComponentRef or MappingRef membership handle evidence supplied by the App Manifest.
   */
  handle?: string;
  /**
   * LocaleRef locale tag evidence supplied by the App Manifest.
   */
  locale?: string;
  /**
   * This interface was referenced by `ArtifactResolutionRef`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * Artifact-owned identity evidence extracted from loaded documents when the artifact family defines one. This evidence does not override App Manifest sibling ref identity.
 *
 * This interface was referenced by `ArtifactResolutionReport`'s JSON-Schema
 * via the `definition` "ArtifactResolutionIdentity".
 */
export interface ArtifactResolutionIdentity {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `ArtifactResolutionReport`'s JSON-Schema
 * via the `definition` "ArtifactResolutionDiagnostic".
 */
export interface ArtifactResolutionDiagnostic {
  /**
   * Stable machine-readable artifact-resolution diagnostic code.
   */
  code: string;
  severity: ArtifactResolutionSeverity;
  phase: ArtifactResolutionPhase;
  origin: ArtifactResolutionOrigin;
  message: string;
  primarySource?: ArtifactResolutionSourcePointer;
  relatedSources?: ArtifactResolutionSourcePointer[];
  /**
   * Stable machine-readable diagnostic details. Details MUST NOT contain executable code, credentials, fetched payloads, rendered output, or local fixture-path identity.
   */
  details?: {
    [k: string]: unknown;
  };
}
/**
 * Diagnostic pointer to source evidence. The source string is for reporting only; local paths, filenames, fixture names, and URL suffixes are not production identity.
 *
 * This interface was referenced by `ArtifactResolutionReport`'s JSON-Schema
 * via the `definition` "ArtifactResolutionSourcePointer".
 */
export interface ArtifactResolutionSourcePointer {
  artifactSlot?: string;
  artifactKind?: string;
  source?: string;
  jsonPointer?: string;
  ref?: ArtifactResolutionRef;
}
/**
 * Resolved artifact handles grouped by App Manifest member name. No spike-only or fixture-local groups are allowed.
 *
 * This interface was referenced by `ArtifactResolutionReport`'s JSON-Schema
 * via the `definition` "ArtifactResolutionArtifacts".
 */
export interface ArtifactResolutionArtifacts {
  definitions?: ArtifactResolutionHandle[];
  experience?: ArtifactResolutionHandle[];
  responseActions?: ArtifactResolutionHandle[];
  component?: ArtifactResolutionHandle[];
  components?: ArtifactResolutionHandle[];
  theme?: ArtifactResolutionHandle[];
  references?: ArtifactResolutionHandle[];
  ontology?: ArtifactResolutionHandle[];
  registries?: ArtifactResolutionHandle[];
  surfaces?: ArtifactResolutionHandle[];
  dataSources?: ArtifactResolutionHandle[];
  locales?: ArtifactResolutionHandle[];
  mappings?: ArtifactResolutionHandle[];
}
/**
 * This interface was referenced by `ArtifactResolutionReport`'s JSON-Schema
 * via the `definition` "ArtifactResolutionSummary".
 */
export interface ArtifactResolutionSummary {
  declaredRefs: number;
  loadedArtifacts: number;
  missingArtifacts: number;
  unsupportedRefs: number;
  discriminatorMismatches: number;
  versionMismatches: number;
  identityMismatches: number;
  errors: number;
  warnings: number;
  infos: number;
}
/**
 * This interface was referenced by `ArtifactResolutionReport`'s JSON-Schema
 * via the `definition` "ArtifactResolutionPhaseStatus".
 */
export interface ArtifactResolutionPhaseStatus {
  phase: ArtifactResolutionPhase;
  status: ArtifactResolutionPhaseStatusValue;
  reason?: string;
}
