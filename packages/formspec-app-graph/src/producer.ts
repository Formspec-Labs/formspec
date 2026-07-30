/** @filedesc Production-callable AppGraph report producer pipeline. */

import type {
  ArtifactResolutionReport,
  ModuleResolutionReport,
} from '@formspec-org/types';
import {
  artifactResolutionGraphInput,
  resolveArtifacts,
  resolveBundleExportArtifacts,
  type ArtifactResolverRequest,
} from './artifact-resolver.js';
import {
  moduleResolverInputFromAppGraph,
  resolveModules,
  type ModuleResolverAdmissionInput,
  type ModuleResolverSupportInput,
} from './module-resolver.js';
import type {
  AppGraphCrossArtifactValidator,
  AppGraphDiagnosticReport,
  AppGraphEvidenceSchemaValidators,
  AppGraphHostEvidence,
  AppGraphSchemaValidators,
  AppGraphValidationOptions,
  AppGraphValidationReport,
} from './types.js';
import { validateAppGraph } from './validator.js';

export interface AppGraphReportProducerRequest extends ArtifactResolverRequest {
  hostEvidence?: AppGraphHostEvidence;
  moduleAdmission?: ModuleResolverAdmissionInput;
  moduleSupport?: ModuleResolverSupportInput;
  moduleSource?: string;
  surfaceLocal?: AppGraphDiagnosticReport;
  authorizationBoundary?: AppGraphDiagnosticReport;
  unsupported?: AppGraphDiagnosticReport;
  schemaValidators: AppGraphSchemaValidators;
  evidenceSchemaValidators?: AppGraphEvidenceSchemaValidators;
  crossArtifactValidators?: AppGraphCrossArtifactValidator[];
  validationOptions?: AppGraphValidationOptions;
}

export interface AppGraphReportProducerResult {
  artifactResolutionReport: ArtifactResolutionReport;
  moduleResolutionReport: ModuleResolutionReport;
  report: AppGraphValidationReport;
}

export type BundleExportAppGraphReportProducerRequest = Omit<
  AppGraphReportProducerRequest,
  'loader'
> & {
  /**
   * Exact canonical URL to parsed document map from a verified inline export.
   *
   * Only own keys are documents. Values remain unknown until schema and graph
   * validation complete.
   */
  documents: Readonly<Record<string, unknown>>;
};

function finishAppGraphValidationReport(
  request: Omit<AppGraphReportProducerRequest, 'manifest' | 'loader'>,
  artifactResolutionReport: ArtifactResolutionReport,
): AppGraphReportProducerResult {
  const graphInput = artifactResolutionGraphInput(artifactResolutionReport);
  const moduleResolutionReport = resolveModules(moduleResolverInputFromAppGraph({
    manifest: graphInput.manifest,
    handles: graphInput.handles,
    ...(request.hostEvidence ? { hostEvidence: request.hostEvidence } : {}),
    ...(request.moduleAdmission ? { admission: request.moduleAdmission } : {}),
    ...(request.moduleSupport ? { support: request.moduleSupport } : {}),
    ...(request.moduleSource ? { source: request.moduleSource } : {}),
  }));
  const report = validateAppGraph({
    manifest: graphInput.manifest,
    artifacts: graphInput.artifacts,
    artifactResolution: graphInput.artifactResolution,
    ...(request.hostEvidence ? { hostEvidence: request.hostEvidence } : {}),
    moduleResolution: moduleResolutionReport,
    ...(request.surfaceLocal ? { surfaceLocal: request.surfaceLocal } : {}),
    ...(request.authorizationBoundary
      ? { authorizationBoundary: request.authorizationBoundary }
      : {}),
    ...(request.unsupported ? { unsupported: request.unsupported } : {}),
    schemaValidators: request.schemaValidators,
    ...(request.evidenceSchemaValidators ? { evidenceSchemaValidators: request.evidenceSchemaValidators } : {}),
    ...(request.crossArtifactValidators ? { crossArtifactValidators: request.crossArtifactValidators } : {}),
    ...(request.validationOptions ? { options: request.validationOptions } : {}),
  });

  return {
    artifactResolutionReport,
    moduleResolutionReport,
    report,
  };
}

export async function produceAppGraphValidationReport(
  request: AppGraphReportProducerRequest,
): Promise<AppGraphReportProducerResult> {
  return finishAppGraphValidationReport(request, await resolveArtifacts(request));
}

/**
 * Run the complete resolver, module, schema, and cross-artifact pipeline over a
 * verified inline export before any consumer dereferences typed Surface data.
 */
export async function produceBundleExportAppGraphValidationReport(
  request: BundleExportAppGraphReportProducerRequest,
): Promise<AppGraphReportProducerResult> {
  const { documents, ...pipelineRequest } = request;
  const artifactResolutionReport = await resolveBundleExportArtifacts({
    manifest: request.manifest,
    documents,
    ...(request.support ? { support: request.support } : {}),
    ...(request.source ? { source: request.source } : {}),
    ...(request.digest ? { digest: request.digest } : {}),
    ...(request.schemaId ? { schemaId: request.schemaId } : {}),
  });
  return finishAppGraphValidationReport(pipelineRequest, artifactResolutionReport);
}
