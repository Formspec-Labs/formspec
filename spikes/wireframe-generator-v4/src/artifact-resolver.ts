/** @filedesc Spike-local ArtifactResolver for v4 App Manifest sidecar refs. */

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  AppManifest,
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
import type { RuntimePlan } from "./runtime.js";

export const SPIKE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ROOT = resolve(SPIKE_ROOT, "fixtures");

const FIX = (name: string) => join(SPIKE_ROOT, "fixtures", name);

type LocalArtifactRef = SiblingRef & {
  locale?: string;
  fixture?: string;
};

export type ResolvedAppGraph = {
  inputs: GeneratorInputs;
  runtimePlan: RuntimePlan;
  artifactResolutionReport: JsonObject;
};

async function readJson<T>(path: string): Promise<T> {
  const buf = await readFile(path, "utf-8");
  return JSON.parse(buf) as T;
}

function fixturePath(ref: LocalArtifactRef, label: string): string {
  const rel = ref.fixture;
  if (typeof rel !== "string" || rel.length === 0) {
    throw new Error(`${label} ref '${ref.url}' is missing fixture; v4 resolves sidecars through first-class App Manifest indexes.`);
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
    fixture: ref.fixture,
  };
}

export async function resolveFixtureAppGraph(manifestName = "lexassist.app-manifest.json"): Promise<ResolvedAppGraph> {
  const appManifest = await readJson<AppManifest>(FIX(manifestName));
  const experienceRefs = asRefs(appManifest.experiences, "experiences");
  const responseActionRefs = asRefs(appManifest.responseActions, "responseActions");
  const dataSourceRefs = asRefs(appManifest.dataSources, "dataSources");
  const postureRef = asRef(appManifest.posture, "posture");
  const screenerRefs = asRefs(appManifest.screeners, "screeners");
  const runtimePlanRef = asRef(appManifest.runtimePlan, "runtimePlan");
  const runtimePlan = await readManifestArtifact<RuntimePlan>(runtimePlanRef, "runtimePlan");
  const inputs: GeneratorInputs = {
    appManifest,
    definitions: await Promise.all(appManifest.definitions.map((ref, index) => readManifestArtifact<Definition>(ref, `definitions[${index}]`))),
    experience: await readManifestArtifact<Experience>(oneRef(experienceRefs, "experiences"), "experiences[0]"),
    responseActions: await Promise.all(responseActionRefs.map((ref, index) => readManifestArtifact<ResponseActions>(ref, `responseActions[${index}]`))),
    registry: await readManifestArtifact<Registry>(oneRef(appManifest.registries, "registries"), "registries[0]"),
    surface: await readManifestArtifact<Surface>(oneRef(appManifest.surfaces, "surfaces"), "surfaces[0]"),
    runtimePlan,
    posture: await readManifestArtifact<PostureDeclaration>(postureRef, "posture"),
    dataSources: await readManifestArtifact<DataSourceCatalog>(oneRef(dataSourceRefs, "dataSources"), "dataSources[0]"),
    screener: await readManifestArtifact<JsonObject>(oneRef(screenerRefs, "screeners"), "screeners[0]"),
    locales: await Promise.all((appManifest.locales ?? []).map((ref, index) => readManifestArtifact<JsonObject>(ref, `locales[${index}]`))),
  };

  return {
    inputs,
    runtimePlan,
    artifactResolutionReport: {
      definitions: inputs.appManifest.definitions.map((ref, index) => artifactResolution(`definitions[${index}]`, ref)),
      experiences: experienceRefs.map((ref, index) => artifactResolution(`experiences[${index}]`, ref)),
      responseActions: responseActionRefs.map((ref, index) => artifactResolution(`responseActions[${index}]`, ref)),
      registries: (inputs.appManifest.registries ?? []).map((ref, index) => artifactResolution(`registries[${index}]`, ref)),
      surfaces: (inputs.appManifest.surfaces ?? []).map((ref, index) => artifactResolution(`surfaces[${index}]`, ref)),
      dataSources: dataSourceRefs.map((ref, index) => artifactResolution(`dataSources[${index}]`, ref)),
      posture: artifactResolution("posture", postureRef),
      screeners: screenerRefs.map((ref, index) => artifactResolution(`screeners[${index}]`, ref)),
      runtimePlan: artifactResolution("runtimePlan", runtimePlanRef),
      locales: (inputs.appManifest.locales ?? []).map((ref, index) => artifactResolution(`locales[${index}]`, ref)),
    },
  };
}
