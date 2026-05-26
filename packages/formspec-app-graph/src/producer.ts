/** @filedesc Production-callable AppGraph report producer pipeline. */

import type {
  ArtifactResolutionReport,
  ModuleResolutionReport,
} from '@formspec-org/types';
import {
  artifactResolutionGraphInput,
  resolveArtifacts,
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

export async function produceAppGraphValidationReport(
  request: AppGraphReportProducerRequest,
): Promise<AppGraphReportProducerResult> {
  const artifactResolutionReport = await resolveArtifacts(request);
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
