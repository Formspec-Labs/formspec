import { describe, expect, it, vi } from 'vitest';
import {
  artifactIdentityKey,
  createAppGraphReport,
  validateAppGraph,
  type AppGraphDiagnostic,
  type ResolvedArtifactHandle,
} from '../src/index.js';

function loadedHandle(partial: Partial<ResolvedArtifactHandle> = {}): ResolvedArtifactHandle {
  return {
    slot: partial.slot ?? 'app',
    artifactKind: partial.artifactKind ?? 'appManifest',
    status: 'loaded',
    schemaId: partial.schemaId,
    document: partial.document ?? {},
    ref: partial.ref,
    identity: partial.identity,
    source: partial.source,
    diagnostics: partial.diagnostics,
  };
}

function diagnostic(partial: Partial<AppGraphDiagnostic> = {}): AppGraphDiagnostic {
  return {
    code: partial.code ?? 'APP-GRAPH-TEST',
    severity: partial.severity ?? 'error',
    phase: partial.phase ?? 'cross-artifact',
    origin: partial.origin ?? 'app-graph-validator',
    message: partial.message ?? 'test diagnostic',
    primarySource: partial.primarySource,
    relatedSources: partial.relatedSources,
    details: partial.details,
  };
}

describe('createAppGraphReport', () => {
  it('sorts diagnostics deterministically and derives summary counts', () => {
    const report = createAppGraphReport({
      artifactCount: 2,
      loadedArtifactCount: 2,
      diagnostics: [
        diagnostic({ code: 'Z-INFO', severity: 'info', phase: 'unsupported', message: 'z' }),
        diagnostic({ code: 'A-ERROR', severity: 'error', phase: 'schema', message: 'a' }),
        diagnostic({ code: 'M-WARN', severity: 'warning', phase: 'module-resolution', origin: 'module-resolver', message: 'm' }),
      ],
      phases: [
        { phase: 'cross-artifact', status: 'not-run', reason: 'no-cross-artifact-validators' },
        { phase: 'schema', status: 'completed' },
      ],
      schemaResults: [],
    });

    expect(report.ok).toBe(false);
    expect(report.diagnostics.map((entry) => entry.code)).toEqual(['A-ERROR', 'M-WARN', 'Z-INFO']);
    expect(report.summary).toMatchObject({
      errors: 1,
      warnings: 1,
      infos: 1,
      unvalidatedArtifacts: 0,
      importedDiagnostics: 1,
      unsupportedFeatures: 1,
    });
  });
});

