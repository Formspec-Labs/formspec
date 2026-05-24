/** @filedesc Spike-local app graph coherence validator for ADR-0150 v4 proof. */

import type Ajv2020 from "ajv/dist/2020.js";
import type {
  ComponentNode,
  DataSource,
  DataSourceCatalog,
  Definition,
  ExpUnit,
  GeneratorInputs,
  JsonObject,
  MultiRouteBundle,
  RegistryEntry,
  ResponseBinding,
  ResponseActions,
  SurfaceRoute,
  SurfaceSlotEntry,
  UiPolicy,
} from "./types.js";
import {
  appModules,
  buildModuleAdmission,
  buildRegistryIndex,
  validateContributionAccess,
  validateModuleAdmission,
  type ModuleAdmission,
  type RegistryIndex,
} from "./module-resolver.js";

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

type ActionSidecarRef = {
  url: string;
  version?: string;
  targetDefinition?: { url?: string };
};

type ArtifactRef = {
  url: string;
  version?: string;
};

function issue(
  issues: CoherenceIssue[],
  severity: CoherenceSeverity,
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ severity, code, path, message });
}

function refsByUrl<T extends { url: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.url, item]));
}

function actionSidecarRefs(inputs: GeneratorInputs): ActionSidecarRef[] {
  const raw = inputs.appManifest.responseActions ?? [];
  return raw.filter((ref) => !!ref && typeof ref.url === "string") as ActionSidecarRef[];
}

function actionRefTargetDefinition(ref: ActionSidecarRef): string | undefined {
  return ref.targetDefinition?.url;
}

function artifactRef(value: unknown): ArtifactRef | undefined {
  if (!value || typeof value !== "object" || typeof (value as { url?: unknown }).url !== "string") return undefined;
  const ref = value as { url: string; version?: unknown };
  return { url: ref.url, version: typeof ref.version === "string" ? ref.version : undefined };
}

function artifactRefs(value: unknown): ArtifactRef[] {
  if (!Array.isArray(value)) return [];
  return value.map(artifactRef).filter((ref): ref is ArtifactRef => !!ref);
}

function docUrl(doc: unknown): string | undefined {
  return doc && typeof doc === "object" && typeof (doc as { url?: unknown }).url === "string"
    ? (doc as { url: string }).url
    : undefined;
}

function docVersion(doc: unknown): string | undefined {
  return doc && typeof doc === "object" && typeof (doc as { version?: unknown }).version === "string"
    ? (doc as { version: string }).version
    : undefined;
}

