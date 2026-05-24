/** @filedesc Spike-local app graph coherence validator for ADR-0150 v3 proof. */

import type Ajv2020 from "ajv/dist/2020.js";
import type {
  ComponentNode,
  DataSourceCatalog,
  Definition,
  ExpUnit,
  GeneratorInputs,
  JsonObject,
  ModuleRef,
  MultiRouteBundle,
  RegistryEntry,
  ResponseActions,
  SurfaceRoute,
  SurfaceSlotEntry,
} from "./types.js";

export type CoherenceSeverity = "error" | "warning" | "info";

export type CoherenceIssue = {
  code: string;
  severity: CoherenceSeverity;
  path: string;
  message: string;
};

export type CoherenceReport = {
  ok: boolean;
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    routes: number;
    definitions: number;
    responseActions: number;
    modules: number;
  };
  issues: CoherenceIssue[];
};

type RegistryIndex = {
  entriesByName: Map<string, RegistryEntry[]>;
  latestByName: Map<string, RegistryEntry>;
  modules: Map<string, RegistryEntry>;
  contributedBy: Map<string, string[]>;
};

const DEFAULT_MODULES: ModuleRef[] = [
  { id: "x-formspec-core-task", version: "^1.0.0" },
  { id: "x-formspec-core-actions", version: "^1.0.0" },
  { id: "x-formspec-core-component", version: "^1.0.0" },
];

function issue(
  issues: CoherenceIssue[],
  severity: CoherenceSeverity,
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ severity, code, path, message });
}

function semverTuple(v: string): [number, number, number] | null {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function versionSatisfies(version: string, range: string): boolean {
  if (range === version) return true;
  const exact = semverTuple(version);
  if (!exact) return false;
  if (range.startsWith("^")) {
    const base = semverTuple(range.slice(1));
    return !!base && exact[0] === base[0] && compareSemver(exact, base) >= 0;
  }
  const parts = range.split(/\s+/).filter(Boolean);
  if (parts.length === 2 && parts[0].startsWith(">=") && parts[1].startsWith("<")) {
    const min = semverTuple(parts[0].slice(2));
    const max = semverTuple(parts[1].slice(1));
    return !!min && !!max && compareSemver(exact, min) >= 0 && compareSemver(exact, max) < 0;
  }
  return false;
}

function compareSemver(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function moduleKey(m: ModuleRef): string {
  return `${m.id}@${m.version}`;
}

function moduleRefsMatch(left: ModuleRef, right: ModuleRef): boolean {
  return left.id === right.id && left.version === right.version;
}

function postureAdmits(docModule: ModuleRef, allowed: ModuleRef): boolean {
  if (allowed.id !== docModule.id) return false;
  if (allowed.version !== docModule.version) return false;
  if (allowed.publisher != null && allowed.publisher !== docModule.publisher) return false;
  if (allowed.lockHash != null && allowed.lockHash !== docModule.lockHash) return false;
  return true;
}

function buildRegistryIndex(entries: RegistryEntry[]): RegistryIndex {
  const entriesByName = new Map<string, RegistryEntry[]>();
  const latestByName = new Map<string, RegistryEntry>();
  const modules = new Map<string, RegistryEntry>();
  const contributedBy = new Map<string, string[]>();

  for (const entry of entries) {
    const existing = entriesByName.get(entry.name) ?? [];
    existing.push(entry);
    entriesByName.set(entry.name, existing);
    const prior = latestByName.get(entry.name);
    if (!prior || compareEntryVersion(entry, prior) >= 0) latestByName.set(entry.name, entry);
    if (entry.category === "module") {
      modules.set(entry.name, entry);
      for (const contribution of entry.contributes ?? []) {
        const owners = contributedBy.get(contribution) ?? [];
        owners.push(entry.name);
        contributedBy.set(contribution, owners);
      }
    }
  }

  return { entriesByName, latestByName, modules, contributedBy };
}

function compareEntryVersion(a: RegistryEntry, b: RegistryEntry): number {
  const av = semverTuple(a.version);
  const bv = semverTuple(b.version);
  if (!av || !bv) return a.version.localeCompare(b.version);
  return compareSemver(av, bv);
}

function latestEntry(index: RegistryIndex, name: string): RegistryEntry | undefined {
  return index.latestByName.get(name);
}

function appModules(inputs: GeneratorInputs): ModuleRef[] {
  const declared = inputs.appManifest.modules ?? [];
  const out = [...declared];
  for (const m of DEFAULT_MODULES) {
    if (!out.some((existing) => existing.id === m.id)) out.push(m);
  }
  return out;
}

function allDocumentModules(inputs: GeneratorInputs): Array<{ owner: string; modules: ModuleRef[] }> {
  const docs: Array<{ owner: string; modules: ModuleRef[] }> = [
    { owner: "appManifest", modules: inputs.appManifest.modules ?? [] },
    { owner: "experience", modules: inputs.experience.modules ?? [] },
    { owner: "surface", modules: inputs.surface.modules ?? [] },
  ];
  for (const def of inputs.definitions) docs.push({ owner: `definition:${def.name ?? def.url}`, modules: def.modules ?? [] });
  for (const ra of inputs.responseActions) docs.push({ owner: `responseActions:${ra.targetDefinition.url}`, modules: ra.modules ?? [] });
  return docs;
}

function refsByUrl<T extends { url: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.url, item]));
}

