/** @filedesc Public exports for the AppGraphValidator report kernel. */

export * from './types.js';
export {
  artifactIdentityKey,
  compareDiagnostics,
  createAppGraphReport,
  diagnosticSourceForHandle,
  normalizeDiagnostics,
  type CreateAppGraphReportInput,
} from './report.js';
export {
  componentNodeIdentityKey,
  type AppGraphComponentMembershipIdentity,
  type AppGraphComponentNodeIdentity,
} from './component-identity.js';
export {
  produceAppGraphValidationReport,
  type AppGraphReportProducerRequest,
  type AppGraphReportProducerResult,
} from './producer.js';
export {
  artifactResolutionGraphInput,
  resolveArtifacts,
  type ArtifactResolutionGraphInput,
  type ArtifactLoader,
  type ArtifactLoaderDiagnosticInput,
  type ArtifactLoaderInput,
  type ArtifactLoaderOutcome,
  type ArtifactResolverRequest,
  type ArtifactResolverSupportProfile,
} from './artifact-resolver.js';
export {
  evaluateActorPostureAdmission,
  evaluateModulePostureAdmission,
  type ModulePostureAdmissionResult,
  type PostureModuleField,
  type PostureModuleRef,
} from './posture-admission.js';
export {
  moduleResolverInputFromAppGraph,
  resolveModules,
  type ModulePayloadValidator,
  type ModulePayloadValidatorInput,
  type ModulePayloadValidatorResult,
  type ModuleResolverGraphInput,
  type ModuleResolverAdmissionInput,
  type ModuleResolverContributionUse,
  type ModuleResolverDocumentInput,
  type ModuleResolverInput,
  type ModuleResolverModuleInput,
  type ModuleResolverRegistryEntry,
  type ModuleResolverRegistryInput,
  type ModuleResolverSupportInput,
} from './module-resolver.js';
export {
  validateComponentGraphContexts,
} from './component-graph-context.js';
export {
  validateComponentRouteTargets,
} from './component-routes.js';
export {
  validateScreenerSurfaceTargets,
} from './screener-surface-targets.js';
export {
  validateSurfaceExperienceUnits,
} from './surface-experience-units.js';
export {
  validateUiGraphPolicy,
} from './ui-graph-policy.js';
export {
  artifactHandlesFor,
  validateAppGraph,
} from './validator.js';
