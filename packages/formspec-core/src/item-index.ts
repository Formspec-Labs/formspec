/** @filedesc Definition path → item indexes over an item tree, in pure TS. */
import type { FormItem } from '@formspec-org/types';

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
