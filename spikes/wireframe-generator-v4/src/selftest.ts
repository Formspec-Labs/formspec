/** @filedesc Negative self-tests for the ADR-0150 v4 app-coherence validator. */

import { resolveFixtureAppGraph } from "./artifact-resolver.js";
import { validateAppGraph } from "./app-graph.js";
import { validateComponentBundle } from "./coherence.js";
import { generateBundle } from "./generate.js";
import { executeRuntimePlan, type RuntimePlan } from "./runtime.js";
import { buildValidator } from "./schema-loader.js";
import type { GeneratorInputs, MultiRouteBundle, RegistryEntry, SurfaceSlotEntry } from "./types.js";

type LocalRef = { url: string; version?: string; fixture?: string };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function refs(value: unknown): LocalRef[] {
  if (!Array.isArray(value)) throw new Error("Expected an array of local refs.");
  return value as LocalRef[];
}

async function loadInputs(): Promise<GeneratorInputs> {
  return (await resolveFixtureAppGraph()).inputs;
}

function assertIssue(name: string, inputs: GeneratorInputs, expectedCode: string): void {
  const report = validateAppGraph(inputs, ajv);
  if (!report.issues.some((issue) => issue.code === expectedCode)) {
    throw new Error(`${name}: expected ${expectedCode}, got ${report.issues.map((issue) => issue.code).join(", ") || "no issues"}`);
  }
  console.log(`[selftest] ok ${name} -> ${expectedCode}`);
}

function assertIssues(name: string, inputs: GeneratorInputs, expectedCodes: string[]): void {
  const report = validateAppGraph(inputs, ajv);
  const actualCodes = report.issues.map((issue) => issue.code);
  const missing = expectedCodes.filter((code) => !actualCodes.includes(code));
  if (missing.length > 0) {
    throw new Error(`${name}: expected ${missing.join(", ")}, got ${actualCodes.join(", ") || "no issues"}`);
  }
  console.log(`[selftest] ok ${name} -> ${expectedCodes.join(", ")}`);
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

function assertComponentIssue(name: string, bundle: MultiRouteBundle, expectedCode: string): void {
  const issues = validateComponentBundle(bundle);
  if (!issues.some((issue) => issue.code === expectedCode)) {
    throw new Error(`${name}: expected ${expectedCode}, got ${issues.map((issue) => issue.code).join(", ") || "no issues"}`);
  }
  console.log(`[selftest] ok ${name} -> ${expectedCode}`);
}

function firstShellSlot(inputs: GeneratorInputs): SurfaceSlotEntry {
  return inputs.surface.routes[0].slots.shell[0];
}

function registryEntry(inputs: GeneratorInputs, name: string): RegistryEntry {
  const entry = inputs.registry.entries.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`Missing registry entry ${name}`);
  return entry;
}

function testModule(name: string, contributes: string[] = []): RegistryEntry {
  return {
    name,
    category: "module",
    version: "0.1.0",
    status: "stable",
    description: `Test module ${name}.`,
    compatibility: { formspecVersion: ">=1.0.0 <2.0.0" },
    contributes,
  };
}

function testWidget(name: string): RegistryEntry {
  return {
    name,
    category: "widget",
    version: "0.1.0",
    status: "stable",
    description: `Test widget ${name}.`,
    compatibility: { formspecVersion: ">=1.0.0 <2.0.0" },
    widgetShape: { props: { type: "object" } },
  };
}

const base = await loadInputs();
const ajv = await buildValidator();
const baseRuntimePlan = base.runtimePlan as RuntimePlan;

{
  const bundle = generateBundle(clone(base));
  const issues = validateComponentBundle(bundle);
  if (issues.length > 0) throw new Error(`generated Component bundle should be clean, got ${issues.map((issue) => issue.code).join(", ")}`);
  console.log("[selftest] ok generated Component bundle identity");
}

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
  assertIssues("schema-invalid missing experience targetDefinitions index", inputs, ["APP-GRAPH-SCHEMA", "APP-GRAPH-COHERENCE-SKIPPED"]);
}

{
  const inputs = clone(base);
  const experienceRef = refs(inputs.appManifest.experiences)[0] as { targetDefinitions?: Array<{ url: string }> };
  experienceRef.targetDefinitions = experienceRef.targetDefinitions?.slice(0, -1);
  assertIssue("experience targetDefinition omission", inputs, "APP-COHERENCE-EXPERIENCE-TARGET-OMISSION");
}

