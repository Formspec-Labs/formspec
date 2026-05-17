/**
 * Command handlers for definition item CRUD operations.
 *
 * Registers handlers for: `definition.addItem`, `definition.deleteItem`,
 * `definition.renameItem`, `definition.moveItem`, `definition.reorderItem`,
 * and `definition.duplicateItem`.
 *
 * All handlers mutate a cloned `ProjectState` in-place and return a
 * `CommandResult`. Most return `{ rebuildComponentTree: true }` to signal
 * that the component tree must be regenerated after the mutation.
 *
 * @module
 */
import type { CommandHandler } from '../types.js';
import type { ProjectState } from '../types.js';
import { normalizeIndexedPath } from '@formspec-org/engine/fel-runtime';
import { rewriteFELReferences } from '@formspec-org/engine/fel-tools';
import type { FormItem } from '@formspec-org/types';
import {
  allMappingRules,
  rewriteBindFelExpressions,
  rewriteItemFelExpressions,
  rewriteMappingRuleFieldRefs,
  rewriteShapeFelExpressions,
  rewriteVariableExpression,
} from '../bind-fel.js';
import { editableComponentTree, walkComponentTree } from '../component-tree.js';
import { resolveItemLocation } from './helpers.js';
// ── Helpers ──────────────────────────────────────────────────────────

/** Module-level counter for auto-generating unique item keys. */
let autoKeyCounter = 0;

/**
 * Generate a unique item key by combining the item type with an
 * auto-incrementing counter (e.g. `"field_1"`, `"group_2"`).
 *
 * Used when `AddItemPayload.key` is omitted.
 *
 * @param type - The item type (`"field"`, `"group"`, or `"display"`).
 * @returns A key string in the form `"{type}_{counter}"`.
 */
function generateKey(type: string): string {
  return `${type}_${++autoKeyCounter}`;
}

/**
 * Resolve the children array for a given parent path, or the root items array
 * if no parent is specified.
 *
 * Unlike {@link resolveItemLocation} (which resolves to a specific item), this
 * function resolves to the _children array_ where new items should be inserted.
 * If an intermediate item lacks a `children` array, one is created automatically.
 *
 * Used by `definition.addItem` and `definition.moveItem` to find the target
 * insertion point.
 *
 * @param state - The current project state.
 * @param parentPath - Dot-separated path to the parent item (e.g. `"contacts"`).
 *   Omit or pass `undefined` to target the root items array.
 * @returns The `FormItem[]` array to insert into, or `undefined` if any
 *   path segment cannot be resolved.
 */
function resolveParentItems(state: ProjectState, parentPath?: string): FormItem[] | undefined {
  if (!parentPath) return state.definition.items;

  const parts = parentPath.split('.');
  let items = state.definition.items;

  for (const part of parts) {
    const found = items.find(it => it.key === part);
    if (!found) return undefined;
    if (!found.children) found.children = [];
    items = found.children;
  }

  return items;
}

/**
 * Construct a new {@link FormItem} from an `AddItemPayload` object.
 *
 * Applies type-specific defaults:
 * - **field**: sets `dataType` to `"string"` if not provided.
 * - **group**: initializes an empty `children` array.
 * - **display**: no additional defaults.
 *
 * Copies optional properties (`description`, `hint`, `options`, `labels`)
 * from the payload when present. The caller is responsible for ensuring
 * key uniqueness via {@link uniqueKey}.
 *
 * @param payload - A record matching the `AddItemPayload` shape. Must include
 *   at least `type`. If `key` is omitted, one is auto-generated.
 * @returns A new `FormItem` ready for insertion into the item tree.
 */
function buildItem(payload: Record<string, unknown>): FormItem {
  const type = payload.type as 'field' | 'group' | 'display';
  type FieldDataType = NonNullable<FormItem['dataType']>;
  const key = (payload.key as string) || generateKey(type);

  const item: FormItem = {
    key,
    type,
    label: (payload.label as string) ?? '',
  };

  if (type === 'field') {
    item.dataType = (payload.dataType as FieldDataType | undefined) ?? 'string';
  }

  if (type === 'group') {
    item.children = [];
  }

  if (payload.description) item.description = payload.description as string;
  if (payload.hint) item.hint = payload.hint as string;
  if (payload.options) item.options = payload.options as { value: string; label: string }[];
  if (payload.labels) item.labels = payload.labels as Record<string, string>;
  for (const prop of [
    'relevant',
    'required',
    'readonly',
    'calculate',
    'constraint',
    'constraintMessage',
    'initialValue',
    'repeatable',
    'minRepeat',
    'maxRepeat',
    'optionSet',
    'currency',
    'presentation',
    'prePopulate',
    'extensions',
  ]) {
    if (payload[prop] !== undefined) {
      (item as Record<string, unknown>)[prop] = payload[prop];
    }
  }

  return item;
}