describe('validateAppGraph', () => {
  it('preserves imported diagnostic origin', () => {
    const imported = diagnostic({
      code: 'ARTIFACT-MISSING',
      phase: 'artifact-resolution',
      origin: 'artifact-resolver',
      message: 'missing Surface',
    });

    const report = validateAppGraph({
      manifest: loadedHandle(),
      artifactResolution: { diagnostics: [imported] },
    });

    expect(report.diagnostics).toContainEqual(imported);
    expect(report.summary.importedDiagnostics).toBe(1);
  });

  it('skips cross-artifact validation when any handle is unresolved', () => {
    const crossArtifact = vi.fn(() => [diagnostic({ code: 'SHOULD-NOT-RUN' })]);
    const report = validateAppGraph({
      manifest: loadedHandle(),
      artifacts: {
        surfaces: [{
          slot: 'surfaces[0]',
          artifactKind: 'surface',
          status: 'missing',
          ref: { url: 'https://example.gov/surface' },
        }],
      },
      artifactResolution: {
        diagnostics: [
          diagnostic({
            code: 'ARTIFACT-MISSING',
            phase: 'artifact-resolution',
            origin: 'artifact-resolver',
            message: 'surface missing',
          }),
        ],
      },
      crossArtifactValidators: [crossArtifact],
    });

    expect(crossArtifact).not.toHaveBeenCalled();
    expect(report.phases).toContainEqual({
      phase: 'cross-artifact',
      status: 'skipped',
      reason: 'unresolved-artifacts',
    });
  });

  it('skips cross-artifact validation when schema validation returns errors', () => {
    const crossArtifact = vi.fn(() => [diagnostic({ code: 'SHOULD-NOT-RUN' })]);
    const report = validateAppGraph({
      manifest: loadedHandle({ schemaId: 'app-manifest' }),
      schemaValidators: {
        'app-manifest': () => ({
          ok: false,
          issues: [{ keyword: 'required', path: '/definitions', message: 'definitions is required' }],
        }),
      },
      crossArtifactValidators: [crossArtifact],
    });

    expect(crossArtifact).not.toHaveBeenCalled();
    expect(report.schemaResults[0]).toMatchObject({
      ok: false,
      slot: 'app',
      status: 'completed',
    });
    expect(report.diagnostics[0]).toMatchObject({
      code: 'APP-GRAPH-SCHEMA',
      origin: 'schema-validator',
      phase: 'schema',
      primarySource: { artifactSlot: 'app', jsonPointer: '/definitions' },
    });
    expect(report.phases).toContainEqual({
      phase: 'cross-artifact',
      status: 'skipped',
      reason: 'schema-errors',
    });
  });

  it('skips cross-artifact validation when schema validators are missing', () => {
    const crossArtifact = vi.fn(() => [diagnostic({ code: 'SHOULD-NOT-RUN' })]);
    const report = validateAppGraph({
      manifest: loadedHandle({ schemaId: 'app-manifest' }),
      crossArtifactValidators: [crossArtifact],
    });

    expect(crossArtifact).not.toHaveBeenCalled();
    expect(report.schemaResults[0]).toMatchObject({
      ok: true,
      slot: 'app',
      status: 'not-run',
      reason: 'missing-schema-validator',
    });
    expect(report.summary.unvalidatedArtifacts).toBe(1);
    expect(report.phases).toContainEqual({
      phase: 'schema',
      status: 'skipped',
      reason: 'missing-schema-validators',
    });
    expect(report.phases).toContainEqual({
      phase: 'cross-artifact',
      status: 'skipped',
      reason: 'missing-schema-validators',
    });
  });

  it('runs injected cross-artifact validators only after loaded schema-valid inputs', () => {
    const report = validateAppGraph({
      manifest: loadedHandle(),
      artifacts: {
        dataSources: [loadedHandle({
          slot: 'dataSources[0]',
          artifactKind: 'dataSources',
          document: { $formspecDataSources: '1.0' },
        })],
      },
      schemaValidators: () => ({ ok: true }),
      crossArtifactValidators: [
        ({ handles }) => [
          diagnostic({
            code: 'APP-GRAPH-CROSS-TEST',
            phase: 'cross-artifact',
            message: `checked ${handles.length} handles`,
          }),
        ],
      ],
    });

    expect(report.phases).toContainEqual({ phase: 'cross-artifact', status: 'completed' });
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'APP-GRAPH-CROSS-TEST',
      message: 'checked 2 handles',
    }));
  });
});

describe('artifactIdentityKey', () => {
  it('does not use local source paths as identity authority', () => {
    const handle = loadedHandle({
      slot: 'surfaces[0]',
      artifactKind: 'surface',
      source: '/tmp/fixtures/main.surface.json',
      identity: { id: 'local-surface-id' },
    });

    expect(artifactIdentityKey(handle)).toBe('surface:surfaces[0]');
    expect(artifactIdentityKey(handle)).not.toContain('/tmp/fixtures');
    expect(artifactIdentityKey(handle)).not.toContain('local-surface-id');
  });

  it('uses App Manifest sibling refs before document-local identity', () => {
    const handle = loadedHandle({
      slot: 'surfaces[0]',
      artifactKind: 'surface',
      source: '/tmp/fixtures/main.surface.json',
      ref: { url: 'https://example.gov/apps/intake/surface', version: '1.0.0' },
      identity: { id: 'local-surface-id' },
    });

    expect(artifactIdentityKey(handle)).toBe('surface:https://example.gov/apps/intake/surface@1.0.0');
  });
});
