/** @filedesc Component tree export/import: schema-prop filtering, bind path rewriting and its inverse, derived detection. */
import type { FormItem } from '@formspec-org/types';
import { COMPONENT_BASE_PROP_NAMES, COMPONENT_SCHEMA_PROPS } from './generated/component-schema-props.js';
import { generateNodeId } from './component-tree.js';
import { jsonEqual } from './json-equal.js';
import { generatedComponentType, reconcileComponentTree } from './tree-reconciler.js';
import type { ProjectState } from './types.js';

/** Components that manage their own group path binding and MUST keep their bind on export. */
const SELF_MANAGED_GROUP_BINDS = new Set(['Accordion', 'DataTable']);

/**
 * Schema-derived allowlist of valid properties per component type (generated from
 * schemas/component.schema.json), each merged with the ComponentBase props. `bind`
 * and `children` are structural — handled by export logic, not listed here.
 */
const COMPONENT_PROP_SETS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(COMPONENT_SCHEMA_PROPS).map(([type, props]) => [
    type,
    new Set([...COMPONENT_BASE_PROP_NAMES, ...props]),
  ]),
);

/** Custom component or unrecognized type: ComponentBase props + `params` (CustomComponentRef). */
const CUSTOM_COMPONENT_PROPS: Set<string> = new Set([...COMPONENT_BASE_PROP_NAMES, 'params']);

/** Schema-valid property names for a component type. */
function allowedPropsFor(componentType: string): Set<string> {
  return COMPONENT_PROP_SETS[componentType] ?? CUSTOM_COMPONENT_PROPS;
}

/**
 * Filter a tree node to only schema-valid properties for its component type.
 *
 * Strips all authoring-time metadata (nodeId, _layout, widgetHint, repeatable,
 * displayMode, addLabel, removeLabel, dataTableConfig, etc.) by emitting ONLY
 * properties that the component schema declares for the node's component type.
 *
 * `bind` and `children` are structural and handled separately by the caller.
 */
