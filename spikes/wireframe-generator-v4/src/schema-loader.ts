/** @filedesc Spike-local JSON Schema loader for v4 graph validation. */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { SPIKE_ROOT } from "./artifact-resolver.js";

const FORMSPEC_ROOT = resolve(SPIKE_ROOT, "..", "..");
const SCHEMA = (name: string) => join(FORMSPEC_ROOT, "schemas", name);
const FIX = (name: string) => join(SPIKE_ROOT, "fixtures", name);

async function readJson<T>(path: string): Promise<T> {
  const buf = await readFile(path, "utf-8");
  return JSON.parse(buf) as T;
}

export async function buildValidator(): Promise<Ajv2020> {
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
  ajv.addSchema(await readJson<Record<string, unknown>>(FIX("lexassist.app-manifest.v4.schema.json")));
  ajv.addSchema(await readJson<Record<string, unknown>>(FIX("lexassist.surface.schema.json")));
  ajv.addSchema(await readJson<Record<string, unknown>>(FIX("lexassist.runtime-plan.schema.json")));
  return ajv;
}
