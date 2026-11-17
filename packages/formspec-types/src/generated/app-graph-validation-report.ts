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
 * via the `definition` "Diagnostic".
 */
export type Diagnostic = {
  /**
   * Stable machine-readable diagnostic code. Native AppGraphValidator codes SHOULD use APP-GRAPH-* unless a sibling spec owns the code. APP-GRAPH-RENDERED-NEED-REDUNDANT warns when a direct trace equals the trace the node would inherit.
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
};
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
  | ('app-graph-validator' | 'artifact-resolver' | 'module-resolver' | 'surface-local-lint' | 'schema-validator' | 'ui-graph-policy')
  | `x-${string}`;
/**
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "PhaseStatusValue".
 */
export type PhaseStatusValue = 'completed' | 'skipped' | 'not-run';
/**
 * Record of the strict rendered-Need trace (Needs spec S10.3), present only when the caller requested it and the cross-artifact phase completed. `completed`: the trace rule ran over the loaded graph and its findings are in `diagnostics`. `not-applicable`: the caller requested it only when declared, and the graph pairs no Needs Document and carries no Need trace. `definitions` lists each loaded Definition the run covered, bound to its content by canonical digest together with the Locales and Components that target it; a server checks a published version's documents against these digests instead of re-running the rule.
 *
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "RenderedNeedTraceRecord".
 */
export type RenderedNeedTraceRecord = {
  status: 'completed' | 'not-applicable';
  definitions: TracedDefinition[];
  /**
   * Inventory with each node's effective publication trace per the App Graph owner table. Nodes MUST be sorted by source.artifactSlot, then source.jsonPointer (the pair is unique per inventoried node), in ascending Unicode code point order. Empty when status is not-applicable. This is trace evidence, not Need satisfaction or runtime authorization.
   */
  nodes: RenderedNeedTraceNode[];
};
/**
 * SHA-256 over the document's RFC 8785 (JCS) canonical bytes, written sha256:<hex>: the hash Source computes for a published Definition.
 *
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "CanonicalDigest".
 */
export type CanonicalDigest = string;
/**
 * Node identity used by both inventory sources and contributing direct trace-bearing sources: a required artifact slot and document-local JSON Pointer. The empty pointer identifies the document root; other SourcePointer evidence is preserved.
 *
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "RenderedNeedTraceSourcePointer".
 */
export type RenderedNeedTraceSourcePointer = SourcePointer & {
  artifactSlot: string;
  jsonPointer: string;
};

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
   * Per-host-evidence source schema validation results. These are not App Manifest artifacts and do not carry artifactKind.
   */
  evidenceResults: EvidenceSchemaResult[];
  /**
   * Unified native and imported diagnostics sorted deterministically by the report producer.
   */
  diagnostics: Diagnostic[];
  /**
   * Ordered phase statuses for the validation run.
   */
  phases: PhaseStatus[];
  support?: SupportProfile;
  renderedNeedTrace?: RenderedNeedTraceRecord;
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
 * via the `definition` "EvidenceSchemaResult".
 */
export interface EvidenceSchemaResult {
  /**
   * Request evidence slot, such as hostEvidence.uiGraphPolicies[0], hostEvidence.componentGraphContexts[0], or hostEvidence.needsDocuments[0]. This is diagnostic evidence only, not an App Manifest slot.
   */
  evidenceSlot: string;
  schemaId: string;
  /**
   * Opaque host source pointer for diagnostics. Local paths and filenames are not identity authority.
   */
  source: string;
  status: SchemaResultStatus;
  reason?: string;
  ok: boolean;
  diagnostics: EvidenceDiagnostic[];
}
/**
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "EvidenceDiagnostic".
 */
export interface EvidenceDiagnostic {
  /**
   * Stable machine-readable diagnostic code.
   */
  code: string;
  severity: Severity;
  phase: 'schema';
  origin: 'schema-validator';
  message: string;
  primarySource?: EvidenceSourcePointer;
  /**
   * Stable machine-readable diagnostic details. Details MUST NOT contain executable code, credentials, fetched payloads, rendered output, or local fixture-path identity.
   */
  details?: {
    [k: string]: unknown;
  };
}
/**
 * Diagnostic pointer for host request evidence. This pointer is evidence-only and cannot carry artifact identity fields.
 *
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "EvidenceSourcePointer".
 */
export interface EvidenceSourcePointer {
  artifactSlot?: string;
  source?: string;
  jsonPointer?: string;
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
/**
 * A Definition the trace covered, with the Locales and Components targeting it that the run also covered.
 *
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "TracedDefinition".
 */
export interface TracedDefinition {
  url: string;
  version: string;
  sha256: CanonicalDigest;
  locales: CoveredDocument[];
  components: CoveredDocument[];
}
/**
 * A document the trace covered, identified by URL and bound by its canonical digest.
 *
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "CoveredDocument".
 */
export interface CoveredDocument {
  url: string;
  sha256: CanonicalDigest;
}
/**
 * One inventoried node with its effective trace. Direct traces override owners; otherwise the closed App Graph owner table supplies the union of the owners' effective traces.
 *
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "RenderedNeedTraceNode".
 */
export interface RenderedNeedTraceNode {
  source: RenderedNeedTraceSourcePointer;
  kind: string;
  label: string;
  effective: EffectiveNeedTrace;
}
/**
 * Effective trace identity and provenance, including unresolved, non-adopted, or stale Need ids. Findings determine admission separately. Missing traces have empty arrays. needIds MUST be deduplicated and sorted lexicographically in ascending Unicode code point order. via MUST be deduplicated by (artifactSlot, jsonPointer) and sorted by artifactSlot, then jsonPointer, in the same order; optional document evidence does not create another node identity.
 *
 * This interface was referenced by `AppGraphValidationReport`'s JSON-Schema
 * via the `definition` "EffectiveNeedTrace".
 */
export interface EffectiveNeedTrace {
  needIds: string[];
  /**
   * Source pointers, including document identity and jsonPointer, to the nearest direct trace-bearing nodes. Direct traces point to self; inherited traces point to the contributing trace-bearing owners; missing traces have no sources.
   */
  via: RenderedNeedTraceSourcePointer[];
}
