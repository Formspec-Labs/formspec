/** @filedesc Negative self-tests for the ADR-0150 v4 app-coherence validator. */

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { validateAppCoherence } from "./coherence.js";
import { executeRuntimePlan, type RuntimePlan } from "./runtime.js";
import type { AppManifest, DataSourceCatalog, Definition, Experience, GeneratorInputs, JsonObject, PostureDeclaration, Registry, ResponseActions, Surface, SurfaceSlotEntry } from "./types.js";

const SPIKE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ROOT = join(SPIKE_ROOT, "fixtures");

type LocalRef = { url: string; version?: string; fixture?: string };

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf-8")) as T;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fixturePath(ref: LocalRef): string {
  if (!ref.fixture) throw new Error(`Missing fixture for ${ref.url}`);
  return join(FIXTURE_ROOT, ref.fixture);
}

function refs(value: unknown): LocalRef[] {
  if (!Array.isArray(value)) throw new Error("Expected an array of local refs.");
  return value as LocalRef[];
}

async function loadInputs(): Promise<GeneratorInputs> {
  const appManifest = await readJson<AppManifest>(join(FIXTURE_ROOT, "lexassist.app-manifest.json"));
  const actionRefs = refs(appManifest.responseActions);
  const screenerRefs = refs(appManifest.screeners);
  const experienceRefs = refs(appManifest.experiences);
  const dataSourceRefs = refs(appManifest.dataSources);
  const runtimePlan = await readJson<RuntimePlan>(fixturePath(appManifest.runtimePlan as LocalRef));
  return {
    appManifest,
    definitions: await Promise.all(appManifest.definitions.map((ref) => readJson<Definition>(fixturePath(ref)))),
    experience: await readJson<Experience>(fixturePath(experienceRefs[0])),
    responseActions: await Promise.all(actionRefs.map((ref) => readJson<ResponseActions>(fixturePath(ref)))),
    registry: await readJson<Registry>(fixturePath((appManifest.registries ?? [])[0] as LocalRef)),
    surface: await readJson<Surface>(fixturePath((appManifest.surfaces ?? [])[0] as LocalRef)),
    runtimePlan,
    posture: await readJson<PostureDeclaration>(fixturePath(appManifest.posture as LocalRef)),
    dataSources: await readJson<DataSourceCatalog>(fixturePath(dataSourceRefs[0])),
    screener: await readJson<JsonObject>(fixturePath(screenerRefs[0])),
    locales: await Promise.all((appManifest.locales ?? []).map((ref) => readJson<JsonObject>(fixturePath(ref)))),
  };
}

function buildAjv(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: false, verbose: false });
  addFormats(ajv);
  return ajv;
}

function assertIssue(name: string, inputs: GeneratorInputs, expectedCode: string): void {
  const report = validateAppCoherence(inputs, buildAjv());
  if (!report.issues.some((issue) => issue.code === expectedCode)) {
    throw new Error(`${name}: expected ${expectedCode}, got ${report.issues.map((issue) => issue.code).join(", ") || "no issues"}`);
  }
  console.log(`[selftest] ok ${name} -> ${expectedCode}`);
}

function assertRuntimeIssue(name: string, inputs: GeneratorInputs, plan: RuntimePlan, expectedCode: string): void {
  const report = executeRuntimePlan(inputs, plan);
  if (!report.issues.some((issue) => issue.code === expectedCode)) {
    throw new Error(`${name}: expected ${expectedCode}, got ${report.issues.map((issue) => issue.code).join(", ") || "no issues"}`);
  }
  console.log(`[selftest] ok ${name} -> ${expectedCode}`);
}

function assertRuntimeOk(name: string, inputs: GeneratorInputs, plan: RuntimePlan, check: (report: ReturnType<typeof executeRuntimePlan>) => void): void {
  const report = executeRuntimePlan(inputs, plan);
  if (!report.ok) {
    throw new Error(`${name}: expected ok runtime report, got ${report.issues.map((issue) => issue.code).join(", ")}`);
  }
  check(report);
  console.log(`[selftest] ok ${name}`);
}

function firstShellSlot(inputs: GeneratorInputs): SurfaceSlotEntry {
  return inputs.surface.routes[0].slots.shell[0];
}

const base = await loadInputs();
const baseRuntimePlan = base.runtimePlan as RuntimePlan;

assertRuntimeOk("runtime persistence and hostEvent boundary", clone(base), clone(baseRuntimePlan), (report) => {
  const newMatter = report.responses["https://lexassist.example/forms/new-matter"];
  const threadComposer = report.responses["https://lexassist.example/forms/thread-composer"];
  if (newMatter?.state !== "completed") throw new Error(`new-matter state should be completed, got ${newMatter?.state}`);
  if (threadComposer?.state !== "in-progress") throw new Error(`thread-composer state should be in-progress, got ${threadComposer?.state}`);
  if (report.hostEvents.some((event) => Object.prototype.hasOwnProperty.call(event, "idempotencyKey"))) {
    throw new Error("hostEvent report entries must not carry idempotencyKey");
  }
});

