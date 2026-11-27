/** @filedesc Shared AppGraphValidator interface and report types. */

import type { HostWidgetContracts } from './widget-runtime-contract.js';
import type { ModuleResolutionReport, RenderedNeedTraceNode } from '@formspec-org/types';

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

export type AppGraphEvidenceKind = 'uiGraphPolicy' | 'componentGraphContext' | 'needsDocument';

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
  hostWidgetContracts?: HostWidgetContracts;
}

export interface AppGraphCrossArtifactValidator {
  (context: AppGraphContext): AppGraphDiagnostic[];
  /** This validator checks response projections through the injected engine port. */
  readonly checksResponseProjections?: true;
}

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
  /**
   * Present only when the caller actually ran its authorization-boundary
   * checks. An empty diagnostics array is affirmative evidence that the phase
   * ran and found nothing.
   */
  authorizationBoundary?: AppGraphDiagnosticReport;
  /**
   * Present only when the caller actually checked for unsupported features.
   * This keeps "no findings" distinct from "the check never ran".
   */
  unsupported?: AppGraphDiagnosticReport;
  schemaValidators?: AppGraphSchemaValidators;
  evidenceSchemaValidators?: AppGraphEvidenceSchemaValidators;
  crossArtifactValidators?: AppGraphCrossArtifactValidator[];
  /** The deployment host's shipped widget contracts; absent means no host check runs. */
  hostWidgetContracts?: HostWidgetContracts;
  /**
   * Run the strict rendered-Need trace (Needs spec S10.3) and record it in the
   * report's `renderedNeedTrace`. Absent means it does not run and no record is
   * written; passing `validateRenderedNeedTrace` as a cross-artifact validator
   * runs the same rule without the record.
   */
  renderedNeedTrace?: AppGraphRenderedNeedTraceRequest;
  options?: AppGraphValidationOptions;
}

/** `required`: always run. `when-declared`: run only when Needs are paired or a rendered node carries a Need trace. */
export type AppGraphRenderedNeedTraceMode = 'required' | 'when-declared';

/**
 * The host's canonical document digest, injected (this package carries no hashing): RFC 8785
 * JCS bytes, SHA-256, `sha256:<hex>` — the hash Source computes for a published Definition.
 */
export type AppGraphDocumentDigest = (document: unknown) => string;

export interface AppGraphRenderedNeedTraceRequest {
  mode: AppGraphRenderedNeedTraceMode;
  digest: AppGraphDocumentDigest;
}

/** One covered document, bound by its canonical digest. */
export interface AppGraphCoveredDocument {
  url: string;
  sha256: string;
}

/**
 * A Definition the trace covered, bound to its content: the Definition's digest plus the
 * Locales and Components that target it. A server admits a published version only when its
 * Definition, Locales, and Component digests are all here.
 */
export interface AppGraphTracedDefinition extends AppGraphCoveredDocument {
  version: string;
  locales: AppGraphCoveredDocument[];
  components: AppGraphCoveredDocument[];
}

/** Whether `renderedNeedTrace.nodes` carries the full per-node inventory or omits it for compact publication proof. */
export type AppGraphRenderedNeedTraceInventoryMode = 'full' | 'omitted';

/** Report record of a strict rendered-Need trace run; the server checks it instead of re-running the rule. */
export interface AppGraphRenderedNeedTraceRecord {
  status: 'completed' | 'not-applicable';
  definitions: AppGraphTracedDefinition[];
  nodes: RenderedNeedTraceNode[];
  inventory?: AppGraphRenderedNeedTraceInventoryMode;
  nodeCount?: number;
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

export type AppGraphHostLandmarkRole = 'main' | 'navigation' | 'complementary';

export interface AppGraphHostLandmarks {
  reserved: AppGraphHostLandmarkRole[];
}

export interface AppGraphHostEvidence {
  uiGraphPolicies?: AppGraphHostEvidenceDocument[];
  componentGraphContexts?: AppGraphHostEvidenceDocument[];
  /**
   * Needs Documents the caller pairs with this bundle (needs-spec S2.1).
   *
   * A Needs Document declares no `targetDefinition` and no bundle binding,
   * so the pairing is an explicit act: the caller's here, or the App
   * Manifest's optional `needs` member, which the bundle-export producer
   * appends to this list. Absent a pairing, `needRefs` resolution and all of
   * coverage are *inapplicable, not failing* — the checker emits nothing, and
   * MUST NOT infer a pairing from co-location or file naming.
   */
  needsDocuments?: AppGraphHostEvidenceDocument[];
  hostLandmarks?: AppGraphHostLandmarks;
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
  renderedNeedTrace?: AppGraphRenderedNeedTraceRecord;
}
