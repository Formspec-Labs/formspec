/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionModuleStatus".
 */
export type ModuleResolutionModuleStatus = 'admitted' | 'denied' | 'unresolved' | 'dependency-unresolved';
/**
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionSeverity".
 */
export type ModuleResolutionSeverity = 'error' | 'warning' | 'info';
/**
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionPhase".
 */
export type ModuleResolutionPhase = 'module-resolution';
/**
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionOrigin".
 */
export type ModuleResolutionOrigin = 'module-resolver';
/**
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionDocumentStatus".
 */
export type ModuleResolutionDocumentStatus =
  | 'coherent'
  | 'defaulted'
  | 'undeclared-module'
  | 'version-mismatch'
  | 'admission-denied';
/**
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionContributionStatus".
 */
export type ModuleResolutionContributionStatus =
  | 'resolved'
  | 'missing'
  | 'category-mismatch'
  | 'unowned'
  | 'conflict'
  | 'unadmitted'
  | 'payload-schema-mismatch';
/**
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionPayloadStatus".
 */
export type ModuleResolutionPayloadStatus = 'not-run' | 'passed' | 'failed' | 'missing-validator';
/**
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionPhaseStatusValue".
 */
export type ModuleResolutionPhaseStatusValue = 'completed' | 'skipped' | 'not-run';

/**
 * Deterministic ModuleResolver output for the module-resolution phase. This schema covers normalized app modules, sibling-document module coherence, contribution resolution, resolver diagnostics, phase status, and summary counts. It is a data contract only: it does not schema resolver requests, source artifact payloads, Registry source schemas, runtime execution, renderer fallback policy, fine-grained authorization, Posture sidecars, credentials, fetched payloads, rendered output, or local fixture paths.
 */
export interface ModuleResolutionReport {
  /**
   * true only when the report contains no error-severity module-resolution diagnostics. JSON Schema cannot derive this from diagnostics; report producers enforce the invariant.
   */
  ok: boolean;
  /**
   * Normalized app module set, including support-profile default modules when they are effective.
   */
  modules: ModuleResolutionModule[];
  /**
   * Per-loaded-document module declaration coherence results.
   */
  documents: ModuleResolutionDocument[];
  /**
   * Module-contributed value resolution results keyed by consuming site evidence.
   */
  contributions: ModuleResolutionContribution[];
  /**
   * Resolver diagnostics normalized to origin module-resolver and phase module-resolution.
   */
  diagnostics: ModuleResolutionDiagnostic[];
  summary: ModuleResolutionSummary;
  phase: ModuleResolutionPhaseStatus;
  support?: ModuleResolutionSupportProfile;
}
/**
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionModule".
 */
export interface ModuleResolutionModule {
  ref: ModuleResolutionRef;
  status: ModuleResolutionModuleStatus;
  source: ModuleResolutionSourcePointer;
  registryVersion?: string;
  /**
   * true when the module came from the support profile's default module set rather than an explicit App Manifest modules[] entry.
   */
  defaulted?: boolean;
  diagnostics?: ModuleResolutionDiagnostic[];
}
/**
 * Canonical module reference identity tuple. Host admission evidence may reuse these fields, but the resolver report must not extend this shape with fixture, path-derived identity, Posture-specific, actor-specific, route-specific, widget-specific, field-specific, source-specific, or operation-specific policy fields.
 *
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionRef".
 */
export interface ModuleResolutionRef {
  /**
   * Module ID following the canonical Registry module naming pattern.
   */
  id: string;
  /**
   * Strict SemVer string or supported range expression.
   */
  version: string;
  /**
   * Optional provenance assertion copied from the canonical ModuleRef shape.
   */
  publisher?: string;
  /**
   * Optional digest pin copied from the canonical ModuleRef shape.
   */
  lockHash?: string;
  extensions?: ModuleResolutionExtensions;
}
/**
 * ModuleRef extension object whose keys must be prefixed with x-.
 *
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionExtensions".
 */
export interface ModuleResolutionExtensions {
  [k: string]: unknown;
}
/**
 * Diagnostic pointer to source evidence. The source string is for reporting only; local paths, filenames, fixture names, and URL suffixes are not production identity.
 *
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionSourcePointer".
 */
export interface ModuleResolutionSourcePointer {
  artifactSlot: string;
  artifactKind: string;
  source?: string;
  jsonPointer: string;
  ref?: ModuleResolutionArtifactRef;
  module?: ModuleResolutionRef;
}
/**
 * Artifact reference evidence copied from the loaded graph for diagnostics only. Only x-* extension keys may extend this shape; local paths, fixture names, and path-derived identity flags are intentionally rejected.
 *
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionArtifactRef".
 */
export interface ModuleResolutionArtifactRef {
  url?: string;
  version?: string;
  handle?: string;
  locale?: string;
  /**
   * This interface was referenced by `ModuleResolutionArtifactRef`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionDiagnostic".
 */
export interface ModuleResolutionDiagnostic {
  /**
   * Stable machine-readable module-resolution diagnostic code.
   */
  code: string;
  severity: ModuleResolutionSeverity;
  phase: ModuleResolutionPhase;
  origin: ModuleResolutionOrigin;
  message: string;
  primarySource?: ModuleResolutionSourcePointer;
  relatedSources?: ModuleResolutionSourcePointer[];
  /**
   * Stable machine-readable diagnostic details. Details MUST NOT contain executable code, credentials, fetched payloads, rendered output, local fixture-path identity, or fine-grained authorization policy.
   */
  details?: {
    [k: string]: unknown;
  };
}
/**
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionDocument".
 */
export interface ModuleResolutionDocument {
  artifactSlot: string;
  artifactKind: string;
  status: ModuleResolutionDocumentStatus;
  modules: ModuleResolutionRef[];
  /**
   * Document modules after applying the support profile default module set when modules[] is omitted.
   */
  effectiveModules?: ModuleResolutionRef[];
  source: ModuleResolutionSourcePointer;
  diagnostics?: ModuleResolutionDiagnostic[];
}
/**
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionContribution".
 */
export interface ModuleResolutionContribution {
  /**
   * Stable consuming-site label, such as experience.units.kind or surface.module-widget.binding.widgetName.
   */
  site: string;
  name: string;
  expectedCategory: string;
  registryCategory?: string;
  entryVersion?: string;
  owningModules?: ModuleResolutionRef[];
  status: ModuleResolutionContributionStatus;
  payloadStatus?: ModuleResolutionPayloadStatus;
  source: ModuleResolutionSourcePointer;
  diagnostics?: ModuleResolutionDiagnostic[];
}
/**
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionSummary".
 */
export interface ModuleResolutionSummary {
  modules: number;
  admittedModules: number;
  deniedModules: number;
  documents: number;
  contributions: number;
  unresolvedDependencies: number;
  unresolvedContributions: number;
  payloadFailures: number;
  errors: number;
  warnings: number;
  infos: number;
}
/**
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionPhaseStatus".
 */
export interface ModuleResolutionPhaseStatus {
  phase: ModuleResolutionPhase;
  status: ModuleResolutionPhaseStatusValue;
  reason?: string;
}
/**
 * This interface was referenced by `ModuleResolutionReport`'s JSON-Schema
 * via the `definition` "ModuleResolutionSupportProfile".
 */
export interface ModuleResolutionSupportProfile {
  defaultModules?: ModuleResolutionRef[];
  moduleCategories?: string[];
  contributionCategories?: string[];
  versionRangeGrammar?: string;
  payloadSchemaValidators?: string[];
}
