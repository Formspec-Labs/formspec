/** @filedesc Shared AppGraphValidator interface and report types. */

import type { ModuleResolutionReport } from '@formspec-org/types';

export const APP_GRAPH_PHASES = [
  'artifact-resolution',
  'schema',
  'module-resolution',
  'surface-local',
  'cross-artifact',
  'authorization-boundary',
  'unsupported',
] as const;

export type AppGraphPhase = typeof APP_GRAPH_PHASES[number];
export type AppGraphSeverity = 'error' | 'warning' | 'info';
export type AppGraphDiagnosticOrigin =
  | 'app-graph-validator'
  | 'artifact-resolver'
  | 'module-resolver'
  | 'surface-local-lint'
  | 'schema-validator'
  | 'ui-graph-policy'
  | `x-${string}`;

export type ResolvedArtifactStatus =
  | 'loaded'
  | 'missing'
  | 'unsupported'
  | 'invalid-discriminator'
  | `x-${string}`;

export type AppGraphPhaseStatusValue = 'completed' | 'skipped' | 'not-run';
export type AppGraphSchemaResultStatus = 'completed' | 'not-run';

export interface AppGraphArtifactRef {
  url?: string;
  version?: string;
  [key: string]: unknown;
}

export interface AppGraphArtifactIdentity {
  url?: string;
  id?: string;
  version?: string;
  name?: string;
  [key: string]: unknown;
}

export interface AppGraphSourcePointer {
  artifactSlot?: string;
  artifactKind?: string;
  source?: string;
  jsonPointer?: string;
  ref?: AppGraphArtifactRef;
}

export interface AppGraphEvidenceSourcePointer {
  artifactSlot?: string;
  source?: string;
  jsonPointer?: string;
}

export interface AppGraphDiagnostic {
  code: string;
  severity: AppGraphSeverity;
  phase: AppGraphPhase;
  origin: AppGraphDiagnosticOrigin;
  message: string;
  primarySource?: AppGraphSourcePointer;
  relatedSources?: AppGraphSourcePointer[];
  details?: Record<string, unknown>;
}

export type AppGraphEvidenceSchemaDiagnostic = Omit<
  AppGraphDiagnostic,
  'phase' | 'origin' | 'primarySource' | 'relatedSources'
> & {
  phase: 'schema';
  origin: 'schema-validator';
  primarySource?: AppGraphEvidenceSourcePointer;
};

export interface ResolvedArtifactHandle<TDocument = unknown> {
  slot: string;
  artifactKind: string;
  status: ResolvedArtifactStatus;
  ref?: AppGraphArtifactRef;
  schemaId?: string;
  document?: TDocument;
  identity?: AppGraphArtifactIdentity;
  source?: string;
  digest?: string;
  diagnostics?: AppGraphDiagnostic[];
}

export interface AppGraphDiagnosticReport {
  diagnostics?: AppGraphDiagnostic[];
}

export interface AppGraphSupportProfile {
  bundleVersions?: string[];
  artifactKinds?: string[];
  schemaIds?: string[];
  featureFlags?: string[];
}

export interface AppGraphValidationOptions {
  support?: AppGraphSupportProfile;
}

export interface SchemaValidationIssue {
  code?: string;
  severity?: AppGraphSeverity;
  path?: string;
  keyword?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SchemaValidatorInput<TDocument = unknown> {
  handle: ResolvedArtifactHandle<TDocument>;
  document: TDocument;
  artifactKind: string;
  schemaId?: string;
}

export type AppGraphEvidenceKind = 'uiGraphPolicy' | 'componentGraphContext';

export interface EvidenceSchemaValidatorInput<TDocument = unknown> {
  evidenceSlot: string;
  evidenceKind: AppGraphEvidenceKind;
  schemaId: string;
  source: string;
  document: TDocument;
}

export interface SchemaValidationOutcome {
  ok: boolean;
  issues?: SchemaValidationIssue[];
  diagnostics?: AppGraphDiagnostic[];
}

export type AppGraphSchemaValidator = (input: SchemaValidatorInput) => SchemaValidationOutcome;
export type AppGraphEvidenceSchemaValidator = (
  input: EvidenceSchemaValidatorInput
) => SchemaValidationOutcome;

export interface AppGraphContext {
  manifest: ResolvedArtifactHandle;
  handles: ResolvedArtifactHandle[];
  schemaResults: AppGraphSchemaResult[];
  evidenceResults: AppGraphEvidenceSchemaResult[];
  hostEvidence?: AppGraphHostEvidence;
  moduleResolution?: ModuleResolutionReport;
}

export type AppGraphCrossArtifactValidator = (context: AppGraphContext) => AppGraphDiagnostic[];

export type AppGraphSchemaValidators =
  | AppGraphSchemaValidator
  | Record<string, AppGraphSchemaValidator | undefined>;

export type AppGraphEvidenceSchemaValidators =
  | AppGraphEvidenceSchemaValidator
  | Record<string, AppGraphEvidenceSchemaValidator | undefined>;

export interface AppGraphValidationRequest {
  manifest: ResolvedArtifactHandle;
  artifacts?: Record<string, ResolvedArtifactHandle[] | undefined>;
  hostEvidence?: AppGraphHostEvidence;
  artifactResolution?: AppGraphDiagnosticReport;
  moduleResolution?: ModuleResolutionReport;
  surfaceLocal?: AppGraphDiagnosticReport;
  schemaValidators?: AppGraphSchemaValidators;
  evidenceSchemaValidators?: AppGraphEvidenceSchemaValidators;
  crossArtifactValidators?: AppGraphCrossArtifactValidator[];
  options?: AppGraphValidationOptions;
}

export interface AppGraphSchemaResult {
  slot: string;
  artifactKind: string;
  schemaId?: string;
  status: AppGraphSchemaResultStatus;
  reason?: string;
  ok: boolean;
  diagnostics: AppGraphDiagnostic[];
}

export interface AppGraphHostEvidenceDocument<TDocument = unknown> {
  schemaId: string;
  source: string;
  document: TDocument;
}

export interface AppGraphHostEvidence {
  uiGraphPolicies?: AppGraphHostEvidenceDocument[];
  componentGraphContexts?: AppGraphHostEvidenceDocument[];
}

export interface AppGraphEvidenceSchemaResult {
  evidenceSlot: string;
  schemaId: string;
  source: string;
  status: AppGraphSchemaResultStatus;
  reason?: string;
  ok: boolean;
  diagnostics: AppGraphEvidenceSchemaDiagnostic[];
}

export interface AppGraphPhaseStatus {
  phase: AppGraphPhase;
  status: AppGraphPhaseStatusValue;
  reason?: string;
}

export interface AppGraphValidationSummary {
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

export interface AppGraphValidationReport {
  ok: boolean;
  summary: AppGraphValidationSummary;
  schemaResults: AppGraphSchemaResult[];
  evidenceResults: AppGraphEvidenceSchemaResult[];
  diagnostics: AppGraphDiagnostic[];
  phases: AppGraphPhaseStatus[];
  support?: AppGraphSupportProfile;
}
