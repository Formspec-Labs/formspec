import { describe, expect, it, vi } from 'vitest';
import type {
  ModuleResolutionDiagnostic,
  ModuleResolutionReport,
} from '@formspec-org/types';
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

function moduleResolutionReport(partial: Partial<ModuleResolutionReport> = {}): ModuleResolutionReport {
  const diagnostics = partial.diagnostics ?? [];
  return {
    ok: partial.ok ?? diagnostics.every((entry) => entry.severity !== 'error'),
    modules: partial.modules ?? [],
    documents: partial.documents ?? [],
    contributions: partial.contributions ?? [],
    diagnostics,
    summary: partial.summary ?? {
      modules: 0,
      admittedModules: 0,
      deniedModules: 0,
      documents: 0,
      contributions: 0,
      unresolvedDependencies: diagnostics.filter((entry) => entry.code === 'MODULE-DEPENDENCY-UNRESOLVED').length,
      unresolvedContributions: 0,
      payloadFailures: 0,
      errors: diagnostics.filter((entry) => entry.severity === 'error').length,
      warnings: diagnostics.filter((entry) => entry.severity === 'warning').length,
      infos: diagnostics.filter((entry) => entry.severity === 'info').length,
    },
    phase: partial.phase ?? { phase: 'module-resolution', status: 'completed' },
    ...(partial.support ? { support: partial.support } : {}),
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

  it('passes typed ModuleResolutionReport evidence to cross-artifact validators and reflects its phase', () => {
    const moduleResolution = moduleResolutionReport({
      phase: { phase: 'module-resolution', status: 'skipped', reason: 'support-disabled' },
    });
    const crossArtifact = vi.fn(() => []);

    const report = validateAppGraph({
      manifest: loadedHandle(),
      moduleResolution,
      schemaValidators: () => ({ ok: true }),
      crossArtifactValidators: [crossArtifact],
    });

    expect(crossArtifact).toHaveBeenCalledWith(expect.objectContaining({
      moduleResolution,
    }));
    expect(report.phases).toContainEqual({
      phase: 'module-resolution',
      status: 'skipped',
      reason: 'support-disabled',
    });
  });

  it('sanitizes imported ModuleResolver source pointers without mutating the resolver report', () => {
    const moduleDiagnostic: ModuleResolutionDiagnostic = {
      code: 'MODULE-ADMISSION-DENIED',
      severity: 'error',
      phase: 'module-resolution',
      origin: 'module-resolver',
      message: 'Module x-denied is not admitted.',
      primarySource: {
        artifactSlot: 'app',
        artifactKind: 'appManifest',
        source: 'memory://app',
        jsonPointer: '/modules/0',
        ref: { url: 'https://example.gov/app', version: '2.2' },
        module: { id: 'x-denied', version: '1.0.0' },
      },
      relatedSources: [{
        artifactSlot: 'registries[0]',
        artifactKind: 'registry',
        source: 'memory://registry',
        jsonPointer: '/entries/0',
        ref: { url: 'https://example.gov/registry', version: '1.0.0' },
        module: { id: 'x-denied', version: '1.0.0' },
      }],
      details: { moduleId: 'x-denied' },
    };
    const moduleResolution = moduleResolutionReport({
      ok: false,
      diagnostics: [moduleDiagnostic],
    });

    const report = validateAppGraph({
      manifest: loadedHandle(),
      moduleResolution,
    });

    const imported = report.diagnostics.find((entry) => entry.code === 'MODULE-ADMISSION-DENIED');
    expect(imported).toMatchObject({
      origin: 'module-resolver',
      phase: 'module-resolution',
      primarySource: {
        artifactSlot: 'app',
        artifactKind: 'appManifest',
        source: 'memory://app',
        jsonPointer: '/modules/0',
        ref: { url: 'https://example.gov/app', version: '2.2' },
      },
      relatedSources: [expect.objectContaining({
        artifactSlot: 'registries[0]',
        artifactKind: 'registry',
        source: 'memory://registry',
        jsonPointer: '/entries/0',
      })],
      details: { moduleId: 'x-denied' },
    });
    expect(imported?.primarySource).not.toHaveProperty('module');
    expect(imported?.relatedSources?.[0]).not.toHaveProperty('module');
    expect(moduleDiagnostic.primarySource).toHaveProperty('module');
    expect(moduleDiagnostic.relatedSources?.[0]).toHaveProperty('module');
    expect(report.summary.importedDiagnostics).toBe(1);
  });

  it('sanitizes imported ModuleResolver host-evidence source pointers without mutating the resolver report', () => {
    const moduleDiagnostic: ModuleResolutionDiagnostic = {
      code: 'MODULE-CONTRIBUTION-UNADMITTED',
      severity: 'error',
      phase: 'module-resolution',
      origin: 'module-resolver',
      message: 'Contribution x-review-panel is not admitted.',
      primarySource: {
        artifactSlot: 'hostEvidence.uiGraphPolicies[0]',
        artifactKind: 'hostEvidence',
        source: 'host://policy/theme-widget',
        jsonPointer: '/theme/assignments/0/widgetRef',
        ref: { url: 'https://example.gov/policies/theme-widget' },
        module: { id: 'x-reviewer', version: '1.0.0' },
      },
      details: { name: 'x-review-panel' },
    };
    const moduleResolution = moduleResolutionReport({
      ok: false,
      diagnostics: [moduleDiagnostic],
    });

    const report = validateAppGraph({
      manifest: loadedHandle(),
      moduleResolution,
    });

    const imported = report.diagnostics.find((entry) => entry.code === 'MODULE-CONTRIBUTION-UNADMITTED');
    expect(imported).toMatchObject({
      origin: 'module-resolver',
      phase: 'module-resolution',
      primarySource: {
        artifactSlot: 'hostEvidence.uiGraphPolicies[0]',
        source: 'host://policy/theme-widget',
        jsonPointer: '/theme/assignments/0/widgetRef',
      },
      details: { name: 'x-review-panel' },
    });
    expect(imported?.primarySource).not.toHaveProperty('artifactKind');
    expect(imported?.primarySource).not.toHaveProperty('ref');
    expect(imported?.primarySource).not.toHaveProperty('module');
    expect(moduleDiagnostic.primarySource).toHaveProperty('artifactKind');
    expect(moduleDiagnostic.primarySource).toHaveProperty('ref');
    expect(moduleDiagnostic.primarySource).toHaveProperty('module');
    expect(report.summary.importedDiagnostics).toBe(1);
  });

  it('does not duplicate nested ModuleResolutionReport diagnostics', () => {
    const nestedDiagnostic: ModuleResolutionDiagnostic = {
      code: 'MODULE-NESTED-SHOULD-NOT-IMPORT',
      severity: 'error',
      phase: 'module-resolution',
      origin: 'module-resolver',
      message: 'nested module diagnostic',
      primarySource: {
        artifactSlot: 'app',
        artifactKind: 'appManifest',
        source: 'memory://app',
        jsonPointer: '/modules/0',
      },
    };
    const moduleResolution = moduleResolutionReport({
      modules: [{
        ref: { id: 'x-review', version: '1.0.0' },
        status: 'admitted',
        source: {
          artifactSlot: 'app',
          artifactKind: 'appManifest',
          source: 'memory://app',
          jsonPointer: '/modules/0',
        },
        diagnostics: [nestedDiagnostic],
      }],
    });

    const report = validateAppGraph({
      manifest: loadedHandle(),
      moduleResolution,
    });

    expect(report.diagnostics.map((entry) => entry.code)).not.toContain('MODULE-NESTED-SHOULD-NOT-IMPORT');
    expect(report.summary.importedDiagnostics).toBe(0);
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
          schemaId: 'surface',
          ref: { url: 'https://example.gov/apps/intake/surfaces/respondent' },
          document: { routes: [{ id: 'review', slots: [] }] },
        })],
        locales: [loadedHandle({
          slot: 'locales[0]',
          artifactKind: 'locale',
          schemaId: 'locale',
          source: 'memory://locale/en',
          document: {
            $formspecLocale: '1.0',
            version: '1.0.0',
            locale: 'en',
            strings: {
              '$module.x-reviewer.heading': 'Review',
            },
          },
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
            localeKeyOwners: [{
              keyPrefix: '$module.x-reviewer.',
              moduleId: 'x-helper',
            }],
            routePolicies: [{ routeId: 'review' }],
            theme: {
              assignments: [{
                widgetRef: { moduleId: 'x-reviewer', widgetName: 'x-review-panel' },
                slot: 'accent',
                token: 'color.accent',
              }],
            },
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
    expect(report.diagnostics.map((entry) => entry.code)).not.toContain('LOCALE-KEY-OWNER');
    expect(report.diagnostics.map((entry) => entry.code)).not.toContain('LOCALE-KEY-OWNER-MODULE-MISMATCH');
    expect(report.diagnostics.map((entry) => entry.code)).not.toContain('LOCALE-KEY-OWNER-MODULE-REF');
    expect(report.diagnostics.map((entry) => entry.code)).not.toContain('THEME-TOKEN-WIDGET');
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

  it('skips UI Graph Policy semantics when policy evidence schema validation is not run', () => {
    const report = validateAppGraph({
      manifest: loadedHandle({ schemaId: 'app-manifest' }),
      artifacts: {
        surfaces: [loadedHandle({
          slot: 'surfaces[0]',
          artifactKind: 'surface',
          schemaId: 'surface',
          ref: { url: 'https://example.gov/apps/intake/surfaces/respondent' },
          document: { routes: [{ id: 'review', slots: [] }] },
        })],
        locales: [loadedHandle({
          slot: 'locales[0]',
          artifactKind: 'locale',
          schemaId: 'locale',
          source: 'memory://locale/en',
          document: {
            $formspecLocale: '1.0',
            version: '1.0.0',
            locale: 'en',
            strings: {
              '$module.x-reviewer.heading': 'Review',
            },
          },
        })],
      },
      hostEvidence: {
        uiGraphPolicies: [{
          schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
          source: 'host://policy/respondent-ui-policy',
          document: {
            $formspecUiGraphPolicy: '0.1',
            version: '1.0.0',
            targetSurface: { url: 'https://example.gov/apps/intake/surfaces/respondent' },
            localeKeyOwners: [{
              keyPrefix: '$module.x-reviewer.',
              moduleId: 'x-helper',
            }],
            routePolicies: [{ routeId: 'review' }],
            theme: {
              assignments: [{
                widgetRef: { moduleId: 'x-reviewer', widgetName: 'x-review-panel' },
                slot: 'accent',
                token: 'color.accent',
              }],
            },
          },
        }],
      },
      schemaValidators: () => ({ ok: true }),
    });

    expect(report.evidenceResults[0]).toMatchObject({
      evidenceSlot: 'hostEvidence.uiGraphPolicies[0]',
      status: 'not-run',
      reason: 'missing-schema-validator',
      ok: true,
    });
    expect(report.diagnostics.map((entry) => entry.code)).not.toContain('LOCALE-KEY-OWNER');
    expect(report.diagnostics.map((entry) => entry.code)).not.toContain('LOCALE-KEY-OWNER-MODULE-MISMATCH');
    expect(report.diagnostics.map((entry) => entry.code)).not.toContain('LOCALE-KEY-OWNER-MODULE-REF');
    expect(report.diagnostics.map((entry) => entry.code)).not.toContain('THEME-TOKEN-WIDGET');
    expect(report.phases).toContainEqual({
      phase: 'cross-artifact',
      status: 'skipped',
      reason: 'missing-schema-validators',
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
