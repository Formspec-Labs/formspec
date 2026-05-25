/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "SchemaResultStatus".
 */
export type SchemaResultStatus = 'completed' | 'not-run';
/**
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "Severity".
 */
export type Severity = 'error' | 'warning' | 'info';
/**
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "Phase".
 */
export type Phase =
  | 'artifact-resolution'
  | 'schema'
  | 'module-resolution'
  | 'surface-local'
  | 'cross-artifact'
  | 'authorization-boundary'
  | 'unsupported';
/**
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "Origin".
 */
export type Origin =
  | ('app-graph-validator' | 'artifact-resolver' | 'module-resolver' | 'surface-local-lint' | 'schema-validator')
  | `x-${string}`;
/**
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "PhaseStatusValue".
 */
export type PhaseStatusValue = 'completed' | 'skipped' | 'not-run';

/**
 * Deterministic AppGraphValidator output report. This schema covers the report envelope emitted by @formspec-org/app-graph after artifact-resolution, schema, module-resolution, surface-local, cross-artifact, authorization-boundary, and unsupported-feature phases. It is a data contract only: it does not schema validator requests, resolver implementations, runtime execution, rendered output, credentials, fetched payloads, or host cache contents.
 */
export interface AppGraphValidationReport {
  /**
   * true only when the report contains no error-severity diagnostics. JSON Schema cannot derive this from diagnostics; report producers enforce the invariant.
   */
  ok: boolean;
  summary: Summary;
  /**
   * Per-loaded-artifact source schema validation results.
   */
  schemaResults: SchemaResult[];
  /**
   * Unified native and imported diagnostics sorted deterministically by the report producer.
   */
  diagnostics: Diagnostic[];
  /**
   * Ordered phase statuses for the validation run.
   */
  phases: PhaseStatus[];
  support?: SupportProfile;
}
/**
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "Summary".
 */
export interface Summary {
  artifacts: number;
  loadedArtifacts: number;
  schemaFailures: number;
  unvalidatedArtifacts: number;
  graphErrors: number;
  errors: number;
  warnings: number;
  infos: number;
  importedDiagnostics: number;
  unsupportedFeatures: number;
  skippedPhases: number;
}
/**
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "SchemaResult".
 */
export interface SchemaResult {
  slot: string;
  artifactKind: string;
  schemaId?: string;
  status: SchemaResultStatus;
  reason?: string;
  ok: boolean;
  diagnostics: Diagnostic[];
}
/**
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "Diagnostic".
 */
export interface Diagnostic {
  /**
   * Stable machine-readable diagnostic code. Native AppGraphValidator codes SHOULD use APP-GRAPH-* unless a sibling spec owns the code.
   */
  code: string;
  severity: Severity;
  phase: Phase;
  origin: Origin;
  message: string;
  primarySource?: SourcePointer;
  relatedSources?: SourcePointer[];
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
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "SourcePointer".
 */
export interface SourcePointer {
  artifactSlot?: string;
  artifactKind?: string;
  source?: string;
  jsonPointer?: string;
  ref?: ArtifactRef;
}
/**
 * App Manifest sibling reference evidence. Extra keys are preserved as diagnostic evidence only and MUST NOT become identity authority.
 *
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "ArtifactRef".
 */
export interface ArtifactRef {
  url?: string;
  version?: string;
  [k: string]: unknown;
}
/**
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "PhaseStatus".
 */
export interface PhaseStatus {
  phase: Phase;
  status: PhaseStatusValue;
  reason?: string;
}
/**
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "SupportProfile".
 */
export interface SupportProfile {
  bundleVersions?: string[];
  artifactKinds?: string[];
  schemaIds?: string[];
  featureFlags?: string[];
}
