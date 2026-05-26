import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
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
