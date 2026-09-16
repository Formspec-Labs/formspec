/** @filedesc Normalize raw extension registry JSON into LoadedRegistry (URL, document, entry index); derive the index rows for authored registries. */
import type { LoadedRegistry, ProjectState } from './types.js';

/**
 * Build a loaded registry record from a registry document payload.
 * Ensures a stable `url` on the stored document for `project.removeRegistry`.
 */
export function indexRegistryPayload(
  registry: Record<string, unknown>,
  fallbackUrl = 'urn:formspec:registry:unnamed',
): LoadedRegistry {
  const url =
    typeof registry.url === 'string' && registry.url.trim() !== ''
      ? registry.url.trim()
      : fallbackUrl;
  const document = { ...registry, url };
  const entries: Record<string, unknown> = {};
  for (const entry of (registry.entries as Iterable<Record<string, unknown>>) ?? []) {
    const e = entry as { name?: string };
    if (e?.name) entries[e.name] = entry;
  }
  return { url, document, entries };
}

/**
 * Rebuild the `extensions.registries` rows derived from the authored `state.registries`:
 * host-loaded rows stay in place, every derived row is replaced by a fresh index of its
 * authored document (a registry without a `url` is indexed under `urn:formspec:registry:<id>`).
 * Runs after every write to `state.registries`, so the authored document is the only source
 * and the index never carries a stale or duplicated projection of it.
 */
export function syncAuthoredRegistries(state: ProjectState): void {
  const loaded = state.extensions.registries.filter((row) => row.authoredId === undefined);
  for (const [id, document] of Object.entries(state.registries)) {
    loaded.push({
      ...indexRegistryPayload(document as unknown as Record<string, unknown>, `urn:formspec:registry:${id}`),
      authoredId: id,
    });
  }
  state.extensions.registries = loaded;
}
