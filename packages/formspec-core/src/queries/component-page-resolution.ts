/** @filedesc Resolves page structure from direct-root Section nodes. */
import type { TreeNode } from '../handlers/tree-utils.js';
import type {
  ResolvedRegion,
  ResolvedPage,
  ResolvedPageStructure,
} from '../page-resolution.js';

/**
 * Collect all `bind` values from a node's subtree (depth-first).
 * Nested Sections inside a page Section are ordinary containers.
 */
function collectBoundKeys(node: TreeNode): string[] {
  const keys: string[] = [];
  const stack: TreeNode[] = node.children ? [...node.children] : [];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.bind) keys.push(n.bind);
    if (n.children) stack.push(...n.children);
  }
  // Reverse to restore document order (stack reverses depth-first traversal)
  return keys.reverse();
}

/**
 * Collect all `bind` values from a node and its descendants.
 * Nested Sections under a non-page root child are ordinary containers, not
 * page-authority nodes, so their bound descendants remain unassigned.
 */
function collectBoundKeysIncludingNode(node: TreeNode): string[] {
  const keys: string[] = [];
  const stack: TreeNode[] = [node];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.bind) keys.push(n.bind);
    if (n.children) stack.push(...n.children);
  }
  return keys.reverse();
}

/**
 * Resolve page structure from the component tree.
 *
 * Walks the root node's direct children for `component: 'Section'` nodes.
 * Each Section's subtree is recursively searched for bound items (any node with a
 * `bind` property). Non-Section children of the root contribute unassigned items.
 *
 * @param tree - The root TreeNode (expected to be a Stack with nodeId 'root').
 * @param pageMode - The form's page mode ('single' | 'wizard' | 'tabs').
 * @param allItemKeys - All known definition item keys (used for `exists` checks
 *   and to identify keys absent from the tree entirely).
 */
export function resolvePageStructureFromTree(
  tree: TreeNode,
  pageMode: 'single' | 'wizard' | 'tabs',
  allItemKeys: string[],
): ResolvedPageStructure {
  const knownKeys = new Set(allItemKeys);
  const assignedKeys = new Set<string>();
  const itemPageMap: Record<string, string> = {};
  const pages: ResolvedPage[] = [];

  const rootChildren = tree.children ?? [];
  const pageNodes = tree.component === 'Section'
    ? [tree]
    : rootChildren.filter((child) => child.component === 'Section');

  // Pass 1: process Section nodes
  for (const child of pageNodes) {
    const pageId: string = (child.id as string) ?? (child.nodeId as string) ?? 'root';
    const title: string = (child.title as string) ?? '';

    // Build regions from all bound items within this Section.
    // Direct children with `bind` carry layout.grid metadata.
    // Items nested inside non-bind containers use default span=12.
    const regions: ResolvedRegion[] = [];
    const addRegion = (key: string, node?: TreeNode) => {
      const grid = node?.layout && typeof node.layout === 'object'
        ? (node.layout as { grid?: { span?: number; start?: number } }).grid
        : undefined;
      const regionSpan = typeof grid?.span === 'number' ? grid.span : 12;
      const region: ResolvedRegion = { key, span: regionSpan, exists: knownKeys.has(key) };
      if (typeof grid?.start === 'number') region.start = grid.start;
      if (node?.responsive && typeof node.responsive === 'object') {
        region.responsive = node.responsive as Record<string, { span?: number; start?: number; hidden?: boolean }>;
      }
      regions.push(region);
      assignedKeys.add(key);
      itemPageMap[key] = pageId;
    };
    const walkPageChildren = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.bind) {
          addRegion(n.bind, n);
          // Also associate deeply nested bound keys with this page
          for (const nested of collectBoundKeys(n)) {
            assignedKeys.add(nested);
            itemPageMap[nested] = pageId;
          }
        } else if (n.children) {
          walkPageChildren(n.children);
        }
      }
    };
    walkPageChildren(child.children ?? []);

    const resolvedPage: ResolvedPage = { id: pageId, title, regions };
    if (typeof child.description === 'string') {
      resolvedPage.description = child.description;
    }
    pages.push(resolvedPage);
  }

  // Pass 2: collect unassigned — bound keys in non-Section root children.
  const unassignedFromTree: string[] = tree.component === 'Section'
    ? []
    : rootChildren.flatMap((child) =>
      child.component === 'Section' ? [] : collectBoundKeysIncludingNode(child),
    );

  // Pass 3: keys in allItemKeys not encountered in the tree at all
  const treeUnassigned = new Set(unassignedFromTree);
  const unassignedItems: string[] = [...unassignedFromTree];
  for (const key of allItemKeys) {
    if (!assignedKeys.has(key) && !treeUnassigned.has(key)) {
      unassignedItems.push(key);
    }
  }

  return {
    mode: pageMode,
    pages,
    diagnostics: [],
    unassignedItems,
    itemPageMap,
  };
}
