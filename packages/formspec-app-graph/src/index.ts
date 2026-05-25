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
  resolveArtifacts,
  type ArtifactLoader,
  type ArtifactLoaderDiagnosticInput,
  type ArtifactLoaderInput,
  type ArtifactLoaderOutcome,
  type ArtifactResolverRequest,
  type ArtifactResolverSupportProfile,
} from './artifact-resolver.js';
export {
  resolveModules,
  type ModulePayloadValidator,
  type ModulePayloadValidatorInput,
  type ModulePayloadValidatorResult,
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
  validateComponentRouteTargets,
} from './component-routes.js';
export {
  validateUiGraphPolicySurfaceRoutes,
} from './ui-graph-policy.js';
export {
  artifactHandlesFor,
  validateAppGraph,
} from './validator.js';
