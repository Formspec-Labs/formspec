/** @filedesc CLI entry point for the ADR-0150 v4 app-graph validation spike. */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

import type { ComponentDoc } from "./types.js";
import { SPIKE_ROOT, resolveFixtureAppGraph } from "./artifact-resolver.js";
import { validateAppGraph, type SchemaValidationResult } from "./app-graph.js";
import { validateComponentBundle } from "./coherence.js";
import { generateBundle } from "./generate.js";
import { bundleToApp } from "./ir.js";
import { renderApp } from "./render.js";
import { executeRuntimePlan } from "./runtime.js";
import { buildValidator } from "./schema-loader.js";

const OUT = (name: string) => join(SPIKE_ROOT, "output", name);

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}

async function writeText(path: string, data: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

function printErrors(label: string, validate: ReturnType<Ajv2020["compile"]>): void {
  console.error(`[spike-v4]   x ${label} INVALID:`);
  const errors = validate.errors ?? [];
  for (const err of errors.slice(0, 8)) {
    console.error(`             ${err.instancePath || "/"} [${err.keyword}] ${err.message} ${JSON.stringify(err.params).slice(0, 200)}`);
  }
}

async function validateOne(
  ajv: Awaited<ReturnType<typeof buildValidator>>,
  schemaId: string,
  label: string,
  doc: unknown,
): Promise<number> {
  const validate = ajv.getSchema(schemaId);
  if (!validate) throw new Error(`Could not resolve schema ${schemaId}`);
  const ok = validate(doc);
  if (!ok) {
    printErrors(label, validate);
    return 1;
  }
  console.log(`[spike-v4]   ok ${label}`);
  return 0;
}

function printSchemaResult(result: SchemaValidationResult): void {
  if (result.ok) {
    console.log(`[spike-v4]   ok ${result.label}`);
    return;
  }
  console.error(`[spike-v4]   x ${result.label} INVALID:`);
  for (const err of result.errors.slice(0, 8)) {
    console.error(`             ${err.path} [${err.keyword}] ${err.message} ${JSON.stringify(err.params).slice(0, 200)}`);
  }
}

async function main() {
  console.log("[spike-v4] reading ADR-0150 layered fixtures...");
  const { inputs, runtimePlan, artifactResolutionReport } = await resolveFixtureAppGraph();
  await writeJson(OUT("artifact-resolution-report.json"), artifactResolutionReport);

  console.log("[spike-v4] validating source artifacts and app graph...");
  const ajv = await buildValidator();
  const graph = validateAppGraph(inputs, ajv);
  for (const result of graph.schemas) printSchemaResult(result);
  for (const entry of graph.coherence.issues) {
    const prefix = entry.severity === "error" ? "x" : entry.severity === "warning" ? "!" : "i";
    console.log(`[spike-v4]   ${prefix} ${entry.code} ${entry.path}: ${entry.message}`);
  }
  await writeJson(OUT("app-graph-report.json"), graph);
  await writeJson(OUT("coherence-report.json"), graph.coherence);
  let validationFailures = graph.summary.schemaFailures + graph.summary.coherenceErrors;

  console.log("[spike-v4] projecting Surface + Experience + Definitions into route Components...");
  const bundle = generateBundle(inputs);

  console.log("[spike-v4] validating generated Components...");
  for (const r of bundle.routes) {
    const doc: ComponentDoc = r.doc;
    validationFailures += await validateOne(ajv, "https://formspec.org/schemas/component/1.1", `Component route ${r.id}`, doc);
    await writeJson(OUT(`components/${r.id}.json`), doc);
  }
  const componentIssues = validateComponentBundle(bundle);
  for (const entry of componentIssues) {
    console.log(`[spike-v4]   x ${entry.code} ${entry.path}: ${entry.message}`);
  }
  if (componentIssues.length > 0) validationFailures += componentIssues.length;

  console.log("[spike-v4] executing route/session/runtime behavior...");
  const runtime = executeRuntimePlan(inputs, runtimePlan);
  for (const entry of runtime.issues) {
    const prefix = entry.severity === "error" ? "x" : entry.severity === "warning" ? "!" : "i";
    console.log(`[spike-v4]   ${prefix} ${entry.code} ${entry.path}: ${entry.message}`);
  }
  await writeJson(OUT("runtime-report.json"), runtime);
  const runtimeErrors = runtime.issues.filter((entry) => entry.severity === "error").length;
  if (runtimeErrors > 0) validationFailures += runtimeErrors;

  console.log("[spike-v4] projecting Components into renderer-neutral IR and HTML...");
  const app = bundleToApp(bundle);
  await writeJson(OUT("wireframe-app.ir.json"), app);
  await writeText(OUT("wireframe.html"), renderApp(app));

  console.log("");
  console.log("=".repeat(64));
  console.log(`[spike-v4] DONE: ${bundle.routes.length} routes`);
  console.log(`[spike-v4]   definitions: ${inputs.definitions.length}`);
  console.log(`[spike-v4]   response action sidecars: ${inputs.responseActions.length}`);
  console.log(`[spike-v4]   app graph schema failures: ${graph.summary.schemaFailures}`);
  console.log(`[spike-v4]   app coherence errors: ${graph.summary.coherenceErrors}`);
  console.log(`[spike-v4]   runtime errors: ${runtimeErrors}`);
  console.log(`[spike-v4]   output/components/*.json (${bundle.routes.length} files)`);
  console.log("[spike-v4]   output/artifact-resolution-report.json");
  console.log("[spike-v4]   output/app-graph-report.json");
  console.log("[spike-v4]   output/coherence-report.json");
  console.log("[spike-v4]   output/runtime-report.json");
  console.log("[spike-v4]   output/wireframe-app.ir.json");
  console.log("[spike-v4]   output/wireframe.html");
  console.log(`[spike-v4]   schema validation failures: ${validationFailures}`);
  if (validationFailures > 0) {
    console.log("[spike-v4] FAILED");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[spike-v4] fatal:", err);
  process.exit(1);
});
