import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  produceBundleExportAppGraphValidationReport,
  produceAppGraphValidationReport,
  type AppGraphHostEvidence,
  type ArtifactLoader,
  type ModulePayloadValidator,
} from '../src/index.js';

interface FixtureCase {
  id: string;
  manifest: unknown;
  loader?: {
    missing?: string[];
  };
  expected: {
    ok: boolean;
    loaderCalls: string[];
    diagnostics?: string[];
    crossArtifactSkippedReason?: string;
  };
}

interface Fixture {
  id: string;
  documents: Record<string, unknown>;
  hostEvidence: AppGraphHostEvidence;
  cases: FixtureCase[];
}

const FIXTURE_PATH = resolve(
  fileURLToPath(new URL('../../../tests/conformance/fixtures/artifact-resolution-graph/graph-pipeline-handoff.case.json', import.meta.url)),
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
    if (typeof payloadRecord[key] !== property.type) return { ok: false, path: key };
  }
  return { ok: true };
};

function fixture(): Fixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Fixture;
}

function loaderFor(testCase: FixtureCase, documents: Record<string, unknown>, calls: string[]): ArtifactLoader {
  const missing = new Set(testCase.loader?.missing ?? []);
  return ({ slot, artifactKind, ref }) => {
    calls.push(`${slot}:${artifactKind}:${ref.url}`);
    if (missing.has(ref.url ?? '') || documents[ref.url ?? ''] === undefined) {
      return { status: 'missing', source: ref.url };
    }
    return {
      status: 'loaded',
      document: documents[ref.url ?? ''],
      source: ref.url,
      digest: `sha256:${testCase.id}:${slot}`,
    };
  };
}

function assertNoFixturePathEvidence(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain('fixtures');
  expect(serialized).not.toContain('.case.json');
  expect(serialized).not.toContain('graph-pipeline-handoff');
}

describe('produceAppGraphValidationReport', () => {
  for (const testCase of fixture().cases) {
    it(`${testCase.id}: produces a completed AppGraph report from the graph-loading pipeline`, async () => {
      const testFixture = fixture();
      const calls: string[] = [];

      const result = await produceAppGraphValidationReport({
        manifest: testCase.manifest,
        loader: loaderFor(testCase, testFixture.documents, calls),
        source: 'memory://app-manifest',
        hostEvidence: testFixture.hostEvidence,
        moduleSupport: {
          payloadSchemaValidators: ['widgetShape.props'],
          payloadValidators: {
            'widgetShape.props': widgetShapePropsValidator,
          },
        },
        authorizationBoundary: { diagnostics: [] },
        unsupported: { diagnostics: [] },
        schemaValidators: () => ({ ok: true }),
        evidenceSchemaValidators: () => ({ ok: true }),
      });

      expect(calls).toEqual(testCase.expected.loaderCalls);
      expect(result.moduleResolutionReport.phase).toEqual({
        phase: 'module-resolution',
        status: 'completed',
      });
      expect(result.report.ok).toBe(testCase.expected.ok);
      expect(result.report.phases).toContainEqual({
        phase: 'artifact-resolution',
        status: 'completed',
      });
      expect(result.report.phases).toContainEqual({
        phase: 'module-resolution',
        status: 'completed',
      });
      expect(result.report.phases).toContainEqual({
        phase: 'authorization-boundary',
        status: 'completed',
      });
      expect(result.report.phases).toContainEqual({
        phase: 'unsupported',
        status: 'completed',
      });
      if (testCase.expected.ok) {
        expect(result.artifactResolutionReport.ok).toBe(true);
        expect(result.moduleResolutionReport.ok).toBe(true);
        expect(result.report.phases).toContainEqual({
          phase: 'schema',
          status: 'completed',
        });
        expect(result.report.phases).toContainEqual({
          phase: 'cross-artifact',
          status: 'completed',
        });
      }

      const diagnosticCodes = result.report.diagnostics.map((diagnostic) => diagnostic.code);
      for (const diagnosticCode of testCase.expected.diagnostics ?? []) {
        expect(diagnosticCodes.filter((code) => code === diagnosticCode)).toHaveLength(1);
      }
      if (testCase.expected.crossArtifactSkippedReason) {
        expect(result.report.phases).toContainEqual({
          phase: 'cross-artifact',
          status: 'skipped',
          reason: testCase.expected.crossArtifactSkippedReason,
        });
      }
      assertNoFixturePathEvidence(result.report);
    });
  }
});

describe('produceBundleExportAppGraphValidationReport', () => {
  const surfaceUrl = 'https://example.gov/surfaces/inline';
  const manifest = {
    $formspecBundle: '2.4',
    id: 'https://example.gov/apps/inline',
    version: '1.0.0',
    definitions: [],
    surfaces: [{ url: surfaceUrl, version: '1.0.0' }],
  };
  const surface = {
    $formspecSurface: '0.2',
    id: 'inline',
    entry: 'start',
    routes: [{ id: 'start', path: '/', slots: [] }],
  };

  it('completes schema and cross-artifact validation before typed dereference', async () => {
    const result = await produceBundleExportAppGraphValidationReport({
      manifest,
      documents: { [surfaceUrl]: surface },
      source: 'memory://inline-export',
      schemaValidators: () => ({ ok: true }),
    });

    expect(result.artifactResolutionReport.ok).toBe(true);
    expect(result.report.ok).toBe(true);
    expect(result.report.phases).toContainEqual({
      phase: 'cross-artifact',
      status: 'completed',
    });
    expect(result.artifactResolutionReport.artifacts.surfaces?.[0]?.document).toBe(surface);
  });

  it('does not treat an inherited document key as inline export content', async () => {
    const documents = Object.create({ [surfaceUrl]: surface }) as Record<string, unknown>;
    const result = await produceBundleExportAppGraphValidationReport({
      manifest,
      documents,
      source: 'memory://inline-export',
      schemaValidators: () => ({ ok: true }),
    });

    expect(result.report.ok).toBe(false);
    expect(result.report.diagnostics.map((entry) => entry.code)).toContain('ARTIFACT-MISSING');
    expect(result.report.phases).toContainEqual({
      phase: 'cross-artifact',
      status: 'skipped',
      reason: 'unresolved-artifacts',
    });
  });
});
