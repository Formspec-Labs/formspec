/**
 * Component property handlers.
 *
 * These handlers implement the `component.*` property-mutation commands defined
 * in the API spec's "Component -- Node Properties", "Custom Components", and
 * "Document-Level" sections. They modify properties on individual tree nodes,
 * manage custom component templates, and set document-level tokens/breakpoints.
 *
 * @module handlers/component-properties
 */
import type { CommandHandler } from '../types.js';
import { normalizeIndexedPath } from '@formspec-org/engine/fel-runtime';
import { type TreeNode, ensureTree } from './tree-utils.js';

/**
 * Locate a tree node by its NodeRef.
 *
 * Performs an iterative depth-first search matching on `nodeId` or `bind`.
 * Unlike the tree-handler variant, this returns only the node (no parent/index)
 * since property mutations do not need splice context.
 *
 * @param root - The tree root to search from.
 * @param ref - A NodeRef with `bind` or `nodeId`.
 * @returns The matched TreeNode, or `undefined` if not found.
 */
function findNode(
  root: TreeNode,
  ref: { bind?: string; nodeId?: string },
): TreeNode | undefined {
  if (ref.nodeId && root.nodeId === ref.nodeId) return root;
  if (ref.bind && root.bind === ref.bind) return root;

  const stack: TreeNode[] = [root];
  while (stack.length) {
    const parent = stack.pop()!;
    for (const child of parent.children ?? []) {
      if (ref.nodeId && child.nodeId === ref.nodeId) return child;
      if (ref.bind && child.bind === ref.bind) return child;
      stack.push(child);
    }
  }
  return undefined;
}

