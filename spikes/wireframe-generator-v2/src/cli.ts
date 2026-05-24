/** @filedesc CLI entry point for the ADR-0150-aligned v2 wireframe spike. */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import type { ComponentDoc, Definition, Experience, GeneratorInputs, JsonObject, ResponseActions, Surface } from "./types.js";
import { generateBundle } from "./generate.js";
import { bundleToApp } from "./ir.js";
import { renderApp } from "./render.js";

const SPIKE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORMSPEC_ROOT = resolve(SPIKE_ROOT, "..", "..");

const FIX = (name: string) => join(SPIKE_ROOT, "fixtures", name);
const SCHEMA = (name: string) => join(FORMSPEC_ROOT, "schemas", name);
const OUT = (name: string) => join(SPIKE_ROOT, "output", name);

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

async function readDirJson<T>(path: string): Promise<T[]> {
  const files = (await readdir(path)).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(files.map((f) => readJson<T>(join(path, f))));
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
    "component.schema.json",
  ];
  for (const f of schemaFiles) {
    ajv.addSchema(await readJson<Record<string, unknown>>(SCHEMA(f)));
  }
  ajv.addSchema(await readJson<Record<string, unknown>>(FIX("lexassist.surface.schema.json")));
  return ajv;
}

function printErrors(label: string, validate: ReturnType<Ajv2020["compile"]>): void {
  console.error(`[spike-v2]   x ${label} INVALID:`);
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
  console.log(`[spike-v2]   ok ${label}`);
  return 0;
}

async function main() {
  console.log("[spike-v2] reading ADR-0150 layered fixtures...");
  const inputs: GeneratorInputs = {
    appManifest: await readJson<JsonObject>(FIX("lexassist.app-manifest.json")),
    definitions: await readDirJson<Definition>(FIX("definitions")),
    experience: await readJson<Experience>(FIX("lexassist.experience.json")),
    responseActions: await readDirJson<ResponseActions>(FIX("actions")),
    registry: await readJson<JsonObject>(FIX("lexassist.registry.json")),
    surface: await readJson<Surface>(FIX("lexassist.surface.json")),
  };

  console.log("[spike-v2] validating source artifacts...");
  const ajv = await buildValidator();
  let validationFailures = 0;
  validationFailures += await validateOne(ajv, "https://formspec.org/schemas/bundleManifest/2.0", "App Manifest", inputs.appManifest);
  validationFailures += await validateOne(ajv, "https://formspec.org/schemas/registry/v1.0/registry.json", "Registry", inputs.registry);
  validationFailures += await validateOne(ajv, "https://formspec.org/spikes/wireframe-generator-v2/surface/0.1", "Surface", inputs.surface);
  validationFailures += await validateOne(ajv, "https://formspec.org/schemas/experience/1.0", "Experience", inputs.experience);
  for (const def of inputs.definitions) {
    validationFailures += await validateOne(ajv, "https://formspec.org/schemas/definition/1.0", `Definition ${def.name ?? def.url}`, def);
  }
  for (const ra of inputs.responseActions) {
    validationFailures += await validateOne(ajv, "https://formspec.org/schemas/responseActions/1.0", `Response Actions ${ra.targetDefinition.url}`, ra);
  }

  console.log("[spike-v2] projecting Surface + Experience + Definitions into route Components...");
  const bundle = generateBundle(inputs);

  console.log("[spike-v2] validating generated Components...");
  for (const r of bundle.routes) {
    const doc: ComponentDoc = r.doc;
    validationFailures += await validateOne(ajv, "https://formspec.org/schemas/component/1.1", `Component route ${r.id}`, doc);
    await writeJson(OUT(`components/${r.id}.json`), doc);
  }

  console.log("[spike-v2] projecting Components into renderer-neutral IR and HTML...");
  const app = bundleToApp(bundle);
  await writeJson(OUT("wireframe-app.ir.json"), app);
  await writeText(OUT("wireframe.html"), renderApp(app));

  console.log("");
  console.log("=".repeat(64));
  console.log(`[spike-v2] DONE: ${bundle.routes.length} routes`);
  console.log(`[spike-v2]   definitions: ${inputs.definitions.length}`);
  console.log(`[spike-v2]   response action sidecars: ${inputs.responseActions.length}`);
  console.log(`[spike-v2]   output/components/*.json (${bundle.routes.length} files)`);
  console.log("[spike-v2]   output/wireframe-app.ir.json");
  console.log("[spike-v2]   output/wireframe.html");
  console.log(`[spike-v2]   schema validation failures: ${validationFailures}`);
  if (validationFailures > 0) {
    console.log("[spike-v2] FAILED");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[spike-v2] fatal:", err);
  process.exit(1);
});