function actionSidecarRefs(inputs: GeneratorInputs): Array<{ url: string; version?: string }> {
  const ext = inputs.appManifest["x-spike-v3-responseActions"];
  if (Array.isArray(ext)) return ext.filter((ref): ref is { url: string; version?: string } => !!ref && typeof ref.url === "string");
  return inputs.appManifest.responseActions ? [inputs.appManifest.responseActions] : [];
}

function definitionKey(def: Definition): string {
  return def.name ?? def.url.replace(/^.*\//, "");
}

function unitById(inputs: GeneratorInputs): Map<string, ExpUnit> {
  return new Map((inputs.experience.units ?? []).map((unit) => [unit.id, unit]));
}

function actionSidecarByDefinition(inputs: GeneratorInputs): Map<string, ResponseActions> {
  return new Map(inputs.responseActions.map((ra) => [ra.targetDefinition.url, ra]));
}

function definitionByRef(inputs: GeneratorInputs, ref: string): Definition | undefined {
  return inputs.definitions.find((def) => def.url === ref || definitionKey(def) === ref);
}

function dataSourceIds(catalog: DataSourceCatalog | undefined): Set<string> {
  return new Set((catalog?.sources ?? []).map((source) => source.id));
}

function payloadDataSourceRefs(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  const raw = p.dataSourceRefs;
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === "string");
  if (typeof raw === "string") return [raw];
  return [];
}

function slotTypeContribution(slotType: string): string {
  return `x-formspec-slot-${slotType}`;
}

function assertContribution(
  issues: CoherenceIssue[],
  index: RegistryIndex,
  name: string,
  category: string,
  path: string,
): RegistryEntry | undefined {
  const entry = latestEntry(index, name);
  if (!entry) {
    issue(issues, "error", "APP-COHERENCE-UNRESOLVED-CONTRIBUTION", path, `Registry entry '${name}' is missing.`);
    return undefined;
  }
  if (entry.category !== category) {
    issue(issues, "error", "APP-COHERENCE-CONTRIBUTION-CATEGORY", path, `Registry entry '${name}' is '${entry.category}', expected '${category}'.`);
  }
  const owners = index.contributedBy.get(name) ?? [];
  if (owners.length === 0) {
    issue(issues, "error", "APP-COHERENCE-UNOWNED-CONTRIBUTION", path, `Registry entry '${name}' is not contributed by any module.`);
  }
  if (owners.length > 1) {
    issue(issues, "error", "APP-COHERENCE-CONTRIBUTION-CONFLICT", path, `Registry entry '${name}' is contributed by multiple modules: ${owners.join(", ")}.`);
  }
  return entry;
}

