/** @filedesc Typed access to editable component tree nodes in project state. */
import type { ProjectState } from './types.js';
import { getEditableComponentDocument, getCurrentComponentDocument } from './component-documents.js';

/** Minimal shape of nodes in an editable component tree (ingress boundary). */
export interface EditableComponentNode {
  bind?: string;
  type?: string;
  children?: EditableComponentNode[];
  [key: string]: unknown;
}

export function editableComponentTree(state: ProjectState): EditableComponentNode | undefined {
  const tree = getEditableComponentDocument(state).tree;
  if (tree === undefined || tree === null) return undefined;
  return tree as EditableComponentNode;
}

export function currentComponentTree(state: ProjectState): EditableComponentNode | undefined {
  const tree = getCurrentComponentDocument(state).tree;
  if (tree === undefined || tree === null) return undefined;
  return tree as EditableComponentNode;
}

export function walkComponentTree(
  root: EditableComponentNode,
  visit: (node: EditableComponentNode) => void,
): void {
  // Breadth-first; an index cursor, not queue.shift(), keeps the walk linear.
  const queue: EditableComponentNode[] = [root];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    visit(node);
    if (node.children?.length) queue.push(...node.children);
  }
}

const bindIndexes = new WeakMap<EditableComponentNode, ReadonlyMap<string, EditableComponentNode>>();

/**
 * The first node, in {@link walkComponentTree} order, bound to each `bind` value — built
 * once per tree root. Root identity is the version: dispatch edits a structuredClone and a
 * rebuild installs a new root, so a committed tree never changes under its index. Use it
 * for queries over committed state, never over a tree a handler is still mutating.
 */
export function componentNodesByBind(root: EditableComponentNode): ReadonlyMap<string, EditableComponentNode> {
  let index = bindIndexes.get(root);
  if (!index) {
    const byBind = new Map<string, EditableComponentNode>();
    walkComponentTree(root, node => {
      if (node.bind && !byBind.has(node.bind)) byBind.set(node.bind, node);
    });
    index = byBind;
    bindIndexes.set(root, index);
  }
  return index;
}

/** Auto-incrementing counter for generating unique node IDs within a session. */
let nodeCounter = 0;

/**
 * Generate a unique node ID for unbound tree nodes.
 *
 * IDs are session-scoped monotonic strings of the form `node_1`, `node_2`, etc.
 * They provide stable addressing for layout/container nodes that have no
 * definition-level bind key.
 */
export function generateNodeId(): string {
  return `node_${++nodeCounter}`;
}
