/**
 * @filedesc E4 red-team harness — real Ajv schema validators over the shipped
 * `formspec/schemas/*.json` corpus, a memory ArtifactLoader, and the runner that
 * drives one violating app graph through `produceAppGraphValidationReport`.
 *
 * Deliberate divergence from spike v8: v8 stubbed both schema validators as
 * `() => ({ ok: true })`, so its `schema: completed` status meant "the pipeline
 * reached the phase", not "Ajv accepted the document" (v8 §Schema-phase caveat).
 * Findings 6, 27, and 30 hang off exactly that phase, so E4 wires real Ajv:
 * every artifact and every host-evidence document is validated against its
 * published `$id`. A violation that survives this harness survived structural
 * validation, not a stub.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020, { type AnySchemaObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  produceAppGraphValidationReport,
  type AppGraphDiagnostic,
  type AppGraphHostEvidenceDocument,
  type ArtifactLoader,
  type ArtifactLoaderInput,
  type ArtifactLoaderOutcome,
  type SchemaValidationOutcome,
} from '@formspec-org/app-graph';
import type { UiGraphPolicyDocument } from '@formspec-org/types';

export const SPIKE_ROOT = resolve(import.meta.dirname, '..');
export const ARTIFACTS_DIR = resolve(SPIKE_ROOT, 'artifacts');
export const REPORTS_DIR = resolve(SPIKE_ROOT, 'reports');
const SCHEMAS_DIR = resolve(SPIKE_ROOT, '..', '..', 'schemas');

/** Artifact kind → published schema `$id` the ArtifactResolver hands to a validator. */
const SCHEMA_ID_BY_KIND: Record<string, string> = {
  appManifest: 'https://formspec.org/schemas/bundleManifest/2.3',
  definition: 'https://formspec.org/schemas/definition/1.0',
  surface: 'https://formspec.org/schemas/surface/0.1',
  registry: 'https://formspec.org/schemas/registry/v1.0/registry.json',
  theme: 'https://formspec.org/schemas/theme/1.0',
  dataSources: 'https://formspec.org/schemas/dataSources/1.0',
  responseActions: 'https://formspec.org/schemas/responseActions/1.0',
  experience: 'https://formspec.org/schemas/experience/1.0',
};

let ajvSingleton: Ajv2020 | undefined;

/** Every schema in `formspec/schemas/`, registered by its own `$id`. */
function ajv(): Ajv2020 {
  if (ajvSingleton) return ajvSingleton;
  const instance = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
  addFormats(instance as never);
  for (const file of readdirSync(SCHEMAS_DIR).filter((name) => name.endsWith('.json'))) {
    const schema = JSON.parse(readFileSync(resolve(SCHEMAS_DIR, file), 'utf8')) as AnySchemaObject;
    if (typeof schema.$id !== 'string') continue;
    instance.addSchema(schema, schema.$id);
  }
  ajvSingleton = instance;
  return instance;
}

function compiled(schemaId: string): ValidateFunction | undefined {
  try {
    return ajv().getSchema(schemaId);
  } catch {
    return undefined;
  }
}

function outcomeFor(schemaId: string | undefined, document: unknown): SchemaValidationOutcome {
  if (!schemaId) return { ok: true };
  const validate = compiled(schemaId);
  if (!validate) {
    return {
      ok: false,
      issues: [{ code: 'E4-SCHEMA-UNAVAILABLE', message: `No compiled schema for ${schemaId}.` }],
    };
  }
  if (validate(document)) return { ok: true };
  return {
    ok: false,
    issues: (validate.errors ?? []).map((error) => ({
      code: 'APP-GRAPH-SCHEMA',
      message: `${error.instancePath || '/'} ${error.message ?? 'failed'}`,
      path: error.instancePath,
      keyword: error.keyword,
      details: { schemaId, params: error.params as Record<string, unknown> },
    })),
  };
}

/** Real Ajv validator for every resolved artifact handle. */
export function realSchemaValidators() {
  return (input: { artifactKind: string; schemaId?: string; document: unknown }): SchemaValidationOutcome =>
    outcomeFor(input.schemaId ?? SCHEMA_ID_BY_KIND[input.artifactKind], input.document);
}

/** Real Ajv validator for host-evidence documents (UI Graph Policy). */
export function realEvidenceSchemaValidators() {
  return (input: { schemaId?: string; document: unknown }): SchemaValidationOutcome =>
    outcomeFor(input.schemaId, input.document);
}

