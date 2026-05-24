/** @filedesc Spike-local AppGraphValidator for source artifact schemas and cross-artifact coherence. */

import type Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";

import { validateAppCoherence, type CoherenceIssue, type CoherenceReport } from "./coherence.js";
import { validateSurfaceContract } from "./surface-contract.js";
import type { GeneratorInputs } from "./types.js";

export type SchemaValidationIssue = {
  path: string;
  keyword: string;
  message: string;
  params: unknown;
};

export type SchemaValidationResult = {
  label: string;
  schemaId: string;
  ok: boolean;
  errors: SchemaValidationIssue[];
};

export type AppGraphIssue = {
  phase: "schema" | "surface" | "coherence";
  label: string;
  severity: "error" | "warning" | "info";
  code: string;
  path: string;
  message: string;
};

export type AppGraphValidationReport = {
  ok: boolean;
  summary: {
    schemaFailures: number;
    surfaceErrors: number;
    coherenceErrors: number;
    warnings: number;
    infos: number;
    artifacts: number;
  };
  schemas: SchemaValidationResult[];
  coherence: CoherenceReport;
  issues: AppGraphIssue[];
};

type SourceArtifact = {
  label: string;
  schemaId: string;
  doc: unknown;
};

const IDS = {
  appManifest: "https://formspec.org/spikes/wireframe-generator-v4/app-manifest/0.1",
  registry: "https://formspec.org/schemas/registry/v1.0/registry.json",
  surface: "https://formspec.org/spikes/wireframe-generator-v4/surface/0.1",
  posture: "https://formspec.org/schemas/posture-declaration/1.0",
  screener: "https://formspec.org/schemas/screener/1.0",
  locale: "https://formspec.org/schemas/locale/1.0",
  experience: "https://formspec.org/schemas/experience/1.0",
  definition: "https://formspec.org/schemas/definition/1.0",
  responseActions: "https://formspec.org/schemas/responseActions/1.0",
  dataSources: "https://formspec.org/spikes/wireframe-generator-v4/data-sources/0.1",
  uiPolicy: "https://formspec.org/spikes/wireframe-generator-v4/ui-policy/0.1",
  runtimePlan: "https://formspec.org/spikes/wireframe-generator-v4/runtime-plan/0.1",
};

