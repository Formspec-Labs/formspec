/** @filedesc Spike-local ModuleResolver for admission and contribution ownership checks. */

import type { CoherenceIssue, CoherenceSeverity } from "./coherence.js";
import type { GeneratorInputs, ModuleRef, RegistryEntry } from "./types.js";

export type RegistryIndex = {
  entriesByName: Map<string, RegistryEntry[]>;
  latestByName: Map<string, RegistryEntry>;
  modules: Map<string, RegistryEntry>;
  contributedBy: Map<string, string[]>;
};

export type ModuleAdmission = {
  appModulesById: Map<string, ModuleRef>;
  allowedModules: ModuleRef[];
};

export type ContributionResolution = {
  entry?: RegistryEntry;
  issues: CoherenceIssue[];
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

function compareEntryVersion(a: RegistryEntry, b: RegistryEntry): number {
  const av = semverTuple(a.version);
  const bv = semverTuple(b.version);
  if (!av || !bv) return a.version.localeCompare(b.version);
  return compareSemver(av, bv);
}

function latestEntry(index: RegistryIndex, name: string): RegistryEntry | undefined {
  return index.latestByName.get(name);
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

function resolveModuleVersion(registry: RegistryIndex, id: string): string | undefined {
  return registry.modules.get(id)?.version;
}

export function moduleKey(m: ModuleRef): string {
  return `${m.id}@${m.version}`;
}

export function buildRegistryIndex(entries: RegistryEntry[]): RegistryIndex {
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

export function appModules(inputs: GeneratorInputs): ModuleRef[] {
  const declared = inputs.appManifest.modules ?? [];
  const out = [...declared];
  for (const m of DEFAULT_MODULES) {
    if (!out.some((existing) => existing.id === m.id)) out.push(m);
  }
  return out;
}

export function buildModuleAdmission(inputs: GeneratorInputs, appModuleSet: ModuleRef[]): ModuleAdmission {
  return {
    appModulesById: new Map(appModuleSet.map((m) => [m.id, m])),
    allowedModules: inputs.posture?.allowedModules ?? [],
  };
}

export function validateModuleAdmission(
  inputs: GeneratorInputs,
  registry: RegistryIndex,
  appModuleSet: ModuleRef[],
): CoherenceIssue[] {
  const issues: CoherenceIssue[] = [];
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
  return issues;
}

export function validateContributionAccess(
  index: RegistryIndex,
  admission: ModuleAdmission,
  name: string,
  category: string,
  path: string,
): ContributionResolution {
  const issues: CoherenceIssue[] = [];
  const entry = latestEntry(index, name);
  if (!entry) {
    issue(issues, "error", "APP-COHERENCE-UNRESOLVED-CONTRIBUTION", path, `Registry entry '${name}' is missing.`);
    return { issues };
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
  if (owners.length === 1) {
    const owner = owners[0];
    const appModule = admission.appModulesById.get(owner);
    if (!appModule) {
      issue(issues, "error", "MODULE-CONTRIBUTION-UNADMITTED", path, `Registry entry '${name}' is contributed by module '${owner}', but the app does not admit that module.`);
    } else if (admission.allowedModules.length > 0 && !admission.allowedModules.some((allowed) => postureAdmits(appModule, allowed))) {
      issue(issues, "error", "MODULE-CONTRIBUTION-DENIED", path, `Registry entry '${name}' is contributed by module '${owner}', but posture does not admit '${moduleKey(appModule)}'.`);
    }
  }
  return { entry, issues };
}
