import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateAppGraph,
  type AppGraphDiagnostic,
  type AppGraphValidationReport,
  type AppGraphValidationRequest,
  type ResolvedArtifactHandle,
} from '../src/index.js';

interface FixturePolicy {
  schemaId: string;
  source: string;
  document: unknown;
}

interface FixtureDiagnostic {
  code: string;
  primarySource?: AppGraphDiagnostic['primarySource'];
  relatedSources?: AppGraphDiagnostic['relatedSources'];
  details?: AppGraphDiagnostic['details'];
}

interface FixtureExpected {
  ok: boolean;
  summary: AppGraphValidationReport['summary'];
  diagnostics: FixtureDiagnostic[];
}

interface FixtureCase {
  id: string;
  description: string;
  request: {
    manifest: string;
    artifacts?: Record<string, string[] | undefined>;
    hostEvidence?: {
      uiGraphPolicies?: string[];
    };
  };
  expected: FixtureExpected;
}

interface FixtureCorpus {
  id: string;
  handles: Record<string, ResolvedArtifactHandle>;
  policies: Record<string, FixturePolicy>;
  cases: FixtureCase[];
}

const FIXTURE_PATH = resolve(
  fileURLToPath(new URL('../../../tests/conformance/fixtures/app-graph-validator/ui-graph-policy-locale-owners.case.json', import.meta.url)),
);

function fixtureCorpus(): FixtureCorpus {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixtureCorpus;
}

function handleFor(corpus: FixtureCorpus, key: string): ResolvedArtifactHandle {
  const handle = corpus.handles[key];
  expect(handle, `missing fixture handle ${key}`).toBeDefined();
  return structuredClone(handle);
}

function policyFor(corpus: FixtureCorpus, key: string): FixturePolicy {
  const policy = corpus.policies[key];
  expect(policy, `missing fixture policy ${key}`).toBeDefined();
  return structuredClone(policy);
}

function requestFor(corpus: FixtureCorpus, testCase: FixtureCase): AppGraphValidationRequest {
  return {
    manifest: handleFor(corpus, testCase.request.manifest),
    artifacts: Object.fromEntries(
      Object.entries(testCase.request.artifacts ?? {}).map(([group, keys]) => [
        group,
        (keys ?? []).map((key) => handleFor(corpus, key)),
      ]),
    ),
    hostEvidence: {
      uiGraphPolicies: (testCase.request.hostEvidence?.uiGraphPolicies ?? [])
        .map((key) => policyFor(corpus, key)),
    },
    schemaValidators: () => ({ ok: true }),
    evidenceSchemaValidators: () => ({ ok: true }),
  };
}

function expectDiagnostic(actual: AppGraphDiagnostic, expected: FixtureDiagnostic): void {
  expect(actual).toMatchObject({
    code: expected.code,
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'ui-graph-policy',
  });
  expect(actual.primarySource).toEqual(expected.primarySource);
  expect(actual.relatedSources).toEqual(expected.relatedSources);
  expect(actual.details).toEqual(expected.details);
}

describe('UI Graph Policy Locale-owner source conformance fixtures', () => {
  const corpus = fixtureCorpus();

  for (const testCase of corpus.cases) {
    it(`${testCase.id}: ${testCase.description}`, () => {
      const report = validateAppGraph(requestFor(corpus, testCase));

      expect(report.ok).toBe(testCase.expected.ok);
      expect(report.summary).toEqual(testCase.expected.summary);
      expect(report.phases).toContainEqual({ phase: 'cross-artifact', status: 'completed' });
      expect(report.summary.skippedPhases).toBe(0);
      expect(report.diagnostics).toHaveLength(testCase.expected.diagnostics.length);

      for (const [index, expected] of testCase.expected.diagnostics.entries()) {
        const actual = report.diagnostics[index];
        expectDiagnostic(actual, expected);
        if (actual.primarySource?.artifactSlot?.startsWith('hostEvidence.')) {
          expect(actual.primarySource).toEqual(expect.not.objectContaining({
            artifactKind: expect.anything(),
            ref: expect.anything(),
          }));
        }
        for (const relatedSource of actual.relatedSources ?? []) {
          if (relatedSource.artifactSlot?.startsWith('hostEvidence.')) {
            expect(relatedSource).toEqual(expect.not.objectContaining({
              artifactKind: expect.anything(),
              ref: expect.anything(),
            }));
          }
        }
      }
    });
  }
});