export const componentPropertiesHandlers = {

  // ── Node Properties ─────────────────────────────────────────────

  'component.setNodeProperty': (state, payload) => {
    const { node: ref, property, value } = payload as {
      node: { bind?: string; nodeId?: string }; property: string; value: unknown;
    };
    const root = ensureTree(state);
    const node = findNode(root, ref);
    if (!node) throw new Error('Node not found');

    if (value === null) {
      delete node[property];
    } else {
      node[property] = value;
    }
    return { rebuildComponentTree: false };
  },

  'component.setNodeType': (state, payload) => {
    const { node: ref, component } = payload as {
      node: { bind?: string; nodeId?: string }; component: string; preserveProps?: boolean;
    };
    const root = ensureTree(state);
    const node = findNode(root, ref);
    if (!node) throw new Error('Node not found');

    node.component = component;
    return { rebuildComponentTree: false };
  },

  'component.setNodeStyle': (state, payload) => {
    const { node: ref, property, value } = payload as {
      node: { bind?: string; nodeId?: string }; property: string; value: unknown;
    };
    const root = ensureTree(state);
    const node = findNode(root, ref);
    if (!node) throw new Error('Node not found');

    if (!node.style) node.style = {};

    if (value === null) {
      delete node.style[property];
    } else {
      node.style[property] = value;
    }
    return { rebuildComponentTree: false };
  },

  'component.setNodeAccessibility': (state, payload) => {
    const { node: ref, property, value } = payload as {
      node: { bind?: string; nodeId?: string }; property: string; value: unknown;
    };
    const root = ensureTree(state);
    const node = findNode(root, ref);
    if (!node) throw new Error('Node not found');

    if (!node.accessibility) node.accessibility = {};

    if (value === null) {
      delete node.accessibility[property];
    } else {
      node.accessibility[property] = value;
    }
    return { rebuildComponentTree: false };
  },

  'component.spliceArrayProp': (state, payload) => {
    const { node: ref, property, index, deleteCount, insert } = payload as {
      node: { bind?: string; nodeId?: string };
      property: string; index: number; deleteCount: number; insert?: unknown[];
    };
    const root = ensureTree(state);
    const node = findNode(root, ref);
    if (!node) throw new Error('Node not found');

    const arr = node[property] as unknown[];
    if (!Array.isArray(arr)) throw new Error(`Property ${property} is not an array`);

    arr.splice(index, deleteCount, ...(insert ?? []));
    return { rebuildComponentTree: false };
  },

  'component.setFieldWidget': (state, payload) => {
    const { fieldKey, widget } = payload as { fieldKey: string; widget: string };
    const root = ensureTree(state);
    const node = findNode(root, { bind: fieldKey });
    if (!node) {
      return { rebuildComponentTree: false, nodeNotFound: true };
    }

    node.component = widget;
    return { rebuildComponentTree: false };
  },

  'component.setResponsiveOverride': (state, payload) => {
    const { node: ref, breakpoint, patch } = payload as {
      node: { bind?: string; nodeId?: string }; breakpoint: string; patch: unknown;
    };
    const root = ensureTree(state);
    const node = findNode(root, ref);
    if (!node) throw new Error('Node not found');

    if (!node.responsive) node.responsive = {};

    if (patch === null) {
      delete node.responsive[breakpoint];
    } else {
      node.responsive[breakpoint] = patch;
    }
    return { rebuildComponentTree: false };
  },

  'component.setGroupRepeatable': (state, payload) => {
    const { groupKey, repeatable } = payload as { groupKey: string; repeatable: boolean };
    const root = ensureTree(state);
    const node = findNode(root, { bind: groupKey });
    if (!node) throw new Error(`No component node bound to group: ${groupKey}`);

    node.repeatable = repeatable;
    return { rebuildComponentTree: true };
  },

  'component.setGroupDisplayMode': (state, payload) => {
    const { groupKey, mode } = payload as { groupKey: string; mode: string };
    const root = ensureTree(state);
    const node = findNode(root, { bind: groupKey });
    if (!node) throw new Error(`No component node bound to group: ${groupKey}`);

    node.displayMode = mode;
    return { rebuildComponentTree: false };
  },

  'component.setGroupDataTable': (state, payload) => {
    const { groupKey, config } = payload as { groupKey: string; config: unknown };
    const root = ensureTree(state);
    const node = findNode(root, { bind: groupKey });
    if (!node) throw new Error(`No component node bound to group: ${groupKey}`);

    node.dataTableConfig = config;
    return { rebuildComponentTree: false };
  },

  // ── Custom Components ───────────────────────────────────────────

  'component.registerCustom': (state, payload) => {
    const { name, params, tree } = payload as { name: string; params: unknown; tree: unknown };
    if (!state.component.components) {
      state.component.components = {};
    }
    state.component.components[name] = { params, tree };
    return { rebuildComponentTree: false };
  },

  'component.updateCustom': (state, payload) => {
    const { name, params, tree } = payload as { name: string; params?: unknown; tree?: unknown };
    const custom = state.component.components?.[name] as Record<string, unknown> | undefined;
    if (!custom) throw new Error(`Custom component not found: ${name}`);

    if (params !== undefined) custom.params = params;
    if (tree !== undefined) custom.tree = tree;
    return { rebuildComponentTree: false };
  },

  'component.deleteCustom': (state, payload) => {
    const { name } = payload as { name: string };
    if (state.component.components) {
      delete state.component.components[name];
    }
    return { rebuildComponentTree: false };
  },

  'component.renameCustom': (state, payload) => {
    const { name, newName } = payload as { name: string; newName: string };
    const customs = state.component.components;
    if (!customs?.[name]) throw new Error(`Custom component not found: ${name}`);

    customs[newName] = customs[name];
    delete customs[name];

    // Rewrite tree references
    const root = ensureTree(state);
    const rewrite = (node: TreeNode) => {
      if (node.component === name) node.component = newName;
      if (node.children) node.children.forEach(rewrite);
    };
    rewrite(root);

    return { rebuildComponentTree: false };
  },

  // ── Document-Level ──────────────────────────────────────────────

  'component.setToken': (state, payload) => {
    const { key, value } = payload as { key: string; value: unknown };
    if (!state.component.tokens) state.component.tokens = {};

    if (value === null) {
      delete state.component.tokens[key];
    } else {
      state.component.tokens[key] = value;
    }
    return { rebuildComponentTree: false };
  },

  'component.setBreakpoint': (state, payload) => {
    const { name, minWidth } = payload as { name: string; minWidth: number | null };
    if (!state.component.breakpoints) state.component.breakpoints = {};

    if (minWidth === null) {
      delete state.component.breakpoints[name];
    } else {
      state.component.breakpoints[name] = minWidth;
    }
    return { rebuildComponentTree: false };
  },

  'component.setDocumentProperty': (state, payload) => {
    const { property, value } = payload as { property: string; value: unknown };
    if (value === null) {
      delete state.component[property];
    } else {
      // Normalize bind paths in tree to strip repeat indices
      if (property === 'tree' && value && typeof value === 'object') {
        const normalizeBinds = (node: Record<string, unknown>) => {
          if (typeof node.bind === 'string') {
            node.bind = normalizeIndexedPath(node.bind);
          }
          if (Array.isArray(node.children)) {
            for (const child of node.children) {
              if (child && typeof child === 'object') normalizeBinds(child as Record<string, unknown>);
            }
          }
        };
        normalizeBinds(value as Record<string, unknown>);
      }
      state.component[property] = value;
    }
    return { rebuildComponentTree: false };
  },
} satisfies Record<string, CommandHandler>;
