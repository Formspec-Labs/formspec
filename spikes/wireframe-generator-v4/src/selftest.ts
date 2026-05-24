/** @filedesc Negative self-tests for the ADR-0150 v4 app-coherence validator. */

import { resolveFixtureAppGraph } from "./artifact-resolver.js";
import { validateAppGraph } from "./app-graph.js";
import { validateComponentBundle } from "./coherence.js";
import { generateBundle } from "./generate.js";
import { executeRuntimePlan, type RuntimePlan } from "./runtime.js";
import { buildValidator } from "./schema-loader.js";
import type { DataSource, GeneratorInputs, MultiRouteBundle, RegistryEntry, SurfaceSlotEntry, UiPolicy } from "./types.js";

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

function runtimeResponse(report: ReturnType<typeof executeRuntimePlan>, definitionUrl: string): ReturnType<typeof executeRuntimePlan>["responses"][string] | undefined {
  return Object.values(report.responses).find((response) => response.definitionUrl === definitionUrl);
}

function assertComponentIssue(name: string, bundle: MultiRouteBundle, expectedCode: string): void {
  const issues = validateComponentBundle(bundle);
  if (!issues.some((issue) => issue.code === expectedCode)) {
    throw new Error(`${name}: expected ${expectedCode}, got ${issues.map((issue) => issue.code).join(", ") || "no issues"}`);
  }
  console.log(`[selftest] ok ${name} -> ${expectedCode}`);
}

function actionNodes(node: { component?: unknown; extensions?: Record<string, unknown>; children?: unknown }): Array<{ extensions?: Record<string, unknown> }> {
  const current = node.component === "ActionButton" ? [node] : [];
  const children = Array.isArray(node.children) ? node.children as Array<{ component?: unknown; extensions?: Record<string, unknown>; children?: unknown }> : [];
  return [...current, ...children.flatMap(actionNodes)];
}

function firstShellSlot(inputs: GeneratorInputs): SurfaceSlotEntry {
  return inputs.surface.routes[0].slots.shell[0];
}

function definitionSlot(inputs: GeneratorInputs, routeId: string, definitionRef: string): SurfaceSlotEntry {
  const route = inputs.surface.routes.find((candidate) => candidate.id === routeId);
  if (!route) throw new Error(`Missing route ${routeId}`);
  const slot = Object.values(route.slots)
    .flat()
    .find((candidate) => candidate.type === "definition-form" && candidate.definitionRef === definitionRef);
  if (!slot) throw new Error(`Missing definition-form slot ${routeId}/${definitionRef}`);
  return slot;
}

function registryEntry(inputs: GeneratorInputs, name: string): RegistryEntry {
  const entry = inputs.registry.entries.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`Missing registry entry ${name}`);
  return entry;
}

function dataSource(inputs: GeneratorInputs, id: string): DataSource {
  const source = inputs.dataSources?.sources.find((candidate) => candidate.id === id);
  if (!source) throw new Error(`Missing data source ${id}`);
  return source;
}

function uiPolicy(inputs: GeneratorInputs): UiPolicy {
  if (!inputs.uiPolicy) throw new Error("Missing UI Policy");
  return inputs.uiPolicy;
}

