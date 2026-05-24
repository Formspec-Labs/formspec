/** @filedesc CLI entry point for the ADR-0150 v3 app-graph validation spike. */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import type {
  AppManifest,
  ComponentDoc,
  DataSourceCatalog,
  Definition,
  Experience,
  GeneratorInputs,
  JsonObject,
  PostureDeclaration,
  Registry,
  ResponseActions,
  SiblingRef,
  Surface,
} from "./types.js";
import { validateAppCoherence, validateComponentBundle } from "./coherence.js";
import { generateBundle } from "./generate.js";
import { bundleToApp } from "./ir.js";
import { renderApp } from "./render.js";
import { executeRuntimePlan, type RuntimePlan } from "./runtime.js";

const SPIKE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORMSPEC_ROOT = resolve(SPIKE_ROOT, "..", "..");

const FIX = (name: string) => join(SPIKE_ROOT, "fixtures", name);
const SCHEMA = (name: string) => join(FORMSPEC_ROOT, "schemas", name);
const OUT = (name: string) => join(SPIKE_ROOT, "output", name);
const FIXTURE_ROOT = resolve(SPIKE_ROOT, "fixtures");

type LocalArtifactRef = SiblingRef & {
  locale?: string;
  "x-spike-v3-fixture"?: string;
};

async function readJson<T>(path: string): Promise<T> {
  const buf = await readFile(path, "utf-8");
  return JSON.parse(buf) as T;
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}

