/**
 * Component tree structure handlers.
 *
 * These handlers implement the `component.*` tree-manipulation commands defined
 * in the API spec's "Component -- Tree Structure" section. They operate on the
 * component document's `tree` -- a recursive node structure that describes how
 * definition items are laid out and rendered.
 *
 * **Node referencing (NodeRef):**
 * Every tree node is addressed by a `NodeRef`, which is an object carrying
 * exactly one of:
 * - `{ bind: string }` -- for nodes bound to a definition item key (Input,
 *   Display, and some Special components).
 * - `{ nodeId: string }` -- for unbound layout/container nodes that receive a
 *   stable auto-generated ID.
 *
 * **Parent/child relationships:**
 * The tree root is always a synthetic `Stack` node with `nodeId: 'root'`.
 * Layout and Container nodes may have `children`; Input and Display nodes
 * are leaf nodes. Nesting rules (component-spec S3.4) are enforced by
 * `addNode` and `moveNode` at a higher level; these handlers perform the
 * raw structural mutations.
 *
 * @module handlers/component-tree
 */
import type { CommandHandler } from '../types.js';
import { normalizeIndexedPath } from '@formspec-org/engine/fel-runtime';
import { reconcileComponentTree } from '../tree-reconciler.js';
import { type TreeNode, ensureTree } from './tree-utils.js';

/** Auto-incrementing counter for generating unique node IDs within a session. */
let nodeCounter = 0;

/**
 * Generate a unique node ID for unbound tree nodes.
 *
 * IDs are session-scoped monotonic strings of the form `node_1`, `node_2`, etc.
 * They provide stable addressing for layout/container nodes that have no
 * definition-level bind key.
 *
 * @returns A unique node identifier string.
 */
function generateNodeId(): string {
  return `node_${++nodeCounter}`;
}

/**
 * Find a node in the tree by its NodeRef, returning the node together with its
 * parent and position index within the parent's children array.
 *
 * Uses an iterative depth-first search. Matching is performed by `nodeId`
 * (preferred) or `bind` key, reflecting the two addressing modes of NodeRef.
 *
 * When the root node itself matches, `index` is returned as `-1` and `parent`
 * points to the root. Callers that need to splice must check for `index === -1`
 * to avoid operating on the root (which cannot be removed or reordered).
 *
 * @param root - The tree root node to search from.
 * @param ref - A NodeRef identifying the target node by `bind` or `nodeId`.
 * @returns An object `{ parent, index, node }` if found, or `undefined`.
 */
function findNode(
  root: TreeNode,
  ref: { bind?: string; nodeId?: string },
): { parent: TreeNode; index: number; node: TreeNode } | undefined {
  // Check if root itself matches
  if (ref.nodeId && root.nodeId === ref.nodeId) {
    return { parent: root, index: -1, node: root };
  }
  if (ref.bind && root.bind === ref.bind) {
    return { parent: root, index: -1, node: root };
  }

  const stack: TreeNode[] = [root];
  while (stack.length) {
    const parent = stack.pop()!;
    const children = parent.children ?? [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (ref.nodeId && child.nodeId === ref.nodeId) {
        return { parent, index: i, node: child };
      }
      if (ref.bind && child.bind === ref.bind) {
        return { parent, index: i, node: child };
      }
      stack.push(child);
    }
  }
  return undefined;
}

/**
 * Find the parent node and index whose `children[index]` is the given `target`.
 * Used to reparent when reordering past the end of a sibling list (outdent).
 */
function findParentContainingChild(
  root: TreeNode,
  target: TreeNode,
): { parent: TreeNode; index: number } | undefined {
  const children = root.children ?? [];
  for (let i = 0; i < children.length; i++) {
    if (children[i] === target) return { parent: root, index: i };
    const nested = findParentContainingChild(children[i], target);
    if (nested) return nested;
  }
  return undefined;
}

