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
  return path.replace(/\[\*\]/g, '');
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

/** Every bind entry whose target is `path`, in document order. */
export function bindEntriesFor(binds: readonly FormBind[] | undefined, path: string): FormBind[] {
  if (!binds) return [];
  const key = bindTargetKey(path);
  return binds.filter(b => typeof b.path === 'string' && bindTargetKey(b.path) === key);
}