/**
 * Recursively collect all item keys in a subtree, including the root item.
 *
 * Used by `definition.deleteItem` to identify all keys that need cleanup
 * in binds, shapes, and theme overrides when a subtree is removed.
 *
 * @param item - The root item of the subtree.
 * @returns A flat array of all keys in the subtree (root key first, then
 *   children depth-first).
 */
function collectKeys(item: FormItem): string[] {
  const keys = [item.key];
  if (item.children) {
    for (const child of item.children) {
      keys.push(...collectKeys(child));
    }
  }
  return keys;
}

/**
 * Ensure an item key is unique among its sibling items.
 *
 * If the key already exists in the siblings array, appends an incrementing
 * numeric suffix (e.g. `"field_1"`, `"field_2"`) until a unique key is found.
 *
 * Used by `definition.addItem` and `definition.duplicateItem` to prevent
 * key collisions.
 *
 * @param key - The desired key.
 * @param siblings - The items array the new item will be inserted into.
 * @returns The original key if unique, or a suffixed variant if not.
 */
function uniqueKey(key: string, siblings: FormItem[]): string {
  const existing = new Set(siblings.map(s => s.key));
  if (!existing.has(key)) return key;

  let suffix = 1;
  while (existing.has(`${key}_${suffix}`)) suffix++;
  return `${key}_${suffix}`;
}

/** Split a dotted item path into non-empty segments. */
function splitPath(path: string): string[] {
  return path.split('.').filter(Boolean);
}

/** Strip repeat indices and wildcards from a single path segment. */
function normalizeSegment(segment: string): string {
  return segment.replace(/\[(?:\d+|\*)\]/g, '');
}

/** Rewrite a path only when it matches the renamed item path as a normalized prefix. */
function rewritePathPrefix(path: string, oldPath: string, newPath: string): string {
  const rawParts = splitPath(path);
  const normalizedParts = rawParts.map(normalizeSegment);
  const oldParts = splitPath(normalizeIndexedPath(oldPath));
  const newParts = splitPath(normalizeIndexedPath(newPath));

  if (oldParts.length === 0 || normalizedParts.length < oldParts.length) {
    return path;
  }

  for (let i = 0; i < oldParts.length; i++) {
    if (normalizedParts[i] !== oldParts[i]) {
      return path;
    }
  }

  const rewritten = [...newParts];
  const finalMatchedIndex = oldParts.length - 1;
  const finalMatchedSuffix = rawParts[finalMatchedIndex]?.slice(normalizedParts[finalMatchedIndex].length) ?? '';
  if (rewritten.length > 0 && finalMatchedSuffix) {
    rewritten[rewritten.length - 1] = rewritten[rewritten.length - 1] + finalMatchedSuffix;
  }
  for (let i = oldParts.length; i < rawParts.length; i++) {
    rewritten.push(rawParts[i]);
  }

  return rewritten.join('.');
}

function rewriteFieldRef(expr: string, oldPath: string, newPath: string): string {
  return rewriteFELReferences(expr, {
    rewriteFieldPath(path) {
      return rewritePathPrefix(path, oldPath, newPath);
    },
  });
}

/**
 * Rewrite all path references across definition artifacts when an item's
 * canonical path changes (due to move or rename).
 *
 * Covers: binds (path + FEL props), shapes (target + FEL props + context),
 * variables (expression), inline item expressions, screener routes, and
 * mapping rules (sourcePath + FEL props + reverse + innerRules).
 */
