/** @filedesc Shared AppGraphValidator report kernel. */

import {
  APP_GRAPH_PHASES,
  type AppGraphCrossArtifactValidator,
  type AppGraphDiagnostic,
  type AppGraphPhase,
  type AppGraphPhaseStatus,
  type AppGraphSchemaResult,
  type AppGraphSchemaValidator,
  type AppGraphValidationRequest,
  type ResolvedArtifactHandle,
  type SchemaValidationIssue,
  type SchemaValidationOutcome,
} from './types.js';
import {
  createAppGraphReport,
  diagnosticSourceForHandle,
  normalizeDiagnostics,
} from './report.js';

export function artifactHandlesFor(request: AppGraphValidationRequest): ResolvedArtifactHandle[] {
  const siblings = Object.values(request.artifacts ?? {}).flatMap((handles) => handles ?? []);
  return [request.manifest, ...siblings];
}

function schemaValidatorFor(
  request: AppGraphValidationRequest,
  handle: ResolvedArtifactHandle,
): AppGraphSchemaValidator | undefined {
  const validators = request.schemaValidators;
  if (!validators) return undefined;
  if (typeof validators === 'function') return validators;
  return (
    (handle.schemaId ? validators[handle.schemaId] : undefined)
    ?? validators[handle.artifactKind]
    ?? validators['*']
  );
}

function schemaIssueDiagnostic(handle: ResolvedArtifactHandle, issue: SchemaValidationIssue): AppGraphDiagnostic {
  const suffix = issue.keyword ? ` [${issue.keyword}]` : '';
  return {
    code: issue.code ?? 'APP-GRAPH-SCHEMA',
    severity: issue.severity ?? 'error',
    phase: 'schema',
    origin: 'schema-validator',
    message: `${handle.artifactKind}${suffix}: ${issue.message}`,
    primarySource: diagnosticSourceForHandle(handle, issue.path ?? ''),
    details: issue.details ? { ...issue.details } : undefined,
  };
}

function normalizeSchemaOutcome(
  handle: ResolvedArtifactHandle,
  outcome: SchemaValidationOutcome,
): AppGraphSchemaResult {
  const diagnostics = normalizeDiagnostics([
    ...(outcome.diagnostics ?? []).map((diagnostic) => ({
      ...diagnostic,
      phase: diagnostic.phase ?? 'schema',
      origin: diagnostic.origin ?? 'schema-validator',
      primarySource: diagnostic.primarySource ?? diagnosticSourceForHandle(handle),
    })),
    ...(outcome.issues ?? []).map((issue) => schemaIssueDiagnostic(handle, issue)),
  ]);

  return {
    slot: handle.slot,
    artifactKind: handle.artifactKind,
    schemaId: handle.schemaId,
    status: 'completed',
    ok: outcome.ok && diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    diagnostics,
  };
}

function schemaNotRunResult(handle: ResolvedArtifactHandle, reason: string): AppGraphSchemaResult {
  return {
    slot: handle.slot,
    artifactKind: handle.artifactKind,
    schemaId: handle.schemaId,
    status: 'not-run',
    reason,
    ok: true,
    diagnostics: [],
  };
}

function schemaResultsFor(
  request: AppGraphValidationRequest,
  handles: readonly ResolvedArtifactHandle[],
): AppGraphSchemaResult[] {
  return handles
    .filter((handle) => handle.status === 'loaded')
    .map((handle) => {
      if (handle.document === undefined) {
        return schemaNotRunResult(handle, 'missing-document');
      }
      const validate = schemaValidatorFor(request, handle);
      if (!validate) {
        return schemaNotRunResult(handle, 'missing-schema-validator');
      }
      return normalizeSchemaOutcome(handle, validate({
        handle,
        document: handle.document,
        artifactKind: handle.artifactKind,
        schemaId: handle.schemaId,
      }));
    });
}

function runCrossArtifactValidators(
  validators: readonly AppGraphCrossArtifactValidator[] | undefined,
  request: AppGraphValidationRequest,
  handles: readonly ResolvedArtifactHandle[],
  schemaResults: readonly AppGraphSchemaResult[],
): AppGraphDiagnostic[] {
  return (validators ?? []).flatMap((validator) => validator({
    manifest: request.manifest,
    handles: [...handles],
    schemaResults: [...schemaResults],
  }));
}

