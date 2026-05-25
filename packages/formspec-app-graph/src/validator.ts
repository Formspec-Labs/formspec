/** @filedesc Shared AppGraphValidator report kernel. */

import {
  APP_GRAPH_PHASES,
  type AppGraphCrossArtifactValidator,
  type AppGraphDiagnostic,
  type AppGraphEvidenceSchemaDiagnostic,
  type AppGraphEvidenceSchemaValidator,
  type AppGraphEvidenceSchemaResult,
  type AppGraphPhase,
  type AppGraphPhaseStatus,
  type AppGraphSchemaResult,
  type AppGraphSchemaValidator,
  type AppGraphValidationRequest,
  type EvidenceSchemaValidatorInput,
  type ResolvedArtifactHandle,
  type SchemaValidationIssue,
  type SchemaValidationOutcome,
} from './types.js';
import {
  compareDiagnostics,
  createAppGraphReport,
  diagnosticSourceForHandle,
  normalizeDiagnostics,
} from './report.js';
import { validateComponentRouteTargets } from './component-routes.js';
import { validateUiGraphPolicy } from './ui-graph-policy.js';

const UI_GRAPH_POLICY_SCHEMA_ID = 'https://formspec.org/schemas/uiGraphPolicy/0.1';

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

function evidenceIssueDiagnostic(
  evidence: EvidenceSchemaValidatorInput,
  issue: SchemaValidationIssue,
): AppGraphEvidenceSchemaDiagnostic {
  const suffix = issue.keyword ? ` [${issue.keyword}]` : '';
  return {
    code: issue.code ?? 'APP-GRAPH-SCHEMA',
    severity: issue.severity ?? 'error',
    phase: 'schema',
    origin: 'schema-validator',
    message: `${evidence.evidenceSlot}${suffix}: ${issue.message}`,
    primarySource: {
      artifactSlot: evidence.evidenceSlot,
      source: evidence.source,
      jsonPointer: issue.path ?? '',
    },
    details: issue.details ? { ...issue.details } : undefined,
  };
}

function evidenceDiagnosticSource(
  evidence: EvidenceSchemaValidatorInput,
  jsonPointer = '',
) {
  return {
    artifactSlot: evidence.evidenceSlot,
    source: evidence.source,
    jsonPointer,
  };
}

function evidenceSchemaDiagnostic(
  evidence: EvidenceSchemaValidatorInput,
  diagnostic: AppGraphDiagnostic,
): AppGraphEvidenceSchemaDiagnostic {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    phase: 'schema',
    origin: 'schema-validator',
    message: diagnostic.message,
    primarySource: evidenceDiagnosticSource(evidence, diagnostic.primarySource?.jsonPointer ?? ''),
    details: diagnostic.details ? { ...diagnostic.details } : undefined,
  };
}