export function validateAppCoherence(inputs: GeneratorInputs, ajv: Ajv2020): CoherenceReport {
  const issues: CoherenceIssue[] = [];
  const registry = buildRegistryIndex(inputs.registry.entries);
  const definitionsByUrl = refsByUrl(inputs.definitions);
  const units = unitById(inputs);
  const sidecarsByDefinition = actionSidecarByDefinition(inputs);
  const dataSources = dataSourceIds(inputs.dataSources);
  const appModuleSet = appModules(inputs);

  validateSiblingIndex(inputs, issues, definitionsByUrl, sidecarsByDefinition);
  validateModuleAdmission(inputs, issues, registry, appModuleSet);
  validateSurfaceGraph(inputs, issues);
  validateSlots(inputs, issues, registry, units, sidecarsByDefinition, dataSources, ajv);
  validateDataSources(inputs, issues);
  validateScreenerTargets(inputs, issues);

  return report(inputs, issues);
}

function validateSiblingIndex(
  inputs: GeneratorInputs,
  issues: CoherenceIssue[],
  definitionsByUrl: Map<string, Definition>,
  sidecarsByDefinition: Map<string, ResponseActions>,
): void {
  for (const ref of inputs.appManifest.definitions) {
    if (!definitionsByUrl.has(ref.url)) {
      issue(issues, "error", "APP-COHERENCE-MISSING-DEFINITION", "$.definitions", `App Manifest references missing Definition '${ref.url}'.`);
    }
  }
  for (const def of inputs.definitions) {
    if (!inputs.appManifest.definitions.some((ref) => ref.url === def.url)) {
      issue(issues, "error", "APP-COHERENCE-UNLISTED-DEFINITION", "$.definitions", `Definition '${def.url}' is loaded but not listed in App Manifest.`);
    }
  }
  if (!inputs.appManifest.experience) {
    issue(issues, "error", "APP-COHERENCE-MISSING-EXPERIENCE-REF", "$.experience", "App Manifest must reference the loaded Experience sidecar.");
  } else {
    issue(issues, "info", "APP-COHERENCE-EXPERIENCE-SINGULAR-GAP", "$.experience", "Experience is still a singular sibling in the official App Manifest shape; v3 resolves it as the app-level Experience sidecar.");
  }
  const actionRefs = actionSidecarRefs(inputs);
  for (const ra of inputs.responseActions) {
    if (!definitionsByUrl.has(ra.targetDefinition.url)) {
      issue(issues, "error", "APP-COHERENCE-ACTION-TARGET", "$.responseActions", `Response Actions sidecar targets missing Definition '${ra.targetDefinition.url}'.`);
    }
    const listed = actionRefs.some((ref) => ref.url === sidecarUrlForDefinition(ra.targetDefinition.url));
    if (!listed) {
      issue(issues, "error", "APP-COHERENCE-UNLISTED-ACTION-SIDECAR", "$.x-spike-v3-responseActions", `Response Actions sidecar for '${ra.targetDefinition.url}' is not listed in the spike-local sidecar index.`);
    }
  }
  for (const def of inputs.definitions) {
    if (!sidecarsByDefinition.has(def.url)) {
      issue(issues, "warning", "APP-COHERENCE-MISSING-ACTION-SIDECAR", "$.x-spike-v3-responseActions", `Definition '${def.url}' has no Response Actions sidecar.`);
    }
  }

  const seenActions = new Map<string, string>();
  for (const ra of inputs.responseActions) {
    for (const action of ra.actions) {
      const owner = seenActions.get(action.id);
      if (owner) {
        issue(issues, "error", "COMP-BUNDLE-ACTION-ID-COLLISION", "$.responseActions", `Action id '${action.id}' appears in both '${owner}' and '${ra.targetDefinition.url}'.`);
      } else {
        seenActions.set(action.id, ra.targetDefinition.url);
      }
    }
  }
}

function sidecarUrlForDefinition(definitionUrl: string): string {
  return definitionUrl.replace("/forms/", "/actions/");
}

