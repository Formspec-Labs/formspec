/**
 * @filedesc Definition bind helpers: import normalization and per-path entry matching/merging.
 */
import type { FormBind } from '@formspec-org/types';

/**
 * Normalize definition `binds` from JSON import (object map or array) to the
 * array shape the studio and queries expect — mirrors createDefaultState.
 */
export function normalizeBindsFromUnknown(binds: unknown): FormBind[] | undefined {
  if (binds == null) return undefined;
  if (Array.isArray(binds)) return binds as FormBind[];
  if (typeof binds === 'object') {
    return Object.entries(binds as Record<string, unknown>).map(([path, value]) => ({
      path,
      ...(typeof value === 'object' && value !== null ? value : {}),
    })) as FormBind[];
  }
  return undefined;
}

/**
 * Item-wide target key for a bind path. core §4.3.3: `[*]` applies a Bind to every
 * repetition, so `jobs[*].hours` and the item path `jobs.hours` address the same
 * node set. Single-repetition selectors (`[@index = N]`) stay distinct.
 */
export function bindTargetKey(path: string): string {
  return path.includes('[') ? path.replace(/\[\*\]/g, '') : path;
}

/** Merge bind property records in document order; later values win (both engines' merge rule). */
export function mergeBindProperties(entries: Iterable<FormBind>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry)) {
      if (key !== 'path') merged[key] = value;
    }
  }
  return merged;
}

const bindIndexes = new WeakMap<readonly FormBind[], ReadonlyMap<string, readonly FormBind[]>>();

/**
 * Bind entries grouped by {@link bindTargetKey}, in document order, built once per
 * `binds` array. Array identity is the version: dispatch edits a structuredClone of
 * the committed state, and a handler that rewrites bind paths in place swaps in a
 * new array, so an indexed array's paths never change under the index.
 */
export function bindIndex(binds: readonly FormBind[]): ReadonlyMap<string, readonly FormBind[]> {
  let index = bindIndexes.get(binds);
  if (!index) {
    const byKey = new Map<string, FormBind[]>();
    for (const bind of binds) {
      if (typeof bind.path !== 'string') continue;
      const key = bindTargetKey(bind.path);
      const entries = byKey.get(key);
      if (entries) entries.push(bind);
      else byKey.set(key, [bind]);
    }
    index = byKey;
    bindIndexes.set(binds, index);
  }
  return index;
}

/** Every bind entry whose target is `path`, in document order. O(1) after the first lookup on `binds`. */
export function bindEntriesFor(binds: readonly FormBind[] | undefined, path: string): readonly FormBind[] {
  return binds ? bindIndex(binds).get(bindTargetKey(path)) ?? [] : [];
}
