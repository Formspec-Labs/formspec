/** @filedesc Source conformance for UI Graph Policy cross-artifact validation fixtures. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import {
  validateAppGraph,
  type AppGraphDiagnostic,
  type AppGraphEvidenceSchemaValidator,
  type AppGraphHostEvidence,
  type AppGraphSchemaValidator,
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
  origin?: string;
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
      hostLandmarks?: AppGraphHostEvidence['hostLandmarks'];
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

const FIXTURE_DIR = resolve(
  fileURLToPath(new URL('../../../tests/conformance/fixtures/app-graph-validator', import.meta.url)),
);

const FIXTURE_CORPORA = [
  {
    label: 'surface routes',
    path: resolve(FIXTURE_DIR, 'ui-graph-policy-surface-routes.case.json'),
  },
  {
    label: 'a11y profiles',
    path: resolve(FIXTURE_DIR, 'ui-graph-policy-a11y-profiles.case.json'),
  },
] as const;
const SCHEMAS_ROOT = resolve(fileURLToPath(new URL('../../../schemas', import.meta.url)));

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(readJson(resolve(SCHEMAS_ROOT, 'common.schema.json')));

const schemaValidators = {
  appManifest: ajv.compile(readJson(resolve(SCHEMAS_ROOT, 'bundle-manifest.schema.json'))),
};

const uiGraphPolicySchemaValidator = ajv.compile(readJson(resolve(SCHEMAS_ROOT, 'ui-graph-policy.schema.json')));

const schemaValidatorForFixture: AppGraphSchemaValidator = ({ artifactKind, document }) => {
  if (artifactKind === 'surface') {
    return { ok: true };
  }
  const validate = schemaValidators[artifactKind as keyof typeof schemaValidators];
  if (!validate) return { ok: true };
  const ok = validate(document);
  return {
    ok,
    issues: (validate.errors ?? []).map((error) => ({
      keyword: error.keyword,
      path: error.instancePath,
      message: error.message ?? 'schema validation failed',
      details: {
        schemaPath: error.schemaPath,
        params: error.params,
      },
    })),
  };
};

const evidenceSchemaValidatorForFixture: AppGraphEvidenceSchemaValidator = ({ document }) => {
  const ok = uiGraphPolicySchemaValidator(document);
  return {
    ok,
    issues: (uiGraphPolicySchemaValidator.errors ?? []).map((error) => ({
      keyword: error.keyword,
      path: error.instancePath,
      message: error.message ?? 'schema validation failed',
      details: {
        schemaPath: error.schemaPath,
        params: error.params,
      },
    })),
  };
};

function fixtureCorpus(fixturePath: string): FixtureCorpus {
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as FixtureCorpus;
}

function handleFor(corpus: FixtureCorpus, key: string): ResolvedArtifactHandle {
  const handle = corpus.handles[key];
  expect(handle, `missing fixture handle ${key}`).toBeDefined();
  return structuredClone(handle);
}

function requestFor(corpus: FixtureCorpus, testCase: FixtureCase): AppGraphValidationRequest {
  const hostEvidenceRequest = testCase.request.hostEvidence;
  const uiGraphPolicies = (hostEvidenceRequest?.uiGraphPolicies ?? []).map((policyKey) => {
    const policy = corpus.policies[policyKey];
    expect(policy, `missing fixture policy ${policyKey}`).toBeDefined();
    return {
      schemaId: policy.schemaId,
      source: policy.source,
      document: structuredClone(policy.document),
    };
  });

  return {
    manifest: handleFor(corpus, testCase.request.manifest),
    artifacts: Object.fromEntries(
      Object.entries(testCase.request.artifacts ?? {}).map(([group, keys]) => [
        group,
        (keys ?? []).map((key) => handleFor(corpus, key)),
      ]),
    ),
    hostEvidence: hostEvidenceRequest
      ? {
          ...(hostEvidenceRequest.hostLandmarks ? { hostLandmarks: hostEvidenceRequest.hostLandmarks } : {}),
          uiGraphPolicies,
        }
      : undefined,
    schemaValidators: schemaValidatorForFixture,
    evidenceSchemaValidators: evidenceSchemaValidatorForFixture,
  };
}

function expectDiagnostic(actual: AppGraphDiagnostic, expected: FixtureDiagnostic): void {
  expect(actual).toMatchObject({
    code: expected.code,
    severity: 'error',
    phase: 'cross-artifact',
    origin: expected.origin ?? 'ui-graph-policy',
  });
  expect(actual.primarySource).toEqual(expected.primarySource);
  if (expected.relatedSources !== undefined) {
    expect(actual.relatedSources).toEqual(expected.relatedSources);
  }
  expect(actual.details).toEqual(expected.details);
}

for (const { label, path: fixturePath } of FIXTURE_CORPORA) {
  describe(`UI Graph Policy ${label} source conformance fixtures`, () => {
    const corpus = fixtureCorpus(fixturePath);

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
        }
      });
    }
  });
}