{
  const inputs = clone(base);
  refs(inputs.appManifest.responseActions)[1].version = "9.9.9";
  assertIssue("stale response-actions sidecar ref", inputs, "APP-COHERENCE-ACTION-SIDECAR-VERSION");
}

{
  const inputs = clone(base);
  (inputs.appManifest.runtimePlan as LocalRef).version = "9.9.9";
  assertIssue("stale runtime-plan ref", inputs, "APP-COHERENCE-ARTIFACT-VERSION");
}

{
  const inputs = clone(base);
  delete (refs(inputs.appManifest.experiences)[0] as { targetDefinitions?: unknown }).targetDefinitions;
  assertIssue("missing experience targetDefinitions index", inputs, "APP-COHERENCE-EXPERIENCE-TARGET-DEFINITIONS");
}

{
  const inputs = clone(base);
  const experienceRef = refs(inputs.appManifest.experiences)[0] as { targetDefinitions?: Array<{ url: string }> };
  experienceRef.targetDefinitions = experienceRef.targetDefinitions?.slice(0, -1);
  assertIssue("experience targetDefinition omission", inputs, "APP-COHERENCE-EXPERIENCE-TARGET-OMISSION");
}

{
  const inputs = clone(base);
  inputs.registry.entries.push(
    {
      name: "x-acme-rogue-widget-module",
      category: "module",
      version: "0.1.0",
      status: "stable",
      contributes: ["x-acme-rogue-widget"],
    },
    {
      name: "x-acme-rogue-widget",
      category: "widget",
      version: "0.1.0",
      status: "stable",
      widgetShape: { props: { type: "object" } },
    },
  );
  inputs.surface.routes[0].slots.main.push({ type: "module-widget", widgetRef: "x-acme-rogue-widget", payload: {} });
  assertIssue("unadmitted contribution owner", inputs, "MODULE-CONTRIBUTION-UNADMITTED");
}

{
  const inputs = clone(base);
  inputs.surface.nav![0].path = "/missing";
  assertIssue("top-level nav target", inputs, "SURFACE-NAV-TARGET");
}

{
  const inputs = clone(base);
  const slot = firstShellSlot(inputs);
  const nav = (slot.payload?.nav ?? []) as Array<{ path: string }>;
  nav[0].path = "/missing";
  assertIssue("widget nav target", inputs, "SURFACE-NAV-TARGET");
}

{
  const plan = clone(baseRuntimePlan);
  const draft = plan.commands.find((command) => command.type === "draft" && command.definitionRef === "new-matter");
  if (draft?.type === "draft") delete draft.response.clientName;
  assertRuntimeIssue("runtime required field blocking", clone(base), plan, "RUNTIME-VALIDATION-BLOCKED");
}

{
  const inputs = clone(base);
  const sidecar = inputs.responseActions.find((candidate) => candidate.targetDefinition.url === "https://lexassist.example/forms/new-matter");
  const action = sidecar?.actions.find((candidate) => candidate.id === "saveNewMatter");
  if (!action) throw new Error("Missing saveNewMatter action");
  action.effects = [
    { type: "ledgerAppend", idempotencyKey: "idem:duplicate" },
    { type: "ledgerAppend", idempotencyKey: "idem:duplicate" },
  ];
  assertRuntimeIssue("runtime durable effect idempotency key reuse", inputs, clone(baseRuntimePlan), "RUNTIME-IDEMPOTENCY-DUPLICATE");
}

{
  const plan = clone(baseRuntimePlan);
  const hop = plan.commands.find((command) => command.type === "screenerHop");
  if (hop?.type === "screenerHop") {
    hop.target = "surface:library";
    hop.params = {};
  }
  assertRuntimeIssue("runtime undeclared screener hop", clone(base), plan, "RUNTIME-SCREENER-HOP-UNDECLARED");
}

{
  const plan = clone(baseRuntimePlan);
  plan.commands.push({ type: "unknown-command" } as unknown as RuntimePlan["commands"][number]);
  assertRuntimeIssue("runtime unknown command", clone(base), plan, "RUNTIME-COMMAND-UNKNOWN");
}

{
  const plan = clone(baseRuntimePlan);
  plan.commands.splice(1, 0, {
    type: "draft",
    definitionRef: "thread-composer",
    response: {
      message: "This draft is attempted before the thread route is active."
    }
  });
  assertRuntimeIssue("runtime definition must be present on active route", clone(base), plan, "RUNTIME-DEFINITION-NOT-IN-ROUTE");
}