async function writeText(path: string, data: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

function fixturePath(ref: LocalArtifactRef, label: string): string {
  const rel = ref["x-spike-v3-fixture"];
  if (typeof rel !== "string" || rel.length === 0) {
    throw new Error(`${label} ref '${ref.url}' is missing x-spike-v3-fixture; v3 must resolve sidecars through the App Manifest.`);
  }
  const path = resolve(FIXTURE_ROOT, rel);
  if (!path.startsWith(`${FIXTURE_ROOT}/`)) {
    throw new Error(`${label} ref '${ref.url}' has an invalid fixture path '${rel}'.`);
  }
  return path;
}

async function readManifestArtifact<T>(ref: LocalArtifactRef, label: string): Promise<T> {
  return readJson<T>(fixturePath(ref, label));
}

function asRef(value: unknown, label: string): LocalArtifactRef {
  if (!value || typeof value !== "object" || typeof (value as { url?: unknown }).url !== "string") {
    throw new Error(`${label} ref is missing or malformed.`);
  }
  return value as LocalArtifactRef;
}

function asRefs(value: unknown, label: string): LocalArtifactRef[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array of refs.`);
  return value.map((entry, index) => asRef(entry, `${label}[${index}]`));
}

function oneRef(value: LocalArtifactRef[] | undefined, label: string): LocalArtifactRef {
  if (!value || value.length !== 1) throw new Error(`${label} must contain exactly one ref for this spike fixture.`);
  return value[0];
}

function artifactResolution(label: string, ref: LocalArtifactRef): JsonObject {
  return {
    label,
    url: ref.url,
    version: ref.version,
    locale: ref.locale,
    fixture: ref["x-spike-v3-fixture"],
  };
}

async function buildValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false, verbose: false });
  addFormats(ajv);

  const schemaFiles = [
    "common.schema.json",
    "issuer.schema.json",
    "validation-mapping.schema.json",
    "definition.schema.json",
    "experience.schema.json",
    "response-actions.schema.json",
    "registry.schema.json",
    "bundle-manifest.schema.json",
    "posture-declaration.schema.json",
    "screener.schema.json",
    "locale.schema.json",
    "component.schema.json",
  ];
  for (const f of schemaFiles) {
    ajv.addSchema(await readJson<Record<string, unknown>>(SCHEMA(f)));
  }
  ajv.addSchema(await readJson<Record<string, unknown>>(FIX("lexassist.surface.schema.json")));
  return ajv;
}

function printErrors(label: string, validate: ReturnType<Ajv2020["compile"]>): void {
  console.error(`[spike-v3]   x ${label} INVALID:`);
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
  console.log(`[spike-v3]   ok ${label}`);
  return 0;
}

async function main() {
  console.log("[spike-v3] reading ADR-0150 layered fixtures...");
  const appManifest = await readJson<AppManifest>(FIX("lexassist.app-manifest.json"));
  const responseActionRefs = asRefs(
    appManifest["x-spike-v3-responseActions"] ?? (appManifest.responseActions ? [appManifest.responseActions] : []),
    "x-spike-v3-responseActions",
  );
  const dataSourceRef = asRef(appManifest["x-spike-v3-dataSources"], "x-spike-v3-dataSources");
  const postureRef = asRef(appManifest["x-spike-v3-posture"], "x-spike-v3-posture");
  const screenerRefs = asRefs(appManifest["x-spike-v3-screeners"], "x-spike-v3-screeners");
  const runtimePlanRef = asRef(appManifest["x-spike-v3-runtimePlan"], "x-spike-v3-runtimePlan");
  const inputs: GeneratorInputs = {
    appManifest,
    definitions: await Promise.all(appManifest.definitions.map((ref, index) => readManifestArtifact<Definition>(ref, `definitions[${index}]`))),
    experience: await readManifestArtifact<Experience>(asRef(appManifest.experience, "experience"), "experience"),
    responseActions: await Promise.all(responseActionRefs.map((ref, index) => readManifestArtifact<ResponseActions>(ref, `x-spike-v3-responseActions[${index}]`))),
    registry: await readManifestArtifact<Registry>(oneRef(appManifest.registries, "registries"), "registries[0]"),
    surface: await readManifestArtifact<Surface>(oneRef(appManifest.surfaces, "surfaces"), "surfaces[0]"),
    posture: await readManifestArtifact<PostureDeclaration>(postureRef, "x-spike-v3-posture"),
    dataSources: await readManifestArtifact<DataSourceCatalog>(dataSourceRef, "x-spike-v3-dataSources"),
    screener: await readManifestArtifact<JsonObject>(oneRef(screenerRefs, "x-spike-v3-screeners"), "x-spike-v3-screeners[0]"),
    locales: await Promise.all((appManifest.locales ?? []).map((ref, index) => readManifestArtifact<JsonObject>(ref, `locales[${index}]`))),
  };
  const runtimePlan = await readManifestArtifact<RuntimePlan>(runtimePlanRef, "x-spike-v3-runtimePlan");
  await writeJson(OUT("artifact-resolution-report.json"), {
    definitions: inputs.appManifest.definitions.map((ref, index) => artifactResolution(`definitions[${index}]`, ref)),
    experience: artifactResolution("experience", asRef(inputs.appManifest.experience, "experience")),
    responseActions: responseActionRefs.map((ref, index) => artifactResolution(`x-spike-v3-responseActions[${index}]`, ref)),
    registries: (inputs.appManifest.registries ?? []).map((ref, index) => artifactResolution(`registries[${index}]`, ref)),
    surfaces: (inputs.appManifest.surfaces ?? []).map((ref, index) => artifactResolution(`surfaces[${index}]`, ref)),
    dataSources: artifactResolution("x-spike-v3-dataSources", dataSourceRef),
    posture: artifactResolution("x-spike-v3-posture", postureRef),
    screeners: screenerRefs.map((ref, index) => artifactResolution(`x-spike-v3-screeners[${index}]`, ref)),
    runtimePlan: artifactResolution("x-spike-v3-runtimePlan", runtimePlanRef),
    locales: (inputs.appManifest.locales ?? []).map((ref, index) => artifactResolution(`locales[${index}]`, ref)),
  });

  console.log("[spike-v3] validating source artifacts...");
  const ajv = await buildValidator();
  let validationFailures = 0;
  validationFailures += await validateOne(ajv, "https://formspec.org/schemas/bundleManifest/2.0", "App Manifest", inputs.appManifest);
  validationFailures += await validateOne(ajv, "https://formspec.org/schemas/registry/v1.0/registry.json", "Registry", inputs.registry);
  validationFailures += await validateOne(ajv, "https://formspec.org/spikes/wireframe-generator-v3/surface/0.1", "Surface", inputs.surface);
  validationFailures += await validateOne(ajv, "https://formspec.org/schemas/posture-declaration/1.0", "Posture", inputs.posture);
  validationFailures += await validateOne(ajv, "https://formspec.org/schemas/screener/1.0", "Screener", inputs.screener);
  for (const locale of inputs.locales ?? []) {
    validationFailures += await validateOne(ajv, "https://formspec.org/schemas/locale/1.0", `Locale ${locale.locale ?? locale.url ?? ""}`, locale);
  }
  validationFailures += await validateOne(ajv, "https://formspec.org/schemas/experience/1.0", "Experience", inputs.experience);
  for (const def of inputs.definitions) {
    validationFailures += await validateOne(ajv, "https://formspec.org/schemas/definition/1.0", `Definition ${def.name ?? def.url}`, def);
  }
  for (const ra of inputs.responseActions) {
    validationFailures += await validateOne(ajv, "https://formspec.org/schemas/responseActions/1.0", `Response Actions ${ra.targetDefinition.url}`, ra);
  }

  console.log("[spike-v3] validating whole app graph coherence...");
  const coherence = validateAppCoherence(inputs, ajv);
  for (const entry of coherence.issues) {
    const prefix = entry.severity === "error" ? "x" : entry.severity === "warning" ? "!" : "i";
    console.log(`[spike-v3]   ${prefix} ${entry.code} ${entry.path}: ${entry.message}`);
  }
  await writeJson(OUT("coherence-report.json"), coherence);
  if (!coherence.ok) validationFailures += coherence.summary.errors;

  console.log("[spike-v3] projecting Surface + Experience + Definitions into route Components...");
  const bundle = generateBundle(inputs);

  console.log("[spike-v3] validating generated Components...");
  for (const r of bundle.routes) {
    const doc: ComponentDoc = r.doc;
    validationFailures += await validateOne(ajv, "https://formspec.org/schemas/component/1.1", `Component route ${r.id}`, doc);
    await writeJson(OUT(`components/${r.id}.json`), doc);
  }
  const componentIssues = validateComponentBundle(bundle);
  for (const entry of componentIssues) {
    console.log(`[spike-v3]   x ${entry.code} ${entry.path}: ${entry.message}`);
  }
  if (componentIssues.length > 0) validationFailures += componentIssues.length;

  console.log("[spike-v3] executing route/session/runtime behavior...");
  const runtime = executeRuntimePlan(inputs, runtimePlan);
  for (const entry of runtime.issues) {
    const prefix = entry.severity === "error" ? "x" : entry.severity === "warning" ? "!" : "i";
    console.log(`[spike-v3]   ${prefix} ${entry.code} ${entry.path}: ${entry.message}`);
  }
  await writeJson(OUT("runtime-report.json"), runtime);
  const runtimeErrors = runtime.issues.filter((entry) => entry.severity === "error").length;
  if (runtimeErrors > 0) validationFailures += runtimeErrors;

  console.log("[spike-v3] projecting Components into renderer-neutral IR and HTML...");
  const app = bundleToApp(bundle);
  await writeJson(OUT("wireframe-app.ir.json"), app);
  await writeText(OUT("wireframe.html"), renderApp(app));

  console.log("");
  console.log("=".repeat(64));
  console.log(`[spike-v3] DONE: ${bundle.routes.length} routes`);
  console.log(`[spike-v3]   definitions: ${inputs.definitions.length}`);
  console.log(`[spike-v3]   response action sidecars: ${inputs.responseActions.length}`);
  console.log(`[spike-v3]   app coherence errors: ${coherence.summary.errors}`);
  console.log(`[spike-v3]   runtime errors: ${runtimeErrors}`);
  console.log(`[spike-v3]   output/components/*.json (${bundle.routes.length} files)`);
  console.log("[spike-v3]   output/artifact-resolution-report.json");
  console.log("[spike-v3]   output/coherence-report.json");
  console.log("[spike-v3]   output/runtime-report.json");
  console.log("[spike-v3]   output/wireframe-app.ir.json");
  console.log("[spike-v3]   output/wireframe.html");
  console.log(`[spike-v3]   schema validation failures: ${validationFailures}`);
  if (validationFailures > 0) {
    console.log("[spike-v3] FAILED");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[spike-v3] fatal:", err);
  process.exit(1);
});
