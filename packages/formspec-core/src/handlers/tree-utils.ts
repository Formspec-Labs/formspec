/**
 * Shared tree utilities for component handlers.
 *
 * Both component-properties.ts and component-tree.ts operate on the same
 * component tree structure. They share node lookup, binding checks, and tree initialization.
 *
 * @module handlers/tree-utils
 */
import type { ComponentState, ProjectState } from '../types.js';
import {
  getEditableComponentDocument,
} from '../component-documents.js';
import { resolveItemLocation } from './helpers.js';

/**
 * Internal representation of a component tree node.
 *
 * - `component` -- the component type name (built-in or custom).
 * - `bind` -- present when the node is bound to a definition item key. In memory
 *   this stores the **leaf `item.key`** only (e.g. `"email"`), not the full dotted
 *   path. At export time, `cleanTreeForExport()` in `raw-project.ts` rewrites it to
 *   the absolute path by prepending the group prefix accumulated from ancestor nodes
 *   (e.g. `"contact.email"`). Code that reads `bind` from an in-memory `TreeNode`
 *   must not assume it is a rooted path.
 * - `definitionItemPath` -- optional absolute definition path for this node (set by
 *   `reconcileComponentTree`). Studio-only; stripped on export. Disambiguates
 *   duplicate leaf keys across pages and layout wrappers.
 * - `nodeId` -- present on unbound nodes (layout, container).
 * - `children` -- child nodes; only meaningful for Layout and Container types.
 * - `style`, `accessibility`, `responsive` -- typed sub-objects for property handlers.
 * - Additional keys hold component-specific props.
 */
export type TreeNode = {
  component: string;
  bind?: string;
  nodeId?: string;
  /** Absolute definition path; set by reconcile; stripped on export. */
  definitionItemPath?: string;
  children?: TreeNode[];
  style?: Record<string, unknown>;
  accessibility?: Record<string, unknown>;
  responsive?: Record<string, unknown>;
  /** Typed layout placement for grid contexts. */
  layout?: { grid?: { span?: number; start?: number; rowSpan?: number; rowStart?: number } };
  [key: string]: unknown;
};

type TreeNodeMatch = { parent: TreeNode; index: number; node: TreeNode; parentBindPath: string };

export function appendBindPath(prefix: string, bind: string | undefined): string {
  if (!bind) return prefix;
  return prefix ? `${prefix}.${bind}` : bind;
}

/** Find a node by its ID or bind, with the enclosing definition path for relative binds. */
export function findTreeNode(
  root: TreeNode,
  ref: { bind?: string; nodeId?: string },
): TreeNodeMatch | undefined {
  const matches = (node: TreeNode) =>
    (ref.nodeId && node.nodeId === ref.nodeId) || (ref.bind && node.bind === ref.bind);

  // The root has no siblings. Callers must check index before splicing.
  if (matches(root)) return { parent: root, index: -1, node: root, parentBindPath: '' };

  const stack = [{ parent: root, parentBindPath: appendBindPath('', root.bind) }];
  while (stack.length) {
    const { parent, parentBindPath } = stack.pop()!;
    const children = parent.children ?? [];
    for (let index = 0; index < children.length; index++) {
      const node = children[index];
      if (matches(node)) return { parent, index, node, parentBindPath };
      stack.push({ parent: node, parentBindPath: appendBindPath(parentBindPath, node.bind) });
    }
  }
  return undefined;
}

/** Authoring uses Text for display Items so the renderer follows their live label and relevance. */
export function assertDisplayItemComponent(
  state: ProjectState,
  component: string,
  bind: unknown,
  parentBindPath: string,
  definitionItemPath?: string,
): void {
  if (component === 'Text' || typeof bind !== 'string' || !bind) return;

  const path = definitionItemPath ?? appendBindPath(parentBindPath, bind);
  if (resolveItemLocation(state, path)?.item.type === 'display') {
    throw new Error(`Bound display item '${path}' must use Text`);
  }
}

/**
 * Ensure the component document has a root tree node.
 *
 * Initializes `component.tree` with a synthetic Stack root if absent.
 *
 * @param state - The project state.
 * @returns The root tree node.
 */
export function ensureTree(state: ProjectState): TreeNode {
  const component = getEditableComponentDocument(state) as ComponentState;
  if (!component.tree) {
    component.tree = { component: 'Stack', nodeId: 'root', children: [] };
  }
  return component.tree as TreeNode;
}
