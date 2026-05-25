import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  moduleResolverInputFromAppGraph,
  resolveModules,
  validateAppGraph,
  type AppGraphHostEvidence,
  type ModulePayloadValidator,
  type ResolvedArtifactHandle,
} from '../src/index.js';

interface GraphCollectorFixture {
  id: string;
  description: string;
  graph: {
    manifest: ResolvedArtifactHandle;
    handles: ResolvedArtifactHandle[];
    hostEvidence?: AppGraphHostEvidence;
  };
  expected: {
    appModuleIds: string[];
    surfaceWidgetUseName: string;
    surfaceWidgetExpectedOwnerModuleId: string;
    experienceUnitUseName: string;
    responseActionUseName: string;
    themeWidgetUseNames: string[];
    uiPolicyWidgetUseName: string;
    uiPolicyExpectedOwnerModuleId: string;
    fallbackSurfaceWidgetUseName: string;
    fallbackDiagnosticCode: string;
    wrongOwnerSurfaceWidgetUseName: string;
    wrongOwnerDiagnosticCode: string;
    contributionNames: string[];
    absentAppGraphDiagnostics: string[];
  };
}

const FIXTURE_PATH = resolve(
  fileURLToPath(new URL('../../../tests/conformance/fixtures/module-resolver-graph/graph-collector-handoff.case.json', import.meta.url)),
);

const widgetShapePropsValidator: ModulePayloadValidator = ({ payload, schema }) => {
  const payloadRecord = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : undefined;
  const schemaRecord = schema && typeof schema === 'object' && !Array.isArray(schema)
    ? schema as { required?: unknown; properties?: Record<string, { type?: string }> }
    : undefined;
  if (!payloadRecord || !schemaRecord) return { ok: false };

  for (const key of Array.isArray(schemaRecord.required) ? schemaRecord.required : []) {
    if (typeof key === 'string' && !(key in payloadRecord)) {
      return { ok: false, path: key };
    }
  }
  for (const [key, property] of Object.entries(schemaRecord.properties ?? {})) {
    if (!(key in payloadRecord) || !property.type) continue;
    const actualType = typeof payloadRecord[key];
    if (actualType !== property.type) return { ok: false, path: key };
  }
  return { ok: true };
};

function fixture(): GraphCollectorFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as GraphCollectorFixture;
}

function graphWithSurfaceWidgetName(
  graph: GraphCollectorFixture['graph'],
  widgetName: string,
): GraphCollectorFixture['graph'] {
  const cloned = structuredClone(graph);
  const surface = cloned.handles.find((handle) => handle.artifactKind === 'surface') as ResolvedArtifactHandle<{
    routes: Array<{
      slots: Array<{
        binding: {
          widgetName: string;
        };
      }>;
    }>;
  }> | undefined;
  expect(surface, 'missing fallback surface fixture handle').toBeDefined();
  surface!.document!.routes[0].slots[0].binding.widgetName = widgetName;
  return cloned;
}