{
  const inputs = clone(base);
  delete (inputs.responseActions[0] as { targetDefinition?: unknown }).targetDefinition;
  assertIssues("schema-invalid response-actions sidecar returns graph report", inputs, ["APP-GRAPH-SCHEMA", "APP-GRAPH-COHERENCE-SKIPPED"]);
}

{
  const inputs = clone(base);
  delete (inputs.registry as { entries?: unknown }).entries;
  assertIssues("schema-invalid registry returns graph report", inputs, ["APP-GRAPH-SCHEMA", "APP-GRAPH-COHERENCE-SKIPPED"]);
}

{
  const inputs = clone(base);
  inputs.registry.entries.push(
    testModule("x-acme-rogue-widget-module", ["x-acme-rogue-widget"]),
    testWidget("x-acme-rogue-widget"),
  );
  inputs.surface.routes[0].slots.main.push({ type: "module-widget", widgetRef: "x-acme-rogue-widget", payload: {} });
  assertIssue("unadmitted contribution owner", inputs, "MODULE-CONTRIBUTION-UNADMITTED");
}

{
  const inputs = clone(base);
  const appModule = inputs.appManifest.modules?.find((moduleRef) => moduleRef.id === "x-formspec-surface");
  if (!appModule) throw new Error("Missing x-formspec-surface app module");
  appModule.version = "^9.0.0";
  assertIssue("unresolved app module version", inputs, "MODULE-VERSION-UNRESOLVED");
}

{
  const inputs = clone(base);
  const surfaceModule = inputs.surface.modules?.find((moduleRef) => moduleRef.id === "x-formspec-surface");
  if (!surfaceModule) throw new Error("Missing x-formspec-surface Surface module");
  surfaceModule.version = "^9.0.0";
  assertIssue("module version conflict across sibling artifacts", inputs, "APP-COHERENCE-SIBLING-MODULE-VERSION");
}

{
  const inputs = clone(base);
  registryEntry(inputs, "x-formspec-surface").dependencies = [{ id: "x-acme-missing-module", version: "^1.0.0" }];
  assertIssue("module dependency failure", inputs, "MODULE-DEPENDENCY-UNRESOLVED");
}

{
  const inputs = clone(base);
  inputs.registry.entries.push({
    ...testWidget("x-formspec-surface"),
    version: "9.0.0",
  });
  assertIssue("registry category name conflict", inputs, "APP-COHERENCE-REGISTRY-NAME-CONFLICT");
}

{
  const inputs = clone(base);
  inputs.registry.entries.push(testWidget("x-acme-unowned-widget"));
  inputs.surface.routes[0].slots.main.push({ type: "module-widget", widgetRef: "x-acme-unowned-widget", payload: {} });
  assertIssue("unowned contribution", inputs, "APP-COHERENCE-UNOWNED-CONTRIBUTION");
}

{
  const inputs = clone(base);
  (registryEntry(inputs, "x-formspec-presentation").contributes as string[]).push("x-acme-conflict-widget");
  (registryEntry(inputs, "x-formspec-conversation").contributes as string[]).push("x-acme-conflict-widget");
  inputs.registry.entries.push(testWidget("x-acme-conflict-widget"));
  inputs.surface.routes[0].slots.main.push({ type: "module-widget", widgetRef: "x-acme-conflict-widget", payload: {} });
  assertIssue("duplicate contribution owner", inputs, "APP-COHERENCE-CONTRIBUTION-CONFLICT");
}

{
  const inputs = clone(base);
  inputs.surface.routes[0].slots.main.push({ type: "module-widget", widgetRef: "x-formspec-slot-static-content", payload: {} });
  assertIssue("wrong contribution category", inputs, "APP-COHERENCE-CONTRIBUTION-CATEGORY");
}

{
  const inputs = clone(base);
  inputs.posture!.allowedModules = inputs.posture!.allowedModules?.filter((moduleRef) => moduleRef.id !== "x-formspec-presentation");
  assertIssue("posture-denied contribution", inputs, "MODULE-CONTRIBUTION-DENIED");
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
  assertIssue("payload nav target", inputs, "SURFACE-NAV-TARGET");
}

{
  const inputs = clone(base);
  inputs.surface.routes[1].id = inputs.surface.routes[0].id;
  assertIssue("duplicate route id", inputs, "SURFACE-ROUTE-ID-DUPLICATE");
}

