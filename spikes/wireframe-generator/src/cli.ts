/** @filedesc CLI entry point. Reads 4 fixture inputs, runs the 3-layer pipeline, writes outputs to ./output. */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import type {
  Definition,
  Experience,
  ResponseActions,
  Surface,
  ComponentDoc,
} from "./types.js";
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

async function buildValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false, verbose: false });
  addFormats(ajv);
  // Load every schema the Component schema may $ref.
  const schemaFiles = [
    "common.schema.json",
    "experience.schema.json",
    "response-actions.schema.json",
    "validation-mapping.schema.json",
    "component.schema.json",
  ];
  for (const f of schemaFiles) {
    const s = await readJson<Record<string, unknown>>(SCHEMA(f));
    ajv.addSchema(s);
  }
  const componentSchemaId = "https://formspec.org/schemas/component/1.1";
  const validate = ajv.getSchema(componentSchemaId);
  if (!validate) throw new Error(`Could not resolve schema ${componentSchemaId}`);
  return validate;
}

async function main() {
  console.log("[spike] reading fixtures…");
  const [def, exp, ra, surface] = await Promise.all([
    readJson<Definition>(FIX("lexassist.definition.json")),
    readJson<Experience>(FIX("lexassist.experience.json")),
    readJson<ResponseActions>(FIX("lexassist.response-actions.json")),
    readJson<Surface>(FIX("lexassist.surface.json")),
  ]);

  console.log("[spike] Layer 1: generating per-route Component bundle…");
  const bundle = generateBundle(def, exp, ra, surface);

  console.log("[spike] Layer 1.5: validating each route Component against the schema…");
  const validate = await buildValidator();
  let validationFailures = 0;
  for (const r of bundle.routes) {
    const ok = validate(r.doc);
    if (!ok) {
      validationFailures += 1;
      console.error(`[spike]   ✗ route '${r.id}' Component INVALID:`);
      // Filter out oneOf-cascade noise — show errors at the most-specific paths only
      const errors = validate.errors ?? [];
      const deepest = errors
        .filter((e) => e.keyword !== "oneOf" && !(e.keyword === "const" && /allowedValue":"(Section|Stack|Grid|Card|Heading)"/.test(JSON.stringify(e.params))))
        .slice(0, 8);
      for (const err of deepest.length ? deepest : errors.slice(0, 8)) {
        console.error(`           ${err.instancePath} [${err.keyword}] ${err.message} ${JSON.stringify(err.params).slice(0, 200)}`);
      }
    } else {
      console.log(`[spike]   ✓ route '${r.id}' Component validates`);
    }
    await writeJson(OUT(`components/${r.id}.json`), r.doc);
  }

  console.log("[spike] Layer 2: projecting Component bundle → WireframeApp IR…");
  const app = bundleToApp(bundle);

  console.log("[spike] Layer 3: rendering WireframeApp → HTML…");
  const html = renderApp(app);
  await writeText(OUT("wireframe.html"), html);

  console.log("");
  console.log("=".repeat(60));
  console.log(`[spike] DONE: ${bundle.routes.length} routes`);
  console.log(`[spike]   output/components/*.json (${bundle.routes.length} files)`);
  console.log(`[spike]   output/wireframe.html`);
  console.log(`[spike]   schema validation failures: ${validationFailures}`);
  if (validationFailures > 0) {
    console.log(`[spike] FAILED — at least one Component does not validate.`);
    process.exit(1);
  }
  console.log(`[spike] Open output/wireframe.html in your browser.`);
}

main().catch((err) => {
  console.error("[spike] fatal:", err);
  process.exit(1);
});
