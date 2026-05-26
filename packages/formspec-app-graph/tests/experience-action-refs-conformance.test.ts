/** @filedesc Source conformance for Experience.units[].actionRefs cross-artifact resolution. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import {
  validateAppGraph,
  type AppGraphDiagnostic,
  type AppGraphSchemaValidator,
  type AppGraphValidationReport,
  type AppGraphValidationRequest,
  type ResolvedArtifactHandle,
} from '../src/index.js';

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
  };
  expected: FixtureExpected;
}

interface FixtureCorpus {
  id: string;
  handles: Record<string, ResolvedArtifactHandle>;
  cases: FixtureCase[];
}

const FIXTURE_PATH = resolve(
  fileURLToPath(new URL('../../../tests/conformance/fixtures/app-graph-validator/experience-action-refs.case.json', import.meta.url)),
);
const SCHEMAS_ROOT = resolve(fileURLToPath(new URL('../../../schemas', import.meta.url)));

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(readJson(resolve(SCHEMAS_ROOT, 'common.schema.json')));
ajv.addSchema(readJson(resolve(SCHEMAS_ROOT, 'validation-mapping.schema.json')));

const schemaValidators = {
  appManifest: ajv.compile(readJson(resolve(SCHEMAS_ROOT, 'bundle-manifest.schema.json'))),
  experience: ajv.compile(readJson(resolve(SCHEMAS_ROOT, 'experience.schema.json'))),
  responseActions: ajv.compile(readJson(resolve(SCHEMAS_ROOT, 'response-actions.schema.json'))),
};

const schemaValidatorForFixture: AppGraphSchemaValidator = ({ artifactKind, document }) => {
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

function fixtureCorpus(): FixtureCorpus {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixtureCorpus;
}

function handleFor(corpus: FixtureCorpus, key: string): ResolvedArtifactHandle {
  const handle = corpus.handles[key];
  expect(handle, `missing fixture handle ${key}`).toBeDefined();
  return structuredClone(handle);
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
    schemaValidators: schemaValidatorForFixture,
  };
}

function expectDiagnostic(actual: AppGraphDiagnostic, expected: FixtureDiagnostic): void {
  expect(actual).toMatchObject({
    code: expected.code,
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
  });
  expect(actual.primarySource).toEqual(expected.primarySource);
  expect(actual.relatedSources).toEqual(expected.relatedSources);
  expect(actual.details).toEqual(expected.details);
}

describe('Experience actionRefs cross-artifact source conformance fixtures', () => {
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
      }
    });
  }
});
