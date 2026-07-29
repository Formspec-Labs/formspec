import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ModuleResolutionReport } from '@formspec-org/types';
import {
  validateAppGraph,
  type AppGraphDiagnostic,
  type AppGraphValidationRequest,
  type ResolvedArtifactHandle,
} from '../src/index.js';

interface FixtureExpectedDiagnostic {
  code: string;
  reason: string;
  severity?: AppGraphDiagnostic['severity'];
}

interface FixtureCase {
  id: string;
  request: {
    manifest: string;
    artifacts?: Record<string, string[] | undefined>;
    admittedModules?: string[];
  };
  expected: {
    ok: boolean;
    diagnostics: FixtureExpectedDiagnostic[];
  };
}

interface FixtureCorpus {
  id: string;
  handles: Record<string, ResolvedArtifactHandle>;
  cases: FixtureCase[];
}

const FIXTURE_PATH = resolve(
  fileURLToPath(new URL(
    '../../../tests/conformance/fixtures/app-graph-validator/surface-vnext-cross-artifact.case.json',
    import.meta.url,
  )),
);

function fixtureCorpus(): FixtureCorpus {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixtureCorpus;
}

function handleFor(corpus: FixtureCorpus, key: string): ResolvedArtifactHandle {
  const handle = corpus.handles[key];
  expect(handle, `missing fixture handle ${key}`).toBeDefined();
  return structuredClone(handle);
}

function moduleResolution(admittedModules: readonly string[]): ModuleResolutionReport {
  return {
    ok: true,
    modules: admittedModules.map((id, index) => ({
      ref: { id, version: '1.0.0' },
      status: 'admitted',
      source: {
        artifactSlot: 'app',
        artifactKind: 'appManifest',
        jsonPointer: `/modules/${index}`,
      },
      registryVersion: '1.1.0',
    })),
    documents: [],
    contributions: [],
    diagnostics: [],
    summary: {
      modules: admittedModules.length,
      admittedModules: admittedModules.length,
      deniedModules: 0,
      documents: 0,
      contributions: 0,
      unresolvedDependencies: 0,
      unresolvedContributions: 0,
      payloadFailures: 0,
      errors: 0,
      warnings: 0,
      infos: 0,
    },
    phase: { phase: 'module-resolution', status: 'completed' },
  };
}

function requestFor(corpus: FixtureCorpus, fixtureCase: FixtureCase): AppGraphValidationRequest {
  const artifacts = Object.fromEntries(
    Object.entries(fixtureCase.request.artifacts ?? {}).map(([group, keys]) => [
      group,
      (keys ?? []).map((key) => handleFor(corpus, key)),
    ]),
  );
  return {
    manifest: handleFor(corpus, fixtureCase.request.manifest),
    artifacts,
    schemaValidators: () => ({ ok: true }),
    ...(fixtureCase.request.admittedModules
      ? { moduleResolution: moduleResolution(fixtureCase.request.admittedModules) }
      : {}),
  };
}

describe('Surface vNext cross-artifact conformance fixtures', () => {
  const corpus = fixtureCorpus();

  for (const fixtureCase of corpus.cases) {
    it(fixtureCase.id, () => {
      const report = validateAppGraph(requestFor(corpus, fixtureCase));

      expect(report.ok).toBe(fixtureCase.expected.ok);
      expect(report.phases).toContainEqual({
        phase: 'cross-artifact',
        status: 'completed',
      });
      expect(report.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        reason: diagnostic.details?.reason,
      }))).toEqual(fixtureCase.expected.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity ?? 'error',
        reason: diagnostic.reason,
      })));
    });
  }
});