function validateModuleAdmission(
  inputs: GeneratorInputs,
  issues: CoherenceIssue[],
  registry: RegistryIndex,
  appModuleSet: ModuleRef[],
): void {
  const appModulesById = new Map(appModuleSet.map((m) => [m.id, m]));
  for (const moduleRef of appModuleSet) {
    const moduleEntry = registry.modules.get(moduleRef.id);
    if (!moduleEntry) {
      issue(issues, "error", "MODULE-ENUM-UNRESOLVED", "$.modules", `App module '${moduleRef.id}' is not present in the Registry.`);
      continue;
    }
    if (!versionSatisfies(moduleEntry.version, moduleRef.version)) {
      issue(issues, "error", "MODULE-VERSION-UNRESOLVED", "$.modules", `Registry module '${moduleRef.id}@${moduleEntry.version}' does not satisfy '${moduleRef.version}'.`);
    }
    for (const dep of moduleEntry.dependencies ?? []) {
      const declared = appModulesById.get(dep.id);
      if (!declared || !versionSatisfies(resolveModuleVersion(registry, dep.id) ?? "", dep.version)) {
        issue(issues, "error", "MODULE-DEPENDENCY-UNRESOLVED", "$.modules", `Module '${moduleRef.id}' depends on '${moduleKey(dep)}', but the app does not admit it.`);
      }
    }
  }

  for (const doc of allDocumentModules(inputs)) {
    for (const moduleRef of doc.modules) {
      const appModule = appModulesById.get(moduleRef.id);
      if (!appModule) {
        issue(issues, "error", "APP-COHERENCE-SIBLING-MODULE", `$.${doc.owner}.modules`, `Sibling declares module '${moduleRef.id}' absent from App Manifest modules[].`);
      } else if (!moduleRefsMatch(moduleRef, appModule)) {
        issue(issues, "error", "APP-COHERENCE-SIBLING-MODULE-VERSION", `$.${doc.owner}.modules`, `Sibling module '${moduleKey(moduleRef)}' differs from App Manifest '${moduleKey(appModule)}'.`);
      }
      const allowed = inputs.posture?.allowedModules ?? [];
      if (allowed.length > 0 && !allowed.some((entry) => postureAdmits(moduleRef, entry))) {
        issue(issues, "error", "MODULE-ADMISSION-DENIED", `$.${doc.owner}.modules`, `Posture does not admit module '${moduleKey(moduleRef)}'.`);
      }
    }
  }

  for (const [name, entries] of registry.entriesByName) {
    const categories = new Set(entries.map((entry) => entry.category));
    if (categories.size > 1) {
      issue(issues, "error", "APP-COHERENCE-REGISTRY-NAME-CONFLICT", "$.registry.entries", `Registry name '${name}' is reused across categories: ${Array.from(categories).join(", ")}.`);
    }
  }
}

function resolveModuleVersion(registry: RegistryIndex, id: string): string | undefined {
  return registry.modules.get(id)?.version;
}