function unitWidgetPayload(inputs: GeneratorInputs, unitId: string): Record<string, unknown> {
  const unit = inputs.experience.units?.find((candidate) => candidate.id === unitId);
  const widget = unit?.extensions?.["x-formspec-widget"] as { payload?: Record<string, unknown> } | undefined;
  if (!widget?.payload) throw new Error(`Missing widget payload for unit ${unitId}`);
  return widget.payload;
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

function zeroDefinitionNonFormInputs(): GeneratorInputs {
  const inputs = clone(base);
  inputs.definitions = [];
  inputs.responseActions = [];
  refs(inputs.appManifest.definitions).splice(0);
  refs(inputs.appManifest.responseActions).splice(0);
  (refs(inputs.appManifest.experiences)[0] as LocalRef & { targetDefinitions: unknown[] }).targetDefinitions = [];
  for (const route of inputs.surface.routes) {
    for (const [slotName, entries] of Object.entries(route.slots)) {
      route.slots[slotName] = entries.filter((slot) => slot.type !== "definition-form");
    }
    for (const transition of route.transitions ?? []) {
      delete transition.actionRef;
    }
  }
  if (inputs.dataSources) {
    inputs.dataSources.sources = inputs.dataSources.sources.filter((source) => source.kind !== "definition-response");
  }
  for (const unit of inputs.experience.units ?? []) {
    const widget = unit.extensions?.["x-formspec-widget"] as { payload?: { dataSourceRefs?: unknown } } | undefined;
    if (Array.isArray(widget?.payload?.dataSourceRefs)) {
      widget.payload.dataSourceRefs = widget.payload.dataSourceRefs.filter((ref) => typeof ref !== "string" || !ref.startsWith("response:"));
    }
  }
  return inputs;
}

{
  const bundle = generateBundle(clone(base));
  const issues = validateComponentBundle(bundle);
  if (issues.length > 0) throw new Error(`generated Component bundle should be clean, got ${issues.map((issue) => issue.code).join(", ")}`);
  const actions = bundle.routes.flatMap((route) => actionNodes(route.doc.tree));
  if (actions.length === 0) throw new Error("generated Component bundle should include ActionButton nodes");
  if (!actions.every((node) => (node.extensions?.["x-formspec-action"] as { executor?: string } | undefined)?.executor === "response-actions")) {
    throw new Error("generated ActionButton nodes must delegate execution to Response Actions");
  }
  console.log("[selftest] ok generated Component bundle identity");
}

assertRuntimeOk("runtime persistence and hostEvent boundary", clone(base), clone(baseRuntimePlan), (report) => {
  const newMatter = runtimeResponse(report, "https://lexassist.example/forms/new-matter");
  const threadComposer = runtimeResponse(report, "https://lexassist.example/forms/thread-composer");
  if (!newMatter || !threadComposer) throw new Error("runtime report should include new-matter and thread-composer Response instances");
  if (newMatter?.state !== "completed") throw new Error(`new-matter state should be completed, got ${newMatter?.state}`);
  if (threadComposer?.state !== "in-progress") throw new Error(`thread-composer state should be in-progress, got ${threadComposer?.state}`);
  if (newMatter.owner !== "response" || report.ownership.session.owner !== "session" || report.ownership.route.owner !== "surface") {
    throw new Error("runtime report must keep route, session, and Response ownership explicit");
  }
  const saveInvocation = report.ownership.actions.find((action) => action.actionId === "saveNewMatter");
  if (!saveInvocation || saveInvocation.owner !== "response-actions" || saveInvocation.responseInstanceId !== Object.keys(report.responses).find((id) => report.responses[id] === newMatter)) {
    throw new Error("runtime report must bind action invocation ownership to the Response instance");
  }
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
  definitionSlot(inputs, "thread", "thread-composer").unitRef = "newMatterForm";
  assertIssue("Experience unit reused across Definitions", inputs, "EXPERIENCE-UNIT-DEFINITION-CONFLICT");
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
  delete (dataSource(inputs, "host:open-matters") as { runtime?: unknown }).runtime;
  assertIssues("schema-invalid missing data-source runtime behavior", inputs, ["APP-GRAPH-SCHEMA", "APP-GRAPH-COHERENCE-SKIPPED"]);
}

{
  const inputs = clone(base);
  delete (uiPolicy(inputs) as { routePolicies?: unknown }).routePolicies;
  assertIssues("schema-invalid missing UI policy route policies", inputs, ["APP-GRAPH-SCHEMA", "APP-GRAPH-COHERENCE-SKIPPED"]);
}

{
  const inputs = zeroDefinitionNonFormInputs();
  assertIssue("non-form app zero Definitions remains blocked by Component identity shim", inputs, "COMP-NONFORM-ZERO-DEFINITION-SHIM");
  try {
    generateBundle(inputs);
    throw new Error("zero-Definition Component generation should have failed");
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("zero-Definition app")) throw err;
    console.log("[selftest] ok zero-Definition generation guard");
  }
}

{
  const inputs = clone(base);
  unitWidgetPayload(inputs, "matterGallery").dataSourceRefs = ["host:missing-source"];
  assertIssue("payload data-source ref must resolve", inputs, "DATA-SOURCE-UNRESOLVED");
}

{
  const inputs = clone(base);
  dataSource(inputs, "host:matter-threads").id = "host:open-matters";
  assertIssue("data-source id must be unique", inputs, "DATA-SOURCE-ID-COLLISION");
}

{
  const inputs = clone(base);
  dataSource(inputs, "conversation:demand-response-thread").kind = "document-resource";
  assertIssue("data-source id prefix must match kind", inputs, "DATA-SOURCE-ID-PREFIX");
}

{
  const inputs = clone(base);
  dataSource(inputs, "response:new-matter").definitionRef = "missing-definition";
  assertIssue("data-source Definition ref must resolve", inputs, "DATA-SOURCE-DEFINITION-REF");
}

{
  const inputs = clone(base);
  dataSource(inputs, "resource:supply-agreement").routeRef = "missing-route";
  assertIssue("data-source route ref must resolve", inputs, "DATA-SOURCE-ROUTE-REF");
}

{
  const inputs = clone(base);
  dataSource(inputs, "host:open-matters").runtime.cache.mode = "snapshot";
  assertIssue("live data-source must subscribe", inputs, "DATA-SOURCE-RUNTIME-CACHE");
}

{
  const inputs = clone(base);
  dataSource(inputs, "host:route-params").runtime.cache.staleAfter = "PT1M";
  assertIssue("cache-none data-source cannot be stale", inputs, "DATA-SOURCE-CACHE-STALENESS");
}

{
  const inputs = clone(base);
  dataSource(inputs, "response:new-matter").runtime.cache.mode = "snapshot";
  assertIssue("draft data-source must use draft cache", inputs, "DATA-SOURCE-RUNTIME-DRAFT");
}

{
  const inputs = clone(base);
  dataSource(inputs, "resource:supply-agreement").runtime.provenance.kind = "host-state";
  assertIssue("data-source provenance kind must match", inputs, "DATA-SOURCE-PROVENANCE");
}

{
  const inputs = clone(base);
  uiPolicy(inputs).targetSurface.url = "https://lexassist.example/surfaces/missing";
  assertIssue("UI Policy Surface target must match", inputs, "UI-POLICY-SURFACE-TARGET");
}

{
  const inputs = clone(base);
  uiPolicy(inputs).localeKeyOwners = uiPolicy(inputs).localeKeyOwners.filter((owner) => owner.moduleId !== "x-formspec-conversation");
  assertIssue("module Locale key owner required", inputs, "LOCALE-KEY-OWNER");
}

{
  const inputs = clone(base);
  uiPolicy(inputs).localeKeyOwners.push({
    keyPrefix: "$module.x-formspec-presentation.",
    moduleId: "x-formspec-conversation",
  });
  assertIssue("module Locale key owner collision", inputs, "LOCALE-KEY-OWNER-COLLISION");
}

{
  const inputs = clone(base);
  uiPolicy(inputs).routePolicies = uiPolicy(inputs).routePolicies.filter((policy) => policy.routeId !== "profile");
  assertIssue("UI Policy must cover every route", inputs, "UI-POLICY-ROUTE-MISSING");
}

{
  const inputs = clone(base);
  uiPolicy(inputs).routePolicies[0].responsive.collapseOrder.push("missing-slot");
  assertIssue("responsive policy slot must resolve", inputs, "UI-POLICY-RESPONSIVE-SLOT");
}

{
  const inputs = clone(base);
  uiPolicy(inputs).routePolicies.find((policy) => policy.routeId === "home")!.definitionVisibility = {
    hiddenDefinitionRefs: ["thread-composer"],
  };
  assertIssue("hidden Definition route policy must target route-local form slot", inputs, "UI-POLICY-HIDDEN-DEFINITION-REF");
}

{
  const inputs = clone(base);
  uiPolicy(inputs).theme.assignments[0].slot = "missing.slot";
  assertIssue("Theme assignment must target declared token slot", inputs, "THEME-TOKEN-SLOT");
}

{
  const inputs = clone(base);
  firstShellSlot(inputs).payload = {
    ...(firstShellSlot(inputs).payload ?? {}),
    authorization: { allowedActors: ["legalUser"] },
  };
  assertIssue("Surface authorization remains ADR 0152", inputs, "AUTHORIZATION-ADR0152-DEFERRED");
}

{
  const inputs = clone(base);
  (inputs.responseActions[0].actions[0] as unknown as { authorization?: unknown }).authorization = { policyRef: "policy:new-matter" };
  assertIssue("Response Action authorization remains ADR 0152", inputs, "AUTHORIZATION-ADR0152-DEFERRED");
}

{
  const inputs = clone(base);
  (inputs.posture as unknown as { routePolicies?: unknown }).routePolicies = [{ routeId: "home", allowedActors: ["legalUser"] }];
  assertIssue("Posture fine-grained authorization remains ADR 0152", inputs, "AUTHORIZATION-ADR0152-DEFERRED");
}

{
  const inputs = clone(base);
  inputs.responseActions[1].actions[0].id = inputs.responseActions[0].actions[0].id;
  assertIssue("duplicate Response Actions action id", inputs, "RESPONSE-ACTIONS-ACTION-ID-COLLISION");
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
  inputs.surface.routes[0].slots.main.push({
    type: "module-widget",
    widgetRef: "x-formspec-presentation-gallery",
    payload: { cards: [{ subtitle: "missing title" }] },
  });
  assertIssue("module-widget payload mismatch", inputs, "MODULE-PAYLOAD-SCHEMA-MISMATCH");
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
  const inputs = clone(base);
  delete definitionSlot(inputs, "home", "new-matter").responseBinding;
  assertIssues("schema-invalid missing Response binding", inputs, ["APP-GRAPH-SCHEMA", "APP-GRAPH-COHERENCE-SKIPPED"]);
}

{
  const inputs = clone(base);
  const binding = definitionSlot(inputs, "thread", "thread-composer").responseBinding;
  if (!binding) throw new Error("Missing thread-composer Response binding");
  binding.routeParam = "missingParam";
  assertIssue("Response binding route param must resolve", inputs, "SURFACE-RESPONSE-BINDING-PARAM");
}

{
  const inputs = clone(base);
  const transition = inputs.surface.routes[0].transitions?.[0];
  if (!transition?.actionRef) throw new Error("Missing home transition actionRef");
  transition.actionRef.actionId = "missingAction";
  assertIssue("Surface transition actionRef must resolve", inputs, "SURFACE-TRANSITION-ACTION-REF");
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
  const bundle = generateBundle(clone(base));
  bundle.routes[0].doc.tree.extensions = {
    ...((bundle.routes[0].doc.tree.extensions as Record<string, unknown> | undefined) ?? {}),
    authorization: { allowedActors: ["legalUser"] },
  };
  assertComponentIssue("Component authorization remains ADR 0152", bundle, "COMP-AUTHORIZATION-DEFERRED");
}

{
  const plan = clone(baseRuntimePlan);
  const draft = plan.commands.find((command) => command.type === "draft" && command.definitionRef === "new-matter");
  if (draft?.type === "draft") delete draft.response.clientName;
  assertRuntimeIssue("runtime required field blocking", clone(base), plan, "RUNTIME-VALIDATION-BLOCKED");
}

{
  const inputs = clone(base);
  uiPolicy(inputs).routePolicies.find((policy) => policy.routeId === "thread")!.definitionVisibility = {
    hiddenDefinitionRefs: ["thread-composer"],
  };
  const plan = clone(baseRuntimePlan);
  plan.commands = [
    { type: "navigate", route: "thread", params: { matterId: "acme", threadId: "thread-1" } },
    { type: "draft", definitionRef: "thread-composer", response: { message: "Draft while hidden." } },
  ];
  assertRuntimeIssue("runtime rejects hidden Definition slot while Response is mid-draft", inputs, plan, "RUNTIME-DEFINITION-HIDDEN-BY-POLICY");
}

{
  const plan = clone(baseRuntimePlan);
  plan.actor = "urn:formspec:actor:human:outside-counsel";
  assertRuntimeIssue("runtime actor must belong to session", clone(base), plan, "RUNTIME-SESSION-ACTOR");
}

{
  const inputs = clone(base);
  inputs.posture!.allowedActors = inputs.posture!.allowedActors?.filter((actor) => actor !== baseRuntimePlan.actor);
  assertRuntimeIssue("runtime actor must be posture-admitted", inputs, clone(baseRuntimePlan), "RUNTIME-ACTOR-DENIED");
}

{
  const inputs = clone(base);
  inputs.posture!.allowedActors = [...(inputs.posture!.allowedActors ?? []), "urn:formspec:actor:human:outside-counsel"];
  const plan = clone(baseRuntimePlan);
  const invoke = plan.commands.find((command) => command.type === "invokeAction" && command.definitionRef === "new-matter");
  if (invoke?.type === "invokeAction") invoke.actor = "urn:formspec:actor:human:outside-counsel";
  assertRuntimeIssue("runtime action actor must belong to session", inputs, plan, "RUNTIME-ACTION-ACTOR-NOT-IN-SESSION");
}

{
  const plan = clone(baseRuntimePlan);
  const actionIndex = plan.commands.findIndex((command) => command.type === "invokeAction" && command.definitionRef === "new-matter");
  if (actionIndex < 0) throw new Error("Missing new-matter invokeAction command");
  plan.commands.splice(actionIndex, 1);
  assertRuntimeIssue("runtime transition requires Response Action", clone(base), plan, "RUNTIME-TRANSITION-ACTION-MISSING");
}

{
  const inputs = clone(base);
  const thread = inputs.surface.routes.find((route) => route.id === "thread");
  if (!thread) throw new Error("Missing thread route");
  thread.transitions = [
    ...(thread.transitions ?? []),
    {
      on: "sendMessage",
      to: "matter",
      params: { matterId: "matterId" },
      actionRef: { definitionRef: "thread-composer", actionId: "sendMessage" },
    },
  ];
  const plan = clone(baseRuntimePlan);
  const sendIndex = plan.commands.findIndex((command) => command.type === "invokeAction" && command.definitionRef === "thread-composer");
  if (sendIndex < 0) throw new Error("Missing thread-composer invokeAction command");
  plan.commands.splice(
    sendIndex + 1,
    0,
    { type: "navigate", route: "thread", params: { matterId: "acme", threadId: "other-thread" } },
    { type: "transition", event: "sendMessage" },
  );
  assertRuntimeIssue("runtime transition action must match Response instance", inputs, plan, "RUNTIME-TRANSITION-ACTION-MISSING");
}

{
  const inputs = clone(base);
  delete definitionSlot(inputs, "home", "new-matter").responseBinding;
  assertRuntimeIssue("runtime Response binding required", inputs, clone(baseRuntimePlan), "RUNTIME-RESPONSE-BINDING");
}

{
  const inputs = clone(base);
  const binding = definitionSlot(inputs, "thread", "thread-composer").responseBinding;
  if (!binding) throw new Error("Missing thread-composer Response binding");
  binding.routeParam = "missingParam";
  assertRuntimeIssue("runtime Response instance param required", inputs, clone(baseRuntimePlan), "RUNTIME-RESPONSE-INSTANCE-PARAM");
}

{
  const inputs = clone(base);
  inputs.surface.routes[0].slots.main.push(clone(definitionSlot(inputs, "home", "new-matter")));
  assertRuntimeIssue("runtime duplicate form slot Response ambiguity", inputs, clone(baseRuntimePlan), "RUNTIME-RESPONSE-BINDING-AMBIGUOUS");
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
