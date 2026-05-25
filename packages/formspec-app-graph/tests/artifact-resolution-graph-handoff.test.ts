import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  artifactResolutionGraphInput,
  moduleResolverInputFromAppGraph,
  resolveArtifacts,
  resolveModules,
  validateAppGraph,
  type AppGraphHostEvidence,
  type ArtifactLoader,
  type ModulePayloadValidator,
  type ResolvedArtifactHandle,
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
    noLoaderCallContains: string[];
    groups: Record<string, number>;
    contributions?: string[];
    diagnostics?: string[];
    unresolvedSlot?: string;
    crossArtifactSkippedReason?: string;
    absentDiagnostics: string[];
  };
}

interface Fixture {
  id: string;
  description: string;
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

function groupCounts(artifacts: Record<string, ResolvedArtifactHandle[] | undefined>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(artifacts).map(([group, handles]) => [group, handles?.length ?? 0]),
  );
}

function assertNoFixturePathEvidence(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain('fixtures');
  expect(serialized).not.toContain('.case.json');
  expect(serialized).not.toContain('graph-pipeline-handoff');
}

describe('ArtifactResolver graph handoff fixture', () => {
  for (const testCase of fixture().cases) {
    it(`${testCase.id}: feeds ArtifactResolver output through ModuleResolver and AppGraphValidator`, async () => {
      const testFixture = fixture();
      const calls: string[] = [];
      const artifactReport = await resolveArtifacts({
        manifest: testCase.manifest,
        loader: loaderFor(testCase, testFixture.documents, calls),
        source: 'memory://app-manifest',
      });
      const graphInput = artifactResolutionGraphInput(artifactReport);

      expect(calls).toEqual(testCase.expected.loaderCalls);
      expect(calls.some((call) => call.startsWith('modules') || call.startsWith('sessions'))).toBe(false);
      for (const forbidden of testCase.expected.noLoaderCallContains) {
        expect(calls.join(' ')).not.toContain(forbidden);
      }
      expect(groupCounts(graphInput.artifacts)).toMatchObject(testCase.expected.groups);
      expect(graphInput.handles).toHaveLength(
        Object.values(testCase.expected.groups).reduce((total, count) => total + count, 0),
      );
      expect(graphInput.handles.every((handle) => handle.diagnostics === undefined)).toBe(true);
      assertNoFixturePathEvidence({
        manifest: graphInput.manifest,
        artifacts: graphInput.artifacts,
        artifactResolution: graphInput.artifactResolution,
      });

      const moduleResolution = resolveModules(moduleResolverInputFromAppGraph({
        manifest: graphInput.manifest,
        handles: graphInput.handles,
        hostEvidence: testFixture.hostEvidence,
        support: {
          payloadSchemaValidators: ['widgetShape.props'],
          payloadValidators: {
            'widgetShape.props': widgetShapePropsValidator,
          },
        },
      }));

      if (testCase.expected.ok) {
        expect(artifactReport.ok).toBe(true);
        expect(moduleResolution.ok).toBe(true);
        expect(moduleResolution.contributions.map((entry) => entry.name)).toEqual(testCase.expected.contributions);
      }

      const appGraphReport = validateAppGraph({
        manifest: graphInput.manifest,
        artifacts: graphInput.artifacts,
        artifactResolution: graphInput.artifactResolution,
        hostEvidence: testFixture.hostEvidence,
        moduleResolution,
        schemaValidators: () => ({ ok: true }),
        evidenceSchemaValidators: () => ({ ok: true }),
      });
      const diagnosticCodes = appGraphReport.diagnostics.map((diagnostic) => diagnostic.code);

      expect(appGraphReport.ok).toBe(testCase.expected.ok);
      for (const diagnosticCode of testCase.expected.diagnostics ?? []) {
        expect(diagnosticCodes.filter((code) => code === diagnosticCode)).toHaveLength(1);
      }
      for (const diagnostic of appGraphReport.diagnostics.filter((entry) =>
        (testCase.expected.diagnostics ?? []).includes(entry.code)
      )) {
        expect(diagnostic).toMatchObject({
          origin: 'artifact-resolver',
          phase: 'artifact-resolution',
        });
      }
      if (testCase.expected.unresolvedSlot) {
        expect(graphInput.handles.find((handle) => handle.slot === testCase.expected.unresolvedSlot)?.status).not.toBe('loaded');
      }
      if (testCase.expected.crossArtifactSkippedReason) {
        expect(appGraphReport.phases).toContainEqual({
          phase: 'cross-artifact',
          status: 'skipped',
          reason: testCase.expected.crossArtifactSkippedReason,
        });
      }
      for (const code of testCase.expected.absentDiagnostics) {
        expect(diagnosticCodes).not.toContain(code);
      }
    });
  }
});
