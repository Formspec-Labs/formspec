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
  validateComponentRouteTargets,
} from './component-routes.js';
export {
  artifactHandlesFor,
  validateAppGraph,
} from './validator.js';