/** In-memory ArtifactLoader keyed by the URL declared in the App Manifest. */
export function memoryLoader(documents: Record<string, unknown>): ArtifactLoader {
  return ({ ref, artifactKind }: ArtifactLoaderInput): ArtifactLoaderOutcome => {
    const url = ref.url;
    if (url !== undefined && Object.prototype.hasOwnProperty.call(documents, url)) {
      return {
        status: 'loaded',
        source: `e4:${artifactKind}:${url}`,
        schemaId: SCHEMA_ID_BY_KIND[artifactKind],
        document: documents[url],
      };
    }
    return { status: 'missing', source: url ?? '(no url)' };
  };
}

export type Verdict = 'undetected' | 'caught' | 'inexpressible';

export interface RedTeamCase {
  /** Stable case id — also the report/artifact filename stem. */
  id: string;
  /** Trust claim under attack, in the product's own words. */
  claim: string;
  /** v8 finding this case red-teams. */
  v8Finding: number;
  /** The violating shape, stated as a sentence an auditor could check. */
  violation: string;
  /** Manifest document (App Manifest v2.x). */
  manifest: unknown;
  /** Manifest source URI for diagnostics. */
  manifestSource: string;
  /** Sibling artifacts the loader serves, keyed by declared URL. */
  documents: Record<string, unknown>;
  /** Optional UI Graph Policy host evidence. */
  uiGraphPolicies?: AppGraphHostEvidenceDocument<UiGraphPolicyDocument>[];
  /**
   * Diagnostic codes that would mean the substrate CAUGHT the violation.
   * Empty means "no producer check exists that could name this violation" —
   * the pre-registered prediction.
   */
  wouldCatch: string[];
}

export interface RedTeamOutcome {
  id: string;
  claim: string;
  v8Finding: number;
  violation: string;
  ok: boolean;
  phases: Array<{ phase: string; status: string }>;
  diagnostics: AppGraphDiagnostic[];
  diagnosticCodes: string[];
  /** Diagnostics whose code is in `wouldCatch` — the ones that would falsify the prediction. */
  catchingDiagnostics: AppGraphDiagnostic[];
  verdict: Verdict;
}

/** Runs one violating app graph through the production producer and persists it. */
export async function runCase(testCase: RedTeamCase): Promise<RedTeamOutcome> {
  const result = await produceAppGraphValidationReport({
    manifest: testCase.manifest,
    source: testCase.manifestSource,
    schemaId: SCHEMA_ID_BY_KIND.appManifest,
    loader: memoryLoader(testCase.documents),
    schemaValidators: realSchemaValidators(),
    evidenceSchemaValidators: realEvidenceSchemaValidators(),
    ...(testCase.uiGraphPolicies ? { hostEvidence: { uiGraphPolicies: testCase.uiGraphPolicies } } : {}),
  });

  const diagnostics = result.report.diagnostics;
  const catchingDiagnostics = diagnostics.filter((d) => testCase.wouldCatch.includes(d.code));

  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(
    resolve(REPORTS_DIR, `${testCase.id}.validation.json`),
    JSON.stringify(
      {
        claim: testCase.claim,
        v8Finding: testCase.v8Finding,
        violation: testCase.violation,
        artifactResolutionReport: result.artifactResolutionReport,
        moduleResolutionReport: result.moduleResolutionReport,
        report: result.report,
      },
      null,
      2,
    ),
  );

  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  writeFileSync(
    resolve(ARTIFACTS_DIR, `${testCase.id}.json`),
    JSON.stringify(
      {
        claim: testCase.claim,
        v8Finding: testCase.v8Finding,
        violation: testCase.violation,
        manifest: testCase.manifest,
        documents: testCase.documents,
        uiGraphPolicies: testCase.uiGraphPolicies ?? [],
      },
      null,
      2,
    ),
  );

  return {
    id: testCase.id,
    claim: testCase.claim,
    v8Finding: testCase.v8Finding,
    violation: testCase.violation,
    ok: result.report.ok,
    phases: result.report.phases.map((p) => ({ phase: p.phase, status: p.status })),
    diagnostics,
    diagnosticCodes: [...new Set(diagnostics.map((d) => d.code))].sort(),
    catchingDiagnostics,
    verdict: catchingDiagnostics.length > 0 ? 'caught' : 'undetected',
  };
}
