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
  const queue: EditableComponentNode[] = [root];
  while (queue.length > 0) {
    const node = queue.shift()!;
    visit(node);
    if (node.children?.length) queue.push(...node.children);
  }
}