function validateResolvedArtifactRef(
  issues: CoherenceIssue[],
  ref: ArtifactRef | undefined,
  doc: unknown,
  path: string,
  label: string,
): void {
  if (!ref) {
    issue(issues, "error", "APP-COHERENCE-MISSING-ARTIFACT-REF", path, `${label} must be listed in the App Manifest.`);
    return;
  }
  const url = docUrl(doc);
  if (url && url !== ref.url) {
    issue(issues, "error", "APP-COHERENCE-ARTIFACT-URL", path, `${label} ref '${ref.url}' resolved to document '${url}'.`);
  }
  const version = docVersion(doc);
  if (ref.version && version && ref.version !== version) {
    issue(issues, "error", "APP-COHERENCE-ARTIFACT-VERSION", path, `${label} ref '${ref.url}' pins version '${ref.version}', but loaded document is '${version}'.`);
  }
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

function dataSourcePrefix(source: DataSource): string | undefined {
  return source.id.includes(":") ? source.id.split(":", 1)[0] : undefined;
}

function expectedDataSourcePrefix(source: DataSource): string {
  switch (source.kind) {
    case "definition-response":
      return "response";
    case "document-resource":
      return "resource";
    case "conversation-stream":
      return "conversation";
    case "query-result":
      return "query";
    case "host-state":
    case "route-params":
      return "host";
  }
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

function resolveContribution(
  issues: CoherenceIssue[],
  index: RegistryIndex,
  admission: ModuleAdmission,
  name: string,
  category: string,
  path: string,
): RegistryEntry | undefined {
  const resolution = validateContributionAccess(index, admission, name, category, path);
  issues.push(...resolution.issues);
  return resolution.entry;
}

export function validateAppCoherence(inputs: GeneratorInputs, ajv: Ajv2020): CoherenceReport {
  const issues: CoherenceIssue[] = [];
  const registry = buildRegistryIndex(inputs.registry.entries);
  const definitionsByUrl = refsByUrl(inputs.definitions);
  const units = unitById(inputs);
  const sidecarsByDefinition = actionSidecarByDefinition(inputs);
  const dataSources = dataSourceIds(inputs.dataSources);
  const appModuleSet = appModules(inputs);
  const admission = buildModuleAdmission(inputs, appModuleSet);

  validateSiblingIndex(inputs, issues, definitionsByUrl, sidecarsByDefinition);
  issues.push(...validateModuleAdmission(inputs, registry, appModuleSet));
  validateSurfaceGraph(inputs, issues);
  validateSlots(inputs, issues, registry, admission, units, sidecarsByDefinition, dataSources, ajv);
  validateTransitionActionRefs(inputs, issues, sidecarsByDefinition);
  validateDataSources(inputs, issues);
  validateUiPolicy(inputs, issues, registry);
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
    const def = definitionsByUrl.get(ref.url);
    if (!def) {
      issue(issues, "error", "APP-COHERENCE-MISSING-DEFINITION", "$.definitions", `App Manifest references missing Definition '${ref.url}'.`);
    } else if (ref.version && ref.version !== def.version) {
      issue(issues, "error", "APP-COHERENCE-ARTIFACT-VERSION", "$.definitions", `Definition ref '${ref.url}' pins version '${ref.version}', but loaded document is '${def.version}'.`);
    }
  }
  for (const def of inputs.definitions) {
    if (!inputs.appManifest.definitions.some((ref) => ref.url === def.url)) {
      issue(issues, "error", "APP-COHERENCE-UNLISTED-DEFINITION", "$.definitions", `Definition '${def.url}' is loaded but not listed in App Manifest.`);
    }
  }
  const experienceRefs = inputs.appManifest.experiences ?? [];
  const experienceRef = experienceRefs[0];
  if (!experienceRef) {
    issue(issues, "error", "APP-COHERENCE-MISSING-EXPERIENCE-REF", "$.experiences[0]", "App Manifest must reference the loaded Experience sidecar.");
  } else {
    validateResolvedArtifactRef(issues, artifactRef(experienceRef), inputs.experience, "$.experiences[0]", "Experience");
    const targetDefinitions = experienceRef.targetDefinitions;
    if (!Array.isArray(targetDefinitions) || targetDefinitions.length === 0) {
      issue(issues, "error", "APP-COHERENCE-EXPERIENCE-TARGET-DEFINITIONS", "$.experiences[0].targetDefinitions", "Experience ref must list targetDefinitions[].");
    }
    for (const [targetIndex, target] of (targetDefinitions ?? []).entries()) {
      if (!definitionsByUrl.has(target.url)) {
        issue(issues, "error", "APP-COHERENCE-EXPERIENCE-TARGET-DEFINITION", `$.experiences[0].targetDefinitions[${targetIndex}]`, `Experience ref targets missing Definition '${target.url}'.`);
      }
    }
  }
  for (const def of inputs.definitions) {
    if (experienceRef && !(experienceRef.targetDefinitions ?? []).some((target) => target.url === def.url)) {
      issue(issues, "error", "APP-COHERENCE-EXPERIENCE-TARGET-OMISSION", "$.experiences[0].targetDefinitions", `Definition '${def.url}' is loaded but not listed in the Experience ref targetDefinitions[].`);
    }
  }
  validateResolvedArtifactRef(issues, artifactRefs(inputs.appManifest.surfaces)[0], inputs.surface, "$.surfaces[0]", "Surface");
  validateResolvedArtifactRef(issues, artifactRefs(inputs.appManifest.registries)[0], inputs.registry, "$.registries[0]", "Registry");
  validateResolvedArtifactRef(issues, artifactRef(inputs.appManifest.posture), inputs.posture, "$.posture", "Posture");
  validateResolvedArtifactRef(issues, artifactRefs(inputs.appManifest.dataSources)[0], inputs.dataSources, "$.dataSources[0]", "Data Sources");
  validateResolvedArtifactRef(issues, artifactRef(inputs.appManifest.uiPolicy), inputs.uiPolicy, "$.uiPolicy", "UI Policy");
  validateResolvedArtifactRef(issues, artifactRefs(inputs.appManifest.screeners)[0], inputs.screener, "$.screeners[0]", "Screener");
  validateResolvedArtifactRef(issues, artifactRef(inputs.appManifest.runtimePlan), inputs.runtimePlan, "$.runtimePlan", "Runtime Plan");
  for (const [index, locale] of (inputs.locales ?? []).entries()) {
    validateResolvedArtifactRef(issues, artifactRefs(inputs.appManifest.locales)[index], locale, `$.locales[${index}]`, "Locale");
  }
  const actionRefs = actionSidecarRefs(inputs);
  const actionRefsByDefinition = new Map<string, ActionSidecarRef[]>();
  for (const [index, ref] of actionRefs.entries()) {
    const targetDefinition = actionRefTargetDefinition(ref);
    if (!targetDefinition) {
      issue(issues, "error", "APP-COHERENCE-ACTION-SIDECAR-TARGET-MISSING", `$.responseActions[${index}]`, `Response Actions ref '${ref.url}' must explicitly name targetDefinition.url.`);
      continue;
    }
    if (!definitionsByUrl.has(targetDefinition)) {
      issue(issues, "error", "APP-COHERENCE-ACTION-SIDECAR-TARGET", `$.responseActions[${index}]`, `Response Actions ref '${ref.url}' targets missing Definition '${targetDefinition}'.`);
    }
    const refs = actionRefsByDefinition.get(targetDefinition) ?? [];
    refs.push(ref);
    actionRefsByDefinition.set(targetDefinition, refs);
  }
  for (const [targetDefinition, refs] of actionRefsByDefinition) {
    if (refs.length > 1) {
      issue(issues, "error", "APP-COHERENCE-ACTION-SIDECAR-DUPLICATE", "$.responseActions", `Definition '${targetDefinition}' has multiple indexed Response Actions sidecars: ${refs.map((ref) => ref.url).join(", ")}.`);
    }
  }
  for (const ra of inputs.responseActions) {
    if (!definitionsByUrl.has(ra.targetDefinition.url)) {
      issue(issues, "error", "APP-COHERENCE-ACTION-TARGET", "$.responseActions", `Response Actions sidecar targets missing Definition '${ra.targetDefinition.url}'.`);
    }
    const refs = actionRefsByDefinition.get(ra.targetDefinition.url) ?? [];
    if (refs.length === 0) {
      issue(issues, "error", "APP-COHERENCE-UNLISTED-ACTION-SIDECAR", "$.responseActions", `Response Actions sidecar for '${ra.targetDefinition.url}' is loaded but not listed in App Manifest responseActions[].`);
    }
    for (const ref of refs) {
      if (ref.version && ref.version !== ra.version) {
        issue(issues, "error", "APP-COHERENCE-ACTION-SIDECAR-VERSION", "$.responseActions", `Response Actions ref '${ref.url}' pins version '${ref.version}', but the loaded sidecar for '${ra.targetDefinition.url}' is '${ra.version}'.`);
      }
    }
  }
  for (const [targetDefinition, refs] of actionRefsByDefinition) {
    if (!sidecarsByDefinition.has(targetDefinition)) {
      issue(issues, "error", "APP-COHERENCE-ACTION-SIDECAR-UNLOADED", "$.responseActions", `Response Actions ref '${refs[0].url}' targets '${targetDefinition}', but no loaded sidecar binds that Definition.`);
    }
  }
  for (const def of inputs.definitions) {
    if (!sidecarsByDefinition.has(def.url)) {
      issue(issues, "warning", "APP-COHERENCE-MISSING-ACTION-SIDECAR", "$.responseActions", `Definition '${def.url}' has no Response Actions sidecar.`);
    }
  }

  const seenActions = new Map<string, string>();
  for (const ra of inputs.responseActions) {
    for (const action of ra.actions) {
      const owner = seenActions.get(action.id);
      if (owner) {
        issue(issues, "error", "RESPONSE-ACTIONS-ACTION-ID-COLLISION", "$.responseActions", `Action id '${action.id}' appears in both '${owner}' and '${ra.targetDefinition.url}'.`);
      } else {
        seenActions.set(action.id, ra.targetDefinition.url);
      }
    }
  }
}

function validateSurfaceGraph(inputs: GeneratorInputs, issues: CoherenceIssue[]): void {
  const targetExperience = inputs.appManifest.experiences?.[0]?.url;
  if (inputs.surface.targetExperience.url !== targetExperience) {
    issue(issues, "error", "SURFACE-EXPERIENCE-MISMATCH", "$.surface.targetExperience", `Surface targets '${inputs.surface.targetExperience.url}', App Manifest lists '${targetExperience ?? "(none)"}'.`);
  }
}

function validateTransitionActionRefs(
  inputs: GeneratorInputs,
  issues: CoherenceIssue[],
  sidecarsByDefinition: Map<string, ResponseActions>,
): void {
  for (const route of inputs.surface.routes) {
    for (const [index, transition] of (route.transitions ?? []).entries()) {
      const ref = transition.actionRef;
      if (!ref) continue;
      const def = definitionByRef(inputs, ref.definitionRef);
      const path = `$.surface.routes.${route.id}.transitions[${index}].actionRef`;
      if (!def) {
        issue(issues, "error", "SURFACE-TRANSITION-ACTION-REF", path, `Transition '${transition.on}' references unknown action Definition '${ref.definitionRef}'.`);
        continue;
      }
      const sidecar = sidecarsByDefinition.get(def.url);
      if (!sidecar?.actions.some((action) => action.id === ref.actionId)) {
        issue(issues, "error", "SURFACE-TRANSITION-ACTION-REF", path, `Transition '${transition.on}' references missing Response Action '${ref.actionId}' for '${def.url}'.`);
      }
    }
  }
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
  admission: ModuleAdmission,
  units: Map<string, ExpUnit>,
  sidecarsByDefinition: Map<string, ResponseActions>,
  dataSources: Set<string>,
  ajv: Ajv2020,
): void {
  for (const route of inputs.surface.routes) {
    const definitionSlots: SurfaceSlotEntry[] = [];
    forEachSlot(route, (slot, path) => {
      resolveContribution(issues, registry, admission, slotTypeContribution(slot.type), "slot-type", `${path}.type`);
      switch (slot.type) {
        case "definition-form":
          definitionSlots.push(slot);
          validateDefinitionSlot(inputs, issues, units, sidecarsByDefinition, route, slot, path);
          break;
        case "experience-unit":
          validateExperienceUnitSlot(inputs, issues, registry, admission, units, dataSources, ajv, slot, path);
          break;
        case "module-widget":
          validateModuleWidgetSlot(issues, registry, admission, dataSources, ajv, slot, path);
          break;
        case "embed-route":
        case "static-content":
          break;
      }
    });
    if (definitionSlots.length > 1 && definitionSlots.some((slot) => !slot.responseBinding)) {
      issue(issues, "warning", "SURFACE-MULTI-DEFINITION-ROUTE", `$.surface.routes.${route.id}`, `Route '${route.id}' has ${definitionSlots.length} definition-form slots; v3 models independent lifecycles and rejects any implicit first-slot ownership.`);
    }
  }
}

function validateDefinitionSlot(
  inputs: GeneratorInputs,
  issues: CoherenceIssue[],
  units: Map<string, ExpUnit>,
  sidecarsByDefinition: Map<string, ResponseActions>,
  route: SurfaceRoute,
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
  validateResponseBinding(issues, route, slot.responseBinding, `${path}.responseBinding`);
}

function validateResponseBinding(issues: CoherenceIssue[], route: SurfaceRoute, binding: ResponseBinding | undefined, path: string): void {
  if (!binding) {
    issue(issues, "error", "SURFACE-RESPONSE-BINDING", path, `definition-form slot on route '${route.id}' must declare Response instance ownership.`);
    return;
  }
  if (binding.owner !== "response" || binding.actionOwner !== "response-actions") {
    issue(issues, "error", "SURFACE-RESPONSE-BINDING-OWNER", path, `definition-form slot on route '${route.id}' must assign Response state to Response and action execution to Response Actions.`);
  }
  if (binding.instancePolicy === "route-param-scoped") {
    const param = binding.routeParam;
    if (!param || !(route.params ?? []).some((candidate) => candidate.name === param)) {
      issue(issues, "error", "SURFACE-RESPONSE-BINDING-PARAM", path, `definition-form slot on route '${route.id}' must bind route-param-scoped Response state to a declared route param.`);
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
  admission: ModuleAdmission,
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
    resolveContribution(issues, registry, admission, unit.kind, "unit-kind", `${path}.unitRef`);
  }
  const widget = unit.extensions?.["x-formspec-widget"] as { kind?: string; payload?: JsonObject } | undefined;
  if (widget?.kind) {
    const entry = resolveContribution(issues, registry, admission, widget.kind, "widget", `${path}.extensions.x-formspec-widget.kind`);
    validatePayload(issues, ajv, entry, widget.payload ?? {}, dataSources, `${path}.extensions.x-formspec-widget.payload`);
  }
}

function validateModuleWidgetSlot(
  issues: CoherenceIssue[],
  registry: RegistryIndex,
  admission: ModuleAdmission,
  dataSources: Set<string>,
  ajv: Ajv2020,
  slot: SurfaceSlotEntry,
  path: string,
): void {
  const entry = slot.widgetRef ? resolveContribution(issues, registry, admission, slot.widgetRef, "widget", `${path}.widgetRef`) : undefined;
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
    const expectedPrefix = expectedDataSourcePrefix(source);
    if (dataSourcePrefix(source) !== expectedPrefix) {
      issue(issues, "error", "DATA-SOURCE-ID-PREFIX", "$.dataSources.sources", `Data source '${source.id}' kind '${source.kind}' must use '${expectedPrefix}:' id prefix.`);
    }
    if (source.definitionRef && !definitionByRef(inputs, source.definitionRef)) {
      issue(issues, "error", "DATA-SOURCE-DEFINITION-REF", "$.dataSources.sources", `Data source '${source.id}' references unknown Definition '${source.definitionRef}'.`);
    }
    if (source.routeRef && !inputs.surface.routes.some((route) => route.id === source.routeRef)) {
      issue(issues, "error", "DATA-SOURCE-ROUTE-REF", "$.dataSources.sources", `Data source '${source.id}' references unknown route '${source.routeRef}'.`);
    }
    validateDataSourceRuntime(source, issues);
  }
}

function validateDataSourceRuntime(source: DataSource, issues: CoherenceIssue[]): void {
  const runtime = source.runtime;
  if (runtime.cache.mode === "none" && runtime.cache.staleAfter) {
    issue(issues, "error", "DATA-SOURCE-CACHE-STALENESS", "$.dataSources.sources", `Data source '${source.id}' cannot declare staleAfter when cache.mode is 'none'.`);
  }
  if (runtime.delivery === "live" && runtime.cache.mode !== "subscribe") {
    issue(issues, "error", "DATA-SOURCE-RUNTIME-CACHE", "$.dataSources.sources", `Live data source '${source.id}' must use subscribe cache mode.`);
  }
  if (runtime.delivery === "draft" && (source.kind !== "definition-response" || runtime.cache.mode !== "draft")) {
    issue(issues, "error", "DATA-SOURCE-RUNTIME-DRAFT", "$.dataSources.sources", `Draft data source '${source.id}' must be a definition-response source with draft cache mode.`);
  }
  if (runtime.provenance.kind !== source.kind) {
    issue(issues, "error", "DATA-SOURCE-PROVENANCE", "$.dataSources.sources", `Data source '${source.id}' provenance kind must match source kind '${source.kind}'.`);
  }
}

function validateUiPolicy(inputs: GeneratorInputs, issues: CoherenceIssue[], registry: RegistryIndex): void {
  const policy = inputs.uiPolicy;
  if (!policy) return;
  if (policy.targetSurface.url !== inputs.surface.url) {
    issue(issues, "error", "UI-POLICY-SURFACE-TARGET", "$.uiPolicy.targetSurface", `UI Policy targets '${policy.targetSurface.url}', but loaded Surface is '${inputs.surface.url}'.`);
  }
  validateLocaleKeyOwners(inputs, issues, policy);
  validateRoutePolicies(inputs, issues, policy);
  validateThemeTokenAssignments(issues, registry, policy);
}

function validateLocaleKeyOwners(inputs: GeneratorInputs, issues: CoherenceIssue[], policy: UiPolicy): void {
  const owners = new Map<string, string>();
  for (const owner of policy.localeKeyOwners) {
    const prior = owners.get(owner.keyPrefix);
    if (prior && prior !== owner.moduleId) {
      issue(issues, "error", "LOCALE-KEY-OWNER-COLLISION", "$.uiPolicy.localeKeyOwners", `Locale key prefix '${owner.keyPrefix}' is owned by both '${prior}' and '${owner.moduleId}'.`);
    }
    owners.set(owner.keyPrefix, owner.moduleId);
  }
  for (const [localeIndex, locale] of (inputs.locales ?? []).entries()) {
    const strings = (locale as { strings?: unknown }).strings;
    if (!strings || typeof strings !== "object") continue;
    for (const key of Object.keys(strings)) {
      if (!key.startsWith("$module.")) continue;
      const owner = policy.localeKeyOwners.find((candidate) => key.startsWith(candidate.keyPrefix));
      if (!owner) {
        issue(issues, "error", "LOCALE-KEY-OWNER", `$.locales[${localeIndex}].strings.${key}`, `Module Locale key '${key}' has no UI Policy owner.`);
      }
    }
  }
}

function validateRoutePolicies(inputs: GeneratorInputs, issues: CoherenceIssue[], policy: UiPolicy): void {
  const routeIds = new Set(inputs.surface.routes.map((route) => route.id));
  const policyRouteIds = new Set<string>();
  for (const routePolicy of policy.routePolicies) {
    if (policyRouteIds.has(routePolicy.routeId)) {
      issue(issues, "error", "UI-POLICY-ROUTE-COLLISION", "$.uiPolicy.routePolicies", `UI Policy declares route '${routePolicy.routeId}' more than once.`);
    }
    policyRouteIds.add(routePolicy.routeId);
    if (!routeIds.has(routePolicy.routeId)) {
      issue(issues, "error", "UI-POLICY-ROUTE-REF", "$.uiPolicy.routePolicies", `UI Policy references missing route '${routePolicy.routeId}'.`);
    }
    const route = inputs.surface.routes.find((candidate) => candidate.id === routePolicy.routeId);
    if (route) {
      const slotNames = new Set(Object.keys(route.slots));
      for (const slotName of routePolicy.responsive.collapseOrder) {
        if (!slotNames.has(slotName)) {
          issue(issues, "error", "UI-POLICY-RESPONSIVE-SLOT", "$.uiPolicy.routePolicies", `Route policy '${routePolicy.routeId}' collapseOrder references missing slot '${slotName}'.`);
        }
      }
    }
  }
  for (const route of inputs.surface.routes) {
    if (!policyRouteIds.has(route.id)) {
      issue(issues, "error", "UI-POLICY-ROUTE-MISSING", "$.uiPolicy.routePolicies", `UI Policy omits route '${route.id}'.`);
    }
  }
}

function validateThemeTokenAssignments(issues: CoherenceIssue[], registry: RegistryIndex, policy: UiPolicy): void {
  for (const assignment of policy.theme.assignments) {
    const widget = registry.latestByName.get(assignment.widgetRef);
    if (!widget || widget.category !== "widget") {
      issue(issues, "error", "THEME-TOKEN-WIDGET", "$.uiPolicy.theme.assignments", `Theme assignment references missing widget '${assignment.widgetRef}'.`);
      continue;
    }
    const slots = widget.semantics?.themeTokenSlots;
    const declaredSlots = Array.isArray(slots) ? slots.filter((slot): slot is string => typeof slot === "string") : [];
    if (!declaredSlots.includes(assignment.slot)) {
      issue(issues, "error", "THEME-TOKEN-SLOT", "$.uiPolicy.theme.assignments", `Theme assignment targets undeclared token slot '${assignment.slot}' on widget '${assignment.widgetRef}'.`);
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
    validateRouteComponentIdentity(route, issues);
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

function validateRouteComponentIdentity(route: MultiRouteBundle["routes"][number], issues: CoherenceIssue[]): void {
  const extensions = route.doc.extensions ?? {};
  const surface = extensions["x-formspec-surface"] as { targetSurface?: string; routeId?: string; path?: string; formCapable?: boolean } | undefined;
  const identity = extensions["x-formspec-component-identity"] as { identityKind?: string; targetSurface?: string; targetRoute?: { id?: string; path?: string } } | undefined;
  if (identity?.identityKind !== "surface-route" || !identity.targetSurface || identity.targetRoute?.id !== route.id || identity.targetRoute?.path !== route.path) {
    issue(issues, "error", "COMP-ROUTE-IDENTITY", `component:${route.id}.extensions.x-formspec-component-identity`, `Route Component '${route.id}' must carry surface-route identity.`);
  }
  if (surface?.routeId !== route.id || surface.path !== route.path || !surface.targetSurface) {
    issue(issues, "error", "COMP-SURFACE-IDENTITY", `component:${route.id}.extensions.x-formspec-surface`, `Route Component '${route.id}' must preserve Surface route identity.`);
  }
  const compat = extensions["x-spike-v4-output-compatibility"] as { outputOnly?: boolean; mustNotPromote?: boolean; shimTargetDefinition?: string } | undefined;
  if (surface?.formCapable === false) {
    if (!compat?.outputOnly || !compat.mustNotPromote || !compat.shimTargetDefinition) {
      issue(issues, "error", "COMP-NONFORM-SHIM-QUARANTINE", `component:${route.id}.extensions.x-spike-v4-output-compatibility`, `Non-form route Component '${route.id}' must quarantine its Component 1.1 targetDefinition shim as output-only.`);
    }
    if (compat?.shimTargetDefinition && compat.shimTargetDefinition !== route.doc.targetDefinition.url) {
      issue(issues, "error", "COMP-NONFORM-SHIM-TARGET-MISMATCH", `component:${route.id}.extensions.x-spike-v4-output-compatibility.shimTargetDefinition`, `Non-form route Component '${route.id}' shim marker must match the Component 1.1 targetDefinition value.`);
    }
  } else if (compat) {
    issue(issues, "error", "COMP-FORM-SHIM-UNEXPECTED", `component:${route.id}.extensions.x-spike-v4-output-compatibility`, `Form-capable route Component '${route.id}' must not carry the non-form targetDefinition shim marker.`);
  }
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