export const componentTreeHandlers = {

  /**
   * Rebuild bound/display nodes from the current definition while preserving
   * layout wrappers (Page, Card, etc.). Used when a node was removed from the
   * tree but the definition item still exists — e.g. Layout "Remove from Tree"
   * followed by placing the item on a page again.
   */
  'component.reconcileFromDefinition': (state) => {
    state.component.tree = reconcileComponentTree(
      state.definition,
      state.component.tree,
    );
    return { rebuildComponentTree: false };
  },

  'component.addNode': (state, payload) => {
    const p = payload as {
      parent: { bind?: string; nodeId?: string };
      insertIndex?: number;
      component: string;
      bind?: string;
      props?: Record<string, unknown>;
    };

    const root = ensureTree(state);
    const parentResult = findNode(root, p.parent);
    if (!parentResult) throw new Error(`Parent node not found`);

    const parentNode = parentResult.node;
    if (!parentNode.children) parentNode.children = [];

    const node: TreeNode = { component: p.component };
    if (p.bind) {
      node.bind = normalizeIndexedPath(p.bind);
    } else {
      node.nodeId = generateNodeId();
      node._layout = true;
    }
    if (p.props) {
      Object.assign(node, p.props);
    }

    if (p.insertIndex !== undefined) {
      parentNode.children.splice(p.insertIndex, 0, node);
    } else {
      parentNode.children.push(node);
    }

    const nodeRef = node.bind ? { bind: node.bind } : { nodeId: node.nodeId! };
    return { rebuildComponentTree: false, nodeRef };
  },

  'component.deleteNode': (state, payload) => {
    const { node: ref } = payload as { node: { bind?: string; nodeId?: string } };
    const root = ensureTree(state);
    const result = findNode(root, ref);
    if (!result || result.index === -1) throw new Error('Node not found');

    result.parent.children!.splice(result.index, 1);
    return { rebuildComponentTree: false };
  },

  'component.moveNode': (state, payload) => {
    const { source, targetParent, targetIndex } = payload as {
      source: { bind?: string; nodeId?: string };
      targetParent: { bind?: string; nodeId?: string };
      targetIndex?: number;
    };

    const root = ensureTree(state);

    // Resolve both before any mutation
    const sourceResult = findNode(root, source);
    if (!sourceResult || sourceResult.index === -1) throw new Error('Source node not found');
    const targetResult = findNode(root, targetParent);
    if (!targetResult) throw new Error('Target parent not found');

    // Guard: target must not be the source itself or inside the source subtree
    const stack: TreeNode[] = [sourceResult.node];
    while (stack.length) {
      const n = stack.pop()!;
      if (n === targetResult.node) {
        throw new Error('Circular move: cannot move a node into itself or its own descendant');
      }
      stack.push(...(n.children ?? []));
    }

    // Remove from current parent, insert into target
    const [node] = sourceResult.parent.children!.splice(sourceResult.index, 1);
    if (!targetResult.node.children) targetResult.node.children = [];
    if (targetIndex !== undefined) {
      targetResult.node.children.splice(targetIndex, 0, node);
    } else {
      targetResult.node.children.push(node);
    }

    return { rebuildComponentTree: false };
  },

  'component.reorderNode': (state, payload) => {
    const { node: ref, direction } = payload as {
      node: { bind?: string; nodeId?: string };
      direction: 'up' | 'down';
    };

    const root = ensureTree(state);
    const result = findNode(root, ref);
    if (!result || result.index === -1) throw new Error('Node not found');

    const parent = result.parent;
    const children = parent.children!;
    const idx = result.index;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;

    if (targetIdx >= 0 && targetIdx < children.length) {
      [children[idx], children[targetIdx]] = [children[targetIdx], children[idx]];
      return { rebuildComponentTree: false };
    }

    // Outdent: no adjacent sibling in that direction — move into the grandparent's
    // child list before/after the current parent (layout canvas "move out" of a wrapper).
    const grand = findParentContainingChild(root, parent);
    if (!grand) return { rebuildComponentTree: false };

    if (direction === 'down' && idx === children.length - 1) {
      const [node] = children.splice(idx, 1);
      grand.parent.children!.splice(grand.index + 1, 0, node);
      return { rebuildComponentTree: false };
    }
    if (direction === 'up' && idx === 0) {
      const [node] = children.splice(idx, 1);
      grand.parent.children!.splice(grand.index, 0, node);
      return { rebuildComponentTree: false };
    }

    return { rebuildComponentTree: false };
  },

  'component.duplicateNode': (state, payload) => {
    const { node: ref } = payload as { node: { bind?: string; nodeId?: string } };

    const root = ensureTree(state);
    const result = findNode(root, ref);
    if (!result || result.index === -1) throw new Error('Node not found');

    const clone = structuredClone(result.node);

    // Assign new nodeIds to all unbound nodes in the clone
    const reId = (n: TreeNode) => {
      if (n.nodeId) n.nodeId = generateNodeId();
      if (n.children) n.children.forEach(reId);
    };
    reId(clone);

    result.parent.children!.splice(result.index + 1, 0, clone);

    const nodeRef = clone.bind ? { bind: clone.bind } : { nodeId: clone.nodeId! };
    return { rebuildComponentTree: false, nodeRef };
  },

  'component.wrapNode': (state, payload) => {
    const { node: ref, wrapper } = payload as {
      node: { bind?: string; nodeId?: string };
      wrapper: { component: string; props?: Record<string, unknown> };
    };

    const root = ensureTree(state);
    const result = findNode(root, ref);
    if (!result || result.index === -1) throw new Error('Node not found');

    // Remove the target node
    const [targetNode] = result.parent.children!.splice(result.index, 1);

    // Create wrapper node (layout container -- must have _layout flag for rebuild preservation)
    const wrapperNode: TreeNode = { component: wrapper.component, nodeId: generateNodeId(), _layout: true, children: [targetNode] };
    if (wrapper.props) Object.assign(wrapperNode, wrapper.props);

    // Insert wrapper at same position
    result.parent.children!.splice(result.index, 0, wrapperNode);

    return { rebuildComponentTree: false, nodeRef: { nodeId: wrapperNode.nodeId! } };
  },

  /**
   * Wrap several sibling nodes in one layout container, preserving their relative order.
   * Resolves all targets before mutating; removes from highest index downward so indices stay valid.
   */
  'component.wrapSiblingNodes': (state, payload) => {
    const { nodes: rawRefs, wrapper } = payload as {
      nodes: Array<{ bind?: string; nodeId?: string }>;
      wrapper: { component: string; props?: Record<string, unknown> };
    };

    const refKey = (r: { bind?: string; nodeId?: string }) =>
      r.bind != null && r.bind !== '' ? `b:${r.bind}` : `n:${r.nodeId ?? ''}`;

    const seen = new Set<string>();
    const refs = rawRefs.filter((r) => {
      const k = refKey(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (refs.length < 2) throw new Error('wrapSiblingNodes requires at least two distinct nodes');

    const root = ensureTree(state);
    const results = refs.map((ref) => {
      const r = findNode(root, ref);
      if (!r || r.index === -1) throw new Error('Node not found');
      return r;
    });

    const parent = results[0].parent;
    for (const r of results) {
      if (r.parent !== parent) {
        throw new Error('Nodes are not siblings');
      }
    }

    const sortedAsc = [...results].sort((a, b) => a.index - b.index);
    const insertIdx = sortedAsc[0].index;
    const sortedDesc = [...sortedAsc].reverse();

    const extracted: TreeNode[] = [];
    for (const r of sortedDesc) {
      const [n] = parent.children!.splice(r.index, 1);
      extracted.unshift(n);
    }

    const wrapperNode: TreeNode = {
      component: wrapper.component,
      nodeId: generateNodeId(),
      _layout: true,
      children: extracted,
    };
    if (wrapper.props) Object.assign(wrapperNode, wrapper.props);

    parent.children!.splice(insertIdx, 0, wrapperNode);

    return { rebuildComponentTree: false, nodeRef: { nodeId: wrapperNode.nodeId! } };
  },

  'component.unwrapNode': (state, payload) => {
    const { node: ref } = payload as { node: { bind?: string; nodeId?: string } };

    const root = ensureTree(state);
    const result = findNode(root, ref);
    if (!result || result.index === -1) throw new Error('Node not found');

    const children = result.node.children ?? [];

    // Remove wrapper, insert children at its position
    result.parent.children!.splice(result.index, 1, ...children);

    return { rebuildComponentTree: false };
  },
} satisfies Record<string, CommandHandler>;
