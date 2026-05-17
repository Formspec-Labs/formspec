/** @filedesc Build a flat search index of all definition items. */
import type { FormItem } from '@formspec-org/types';
import type { ProjectState } from '../types.js';

/**
 * A single entry in the search index, suitable for client-side filtering.
 */
export interface SearchIndexEntry {
  /** Item key (leaf segment). */
  key: string;
  /** Full dot-notation path. */
  path: string;
  /** Human-readable label (falls back to key). */
  label: string;
  /** Item kind: field, group, or display. */
  type: string;
  /** Data type for fields (undefined for groups/displays). */
  dataType: string | undefined;
}

/**
 * Build a flat search index of all items in the definition tree.
 * Walks depth-first, producing one entry per item (including groups).
 */
export function buildSearchIndex(state: ProjectState): SearchIndexEntry[] {
  const entries: SearchIndexEntry[] = [];

  function walk(items: FormItem[], prefix: string): void {
    for (const item of items) {
      const path = prefix ? `${prefix}.${item.key}` : item.key;
      entries.push({
        key: item.key,
        path,
        label: item.label || item.key,
        type: item.type,
        dataType: item.dataType,
      });
      if (item.children?.length) {
        walk(item.children, path);
      }
    }
  }

  walk(state.definition.items, '');
  return entries;
}
