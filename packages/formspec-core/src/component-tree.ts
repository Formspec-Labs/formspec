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
