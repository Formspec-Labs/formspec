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
  fileURLToPath(new URL('../../../tests/conformance/fixtures/app-graph-validator/ui-graph-policy-hidden-definitions.case.json', import.meta.url)),
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
    origin: expected.code.startsWith('UI-POLICY-') ? 'ui-graph-policy' : expect.any(String),
  });
  expect(actual.primarySource).toEqual(expected.primarySource);
  expect(actual.relatedSources).toEqual(expected.relatedSources);
  expect(actual.details).toEqual(expected.details);
}

describe('UI Graph Policy hidden Definition source conformance fixtures', () => {
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
        expectDiagnostic(report.diagnostics[index], expected);
        if (report.diagnostics[index].primarySource?.artifactSlot?.startsWith('hostEvidence.')) {
          expect(report.diagnostics[index].primarySource).toEqual(expect.not.objectContaining({
            artifactKind: expect.anything(),
            ref: expect.anything(),
          }));
        }
      }
    });
  }

  it('does not treat a non-definition-form slot as route-local even when it carries a definitionRef field', () => {
    const testCase = corpus.cases.find((candidate) => candidate.id === 'hidden-definition-not-route-local');
    expect(testCase).toBeDefined();
    const request = requestFor(corpus, testCase!);
    const surface = request.artifacts?.surfaces?.[0] as ResolvedArtifactHandle<Record<string, unknown>>;
    const document = surface.document as {
      routes: Array<{
        slots: Array<Record<string, unknown>>;
      }>;
    };
    document.routes[0].slots[0] = {
      id: 'summary',
      slotType: 'static-content',
      binding: {
        kind: 'text',
        content: 'Review',
        definitionRef: 'https://example.gov/forms/intake',
      },
    };

    const report = validateAppGraph(request);

    expect(report.diagnostics).toHaveLength(1);
    expect(report.diagnostics[0]).toMatchObject({
      code: 'UI-POLICY-HIDDEN-DEFINITION-REF',
      details: {
        routeId: 'review',
        definitionRef: 'https://example.gov/forms/intake',
        reason: 'not-route-local',
      },
    });
  });
});
