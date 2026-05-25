/** @filedesc Deterministic report helpers for AppGraphValidator output. */

import {
  APP_GRAPH_PHASES,
  type AppGraphDiagnostic,
  type AppGraphPhase,
  type AppGraphPhaseStatus,
  type AppGraphSchemaResult,
  type AppGraphSourcePointer,
  type AppGraphSupportProfile,
  type AppGraphValidationReport,
  type AppGraphValidationSummary,
  type ResolvedArtifactHandle,
} from './types.js';

const SEVERITY_RANK: Record<AppGraphDiagnostic['severity'], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const PHASE_RANK: Record<AppGraphPhase, number> = Object.fromEntries(
  APP_GRAPH_PHASES.map((phase, index) => [phase, index]),
) as Record<AppGraphPhase, number>;

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sourceKey(source: AppGraphSourcePointer | undefined): string {
  if (!source) return '';
  return [
    stringValue(source.artifactSlot),
    stringValue(source.artifactKind),
    stringValue(source.jsonPointer),
    stringValue(source.ref?.url),
    stringValue(source.ref?.version),
    stringValue(source.source),
  ].join('\u0000');
}

export function compareDiagnostics(left: AppGraphDiagnostic, right: AppGraphDiagnostic): number {
  return (
    SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]
    || PHASE_RANK[left.phase] - PHASE_RANK[right.phase]
    || sourceKey(left.primarySource).localeCompare(sourceKey(right.primarySource))
    || left.code.localeCompare(right.code)
    || left.message.localeCompare(right.message)
  );
}

export function normalizeDiagnostics(diagnostics: readonly AppGraphDiagnostic[] = []): AppGraphDiagnostic[] {
  return diagnostics
    .map((diagnostic) => ({
      ...diagnostic,
      primarySource: diagnostic.primarySource ? { ...diagnostic.primarySource } : undefined,
      relatedSources: diagnostic.relatedSources
        ? [...diagnostic.relatedSources].map((source) => ({ ...source })).sort((left, right) => sourceKey(left).localeCompare(sourceKey(right)))
        : undefined,
      details: diagnostic.details ? { ...diagnostic.details } : undefined,
    }))
    .sort(compareDiagnostics);
}

export function diagnosticSourceForHandle(
  handle: ResolvedArtifactHandle,
  jsonPointer = '',
): AppGraphSourcePointer {
  return {
    artifactSlot: handle.slot,
    artifactKind: handle.artifactKind,
    source: handle.source,
    jsonPointer,
    ref: handle.ref ? { ...handle.ref } : undefined,
  };
}

export function artifactIdentityKey(handle: ResolvedArtifactHandle): string {
  const version = handle.ref?.version ?? handle.identity?.version;
  const refIdentity = handle.ref?.url;
  const documentUrl = handle.identity?.url;
  const documentId = handle.artifactKind === 'surface' ? undefined : handle.identity?.id;
  const identity = refIdentity ?? documentUrl ?? documentId ?? handle.slot;
  return version ? `${handle.artifactKind}:${identity}@${version}` : `${handle.artifactKind}:${identity}`;
}

function countDiagnostics(
  diagnostics: readonly AppGraphDiagnostic[],
  severity: AppGraphDiagnostic['severity'],
): number {
  return diagnostics.filter((diagnostic) => diagnostic.severity === severity).length;
}

export interface CreateAppGraphReportInput {
  artifactCount: number;
  loadedArtifactCount: number;
  diagnostics?: AppGraphDiagnostic[];
  schemaResults?: AppGraphSchemaResult[];
  phases?: AppGraphPhaseStatus[];
  support?: AppGraphSupportProfile;
}

export function createAppGraphReport(input: CreateAppGraphReportInput): AppGraphValidationReport {
  const diagnostics = normalizeDiagnostics(input.diagnostics);
  const schemaResults = [...(input.schemaResults ?? [])].sort((left, right) =>
    left.slot.localeCompare(right.slot) || left.artifactKind.localeCompare(right.artifactKind),
  );
  const phases = [...(input.phases ?? [])].sort((left, right) => PHASE_RANK[left.phase] - PHASE_RANK[right.phase]);
  const summary: AppGraphValidationSummary = {
    artifacts: input.artifactCount,
    loadedArtifacts: input.loadedArtifactCount,
    schemaFailures: schemaResults.filter((result) => result.status === 'completed' && !result.ok).length,
    unvalidatedArtifacts: schemaResults.filter((result) => result.status !== 'completed').length,
    graphErrors: diagnostics.filter((diagnostic) => diagnostic.phase === 'cross-artifact' && diagnostic.severity === 'error').length,
    errors: countDiagnostics(diagnostics, 'error'),
    warnings: countDiagnostics(diagnostics, 'warning'),
    infos: countDiagnostics(diagnostics, 'info'),
    importedDiagnostics: diagnostics.filter((diagnostic) =>
      diagnostic.origin !== 'app-graph-validator' && diagnostic.origin !== 'schema-validator'
    ).length,
    unsupportedFeatures: diagnostics.filter((diagnostic) => diagnostic.phase === 'unsupported').length,
    skippedPhases: phases.filter((phase) => phase.status === 'skipped').length,
  };

  return {
    ok: summary.errors === 0,
    summary,
    schemaResults,
    diagnostics,
    phases,
    support: input.support ? { ...input.support } : undefined,
  };
}