function filterToSchemaProps(
  base: Record<string, unknown>,
  componentType: string,
): Record<string, unknown> {
  const allowed = allowedPropsFor(componentType);
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base)) {
    if (allowed.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

/**
 * Definition path → item for every item in the tree: one pure walk per export instead
 * of an engine `itemAtPath` per bound node, which serializes the whole item tree into
 * WASM on every call (O(n²) export). Mirrors its first-match rule: a duplicate sibling
 * key resolves to the first item, and the duplicate's subtree is unreachable.
 */
function itemsByPath(items: readonly FormItem[]): Map<string, FormItem> {
  const index = new Map<string, FormItem>();
  const walk = (list: readonly FormItem[], prefix: string) => {
    for (const item of list) {
      const path = joinPath(prefix, item.key);
      if (index.has(path)) continue;
      index.set(path, item);
      if (item.children) walk(item.children, path);
    }
  };
  walk(items, '');
  return index;
}

/**
 * Clean a component tree node for export, applying schema-valid property
 * filtering and bind path normalization.
 *
 * - Only schema-declared properties survive (allowlist per component type).
 * - `nodeId`, `_layout`, and all authoring metadata are implicitly excluded.
 * - Two prefixes walk down the tree: `lookupPrefix` is the definition path used to
 *   resolve items; `writePrefix` is what an exported bind is written relative to.
 * - For non-self-managed layout/container nodes bound to a group item: bind is
 *   removed and the group key is appended to both prefixes.
 * - For self-managed repeat containers (Accordion/DataTable): bind is written
 *   relative to `writePrefix`, then children restart at write prefix `''` —
 *   component-spec §4.4: repeat template children are flat item keys resolved
 *   within the current repeat instance.
 * - For input/display nodes: bind is written relative to `writePrefix`.
 * - If bind references a path not found in the definition, it is kept at its
 *   written path (orphaned binds are preserved rather than silently dropped).
 */
function cleanTreeForExport(
  node: Record<string, unknown>,
  items: ReadonlyMap<string, FormItem>,
  lookupPrefix: string,
  writePrefix: string,
): Record<string, unknown> {
  const componentType = (node.component as string) ?? '';
  const bindKey = node.bind;
  const children = node.children;

  // Filter to schema-valid properties only (excludes bind and children — handled below)
  const base = filterToSchemaProps(node, componentType);

  let output: Record<string, unknown>;
  let childLookupPrefix = lookupPrefix;
  let childWritePrefix = writePrefix;

  if (bindKey) {
    const key = String(bindKey);
    const lookupPath = joinPath(lookupPrefix, key);
    const writePath = joinPath(writePrefix, key);
    const item = items.get(lookupPath);

    if (item?.type === 'group' && !SELF_MANAGED_GROUP_BINDS.has(componentType)) {
      // Non-self-managed group container: omit bind entirely, propagate the group to children
      output = { ...base };
      childLookupPrefix = lookupPath;
      childWritePrefix = writePath;
    } else {
      output = { ...base, bind: writePath };
      if (item?.type === 'group') {
        // Self-managed repeat template: children resolve inside the repeat instance
        childLookupPrefix = lookupPath;
        childWritePrefix = '';
      }
    }
  } else {
    output = { ...base };
  }

  if (Array.isArray(children)) {
    output.children = (children as unknown[]).map((child: unknown) =>
      cleanTreeForExport(child as Record<string, unknown>, items, childLookupPrefix, childWritePrefix)
    );
  }

  return output;
}

function joinPath(prefix: string, key: string): string {
  return prefix ? `${prefix}.${key}` : key;
}

type TreeRecord = Record<string, unknown> & { children?: TreeRecord[] };

/** `path` relative to the group at `group` (`''` = root), or `undefined` when not under it. */
function relativePath(path: string, group: string): string | undefined {
  if (!group) return path;
  return path.startsWith(`${group}.`) ? path.slice(group.length + 1) : undefined;
}

/**
 * Key of the plain group, directly under `group`, that every bound descendant of
 * `node` sits inside (searching through unbound nodes, stopping at bound ones).
 * `undefined` when there is none: the node is a layout wrapper.
 */
function coveringGroupKey(
  node: TreeRecord,
  items: ReadonlyMap<string, FormItem>,
  base: string,
  group: string,
): string | undefined {
  let key: string | undefined;
  const pending = [...(node.children ?? [])];
  while (pending.length > 0) {
    const child = pending.pop()!;
    if (typeof child.bind === 'string' && child.bind) {
      const rel = relativePath(joinPath(base, child.bind), group);
      const dot = rel?.indexOf('.') ?? -1;
      if (dot < 0) return undefined;
      const childKey = rel!.slice(0, dot);
      if (key !== undefined && childKey !== key) return undefined;
      key = childKey;
    } else if (child.children) {
      pending.push(...child.children);
    }
  }
  return key !== undefined && items.get(joinPath(group, key))?.type === 'group' ? key : undefined;
}

/**
 * Invert the export bind transform on an incoming tree so its authored nodes match
 * their items on reconcile. Export drops a layout container's bind to a plain group
 * (component-spec §4.2: layout components are bind-forbidden) and writes descendants
 * as dotted paths; repeat template children restart as flat keys (§4.4). Import:
 *
 * - rewrites every bind relative to its enclosing group node (the in-memory shape);
 * - binds an unbound container to the plain group all its bound descendants sit in —
 *   the outermost such container: export cannot tell a group's Stack from a wrapper
 *   directly around it, and both shapes re-export identically;
 * - binds an unbound node with no bound descendants to the next group, in document
 *   order under the enclosing group, that no node binds into and whose generated
 *   component it shows: an empty group exports as a bare container
 *   (`{ component: 'Stack', children: [] }`). An empty group whose node carries any
 *   other component cannot be told from an empty layout container of that type, and
 *   imports as one;
 * - marks every other unbound node a layout wrapper (`_layout` + `nodeId`), the shape
 *   the reconciler preserves.
 *
 * The root and nodes that already carry `nodeId` are in-memory shape and keep their
 * identity, so the transform is idempotent on a tree that was never exported.
 */
export function importComponentTree(tree: unknown, items: readonly FormItem[]): Record<string, unknown> {
  const root = tree as TreeRecord;
  const index = itemsByPath(items);

  // Definition paths at or above a bound node: groups some node binds into.
  const bound = new Set<string>();
  const scan = (node: TreeRecord, base: string) => {
    for (const child of node.children ?? []) {
      let childBase = base;
      if (typeof child.bind === 'string' && child.bind) {
        const path = joinPath(base, child.bind);
        for (let prefix = path; prefix && !bound.has(prefix); prefix = prefix.slice(0, Math.max(0, prefix.lastIndexOf('.')))) {
          bound.add(prefix);
        }
        if (index.get(path)?.type === 'group') childBase = path;
      }
      scan(child, childBase);
    }
  };
  scan(root, '');

  // Per enclosing group and component: how far into its child items claims have reached.
  // A claim takes the first match, so everything before the cursor is taken or ineligible.
  const cursors = new Map<string, number>();
  const claimEmptyGroup = (node: TreeRecord, group: string): string | undefined => {
    const siblings = group ? index.get(group)?.children : items;
    if (!siblings) return undefined;
    const cursorKey = `${group} ${String(node.component)}`;
    for (let i = cursors.get(cursorKey) ?? 0; i < siblings.length; i++) {
      const item = siblings[i];
      if (item.type !== 'group' || bound.has(joinPath(group, item.key))) continue;
      if (generatedComponentType(item) !== node.component) continue;
      cursors.set(cursorKey, i + 1);
      return item.key;
    }
    cursors.set(cursorKey, siblings.length);
    return undefined;
  };

  /**
   * `base` is the definition path exported binds resolve against (`''`, or the enclosing
   * bound group — repeat template children restart there); `group` is the definition path
   * of the enclosing in-memory group node, which in-memory binds are relative to.
   */
  const importNode = (node: TreeRecord, base: string, group: string): TreeRecord => {
    const out: TreeRecord = { ...node };
    let childBase = base;
    let childGroup = group;

    if (typeof node.bind === 'string' && node.bind) {
      const path = joinPath(base, node.bind);
      out.bind = relativePath(path, group) ?? node.bind;
      if (index.get(path)?.type === 'group') childBase = childGroup = path;
    } else if (node.nodeId === undefined) {
      const key = node.component === 'Section'
        ? undefined
        : coveringGroupKey(node, index, base, group) ?? claimEmptyGroup(node, group);
      if (key) {
        out.bind = key;
        childGroup = joinPath(group, key);
      } else {
        out._layout = true;
        out.nodeId = generateNodeId();
      }
    }

    if (node.children) {
      out.children = node.children.map(child => importNode(child, childBase, childGroup));
    }
    return out;
  };

  return {
    ...root,
    nodeId: root.nodeId ?? 'root',
    ...(root.children ? { children: root.children.map(child => importNode(child, '', '')) } : {}),
  };
}

/** Envelope keys `RawProject` stamps on every component document; they carry no authored content. */
const COMPONENT_ENVELOPE_KEYS = new Set(['$formspecComponent', 'version', 'targetDefinition', 'tree']);

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null
    || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
}

/** The component tree as export writes it, and whether the document is derived. */
export interface ComponentTreeExport {
  /** See {@link componentDocumentIsDerived}. */
  derived: boolean;
  /** Exported (schema-valid, export-bind-shaped) tree; `undefined` when the document has none. */
  tree: Record<string, unknown> | undefined;
}

/**
 * Export the component tree once and decide from it whether the document is derived,
 * so `export()` never cleans the same tree twice. Linear in the tree and item count:
 * one item index, one clean pass per side, one reconcile, one structural compare.
 */
export function exportComponentTree(state: ProjectState): ComponentTreeExport {
  const component = state.component as Record<string, unknown>;
  let derived = Object.entries(component)
    .every(([key, value]) => COMPONENT_ENVELOPE_KEYS.has(key) || isAbsent(value));
  if (!component.tree) return { derived, tree: undefined };

  const items = itemsByPath(state.definition.items);
  const tree = cleanTreeForExport(component.tree as Record<string, unknown>, items, '', '');
  if (derived) {
    const generated = reconcileComponentTree(state.definition, undefined);
    derived = jsonEqual(tree, cleanTreeForExport(generated, items, '', ''));
  }
  return { derived, tree };
}

/**
 * True when the component document holds nothing beyond what
 * `reconcileComponentTree` generates from the Definition alone: no document-level
 * content (tokens, breakpoints, custom components, …) and an exported tree equal
 * to the exported default tree.
 *
 * Such a document is not an authoring decision, yet component-spec §1.2 lets any
 * Component Document override Theme widget selection — so a derived document
 * should not be emitted. Compares exported shapes, so Studio-only node metadata
 * (`nodeId`, `definitionItemPath`, non-schema props) never counts as authored.
 */
export function componentDocumentIsDerived(state: ProjectState): boolean {
  return exportComponentTree(state).derived;
}