describe('ModuleResolver graph collector conformance fixtures', () => {
  it('collects graph evidence and feeds AppGraphValidator UI policy semantics', () => {
    const testCase = fixture();
    const resolverInput = moduleResolverInputFromAppGraph({
      ...testCase.graph,
      support: {
        payloadSchemaValidators: ['widgetShape.props'],
        payloadValidators: {
          'widgetShape.props': widgetShapePropsValidator,
        },
      },
    });

    expect(resolverInput.appModules.map((module) => module.id)).toEqual(testCase.expected.appModuleIds);
    expect(resolverInput.registries).toHaveLength(1);

    const surfaceDocument = resolverInput.documents?.find((document) => document.artifactSlot === 'surfaces[0]');
    expect(surfaceDocument?.uses?.[0]).toMatchObject({
      site: 'surface.module-widget.binding.widgetName',
      name: testCase.expected.surfaceWidgetUseName,
      expectedCategory: 'widget',
      expectedOwnerModuleId: testCase.expected.surfaceWidgetExpectedOwnerModuleId,
      source: {
        artifactSlot: 'surfaces[0]',
        artifactKind: 'surface',
        source: 'memory://surface/review',
        jsonPointer: '/routes/0/slots/0/binding/widgetName',
      },
      payloadSource: {
        artifactSlot: 'surfaces[0]',
        artifactKind: 'surface',
        source: 'memory://surface/review',
        jsonPointer: '/routes/0/slots/0/binding/config',
      },
    });

    const experienceDocument = resolverInput.documents?.find((document) => document.artifactSlot === 'experiences[0]');
    expect(experienceDocument?.uses?.[0]).toMatchObject({
      site: 'experience.units.kind',
      name: testCase.expected.experienceUnitUseName,
      expectedCategory: 'unit-kind',
      source: {
        artifactSlot: 'experiences[0]',
        artifactKind: 'experience',
        source: 'memory://experience/review',
        jsonPointer: '/units/0/kind',
      },
    });

    const responseActionsDocument = resolverInput.documents?.find((document) => document.artifactSlot === 'responseActions');
    expect(responseActionsDocument?.uses?.[0]).toMatchObject({
      site: 'response-actions.actions.intent',
      name: testCase.expected.responseActionUseName,
      expectedCategory: 'action-intent',
      source: {
        artifactSlot: 'responseActions',
        artifactKind: 'responseActions',
        source: 'memory://response-actions',
        jsonPointer: '/actions/0/intent',
      },
    });

    const themeDocument = resolverInput.documents?.find((document) => document.artifactSlot === 'themes[0]');
    expect(themeDocument?.uses?.map((use) => use.name)).toEqual(testCase.expected.themeWidgetUseNames);
    expect(themeDocument?.uses).toEqual([
      expect.objectContaining({
        site: 'theme.presentation.widget',
        name: 'x-theme-money',
        expectedCategory: 'widget',
        source: expect.objectContaining({ jsonPointer: '/defaults/widget' }),
        payloadSource: expect.objectContaining({ jsonPointer: '/defaults/widgetConfig' }),
      }),
      expect.objectContaining({
        site: 'theme.presentation.widget',
        name: 'x-theme-date',
        expectedCategory: 'widget',
        source: expect.objectContaining({ jsonPointer: '/selectors/0/apply/widget' }),
        payloadSource: expect.objectContaining({ jsonPointer: '/selectors/0/apply/widgetConfig' }),
      }),
      expect.objectContaining({
        site: 'theme.presentation.widget',
        name: 'x-theme-case-id',
        expectedCategory: 'widget',
        source: expect.objectContaining({ jsonPointer: '/items/caseId/widget' }),
        payloadSource: expect.objectContaining({ jsonPointer: '/items/caseId/widgetConfig' }),
      }),
    ]);

    const uiPolicyDocument = resolverInput.documents?.find((document) =>
      document.artifactSlot === 'hostEvidence.uiGraphPolicies[0]'
    );
    expect(uiPolicyDocument?.uses?.[0]).toMatchObject({
      site: 'ui-graph-policy.theme.assignments.widgetRef',
      name: testCase.expected.uiPolicyWidgetUseName,
      expectedCategory: 'widget',
      expectedOwnerModuleId: testCase.expected.uiPolicyExpectedOwnerModuleId,
      source: {
        artifactSlot: 'hostEvidence.uiGraphPolicies[0]',
        artifactKind: 'hostEvidence',
        source: 'host://policy/review',
        jsonPointer: '/theme/assignments/0/widgetRef',
      },
    });

    const moduleResolution = resolveModules(resolverInput);
    expect(moduleResolution.ok).toBe(true);
    expect(moduleResolution.diagnostics).toEqual([]);
    expect(moduleResolution.contributions.map((contribution) => contribution.name)).toEqual(
      testCase.expected.contributionNames,
    );
    expect(moduleResolution.contributions.find((contribution) =>
      contribution.name === testCase.expected.surfaceWidgetUseName
    )).toMatchObject({
      status: 'resolved',
      payloadStatus: 'passed',
      owningModules: [{ id: 'x-acme-surface', version: '1.0.0' }],
    });

    const appGraphReport = validateAppGraph({
      manifest: testCase.graph.manifest,
      artifacts: {
        handles: testCase.graph.handles,
      },
      hostEvidence: testCase.graph.hostEvidence,
      moduleResolution,
      schemaValidators: () => ({ ok: true }),
      evidenceSchemaValidators: () => ({ ok: true }),
    });

    expect(appGraphReport.ok).toBe(true);
    for (const code of testCase.expected.absentAppGraphDiagnostics) {
      expect(appGraphReport.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(code);
    }
  });

  it('preserves untranslated Surface widget names for resolver-owned diagnostics', () => {
    const testCase = fixture();
    const fallbackGraph = graphWithSurfaceWidgetName(
      testCase.graph,
      testCase.expected.fallbackSurfaceWidgetUseName,
    );
    const resolverInput = moduleResolverInputFromAppGraph(fallbackGraph);

    const surfaceDocument = resolverInput.documents?.find((document) => document.artifactSlot === 'surfaces[0]');
    expect(surfaceDocument?.uses?.[0]).toMatchObject({
      site: 'surface.module-widget.binding.widgetName',
      name: testCase.expected.fallbackSurfaceWidgetUseName,
      expectedCategory: 'widget',
      expectedOwnerModuleId: testCase.expected.surfaceWidgetExpectedOwnerModuleId,
      source: {
        artifactSlot: 'surfaces[0]',
        artifactKind: 'surface',
        source: 'memory://surface/review',
        jsonPointer: '/routes/0/slots/0/binding/widgetName',
      },
    });

    const moduleResolution = resolveModules(resolverInput);
    expect(moduleResolution.ok).toBe(false);
    expect(moduleResolution.diagnostics).toContainEqual(expect.objectContaining({
      code: testCase.expected.fallbackDiagnosticCode,
      origin: 'module-resolver',
      phase: 'module-resolution',
      primarySource: expect.objectContaining({
        artifactSlot: 'surfaces[0]',
        artifactKind: 'surface',
        source: 'memory://surface/review',
        jsonPointer: '/routes/0/slots/0/binding/widgetName',
      }),
    }));
  });

  it('does not resolve a Surface widget through the wrong admitted owner', () => {
    const testCase = fixture();
    const wrongOwnerGraph = graphWithSurfaceWidgetName(
      testCase.graph,
      testCase.expected.wrongOwnerSurfaceWidgetUseName,
    );
    const resolverInput = moduleResolverInputFromAppGraph(wrongOwnerGraph);

    const moduleResolution = resolveModules(resolverInput);
    expect(moduleResolution.ok).toBe(false);
    expect(moduleResolution.contributions.find((contribution) =>
      contribution.site === 'surface.module-widget.binding.widgetName'
    )).toMatchObject({
      name: testCase.expected.wrongOwnerSurfaceWidgetUseName,
      status: 'owner-mismatch',
      owningModules: [{ id: 'x-reviewer', version: '1.0.0' }],
    });
    expect(moduleResolution.diagnostics).toContainEqual(expect.objectContaining({
      code: testCase.expected.wrongOwnerDiagnosticCode,
      origin: 'module-resolver',
      phase: 'module-resolution',
      details: expect.objectContaining({
        contribution: testCase.expected.wrongOwnerSurfaceWidgetUseName,
        expectedOwnerModuleId: testCase.expected.surfaceWidgetExpectedOwnerModuleId,
        owningModules: ['x-reviewer'],
      }),
    }));
  });
});