function validateSurfaceGraph(inputs: GeneratorInputs, issues: CoherenceIssue[]): void {
  if (inputs.surface.targetExperience.url !== inputs.appManifest.experience?.url) {
    issue(issues, "error", "SURFACE-EXPERIENCE-MISMATCH", "$.surface.targetExperience", `Surface targets '${inputs.surface.targetExperience.url}', App Manifest lists '${inputs.appManifest.experience?.url ?? "(none)"}'.`);
  }
  const routes = new Map(inputs.surface.routes.map((route) => [route.id, route]));
  const defaults = inputs.surface.routes.filter((route) => route.default);
  if (defaults.length !== 1) {
    issue(issues, "error", "SURFACE-DEFAULT-ROUTE", "$.surface.routes", `Surface must have exactly one default route; found ${defaults.length}.`);
  }

  for (const [index, route] of inputs.surface.routes.entries()) {
    for (const [transitionIndex, transition] of (route.transitions ?? []).entries()) {
      const target = routes.get(transition.to);
      if (!target) {
        issue(issues, "error", "SURFACE-TRANSITION-TARGET", `$.surface.routes[${index}].transitions[${transitionIndex}]`, `Transition '${transition.on}' targets unknown route '${transition.to}'.`);
        continue;
      }
      for (const param of target.params ?? []) {
        if (!transition.params?.[param.name]) {
          issue(issues, "error", "SURFACE-TRANSITION-PARAM", `$.surface.routes[${index}].transitions[${transitionIndex}]`, `Transition '${transition.on}' to '${target.id}' does not supply param '${param.name}'.`);
        }
      }
    }
    forEachSlot(route, (slot, slotPath) => {
      if (slot.type === "embed-route" && slot.routeRef && !routes.has(slot.routeRef)) {
        issue(issues, "error", "SURFACE-EMBED-TARGET", slotPath, `Embedded route '${slot.routeRef}' does not exist.`);
      }
    });
  }

  const start = defaults[0]?.id ?? inputs.surface.routes[0]?.id;
  if (start) {
    const reachable = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const id = stack.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      const route = routes.get(id);
      if (!route) continue;
      for (const transition of route.transitions ?? []) stack.push(transition.to);
      forEachSlot(route, (slot) => {
        if (slot.type === "embed-route" && slot.routeRef) stack.push(slot.routeRef);
      });
      for (const nav of inputs.surface.nav ?? []) {
        const navRoute = inputs.surface.routes.find((candidate) => concretePathMatches(nav.path, candidate));
        if (navRoute) stack.push(navRoute.id);
      }
    }
    for (const route of inputs.surface.routes) {
      if (!reachable.has(route.id)) {
        issue(issues, "error", "SURFACE-UNREACHABLE-ROUTE", "$.surface.routes", `Route '${route.id}' is not reachable from default route '${start}'.`);
      }
    }
  }
}

function concretePathMatches(path: string, route: SurfaceRoute): boolean {
  const routeParts = route.path.split("/");
  const pathParts = path.split("/");
  if (routeParts.length !== pathParts.length) return false;
  return routeParts.every((part, index) => part.startsWith(":") || part === pathParts[index]);
}

function forEachSlot(route: SurfaceRoute, fn: (slot: SurfaceSlotEntry, path: string) => void): void {
  for (const [slotName, entries] of Object.entries(route.slots)) {
    entries.forEach((entry, index) => fn(entry, `$.surface.routes.${route.id}.slots.${slotName}[${index}]`));
  }
}

function validateSlots(
  inputs: GeneratorInputs,
  issues: CoherenceIssue[],
  registry: RegistryIndex,
  units: Map<string, ExpUnit>,
  sidecarsByDefinition: Map<string, ResponseActions>,
  dataSources: Set<string>,
  ajv: Ajv2020,
): void {
  for (const route of inputs.surface.routes) {
    const definitionSlots: SurfaceSlotEntry[] = [];
    forEachSlot(route, (slot, path) => {
      assertContribution(issues, registry, slotTypeContribution(slot.type), "slot-type", `${path}.type`);
      switch (slot.type) {
        case "definition-form":
          definitionSlots.push(slot);
          validateDefinitionSlot(inputs, issues, units, sidecarsByDefinition, slot, path);
          break;
        case "experience-unit":
          validateExperienceUnitSlot(inputs, issues, registry, units, dataSources, ajv, slot, path);
          break;
        case "module-widget":
          validateModuleWidgetSlot(issues, registry, dataSources, ajv, slot, path);
          break;
        case "embed-route":
        case "static-content":
          break;
      }
    });
    if (definitionSlots.length > 1) {
      issue(issues, "warning", "SURFACE-MULTI-DEFINITION-ROUTE", `$.surface.routes.${route.id}`, `Route '${route.id}' has ${definitionSlots.length} definition-form slots; v3 models independent lifecycles and rejects any implicit first-slot ownership.`);
    }
  }
}