function importedDiagnostics(request: AppGraphValidationRequest, handles: readonly ResolvedArtifactHandle[]): AppGraphDiagnostic[] {
  return [
    ...(request.artifactResolution?.diagnostics ?? []),
    ...(request.moduleResolution?.diagnostics ?? []),
    ...(request.surfaceLocal?.diagnostics ?? []),
    ...handles.flatMap((handle) => handle.diagnostics ?? []),
  ];
}

function phaseStatus(
  phase: AppGraphPhase,
  status: AppGraphPhaseStatus['status'],
  reason?: string,
): AppGraphPhaseStatus {
  return reason ? { phase, status, reason } : { phase, status };
}

function phaseStatuses(
  request: AppGraphValidationRequest,
  schemaStatus: AppGraphPhaseStatus,
  crossArtifactStatus: AppGraphPhaseStatus,
): AppGraphPhaseStatus[] {
  const statuses = new Map<AppGraphPhase, AppGraphPhaseStatus>();
  for (const phase of APP_GRAPH_PHASES) {
    statuses.set(phase, phaseStatus(phase, 'not-run'));
  }
  statuses.set('artifact-resolution', phaseStatus('artifact-resolution', request.artifactResolution ? 'completed' : 'not-run'));
  statuses.set('module-resolution', phaseStatus('module-resolution', request.moduleResolution ? 'completed' : 'not-run'));
  statuses.set('surface-local', phaseStatus('surface-local', request.surfaceLocal ? 'completed' : 'not-run'));
  statuses.set('schema', schemaStatus);
  statuses.set('cross-artifact', crossArtifactStatus);
  return [...statuses.values()];
}

function schemaPhaseStatus(schemaResults: readonly AppGraphSchemaResult[]): AppGraphPhaseStatus {
  if (schemaResults.length === 0) {
    return phaseStatus('schema', 'not-run', 'no-loaded-artifacts');
  }
  if (schemaResults.some((result) => result.reason === 'missing-document')) {
    return phaseStatus('schema', 'skipped', 'missing-documents');
  }
  if (schemaResults.some((result) => result.status !== 'completed')) {
    return phaseStatus('schema', 'skipped', 'missing-schema-validators');
  }
  return phaseStatus('schema', 'completed');
}

export function validateAppGraph(request: AppGraphValidationRequest) {
  const handles = artifactHandlesFor(request);
  const loadedArtifactCount = handles.filter((handle) => handle.status === 'loaded').length;
  const unresolved = handles.filter((handle) => handle.status !== 'loaded');
  const schemaResults = schemaResultsFor(request, handles);
  const schemaFailures = schemaResults.some((result) => !result.ok);
  const schemaNotRun = schemaResults.some((result) => result.status !== 'completed');
  const schemaStatus = schemaPhaseStatus(schemaResults);
  let crossArtifactStatus: AppGraphPhaseStatus;
  let crossDiagnostics: AppGraphDiagnostic[] = [];

  if (unresolved.length > 0) {
    crossArtifactStatus = phaseStatus('cross-artifact', 'skipped', 'unresolved-artifacts');
  } else if (schemaFailures) {
    crossArtifactStatus = phaseStatus('cross-artifact', 'skipped', 'schema-errors');
  } else if (schemaNotRun && request.crossArtifactValidators?.length) {
    crossArtifactStatus = phaseStatus('cross-artifact', 'skipped', schemaStatus.reason ?? 'schema-not-run');
  } else if (!request.crossArtifactValidators?.length) {
    crossArtifactStatus = phaseStatus('cross-artifact', 'not-run', 'no-cross-artifact-validators');
  } else {
    crossArtifactStatus = phaseStatus('cross-artifact', 'completed');
    crossDiagnostics = runCrossArtifactValidators(request.crossArtifactValidators, request, handles, schemaResults);
  }

  const diagnostics = normalizeDiagnostics([
    ...importedDiagnostics(request, handles),
    ...schemaResults.flatMap((result) => result.diagnostics),
    ...crossDiagnostics,
  ]);

  return createAppGraphReport({
    artifactCount: handles.length,
    loadedArtifactCount,
    diagnostics,
    schemaResults,
    phases: phaseStatuses(request, schemaStatus, crossArtifactStatus),
    support: request.options?.support,
  });
}