function rewriteAllPathReferences(
  state: ProjectState,
  oldPath: string,
  newPath: string,
): void {
  const rewriteExpr = (expr: string) => rewriteFieldRef(expr, oldPath, newPath);
  const rewritePath = (path: string) => rewritePathPrefix(path, oldPath, newPath);

  for (const bind of state.definition.binds ?? []) {
    bind.path = rewritePath(bind.path);
    rewriteBindFelExpressions(bind, rewriteExpr);
  }

  for (const shape of state.definition.shapes ?? []) {
    rewriteShapeFelExpressions(shape, rewritePath, rewriteExpr);
  }

  for (const variable of state.definition.variables ?? []) {
    rewriteVariableExpression(variable, rewriteExpr);
  }

  const walkItems = (items: FormItem[]) => {
    for (const item of items) {
      rewriteItemFelExpressions(item, rewriteExpr);
      if (item.children) walkItems(item.children);
    }
  };
  walkItems(state.definition.items);

  if (state.screener) {
    for (const phase of state.screener.evaluation) {
      for (const route of phase.routes) {
        if (typeof route.condition === 'string') route.condition = rewriteExpr(route.condition);
        if (typeof route.score === 'string') route.score = rewriteExpr(route.score);
      }
    }
  }

  for (const rule of allMappingRules(state.mappings)) {
    rewriteMappingRuleFieldRefs(rule, rewritePath, rewriteExpr);
  }
}

// ── Handler table ────────────────────────────────────────────────────

