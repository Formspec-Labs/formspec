/** @filedesc Definition path → item indexes over an item tree, in pure TS. */
import type { FormItem } from '@formspec-org/types';
import { normalizeIndexedPath } from '@formspec-org/engine/fel-runtime';

/**
 * Definition path → item for every item in the tree, in one walk — instead of an engine
 * `itemAtPath` per lookup, which serializes the whole item tree into WASM on every call.
 * Mirrors its first-match rule: a duplicate sibling key resolves to the first item, and
 * the duplicate's subtree is unreachable.
 */
export function itemsByPath(items: readonly FormItem[]): Map<string, FormItem> {
  const index = new Map<string, FormItem>();
  const walk = (list: readonly FormItem[], prefix: string) => {
    for (const item of list) {
      const path = prefix ? `${prefix}.${item.key}` : item.key;
      if (index.has(path)) continue;
      index.set(path, item);
      if (item.children) walk(item.children, path);
    }
  };
  walk(items, '');
  return index;
}

const indexes = new WeakMap<readonly FormItem[], ReadonlyMap<string, FormItem>>();

/**
 * {@link itemsByPath}, built once per `items` array. Array identity is the version, the
 * invariant `bindIndex` rests on: dispatch edits a structuredClone of the committed state,
 * so a committed item tree never changes under its index. Use it for queries over committed
 * state, never over a tree a handler is still mutating (handlers use the engine directly).
 */
export function itemIndex(items: readonly FormItem[]): ReadonlyMap<string, FormItem> {
  let index = indexes.get(items);
  if (!index) {
    index = itemsByPath(items);
    indexes.set(items, index);
  }
  return index;
}

/**
 * The engine's `itemAtPath` as an O(1) lookup: the engine still parses the path (repeat
 * indexes and selectors stripped), the index answers the lookup. Item keys never contain
 * `.` or `[`, so an index path and a normalized path address the same item.
 */
export function itemAtIndexedPath(items: readonly FormItem[], path: string): FormItem | undefined {
  return path ? itemIndex(items).get(normalizeIndexedPath(path)) : undefined;
}
