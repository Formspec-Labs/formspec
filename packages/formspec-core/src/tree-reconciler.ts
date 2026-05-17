/** @filedesc Rebuilds the component tree to mirror the definition item hierarchy. */
import type { FormDefinition, FormItem } from '@formspec-org/types';
import { widgetTokenToComponent } from '@formspec-org/types';

/** Component tree node shape used in generated layout documents. */
type TreeNode = {
  component: string;
  bind?: string;
  nodeId?: string;
  children?: TreeNode[];
  /**
   * Absolute definition path for this item (e.g. `page1.contact.email`). Studio-only
   * authoring metadata — stripped on component export. Disambiguates duplicate leaf
   * `bind` / display `nodeId` values across pages and layout wrappers.
   */
  definitionItemPath?: string;
  [k: string]: unknown;
};

/** Snapshot of a layout wrapper and its position before rebuild. */
interface WrapperSnapshot {
  wrapper: TreeNode;
  parentRef: { bind?: string; nodeId?: string };
  position: number;
  wasLast: boolean;
}

function isLayoutWrapper(node: TreeNode): boolean {
  return !!node._layout || node.component === 'Page';
}

/** Component types that allow `children` per the component schema. */
const CONTAINER_COMPONENTS = new Set([
  'Accordion', 'Card', 'Collapsible', 'Columns', 'ConditionalGroup',
  'Grid', 'Modal', 'Page', 'Panel', 'Popover', 'Stack', 'Tabs',
]);

/**
 * Determine the default component type for a definition item.
 * Maps item types to sensible widget defaults: field -> TextInput,
 * group -> Stack, display -> Text.
 */
export function defaultComponentType(item: FormItem): string {
  switch (item.type) {
    case 'field':
      if (item.optionSet || Array.isArray(item.options)) return 'Select';
      switch (item.dataType) {
        case 'choice': return 'Select';
        case 'multiChoice': return 'CheckboxGroup';
        case 'boolean': return 'Toggle';
        case 'integer':
        case 'decimal': return 'NumberInput';
        case 'date':
        case 'dateTime':
        case 'time': return 'DatePicker';
        case 'money': return 'MoneyInput';
        case 'attachment': return 'FileUpload';
        default: return 'TextInput';
      }
    case 'group': return item.repeatable ? 'Accordion' : 'Stack';
    case 'display': return 'Text';
    default: return 'TextInput';
  }
}

/**
 * Rebuild the component tree to mirror the definition item hierarchy.
 *
 * Pure function — takes all inputs as arguments, returns the new tree root.
 * Preserves existing bound node properties (widget overrides, styles) and
 * unbound layout nodes (re-inserted at original positions).
 *
 * The algorithm:
 *   1. Snapshot layout wrappers (_layout: true) with their full subtrees.
 *   2. Collect existing bound/display nodes by path, rebuild from definition.
 *   3. Build a flat Stack root with all definition-derived nodes.
 *   4. Re-insert layout wrappers (including Page nodes) at original positions.
 */