function normalizeEvidenceDiagnostics(
  diagnostics: readonly AppGraphEvidenceSchemaDiagnostic[],
): AppGraphEvidenceSchemaDiagnostic[] {
  return diagnostics
    .map((diagnostic) => ({
      ...diagnostic,
      primarySource: diagnostic.primarySource ? { ...diagnostic.primarySource } : undefined,
      details: diagnostic.details ? { ...diagnostic.details } : undefined,
    }))
    .sort(compareDiagnostics);
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

function normalizeEvidenceSchemaOutcome(
  evidence: EvidenceSchemaValidatorInput,
  outcome: SchemaValidationOutcome,
): AppGraphEvidenceSchemaResult {
  const diagnostics = normalizeEvidenceDiagnostics([
    ...(outcome.diagnostics ?? []).map((diagnostic) => evidenceSchemaDiagnostic(evidence, diagnostic)),
    ...(outcome.issues ?? []).map((issue) => evidenceIssueDiagnostic(evidence, issue)),
  ]);

  return {
    evidenceSlot: evidence.evidenceSlot,
    schemaId: evidence.schemaId,
    source: evidence.source,
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

function evidenceSchemaNotRunResult(
  evidence: EvidenceSchemaValidatorInput,
  reason: string,
): AppGraphEvidenceSchemaResult {
  return {
    evidenceSlot: evidence.evidenceSlot,
    schemaId: evidence.schemaId,
    source: evidence.source,
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

function uiGraphPolicyEvidence(request: AppGraphValidationRequest): EvidenceSchemaValidatorInput[] {
  return (request.hostEvidence?.uiGraphPolicies ?? []).map((evidence, index) => ({
    evidenceSlot: `hostEvidence.uiGraphPolicies[${index}]`,
    evidenceKind: 'uiGraphPolicy',
    schemaId: evidence.schemaId,
    source: evidence.source,
    document: evidence.document,
  }));
}

function schemaValidatorForEvidence(
  request: AppGraphValidationRequest,
  evidence: EvidenceSchemaValidatorInput,
): AppGraphEvidenceSchemaValidator | undefined {
  const validators = request.evidenceSchemaValidators;
  if (!validators) return undefined;
  if (typeof validators === 'function') return validators;
  return validators[evidence.schemaId] ?? validators[evidence.evidenceKind] ?? validators['*'];
}

function evidenceResultsFor(request: AppGraphValidationRequest): AppGraphEvidenceSchemaResult[] {
  return uiGraphPolicyEvidence(request).map((evidence) => {
    if (evidence.document === undefined) {
      return evidenceSchemaNotRunResult(evidence, 'missing-document');
    }
    if (evidence.schemaId !== UI_GRAPH_POLICY_SCHEMA_ID) {
      return normalizeEvidenceSchemaOutcome(evidence, {
        ok: false,
        issues: [{
          code: 'APP-GRAPH-EVIDENCE-SCHEMA-ID',
          keyword: 'const',
          path: '/schemaId',
          message: `UI Graph Policy host evidence must use schemaId '${UI_GRAPH_POLICY_SCHEMA_ID}'.`,
        }],
      });
    }
    const validate = schemaValidatorForEvidence(request, evidence);
    if (!validate) {
      return evidenceSchemaNotRunResult(evidence, 'missing-schema-validator');
    }
    return normalizeEvidenceSchemaOutcome(evidence, validate(evidence));
  });
}

function runCrossArtifactValidators(
  validators: readonly AppGraphCrossArtifactValidator[] | undefined,
  request: AppGraphValidationRequest,
  handles: readonly ResolvedArtifactHandle[],
  schemaResults: readonly AppGraphSchemaResult[],
  evidenceResults: readonly AppGraphEvidenceSchemaResult[],
): AppGraphDiagnostic[] {
  const allValidators = [
    validateComponentRouteTargets,
    validateUiGraphPolicy,
    ...(validators ?? []),
  ];
  return allValidators.flatMap((validator) => validator({
    manifest: request.manifest,
    handles: [...handles],
    schemaResults: [...schemaResults],
    evidenceResults: [...evidenceResults],
    hostEvidence: request.hostEvidence,
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

function schemaPhaseStatus(
  results: readonly (AppGraphSchemaResult | AppGraphEvidenceSchemaResult)[],
): AppGraphPhaseStatus {
  if (results.length === 0) {
    return phaseStatus('schema', 'not-run', 'no-loaded-artifacts');
  }
  if (results.some((result) => result.reason === 'missing-document')) {
    return phaseStatus('schema', 'skipped', 'missing-documents');
  }
  if (results.some((result) => result.status !== 'completed')) {
    return phaseStatus('schema', 'skipped', 'missing-schema-validators');
  }
  return phaseStatus('schema', 'completed');
}

export function validateAppGraph(request: AppGraphValidationRequest) {
  const handles = artifactHandlesFor(request);
  const loadedArtifactCount = handles.filter((handle) => handle.status === 'loaded').length;
  const unresolved = handles.filter((handle) => handle.status !== 'loaded');
  const schemaResults = schemaResultsFor(request, handles);
  const evidenceResults = evidenceResultsFor(request);
  const schemaAndEvidenceResults = [...schemaResults, ...evidenceResults];
  const schemaFailures = schemaAndEvidenceResults.some((result) => !result.ok);
  const schemaNotRun = schemaAndEvidenceResults.some((result) => result.status !== 'completed');
  const schemaStatus = schemaPhaseStatus(schemaAndEvidenceResults);
  let crossArtifactStatus: AppGraphPhaseStatus;
  let crossDiagnostics: AppGraphDiagnostic[] = [];

  if (unresolved.length > 0) {
    crossArtifactStatus = phaseStatus('cross-artifact', 'skipped', 'unresolved-artifacts');
  } else if (schemaFailures) {
    crossArtifactStatus = phaseStatus('cross-artifact', 'skipped', 'schema-errors');
  } else if (schemaNotRun) {
    crossArtifactStatus = phaseStatus('cross-artifact', 'skipped', schemaStatus.reason ?? 'schema-not-run');
  } else {
    crossArtifactStatus = phaseStatus('cross-artifact', 'completed');
    crossDiagnostics = runCrossArtifactValidators(
      request.crossArtifactValidators,
      request,
      handles,
      schemaResults,
      evidenceResults,
    );
  }

  const diagnostics = normalizeDiagnostics([
    ...importedDiagnostics(request, handles),
    ...schemaResults.flatMap((result) => result.diagnostics),
    ...evidenceResults.flatMap((result) => result.diagnostics),
    ...crossDiagnostics,
  ]);

  return createAppGraphReport({
    artifactCount: handles.length,
    loadedArtifactCount,
    diagnostics,
    schemaResults,
    evidenceResults,
    phases: phaseStatuses(request, schemaStatus, crossArtifactStatus),
    support: request.options?.support,
  });
}