export const definitionItemsHandlers = {

  // ── addItem ──────────────────────────────────────────────────────────

  /**
   * Handler for `definition.addItem`.
   *
   * Creates a new item and inserts it into the definition item tree.
   *
   * **Payload** (`AddItemPayload`):
   * - `type` — `"field"` | `"group"` | `"display"` (required).
   * - `parentPath` — Dot-path of the parent item. Omit to insert at root.
   * - `insertIndex` — Position within the parent's children. Omit to append.
   * - `key` — Desired item key. Auto-generated from type if omitted.
   * - `dataType` — For fields only; defaults to `"string"`.
   * - `label`, `description`, `hint`, `options`, `labels` — Optional metadata.
   *
   * **Returns**: `{ rebuildComponentTree: true, insertedPath }` where
   * `insertedPath` is the full dot-path of the newly created item.
   *
   * **Side effects**: Ensures the key is unique among siblings. Groups get
   * an empty `children` array. Fields default to `dataType: "string"`.
   *
   * @throws If `parentPath` cannot be resolved in the item tree.
   */
  'definition.addItem': (state, payload) => {
    const p = payload as Record<string, unknown>;
    const parentPath = p.parentPath as string | undefined;
    const insertIndex = p.insertIndex as number | undefined;
    const itemType = p.type as string;
    const hasTopLevelGroups = state.definition.items.some((item) => item.type === 'group');

    // Guard: paged definitions require non-group items to specify a parentPath
    const pageMode = state.definition.formPresentation?.pageMode;
    if (
      (pageMode === 'wizard' || pageMode === 'tabs') &&
      !parentPath &&
      itemType !== 'group' &&
      hasTopLevelGroups
    ) {
      throw new Error(
        `Cannot add a "${itemType}" at root in a paged (${pageMode}) definition — provide a parentPath`,
      );
    }

    const items = resolveParentItems(state, parentPath);
    if (!items) throw new Error(`Parent path not found: ${parentPath}`);

    const item = buildItem(p);
    item.key = uniqueKey(item.key, items);

    if (insertIndex !== undefined) {
      items.splice(insertIndex, 0, item);
    } else {
      items.push(item);
    }

    const insertedPath = parentPath ? `${parentPath}.${item.key}` : item.key;
    return { rebuildComponentTree: true, insertedPath };
  },

  // ── deleteItem ───────────────────────────────────────────────────────

  /**
   * Handler for `definition.deleteItem`.
   *
   * Removes an item (and its entire subtree) from the definition, then
   * cleans up all cross-references to the deleted paths.
   *
   * **Payload**: `{ path }` — Dot-path of the item to delete.
   *
   * **Returns**: `{ rebuildComponentTree: true }`.
   *
   * **Side effects** (cascading cleanup):
   * - Removes the item from its parent's children array.
   * - Filters out any `binds` entries whose `path` matches a deleted path.
   * - Filters out any `shapes` entries whose `target` matches a deleted path.
   * - Deletes matching keys from `theme.items` per-item overrides.
   *
   * @throws If `path` cannot be resolved in the item tree.
   */
  'definition.deleteItem': (state, payload) => {
    const { path } = payload as { path: string };
    const loc = resolveItemLocation(state, path);
    if (!loc) throw new Error(`Item not found: ${path}`);

    // Collect all keys to clean up binds
    const deletedKeys = collectKeys(loc.item);
    const deletedPaths = new Set<string>();
    // Build full paths for each deleted key
    const pathPrefix = path.includes('.') ? path.slice(0, path.lastIndexOf('.') + 1) : '';
    for (const key of deletedKeys) {
      // For the item itself, use the full path. For children, approximate.
      deletedPaths.add(path);
    }
    // Also collect nested paths
    function collectPaths(item: FormItem, prefix: string) {
      deletedPaths.add(prefix + item.key);
      if (item.children) {
        for (const child of item.children) {
          collectPaths(child, prefix + item.key + '.');
        }
      }
    }
    const parentPrefix = path.includes('.') ? path.slice(0, path.lastIndexOf('.') + 1) : '';
    collectPaths(loc.item, parentPrefix);

    // Remove the item
    loc.parent.splice(loc.index, 1);

    // Clean up binds targeting deleted paths
    if (state.definition.binds) {
      state.definition.binds = state.definition.binds.filter(
        b => !deletedPaths.has(b.path),
      );
    }

    // Clean up shapes targeting deleted paths
    if (state.definition.shapes) {
      state.definition.shapes = state.definition.shapes.filter(
        s => !deletedPaths.has(s.target),
      );
    }

    // Clean up theme per-item overrides
    const themeItems = state.theme.items as Record<string, unknown> | undefined;
    if (themeItems) {
      for (const key of deletedPaths) {
        // The key in theme.items is the item key, not the full path
        const itemKey = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : key;
        delete themeItems[itemKey];
      }
    }

    // Page child nodes referencing deleted items are cleaned up by the
    // reconciler (rebuildComponentTree: true) — _layout wrappers survive
    // but their stale bound children are dropped during restore.

    return { rebuildComponentTree: true };
  },

  // ── renameItem ───────────────────────────────────────────────────────

  /**
   * Handler for `definition.renameItem`.
   *
   * Changes an item's key and rewrites all references across every artifact
   * to maintain consistency.
   *
   * **Payload**: `{ path, newKey }` — `path` is the current dot-path;
   * `newKey` is the replacement key string.
   *
   * **Returns**: `{ rebuildComponentTree: true, newPath }` where `newPath`
   * is the updated full dot-path after the rename.
   *
   * @throws If `path` cannot be resolved in the item tree.
   */
  'definition.renameItem': (state, payload) => {
    const { path, newKey } = payload as { path: string; newKey: string };
    const loc = resolveItemLocation(state, path);
    if (!loc) throw new Error(`Item not found: ${path}`);

    const oldKey = loc.item.key;
    loc.item.key = newKey;

    // Compute old and new full paths
    const parentPrefix = path.includes('.') ? path.slice(0, path.lastIndexOf('.') + 1) : '';
    const newPath = parentPrefix + newKey;

    // Rewrite path references across all artifacts
    rewriteAllPathReferences(state, path, newPath);

    // Rename-specific: rewrite component tree bind + definitionItemPath (Studio metadata).
    // Reconcile matches bound nodes by bind + definitionItemPath; updating bind alone leaves
    // a stale path so wrapper restore cannot splice the node back from newRoot.
    const tree = editableComponentTree(state);
    if (tree) {
      walkComponentTree(tree, node => {
        if (node.bind === oldKey) node.bind = newKey;
        if (typeof node.definitionItemPath === 'string') {
          node.definitionItemPath = rewritePathPrefix(node.definitionItemPath, path, newPath);
        }
      });
    }

    // Rename-specific: rewrite theme per-item override keys
    const themeItems = state.theme.items as Record<string, unknown> | undefined;
    if (themeItems && themeItems[oldKey]) {
      themeItems[newKey] = themeItems[oldKey];
      delete themeItems[oldKey];
    }

    // Page children and other layout-preserved nodes are updated by the BFS above so
    // reconcile can match and re-splice them onto newRoot.

    return { rebuildComponentTree: true, newPath };
  },

  // ── moveItem ─────────────────────────────────────────────────────────

  /**
   * Handler for `definition.moveItem`.
   *
   * Moves an item from its current location to a new parent and/or position
   * within the definition item tree.
   *
   * @throws If `sourcePath` cannot be resolved or `targetParentPath` is invalid.
   */
  'definition.moveItem': (state, payload) => {
    const { sourcePath, targetParentPath, targetIndex } = payload as {
      sourcePath: string;
      targetParentPath?: string;
      targetIndex?: number;
    };

    const loc = resolveItemLocation(state, sourcePath);
    if (!loc) throw new Error(`Item not found: ${sourcePath}`);

    // Guard: prevent circular moves (moving a node into its own subtree)
    if (targetParentPath && (targetParentPath === sourcePath || targetParentPath.startsWith(sourcePath + '.'))) {
      throw new Error(`Circular move: cannot move "${sourcePath}" into its own descendant "${targetParentPath}"`);
    }

    const hasTopLevelGroups = state.definition.items.some((item) => item.type === 'group');
    const pageMode = state.definition.formPresentation?.pageMode;
    if (
      (pageMode === 'wizard' || pageMode === 'tabs') &&
      !targetParentPath &&
      loc.item.type !== 'group' &&
      hasTopLevelGroups
    ) {
      throw new Error(
        `Cannot add a "${loc.item.type}" at root in a paged (${pageMode}) definition — provide a parentPath`,
      );
    }

    // Remove from source
    const [item] = loc.parent.splice(loc.index, 1);

    // Insert into target
    const targetItems = resolveParentItems(state, targetParentPath);
    if (!targetItems) throw new Error(`Target parent not found: ${targetParentPath}`);

    if (targetIndex !== undefined) {
      targetItems.splice(targetIndex, 0, item);
    } else {
      targetItems.push(item);
    }

    const newPath = targetParentPath ? `${targetParentPath}.${item.key}` : item.key;

    // Rewrite path references if the canonical path actually changed
    if (newPath !== sourcePath) {
      rewriteAllPathReferences(state, sourcePath, newPath);
    }

    return { rebuildComponentTree: true, newPath };
  },

  // ── reorderItem ──────────────────────────────────────────────────────

  /**
   * Handler for `definition.reorderItem`.
   *
   * Swaps an item with its adjacent sibling in the specified direction
   * within the same parent.
   *
   * @throws If `path` cannot be resolved in the item tree.
   */
  'definition.reorderItem': (state, payload) => {
    const { path, direction } = payload as { path: string; direction: 'up' | 'down' };
    const loc = resolveItemLocation(state, path);
    if (!loc) throw new Error(`Item not found: ${path}`);

    const swapIndex = direction === 'up' ? loc.index - 1 : loc.index + 1;
    if (swapIndex < 0 || swapIndex >= loc.parent.length) {
      return { rebuildComponentTree: false };
    }

    [loc.parent[loc.index], loc.parent[swapIndex]] = [loc.parent[swapIndex], loc.parent[loc.index]];

    return { rebuildComponentTree: true };
  },

  // ── duplicateItem ────────────────────────────────────────────────────

  /**
   * Handler for `definition.duplicateItem`.
   *
   * Creates a deep clone of an item (including its entire subtree) and
   * inserts the clone immediately after the original.
   *
   * @throws If `path` cannot be resolved in the item tree.
   */
  'definition.duplicateItem': (state, payload) => {
    const { path } = payload as { path: string };
    const loc = resolveItemLocation(state, path);
    if (!loc) throw new Error(`Item not found: ${path}`);

    const clone = structuredClone(loc.item);
    clone.key = uniqueKey(clone.key, loc.parent);

    // Suffix children keys too for uniqueness across the tree
    function suffixChildKeys(item: FormItem) {
      if (item.children) {
        for (const child of item.children) {
          child.key = child.key + '_copy';
          suffixChildKeys(child);
        }
      }
    }
    suffixChildKeys(clone);

    loc.parent.splice(loc.index + 1, 0, clone);

    const parentPrefix = path.includes('.') ? path.slice(0, path.lastIndexOf('.') + 1) : '';
    const insertedPath = parentPrefix + clone.key;
    return { rebuildComponentTree: true, insertedPath };
  },
} satisfies Record<string, CommandHandler>;