export function reconcileComponentTree(
  definition: FormDefinition,
  currentTree: unknown | undefined,
): TreeNode {
  const tree = (currentTree as TreeNode) ?? { component: 'Stack', nodeId: 'root', children: [] };

  // ── Phase 1: Snapshot top-level layout wrappers ──
  const wrapperSnapshots: WrapperSnapshot[] = [];

  const snapshotWrappers = (parent: TreeNode) => {
    const children = parent.children ?? [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (isLayoutWrapper(child)) {
        wrapperSnapshots.push({
          wrapper: structuredClone(child),
          parentRef: parent.bind ? { bind: parent.bind } : { nodeId: parent.nodeId! },
          position: i,
          wasLast: i === children.length - 1,
        });
      } else if (child.children) {
        snapshotWrappers(child);
      }
    }
  };
  snapshotWrappers(tree);

  // ── Phase 2: Collect existing bound/display nodes ──
  const existingBound = new Map<string, TreeNode>();
  const existingDisplay = new Map<string, TreeNode>();

  const collectExisting = (node: TreeNode, parentPath = '') => {
    for (const child of node.children ?? []) {
      if (isLayoutWrapper(child)) {
        const collectDeep = (n: TreeNode, path: string) => {
          for (const c of n.children ?? []) {
            if (c.bind) {
              const cPath = path ? `${path}.${c.bind}` : c.bind;
              existingBound.set(cPath, c);
              collectDeep(c, cPath);
            } else if (c.nodeId && !c._layout) {
              const cPath = path ? `${path}.${c.nodeId}` : c.nodeId;
              existingDisplay.set(cPath, c);
            } else if (isLayoutWrapper(c)) {
              collectDeep(c, path);
            }
          }
        };
        collectDeep(child, parentPath);
      } else if (child.bind) {
        const path = parentPath ? `${parentPath}.${child.bind}` : child.bind;
        existingBound.set(path, child);
        if (child.children) collectExisting(child, path);
      } else if (child.nodeId) {
        const path = parentPath ? `${parentPath}.${child.nodeId}` : child.nodeId;
        existingDisplay.set(path, child);
      }
    }
  };
  collectExisting(tree);

  // ── Collect display paths with calculate binds ──
  const calculatedDisplayPaths = new Set<string>();
  const bindsArray: Array<{ path?: string; calculate?: string }> = Array.isArray(definition.binds)
    ? definition.binds
    : definition.binds && typeof definition.binds === 'object'
      ? Object.entries(definition.binds as Record<string, unknown>).map(([path, value]) => ({ path, ...(value as object) }))
      : [];
  for (const bind of bindsArray) {
    if (bind.calculate && bind.path) {
      calculatedDisplayPaths.add(bind.path);
    }
  }

  // ── Build nodes from definition items ──
  // Returns an array: normally [node], but non-container components with
  // definition children emit those children as siblings instead of nesting.
  const buildNodes = (item: FormItem, parentPath = ''): TreeNode[] => {
    const itemPath = parentPath ? `${parentPath}.${item.key}` : item.key;
    let node: TreeNode;

    if (item.type === 'display') {
      const hasCalculate = calculatedDisplayPaths.has(itemPath);
      if (hasCalculate) {
        // Bind the display node so the webcomponent subscribes to the engine signal
        const existing = existingBound.get(itemPath);
        if (existing) {
          node = { ...existing, text: item.label ?? '' };
          existingBound.delete(itemPath);
        } else {
          const hintComponent = widgetTokenToComponent(item.presentation?.widgetHint);
          node = { component: hintComponent ?? 'Text', bind: item.key, text: item.label ?? '' };
        }
      } else {
        const existing = existingDisplay.get(itemPath);
        if (existing) {
          node = { ...existing, text: item.label ?? '' };
          existingDisplay.delete(itemPath);
        } else {
          node = { component: 'Text', nodeId: item.key, text: item.label ?? '' };
        }
      }
    } else {
      const existing = existingBound.get(itemPath);
      const hintComponent = widgetTokenToComponent(item.presentation?.widgetHint);
      if (existing) {
        node = { ...existing };
        // Update component if widgetHint resolves to a different component
        if (hintComponent && existing.component !== hintComponent) {
          node.component = hintComponent;
        }
      } else {
        node = { component: hintComponent ?? defaultComponentType(item), bind: item.key };
      }
    }

    node.definitionItemPath = itemPath;

    if (item.children && item.children.length > 0) {
      const childNodes = item.children.flatMap(child => buildNodes(child, itemPath));
      if (CONTAINER_COMPONENTS.has(node.component)) {
        node.children = childNodes;
      } else {
        // Non-container component (e.g. RadioGroup): emit children as siblings
        delete node.children;
        return [node, ...childNodes];
      }
    } else if (item.type === 'group') {
      node.children = [];
    } else {
      delete node.children;
    }

    return [node];
  };

  const builtNodes: TreeNode[] = definition.items.flatMap(item => buildNodes(item));

  // Root is always Stack. Page structure is authored by page handlers
  // and preserved via the _layout snapshot/restore mechanism above.
  let newRoot: TreeNode = { component: 'Stack', nodeId: 'root', children: builtNodes };

  // ── Phase 3: Re-insert layout wrappers ──
  /**
   * DFS queues of definition-bound nodes on `newRoot`, in visit order. Used when a
   * layout-wrapper clone still has leaf `bind` / `nodeId` but no `definitionItemPath`
   * (e.g. first reconcile after import): consume the next queue entry so duplicate
   * keys map to the same order as the rebuilt flat tree.
   */
  function buildExtractionQueues(root: TreeNode): {
    byBind: Map<string, TreeNode[]>;
    byNodeId: Map<string, TreeNode[]>;
  } {
    const byBind = new Map<string, TreeNode[]>();
    const byNodeId = new Map<string, TreeNode[]>();
    const push = (map: Map<string, TreeNode[]>, key: string, node: TreeNode) => {
      const arr = map.get(key) ?? [];
      arr.push(node);
      map.set(key, arr);
    };
    /** Do not queue nodes already sitting under a layout wrapper (they were extracted). */
    const walk = (n: TreeNode, underLayoutWrapper: boolean) => {
      for (const c of n.children ?? []) {
        const nextUnderLayout = underLayoutWrapper || isLayoutWrapper(c);
        if (!nextUnderLayout) {
          // Skip schema containers (groups, etc.): only leaf-like bound nodes participate
          // in duplicate-bind disambiguation for wrapper extraction.
          if (
            c.bind &&
            !isLayoutWrapper(c) &&
            typeof c.definitionItemPath === 'string' &&
            !CONTAINER_COMPONENTS.has(c.component)
          ) {
            push(byBind, c.bind, c);
          } else if (
            c.nodeId &&
            !c._layout &&
            !c.bind &&
            typeof c.definitionItemPath === 'string' &&
            !CONTAINER_COMPONENTS.has(c.component)
          ) {
            push(byNodeId, c.nodeId, c);
          }
        }
        if (c.children) walk(c, nextUnderLayout);
      }
    };
    walk(root, false);
    return { byBind, byNodeId };
  }

  const matchesRef = (n: TreeNode, ref: { bind?: string; nodeId?: string; definitionItemPath?: string }): boolean => {
    if (ref.nodeId && n.nodeId === ref.nodeId) {
      if (!ref.definitionItemPath || n.definitionItemPath === ref.definitionItemPath) return true;
      return false;
    }
    if (ref.bind && n.bind === ref.bind) {
      if (!ref.definitionItemPath || n.definitionItemPath === ref.definitionItemPath) return true;
    }
    return false;
  };

  const findInTree = (
    root: TreeNode,
    ref: { bind?: string; nodeId?: string; definitionItemPath?: string },
  ): { parent: TreeNode; index: number; node: TreeNode } | undefined => {
    if (ref.nodeId && root.nodeId === ref.nodeId) {
      if (matchesRef(root, ref)) return { parent: root, index: -1, node: root };
    }
    if (ref.bind && root.bind === ref.bind) {
      if (matchesRef(root, ref)) return { parent: root, index: -1, node: root };
    }
    const stack: TreeNode[] = [root];
    while (stack.length) {
      const p = stack.pop()!;
      for (let i = 0; i < (p.children?.length ?? 0); i++) {
        const c = p.children![i];
        if (ref.nodeId && c.nodeId === ref.nodeId) {
          if (matchesRef(c, ref)) return { parent: p, index: i, node: c };
        } else if (ref.bind && c.bind === ref.bind) {
          if (matchesRef(c, ref)) return { parent: p, index: i, node: c };
        }
        stack.push(c);
      }
    }
    return undefined;
  };

  const updateWrapperChildren = (
    wrapperNode: TreeNode,
    queues: ReturnType<typeof buildExtractionQueues>,
  ): void => {
    if (!wrapperNode.children) return;
    const updatedChildren: TreeNode[] = [];
    for (const child of wrapperNode.children) {
      if (isLayoutWrapper(child)) {
        updateWrapperChildren(child, queues);
        updatedChildren.push(child);
      } else if (child.bind) {
        let itemPath: string | undefined =
          typeof child.definitionItemPath === 'string' ? child.definitionItemPath : undefined;
        if (!itemPath) {
          const next = queues.byBind.get(child.bind)?.shift();
          itemPath = typeof next?.definitionItemPath === 'string' ? next.definitionItemPath : undefined;
        }
        const found = itemPath
          ? findInTree(newRoot, { bind: child.bind, definitionItemPath: itemPath })
          : findInTree(newRoot, { bind: child.bind });
        if (found && found.index !== -1) {
          const [extracted] = found.parent.children!.splice(found.index, 1);
          updatedChildren.push(extracted);
        }
      } else if (child.nodeId) {
        let itemPath: string | undefined =
          typeof child.definitionItemPath === 'string' ? child.definitionItemPath : undefined;
        if (!itemPath) {
          const next = queues.byNodeId.get(child.nodeId)?.shift();
          itemPath = typeof next?.definitionItemPath === 'string' ? next.definitionItemPath : undefined;
        }
        const found = itemPath
          ? findInTree(newRoot, { nodeId: child.nodeId, definitionItemPath: itemPath })
          : findInTree(newRoot, { nodeId: child.nodeId });
        if (found && found.index !== -1) {
          const [extracted] = found.parent.children!.splice(found.index, 1);
          updatedChildren.push(extracted);
        }
      }
    }
    wrapperNode.children = updatedChildren;
  };

  for (const snap of wrapperSnapshots) {
    const wrapperNode = snap.wrapper;
    const queues = buildExtractionQueues(newRoot);
    updateWrapperChildren(wrapperNode, queues);

    const parentResult = findInTree(newRoot, snap.parentRef);
    const parentNode = parentResult ? parentResult.node : newRoot;
    if (!parentNode.children) parentNode.children = [];

    const idx = snap.wasLast ? parentNode.children.length : Math.min(snap.position, parentNode.children.length);
    parentNode.children.splice(idx, 0, wrapperNode);
  }

  return newRoot;
}