function validateDefinitionSlot(
  inputs: GeneratorInputs,
  issues: CoherenceIssue[],
  units: Map<string, ExpUnit>,
  sidecarsByDefinition: Map<string, ResponseActions>,
  slot: SurfaceSlotEntry,
  path: string,
): void {
  const def = slot.definitionRef ? definitionByRef(inputs, slot.definitionRef) : undefined;
  if (!def) {
    issue(issues, "error", "SURFACE-DEFINITION-REF", path, `definition-form slot references unknown Definition '${slot.definitionRef ?? "(missing)"}'.`);
    return;
  }
  const unit = slot.unitRef ? units.get(slot.unitRef) : undefined;
  if (!unit) {
    issue(issues, "error", "SURFACE-UNIT-REF", path, `definition-form slot references unknown Experience unit '${slot.unitRef ?? "(missing)"}'.`);
    return;
  }
  if (unit.kind !== "data-entry") {
    issue(issues, "error", "SURFACE-DEFINITION-UNIT-KIND", path, `definition-form slot unit '${unit.id}' has kind '${unit.kind}', expected 'data-entry'.`);
  }
  const itemPaths = new Set(flattenItemPaths(def));
  for (const itemRef of unit.itemRefs ?? []) {
    if (!itemPaths.has(itemRef.path)) {
      issue(issues, "error", "SURFACE-DEFINITION-ITEM-REF", path, `Unit '${unit.id}' itemRef '${itemRef.path}' does not resolve in Definition '${def.url}'.`);
    }
  }
  const actions = sidecarsByDefinition.get(def.url);
  for (const actionRef of unit.actionRefs ?? []) {
    if (!actions?.actions.some((action) => action.id === actionRef.id)) {
      issue(issues, "error", "SURFACE-ACTION-REF", path, `Unit '${unit.id}' actionRef '${actionRef.id}' does not resolve in Response Actions for '${def.url}'.`);
    }
  }
}

function flattenItemPaths(def: Definition): string[] {
  const paths: string[] = [];
  function walk(items: Definition["items"], parent: string): void {
    for (const item of items) {
      const path = parent ? `${parent}.${item.key}` : item.key;
      paths.push(path);
      if (item.children) walk(item.children, item.repeatable ? `${path}[*]` : path);
    }
  }
  walk(def.items, "");
  return paths;
}

function validateExperienceUnitSlot(
  inputs: GeneratorInputs,
  issues: CoherenceIssue[],
  registry: RegistryIndex,
  units: Map<string, ExpUnit>,
  dataSources: Set<string>,
  ajv: Ajv2020,
  slot: SurfaceSlotEntry,
  path: string,
): void {
  const unit = slot.unitRef ? units.get(slot.unitRef) : undefined;
  if (!unit) {
    issue(issues, "error", "SURFACE-UNIT-REF", path, `experience-unit slot references unknown Experience unit '${slot.unitRef ?? "(missing)"}'.`);
    return;
  }
  if (unit.kind.startsWith("x-")) {
    assertContribution(issues, registry, unit.kind, "unit-kind", `${path}.unitRef`);
  }
  const widget = unit.extensions?.["x-formspec-widget"] as { kind?: string; payload?: JsonObject } | undefined;
  if (widget?.kind) {
    const entry = assertContribution(issues, registry, widget.kind, "widget", `${path}.extensions.x-formspec-widget.kind`);
    validatePayload(issues, ajv, entry, widget.payload ?? {}, dataSources, `${path}.extensions.x-formspec-widget.payload`);
  }
}

function validateModuleWidgetSlot(
  issues: CoherenceIssue[],
  registry: RegistryIndex,
  dataSources: Set<string>,
  ajv: Ajv2020,
  slot: SurfaceSlotEntry,
  path: string,
): void {
  const entry = slot.widgetRef ? assertContribution(issues, registry, slot.widgetRef, "widget", `${path}.widgetRef`) : undefined;
  validatePayload(issues, ajv, entry, slot.payload ?? {}, dataSources, `${path}.payload`);
}

