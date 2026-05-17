/**
 * Pure query functions for extension registry lookups.
 */
import type {
  ProjectState,
  RegistrySummary,
  ExtensionFilter,
} from '../types.js';
import { registryEntry } from '../registry-entry.js';

/**
 * Enumerate loaded extension registries with summary metadata.
 */
export function listRegistries(state: ProjectState): RegistrySummary[] {
  return state.extensions.registries.map(r => ({
    url: r.url,
    entryCount: Object.keys(r.entries).length,
  }));
}

/**
 * Browse extension entries across all loaded registries with optional filtering.
 */
export function browseExtensions(state: ProjectState, filter?: ExtensionFilter): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  for (const reg of state.extensions.registries) {
    for (const entry of Object.values(reg.entries)) {
      const e = registryEntry(entry);
      if (filter?.category && e.category !== filter.category) continue;
      if (filter?.status && e.status !== filter.status) continue;
      if (filter?.namePattern && !e.name?.includes(filter.namePattern)) continue;
      results.push(e);
    }
  }
  return results;
}

/**
 * Resolve an extension name against all loaded registries.
 */
export function resolveExtension(state: ProjectState, name: string): Record<string, unknown> | undefined {
  for (const reg of state.extensions.registries) {
    const entry = reg.entries[name];
    if (entry) return entry as unknown as Record<string, unknown>;
  }
  return undefined;
}