{
  const inputs = clone(base);
  inputs.surface.routes[1].default = true;
  assertIssue("multiple default routes", inputs, "SURFACE-DEFAULT-ROUTE");
}

{
  const inputs = clone(base);
  for (const route of inputs.surface.routes) route.default = false;
  assertIssue("missing default route", inputs, "SURFACE-DEFAULT-ROUTE");
}

{
  const inputs = clone(base);
  const docViewer = inputs.surface.routes.find((route) => route.id === "doc-viewer");
  const embed = docViewer?.slots.right.find((slot) => slot.type === "embed-route");
  if (!embed || embed.type !== "embed-route") throw new Error("Missing doc-viewer embed-route slot");
  embed.routeRef = "missing-route";
  assertIssue("unresolved embedded Surface route", inputs, "SURFACE-EMBED-TARGET");
}

{
  const inputs = clone(base);
  const transition = inputs.surface.routes[0].transitions?.[0];
  if (!transition?.params) throw new Error("Missing home transition params");
  delete transition.params.matterId;
  assertIssue("transition missing route params", inputs, "SURFACE-TRANSITION-PARAM");
}

{
  const inputs = clone(base);
  inputs.surface.routes.push({
    id: "orphan",
    path: "/orphan",
    label: "Orphan",
    slots: {
      main: [
        {
          type: "static-content",
          content: {
            heading: "Orphan",
            body: "This route is not reachable from nav, transition, or embed graph.",
          },
        },
      ],
    },
  });
  assertIssue("unreachable route", inputs, "SURFACE-UNREACHABLE-ROUTE");
}

{
  const bundle = generateBundle(clone(base));
  const nonFormRoute = bundle.routes.find((route) => route.id === "matter");
  if (!nonFormRoute) throw new Error("Missing non-form matter route");
  const compat = nonFormRoute.doc.extensions?.["x-spike-v4-output-compatibility"] as { outputOnly?: boolean } | undefined;
  if (!compat) throw new Error("Missing non-form compatibility marker");
  compat.outputOnly = false;
  assertComponentIssue("non-form Component shim quarantine", bundle, "COMP-NONFORM-SHIM-QUARANTINE");
}

{
  const bundle = generateBundle(clone(base));
  const route = bundle.routes[0];
  delete route.doc.extensions?.["x-formspec-component-identity"];
  assertComponentIssue("route Component identity required", bundle, "COMP-ROUTE-IDENTITY");
}

{
  const bundle = generateBundle(clone(base));
  const route = bundle.routes[0];
  const surface = route.doc.extensions?.["x-formspec-surface"] as { path?: string } | undefined;
  if (!surface) throw new Error("Missing Surface identity marker");
  surface.path = "/wrong";
  assertComponentIssue("route Component Surface identity required", bundle, "COMP-SURFACE-IDENTITY");
}

{
  const bundle = generateBundle(clone(base));
  const route = bundle.routes.find((route) => route.id === "home");
  if (!route) throw new Error("Missing form-capable home route");
  route.doc.extensions = {
    ...(route.doc.extensions ?? {}),
    "x-spike-v4-output-compatibility": {
      outputOnly: true,
      mustNotPromote: true,
      shimTargetDefinition: route.doc.targetDefinition.url,
    },
  };
  assertComponentIssue("form Component shim marker rejected", bundle, "COMP-FORM-SHIM-UNEXPECTED");
}

{
  const bundle = generateBundle(clone(base));
  const nonFormRoute = bundle.routes.find((route) => route.id === "matter");
  if (!nonFormRoute) throw new Error("Missing non-form matter route");
  const compat = nonFormRoute.doc.extensions?.["x-spike-v4-output-compatibility"] as { shimTargetDefinition?: string } | undefined;
  if (!compat) throw new Error("Missing non-form compatibility marker");
  compat.shimTargetDefinition = "https://lexassist.example/forms/wrong";
  assertComponentIssue("non-form Component shim target mismatch", bundle, "COMP-NONFORM-SHIM-TARGET-MISMATCH");
}

{
  const bundle = generateBundle(clone(base));
  bundle.routes[1].doc.tree.id = bundle.routes[0].doc.tree.id;
  assertComponentIssue("generated Component id collision", bundle, "COMP-BUNDLE-ID-COLLISION");
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
