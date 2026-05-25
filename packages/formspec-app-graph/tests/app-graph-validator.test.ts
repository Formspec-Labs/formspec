import { describe, expect, it, vi } from 'vitest';
import {
  artifactIdentityKey,
  createAppGraphReport,
  validateAppGraph,
  type AppGraphDiagnostic,
  type ResolvedArtifactHandle,
} from '../src/index.js';

const UI_GRAPH_POLICY_SCHEMA_ID = 'https://formspec.org/schemas/uiGraphPolicy/0.1';

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
        diagnostic({ code: 'UI-POLICY-ROUTE-REF', origin: 'ui-graph-policy', message: 'policy route' }),
        diagnostic({ code: 'M-WARN', severity: 'warning', phase: 'module-resolution', origin: 'module-resolver', message: 'm' }),
      ],
      phases: [
        { phase: 'cross-artifact', status: 'not-run', reason: 'no-cross-artifact-validators' },
        { phase: 'schema', status: 'completed' },
      ],
      schemaResults: [],
    });

    expect(report.ok).toBe(false);
    expect(report.diagnostics.map((entry) => entry.code)).toEqual(['A-ERROR', 'UI-POLICY-ROUTE-REF', 'M-WARN', 'Z-INFO']);
    expect(report.summary).toMatchObject({
      errors: 2,
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

  it('validates UI Graph Policy host evidence with explicit evidence validators', () => {
    const policyDocument = {
      $formspecUiGraphPolicy: '0.1',
      version: '1.0.0',
      targetSurface: { url: 'https://example.gov/apps/intake/surfaces/respondent' },
      routePolicies: [{ routeId: 'review' }],
    };
    const evidenceSchemaValidator = vi.fn(() => ({ ok: true }));
    const crossArtifact = vi.fn(() => []);
    const report = validateAppGraph({
      manifest: loadedHandle({ schemaId: 'app-manifest' }),
      artifacts: {
        surfaces: [loadedHandle({
          slot: 'surfaces[0]',
          artifactKind: 'surface',
          schemaId: 'surface',
          ref: { url: 'https://example.gov/apps/intake/surfaces/respondent' },
          document: {
            $formspecSurface: '0.1',
            id: 'respondent',
            entry: 'review',
            routes: [{
              id: 'review',
              path: '/review',
              slots: [{ id: 'main', slotType: 'static-content', binding: { kind: 'text', content: 'Review' } }],
            }],
          },
        })],
      },
      hostEvidence: {
        uiGraphPolicies: [{
          schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
          source: 'host://policy/respondent-ui-policy',
          document: policyDocument,
        }],
      },
      schemaValidators: () => ({ ok: true }),
      evidenceSchemaValidators: { [UI_GRAPH_POLICY_SCHEMA_ID]: evidenceSchemaValidator },
      crossArtifactValidators: [crossArtifact],
    });

    expect(evidenceSchemaValidator).toHaveBeenCalledWith({
      evidenceSlot: 'hostEvidence.uiGraphPolicies[0]',
      evidenceKind: 'uiGraphPolicy',
      schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
      source: 'host://policy/respondent-ui-policy',
      document: policyDocument,
    });
    expect(crossArtifact).toHaveBeenCalledWith(expect.objectContaining({
      evidenceResults: [expect.objectContaining({
        evidenceSlot: 'hostEvidence.uiGraphPolicies[0]',
        ok: true,
        status: 'completed',
      })],
      hostEvidence: expect.objectContaining({
        uiGraphPolicies: expect.any(Array),
      }),
    }));
    expect(report.schemaResults).toHaveLength(2);
    expect(report.schemaResults).toContainEqual(expect.objectContaining({ slot: 'app', artifactKind: 'appManifest' }));
    expect(report.evidenceResults[0]).toEqual(expect.not.objectContaining({ artifactKind: expect.anything() }));
    expect(report.phases).toContainEqual({ phase: 'cross-artifact', status: 'completed' });
  });

  it('reports invalid UI Graph Policy host evidence without artifact identity fields', () => {
    const crossArtifact = vi.fn(() => [diagnostic({ code: 'SHOULD-NOT-RUN' })]);
    const report = validateAppGraph({
      manifest: loadedHandle({ schemaId: 'app-manifest' }),
      hostEvidence: {
        uiGraphPolicies: [{
          schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
          source: 'host://policy/respondent-ui-policy',
          document: { uiGraphPolicy: '0.1' },
        }],
      },
      schemaValidators: { 'app-manifest': () => ({ ok: true }) },
      evidenceSchemaValidators: {
        [UI_GRAPH_POLICY_SCHEMA_ID]: () => ({
          ok: false,
          issues: [{
            keyword: 'required',
            path: '/families',
            message: 'families is required',
          }],
        }),
      },
      crossArtifactValidators: [crossArtifact],
    });

    expect(crossArtifact).not.toHaveBeenCalled();
    expect(report.summary.schemaFailures).toBe(1);
    expect(report.summary.unvalidatedArtifacts).toBe(0);
    expect(report.evidenceResults[0]).toMatchObject({
      evidenceSlot: 'hostEvidence.uiGraphPolicies[0]',
      status: 'completed',
      ok: false,
    });
    expect(report.diagnostics[0]).toMatchObject({
      code: 'APP-GRAPH-SCHEMA',
      origin: 'schema-validator',
      phase: 'schema',
      primarySource: {
        artifactSlot: 'hostEvidence.uiGraphPolicies[0]',
        source: 'host://policy/respondent-ui-policy',
        jsonPointer: '/families',
      },
    });
    expect(report.diagnostics[0].primarySource).toEqual(expect.not.objectContaining({
      artifactKind: expect.anything(),
      ref: expect.anything(),
    }));
    expect(report.phases).toContainEqual({
      phase: 'cross-artifact',
      status: 'skipped',
      reason: 'schema-errors',
    });
  });

  it('rejects UI Graph Policy host evidence with the wrong schema id', () => {
    const evidenceSchemaValidator = vi.fn(() => ({ ok: true }));
    const crossArtifact = vi.fn(() => [diagnostic({ code: 'SHOULD-NOT-RUN' })]);
    const report = validateAppGraph({
      manifest: loadedHandle({ schemaId: 'app-manifest' }),
      hostEvidence: {
        uiGraphPolicies: [{
          schemaId: 'https://formspec.org/schemas/uiGraphPolicy/9.9',
          source: 'host://policy/respondent-ui-policy',
          document: { uiGraphPolicy: '0.1', families: [] },
        }],
      },
      schemaValidators: { 'app-manifest': () => ({ ok: true }) },
      evidenceSchemaValidators: { '*': evidenceSchemaValidator },
      crossArtifactValidators: [crossArtifact],
    });

    expect(evidenceSchemaValidator).not.toHaveBeenCalled();
    expect(crossArtifact).not.toHaveBeenCalled();
    expect(report.summary.schemaFailures).toBe(1);
    expect(report.evidenceResults[0]).toMatchObject({
      evidenceSlot: 'hostEvidence.uiGraphPolicies[0]',
      schemaId: 'https://formspec.org/schemas/uiGraphPolicy/9.9',
      status: 'completed',
      ok: false,
    });
    expect(report.diagnostics[0]).toMatchObject({
      code: 'APP-GRAPH-EVIDENCE-SCHEMA-ID',
      primarySource: {
        artifactSlot: 'hostEvidence.uiGraphPolicies[0]',
        source: 'host://policy/respondent-ui-policy',
        jsonPointer: '/schemaId',
      },
    });
    expect(report.diagnostics[0].primarySource).toEqual(expect.not.objectContaining({
      artifactKind: expect.anything(),
      ref: expect.anything(),
    }));
  });

  it('clamps caller-supplied host evidence diagnostics to schema evidence pointers', () => {
    const report = validateAppGraph({
      manifest: loadedHandle({ schemaId: 'app-manifest' }),
      hostEvidence: {
        uiGraphPolicies: [{
          schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
          source: 'host://policy/respondent-ui-policy',
          document: { uiGraphPolicy: '0.1', families: [] },
        }],
      },
      schemaValidators: { 'app-manifest': () => ({ ok: true }) },
      evidenceSchemaValidators: {
        [UI_GRAPH_POLICY_SCHEMA_ID]: () => ({
          ok: false,
          diagnostics: [
            diagnostic({
              code: 'LEAKY-EVIDENCE-DIAGNOSTIC',
              phase: 'cross-artifact',
              origin: 'ui-graph-policy',
              message: 'do not preserve semantic diagnostic fields',
              primarySource: {
                artifactSlot: 'uiGraphPolicies[0]',
                artifactKind: 'uiGraphPolicy',
                ref: { url: 'https://example.gov/policy' },
                source: '/tmp/policy.json',
                jsonPointer: '/families',
              },
              relatedSources: [{
                artifactSlot: 'surfaces[0]',
                artifactKind: 'surface',
              }],
            }),
          ],
        }),
      },
    });

    expect(report.summary.schemaFailures).toBe(1);
    expect(report.summary.graphErrors).toBe(0);
    expect(report.evidenceResults[0].diagnostics[0]).toMatchObject({
      code: 'LEAKY-EVIDENCE-DIAGNOSTIC',
      phase: 'schema',
      origin: 'schema-validator',
      primarySource: {
        artifactSlot: 'hostEvidence.uiGraphPolicies[0]',
        source: 'host://policy/respondent-ui-policy',
        jsonPointer: '/families',
      },
    });
    expect(report.evidenceResults[0].diagnostics[0]).not.toHaveProperty('relatedSources');
    expect(report.evidenceResults[0].diagnostics[0].primarySource).toEqual(expect.not.objectContaining({
      artifactKind: expect.anything(),
      ref: expect.anything(),
    }));
    expect(report.diagnostics[0]).toMatchObject({
      code: 'LEAKY-EVIDENCE-DIAGNOSTIC',
      phase: 'schema',
      origin: 'schema-validator',
    });
  });

  it('keeps artifact schema validators separate from host evidence validators', () => {
    const artifactSchemaValidator = vi.fn(() => ({ ok: true }));
    const crossArtifact = vi.fn(() => [diagnostic({ code: 'SHOULD-NOT-RUN' })]);
    const report = validateAppGraph({
      manifest: loadedHandle({ schemaId: 'app-manifest' }),
      hostEvidence: {
        uiGraphPolicies: [{
          schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
          source: 'host://policy/respondent-ui-policy',
          document: { uiGraphPolicy: '0.1', families: [] },
        }],
      },
      schemaValidators: artifactSchemaValidator,
      crossArtifactValidators: [crossArtifact],
    });

    expect(artifactSchemaValidator).toHaveBeenCalledTimes(1);
    expect(crossArtifact).not.toHaveBeenCalled();
    expect(report.evidenceResults[0]).toMatchObject({
      evidenceSlot: 'hostEvidence.uiGraphPolicies[0]',
      status: 'not-run',
      reason: 'missing-schema-validator',
      ok: true,
    });
    expect(report.summary.unvalidatedArtifacts).toBe(0);
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

  it('skips UI Graph Policy semantics when policy evidence schema validation fails', () => {
    const report = validateAppGraph({
      manifest: loadedHandle({ schemaId: 'app-manifest' }),
      artifacts: {
        surfaces: [loadedHandle({
          slot: 'surfaces[0]',
          artifactKind: 'surface',
          ref: { url: 'https://example.gov/apps/intake/surfaces/respondent' },
          document: { routes: [{ id: 'review', slots: [] }] },
        })],
      },
      hostEvidence: {
        uiGraphPolicies: [{
          schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
          source: 'host://policy/respondent-ui-policy',
          document: {
            $formspecUiGraphPolicy: '0.1',
            version: '1.0.0',
            targetSurface: { url: 'https://example.gov/apps/intake/surfaces/admin' },
            routePolicies: [{ routeId: 'review' }],
          },
        }],
      },
      schemaValidators: () => ({ ok: true }),
      evidenceSchemaValidators: {
        [UI_GRAPH_POLICY_SCHEMA_ID]: () => ({
          ok: false,
          issues: [{ path: '/routePolicies', message: 'schema failed before semantics' }],
        }),
      },
    });

    expect(report.diagnostics.map((entry) => entry.code)).not.toContain('UI-POLICY-SURFACE-TARGET');
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'APP-GRAPH-SCHEMA',
      phase: 'schema',
      origin: 'schema-validator',
    }));
    expect(report.phases).toContainEqual({
      phase: 'cross-artifact',
      status: 'skipped',
      reason: 'schema-errors',
    });
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