function validatePayload(
  issues: CoherenceIssue[],
  ajv: Ajv2020,
  entry: RegistryEntry | undefined,
  payload: JsonObject,
  dataSources: Set<string>,
  path: string,
): void {
  for (const ref of payloadDataSourceRefs(payload)) {
    if (!dataSources.has(ref)) {
      issue(issues, "error", "DATA-SOURCE-UNRESOLVED", path, `Payload references missing data source '${ref}'.`);
    }
  }
  const schema = entry?.widgetShape?.props;
  if (!schema) return;
  const validate = ajv.compile(schema);
  if (!validate(payload)) {
    const msg = (validate.errors ?? [])
      .slice(0, 3)
      .map((err) => `${err.instancePath || "/"} ${err.message}`)
      .join("; ");
    issue(issues, "error", "MODULE-PAYLOAD-SCHEMA-MISMATCH", path, `Payload for '${entry?.name}' does not match widgetShape.props: ${msg}`);
  }
}

function validateDataSources(inputs: GeneratorInputs, issues: CoherenceIssue[]): void {
  const ids = new Set<string>();
  for (const source of inputs.dataSources?.sources ?? []) {
    if (ids.has(source.id)) {
      issue(issues, "error", "DATA-SOURCE-ID-COLLISION", "$.dataSources.sources", `Data source '${source.id}' is declared more than once.`);
    }
    ids.add(source.id);
    if (source.definitionRef && !definitionByRef(inputs, source.definitionRef)) {
      issue(issues, "error", "DATA-SOURCE-DEFINITION-REF", "$.dataSources.sources", `Data source '${source.id}' references unknown Definition '${source.definitionRef}'.`);
    }
    if (source.routeRef && !inputs.surface.routes.some((route) => route.id === source.routeRef)) {
      issue(issues, "error", "DATA-SOURCE-ROUTE-REF", "$.dataSources.sources", `Data source '${source.id}' references unknown route '${source.routeRef}'.`);
    }
  }
}

function validateScreenerTargets(inputs: GeneratorInputs, issues: CoherenceIssue[]): void {
  if (!inputs.screener) return;
  const routeIds = new Set(inputs.surface.routes.map((route) => route.id));
  const phases = inputs.screener.evaluation as Array<{ routes?: Array<{ target?: string }> }> | undefined;
  for (const [phaseIndex, phase] of (phases ?? []).entries()) {
    for (const [routeIndex, route] of (phase.routes ?? []).entries()) {
      if (typeof route.target === "string" && route.target.startsWith("surface:")) {
        const routeId = route.target.slice("surface:".length);
        if (!routeIds.has(routeId)) {
          issue(issues, "error", "SCREENER-SURFACE-TARGET", `$.screener.evaluation[${phaseIndex}].routes[${routeIndex}].target`, `Screener terminal hop targets missing Surface route '${routeId}'.`);
        }
      }
    }
  }
}

export function validateComponentBundle(bundle: MultiRouteBundle): CoherenceIssue[] {
  const issues: CoherenceIssue[] = [];
  const ids = new Map<string, string>();
  for (const route of bundle.routes) {
    walkComponent(route.doc.tree, `component:${route.id}`, (node, path) => {
      const id = node.id;
      if (typeof id !== "string") return;
      const prior = ids.get(id);
      if (prior) {
        issue(issues, "error", "COMP-BUNDLE-ID-COLLISION", path, `Component id '${id}' collides with ${prior}.`);
      } else {
        ids.set(id, path);
      }
    });
  }
  return issues;
}

function walkComponent(node: ComponentNode, path: string, fn: (node: ComponentNode, path: string) => void): void {
  fn(node, path);
  const children = node.children as ComponentNode[] | undefined;
  children?.forEach((child, index) => walkComponent(child, `${path}.children[${index}]`, fn));
}

function report(inputs: GeneratorInputs, issues: CoherenceIssue[]): CoherenceReport {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const infos = issues.filter((i) => i.severity === "info").length;
  return {
    ok: errors === 0,
    summary: {
      errors,
      warnings,
      infos,
      routes: inputs.surface.routes.length,
      definitions: inputs.definitions.length,
      responseActions: inputs.responseActions.length,
      modules: appModules(inputs).length,
    },
    issues,
  };
}
