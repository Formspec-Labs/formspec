/** @filedesc Component document export: schema-prop filtering, bind path rewriting, derived-default detection. */
import type { FormItem } from '@formspec-org/types';
import { itemAtPath } from '@formspec-org/engine/fel-runtime';
import { COMPONENT_BASE_PROP_NAMES, COMPONENT_SCHEMA_PROPS } from './generated/component-schema-props.js';
import { jsonEqual } from './json-equal.js';
import { reconcileComponentTree } from './tree-reconciler.js';
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
  definition: { items: FormItem[] },
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
    const item = itemAtPath(definition.items, lookupPath);

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
      cleanTreeForExport(child as Record<string, unknown>, definition, childLookupPrefix, childWritePrefix)
    );
  }

  return output;
}

function joinPath(prefix: string, key: string): string {
  return prefix ? `${prefix}.${key}` : key;
}

/** Rewrite an in-memory component tree into its exported, schema-valid shape. */
export function exportComponentTree(
  tree: unknown,
  definition: { items: FormItem[] },
): Record<string, unknown> {
  return cleanTreeForExport(tree as Record<string, unknown>, definition, '', '');
}

/** Envelope keys `RawProject` stamps on every component document; they carry no authored content. */
const COMPONENT_ENVELOPE_KEYS = new Set(['$formspecComponent', 'version', 'targetDefinition', 'tree']);

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null
    || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
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
 * Cost: one reconcile plus two export passes — the same order as one `export()`.
 */
export function componentDocumentIsDerived(state: ProjectState): boolean {
  const component = state.component as Record<string, unknown>;
  for (const [key, value] of Object.entries(component)) {
    if (!COMPONENT_ENVELOPE_KEYS.has(key) && !isAbsent(value)) return false;
  }
  if (!component.tree) return true;
  return jsonEqual(
    exportComponentTree(component.tree, state.definition),
    exportComponentTree(reconcileComponentTree(state.definition, undefined), state.definition),
  );
}
