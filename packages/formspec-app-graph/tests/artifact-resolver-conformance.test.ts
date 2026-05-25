import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  ArtifactResolutionDiagnostic,
  ArtifactResolutionHandle,
  ArtifactResolutionReport,
} from '@formspec-org/types';
import {
  resolveArtifacts,
  type ArtifactLoader,
  type ArtifactResolverSupportProfile,
} from '../src/index.js';

interface FixtureDiagnostic {
  code: string;
  severity: ArtifactResolutionDiagnostic['severity'];
}

interface FixtureHandleExpectation {
  slot: string;
  artifactKind: string;
  status?: string;
}

interface FixtureRefExpectation {
  slot: string;
  artifactKind: string;
  contains: Record<string, unknown>;
}

interface FixtureExpected {
  ok: boolean;
  summary?: Partial<ArtifactResolutionReport['summary']>;
  diagnostics?: FixtureDiagnostic[];
  loaderCalls?: string[];
  handles?: FixtureHandleExpectation[];
  refs?: FixtureRefExpectation[];
  noLoaderCallContains?: string[];
}

interface FixtureCase {
  id: string;
  description: string;
  manifest: unknown;
  documents?: Record<string, unknown>;
  support?: ArtifactResolverSupportProfile;
  loader?: {
    missing?: string[];
    unsupported?: string[];
    throws?: string[];
  };
  expected: FixtureExpected;
}

const FIXTURE_DIR = resolve(
  fileURLToPath(new URL('../../../tests/conformance/fixtures/artifact-resolver', import.meta.url)),
);

function fixtureCases(): FixtureCase[] {
  return readdirSync(FIXTURE_DIR)
    .filter((entry) => entry.endsWith('.case.json'))
    .sort()
    .map((entry) => JSON.parse(readFileSync(resolve(FIXTURE_DIR, entry), 'utf8')) as FixtureCase);
}

function own<T extends Record<string, unknown>>(record: T, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function loaderFor(testCase: FixtureCase, calls: string[]): ArtifactLoader {
  const documents = testCase.documents ?? {};
  const missing = new Set(testCase.loader?.missing ?? []);
  const unsupported = new Set(testCase.loader?.unsupported ?? []);
  const throws = new Set(testCase.loader?.throws ?? []);

  return ({ slot, artifactKind, ref }) => {
    calls.push(`${slot}:${artifactKind}:${ref.url}`);
    if (throws.has(ref.url)) {
      throw new Error(`load failed for ${slot}`);
    }
    if (unsupported.has(ref.url)) {
      return { status: 'unsupported', source: ref.url };
    }
    if (missing.has(ref.url) || !own(documents, ref.url)) {
      return { status: 'missing', source: ref.url };
    }
    return {
      status: 'loaded',
      document: documents[ref.url],
      source: ref.url,
      digest: `sha256:${testCase.id}:${slot}`,
    };
  };
}

function artifactHandles(report: ArtifactResolutionReport): ArtifactResolutionHandle[] {
  return Object.values(report.artifacts).flatMap((handles) => handles ?? []);
}

function handleFor(
  report: ArtifactResolutionReport,
  expected: FixtureHandleExpectation | FixtureRefExpectation,
): ArtifactResolutionHandle {
  const handle = artifactHandles(report).find((entry) =>
    entry.slot === expected.slot && entry.artifactKind === expected.artifactKind,
  );
  expect(handle, `missing handle ${expected.slot}:${expected.artifactKind}`).toBeDefined();
  return handle as ArtifactResolutionHandle;
}

function assertNoPathDerivedRefEvidence(report: ArtifactResolutionReport): void {
  const allowedRefKeys = new Set(['url', 'version', 'handle', 'locale']);
  const refs = [
    ...artifactHandles(report).map((handle) => handle.ref),
    ...report.diagnostics.map((diagnostic) => diagnostic.primarySource?.ref),
  ].filter((ref): ref is NonNullable<typeof ref> => ref !== undefined);

  for (const ref of refs) {
    for (const key of Object.keys(ref)) {
      expect(allowedRefKeys.has(key) || key.startsWith('x-')).toBe(true);
    }
    const serialized = JSON.stringify(ref);
    expect(serialized).not.toContain('fixture');
    expect(serialized).not.toContain('filename');
    expect(serialized).not.toContain('.json');
  }

  const serializedDiagnostics = JSON.stringify(report.diagnostics);
  expect(serializedDiagnostics).not.toContain('fixture');
  expect(serializedDiagnostics).not.toContain('filename');
  expect(serializedDiagnostics).not.toContain('.json');
}

describe('ArtifactResolver source conformance fixtures', () => {
  for (const testCase of fixtureCases()) {
    it(`${testCase.id}: ${testCase.description}`, async () => {
      const calls: string[] = [];
      const manifestId = typeof testCase.manifest === 'object' && testCase.manifest !== null
        ? (testCase.manifest as Record<string, unknown>).id
        : undefined;
      const report = await resolveArtifacts({
        manifest: testCase.manifest,
        loader: loaderFor(testCase, calls),
        support: testCase.support,
        source: typeof manifestId === 'string' ? manifestId : undefined,
      });

      expect(report.ok).toBe(testCase.expected.ok);
      expect(report.phase).toEqual({ phase: 'artifact-resolution', status: 'completed' });

      if (testCase.expected.summary) {
        expect(report.summary).toMatchObject(testCase.expected.summary);
      }

      expect(report.diagnostics.map((entry) => ({
        code: entry.code,
        severity: entry.severity,
      }))).toEqual(testCase.expected.diagnostics ?? []);

      for (const diagnostic of report.diagnostics) {
        expect(diagnostic.origin).toBe('artifact-resolver');
        expect(diagnostic.phase).toBe('artifact-resolution');
      }

      expect(calls).toEqual(testCase.expected.loaderCalls ?? []);
      for (const forbiddenCall of testCase.expected.noLoaderCallContains ?? []) {
        expect(calls.join(' ')).not.toContain(forbiddenCall);
      }

      for (const expectedHandle of testCase.expected.handles ?? []) {
        expect(handleFor(report, expectedHandle).status).toBe(expectedHandle.status);
      }

      for (const expectedRef of testCase.expected.refs ?? []) {
        expect(handleFor(report, expectedRef).ref).toMatchObject(expectedRef.contains);
      }

      assertNoPathDerivedRefEvidence(report);
    });
  }
});