function sourceArtifacts(inputs: GeneratorInputs): SourceArtifact[] {
  return [
    { label: "App Manifest", schemaId: IDS.appManifest, doc: inputs.appManifest },
    { label: "Registry", schemaId: IDS.registry, doc: inputs.registry },
    { label: "Surface", schemaId: IDS.surface, doc: inputs.surface },
    { label: "Posture", schemaId: IDS.posture, doc: inputs.posture },
    { label: "Screener", schemaId: IDS.screener, doc: inputs.screener },
    ...(inputs.locales ?? []).map((locale, index) => ({ label: labelFor(locale, "Locale", index, ["locale", "url"]), schemaId: IDS.locale, doc: locale })),
    { label: "Experience", schemaId: IDS.experience, doc: inputs.experience },
    ...inputs.definitions.map((def, index) => ({ label: labelFor(def, "Definition", index, ["name", "url"]), schemaId: IDS.definition, doc: def })),
    ...inputs.responseActions.map((ra, index) => ({ label: labelForResponseActions(ra, index), schemaId: IDS.responseActions, doc: ra })),
    { label: "Data Sources", schemaId: IDS.dataSources, doc: inputs.dataSources },
    { label: "UI Policy", schemaId: IDS.uiPolicy, doc: inputs.uiPolicy },
    { label: "Runtime Plan", schemaId: IDS.runtimePlan, doc: inputs.runtimePlan },
  ];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function stringProp(value: unknown, key: string): string | undefined {
  const obj = record(value);
  return typeof obj?.[key] === "string" ? obj[key] : undefined;
}

function labelFor(value: unknown, prefix: string, index: number, keys: string[]): string {
  for (const key of keys) {
    const candidate = stringProp(value, key);
    if (candidate) return `${prefix} ${candidate}`;
  }
  return `${prefix} #${index + 1}`;
}

function labelForResponseActions(value: unknown, index: number): string {
  const targetDefinition = record(record(value)?.targetDefinition);
  const url = typeof targetDefinition?.url === "string" ? targetDefinition.url : undefined;
  return url ? `Response Actions ${url}` : `Response Actions #${index + 1}`;
}

function schemaIssue(err: ErrorObject): SchemaValidationIssue {
  return {
    path: err.instancePath || "/",
    keyword: err.keyword,
    message: err.message ?? "schema validation failed",
    params: err.params,
  };
}

function validateSchema(ajv: Ajv2020, artifact: SourceArtifact): SchemaValidationResult {
  const validate = ajv.getSchema(artifact.schemaId);
  if (!validate) throw new Error(`Could not resolve schema ${artifact.schemaId}`);
  const ok = validate(artifact.doc) === true;
  return {
    label: artifact.label,
    schemaId: artifact.schemaId,
    ok,
    errors: ok ? [] : (validate.errors ?? []).map(schemaIssue),
  };
}

function schemaIssues(results: SchemaValidationResult[]): AppGraphIssue[] {
  return results.flatMap((result) =>
    result.errors.map((err) => ({
      phase: "schema" as const,
      label: result.label,
      severity: "error" as const,
      code: "APP-GRAPH-SCHEMA",
      path: err.path,
      message: `${result.label}: [${err.keyword}] ${err.message}`,
    })),
  );
}

function coherenceIssue(issue: CoherenceIssue): AppGraphIssue {
  return {
    phase: "coherence",
    label: "App Graph",
    severity: issue.severity,
    code: issue.code,
    path: issue.path,
    message: issue.message,
  };
}

function surfaceIssue(issue: CoherenceIssue): AppGraphIssue {
  return {
    phase: "surface",
    label: "Surface",
    severity: issue.severity,
    code: issue.code,
    path: issue.path,
    message: issue.message,
  };
}

function emptyCoherenceReport(): CoherenceReport {
  return {
    ok: false,
    summary: {
      errors: 0,
      warnings: 0,
      infos: 0,
      routes: 0,
      definitions: 0,
      responseActions: 0,
      modules: 0,
    },
    issues: [],
  };
}

export function validateAppGraph(inputs: GeneratorInputs, ajv: Ajv2020): AppGraphValidationReport {
  const schemas = sourceArtifacts(inputs).map((artifact) => validateSchema(ajv, artifact));
  const schemaFailures = schemas.filter((result) => !result.ok).length;
  const surfaceIssues = schemaFailures === 0 ? validateSurfaceContract(inputs.surface) : [];
  const coherence = schemaFailures === 0 ? validateAppCoherence(inputs, ajv) : emptyCoherenceReport();
  const skippedCoherence: AppGraphIssue[] = schemaFailures === 0
    ? []
    : [{
        phase: "coherence",
        label: "App Graph",
        severity: "info",
        code: "APP-GRAPH-COHERENCE-SKIPPED",
        path: "$",
        message: "Coherence validation skipped because one or more source artifacts failed schema validation.",
      }];
  const issues = [...schemaIssues(schemas), ...surfaceIssues.map(surfaceIssue), ...coherence.issues.map(coherenceIssue), ...skippedCoherence];
  const surfaceErrors = surfaceIssues.filter((issue) => issue.severity === "error").length;
  return {
    ok: schemaFailures === 0 && surfaceErrors === 0 && coherence.ok,
    summary: {
      schemaFailures,
      surfaceErrors,
      coherenceErrors: coherence.summary.errors,
      warnings: issues.filter((issue) => issue.severity === "warning").length,
      infos: issues.filter((issue) => issue.severity === "info").length,
      artifacts: schemas.length,
    },
    schemas,
    coherence,
    issues,
  };
}
