/** @filedesc Rebuilds the component tree to mirror the definition item hierarchy. */
import type { FormDefinition, FormItem } from '@formspec-org/types';
import { widgetTokenToComponent } from '@formspec-org/types';
import { bindTargetKey, normalizeBindsFromUnknown } from './definition-binds.js';

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
  /** Definition path the wrapper's children bind relative to: its nearest bound ancestors' binds. */
  enclosingPath: string;
  parentRef: { bind?: string; nodeId?: string; definitionItemPath?: string };
  position: number;
  wasLast: boolean;
}

function joinPath(prefix: string, key: string): string {
  return prefix ? `${prefix}.${key}` : key;
}

function isLayoutWrapper(node: TreeNode): boolean {
  return !!node._layout || node.component === 'Section';
}

/** Component types that allow `children` per the component schema. */
const CONTAINER_COMPONENTS = new Set([
  'Accordion', 'Card', 'Collapsible', 'ConditionalGroup',
  'Grid', 'Modal', 'Section', 'Panel', 'Popover', 'Stack', 'Tabs',
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
 * The component the reconciler generates for a field or group: the widgetHint's
 * component, else {@link defaultComponentType}.
 */
export function generatedComponentType(item: FormItem): string {
  return widgetTokenToComponent(item.presentation?.widgetHint) ?? defaultComponentType(item);
}

/** An item's generated widget before and after its shape changed. */
export interface GeneratedWidgetMove {
  from: string;
  to: string;
}

/**
 * Generated widget moves between two versions of an item tree: every field or group path
 * in both whose generated widget differs. Linear in the item count.
 */
export function generatedWidgetMoves(
  before: ReadonlyMap<string, FormItem>,
  after: ReadonlyMap<string, FormItem>,
): Map<string, GeneratedWidgetMove> {
  const moves = new Map<string, GeneratedWidgetMove>();
  for (const [path, old] of before) {
    const next = after.get(path);
    if (!next || old.type === 'display' || next.type === 'display') continue;
    const from = generatedComponentType(old);
    const to = generatedComponentType(next);
    if (from !== to) moves.set(path, { from, to });
  }
  return moves;
}

/**
 * The reconciler keeps an existing node's component, so a node still showing the widget
 * generated for an item's old shape (dataType, options, repeatable, widgetHint) would read
 * as authored once the shape changes — a TextInput pinned on a choice field, a Stack bound
 * to a repeatable group (component-spec §4.4). Such nodes take the new generated widget;
 * nodes showing any other widget are authored and stay. `moves` is keyed by definition
 * item path (a node's `definitionItemPath`). One walk of the tree.
 */
export function moveGeneratedWidgets(
  tree: unknown | undefined,
  moves: ReadonlyMap<string, GeneratedWidgetMove>,
): void {
  if (!tree || moves.size === 0) return;
  const queue: TreeNode[] = [tree as TreeNode];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    const move = typeof node.definitionItemPath === 'string' ? moves.get(node.definitionItemPath) : undefined;
    if (move && node.component === move.from) node.component = move.to;
    if (node.children?.length) queue.push(...node.children);
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
 *   4. Re-insert layout wrappers (including Section nodes) at original positions.
 */
export function reconcileComponentTree(
  definition: FormDefinition,
  currentTree: unknown | undefined,
): TreeNode {
  const tree = (currentTree as TreeNode) ?? { component: 'Stack', nodeId: 'root', children: [] };

  // ── Phase 1: Snapshot top-level layout wrappers ──
  const wrapperSnapshots: WrapperSnapshot[] = [];

  /** `path`: the definition path binds under `parent` are relative to (as {@link collectExisting} joins them). */
  const snapshotWrappers = (parent: TreeNode, path: string) => {
    const children = parent.children ?? [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (isLayoutWrapper(child)) {
        wrapperSnapshots.push({
          wrapper: structuredClone(child),
          enclosingPath: path,
          parentRef: parent.bind
            ? {
              bind: parent.bind,
              definitionItemPath: typeof parent.definitionItemPath === 'string' ? parent.definitionItemPath : path,
            }
            : { nodeId: parent.nodeId! },
          position: i,
          wasLast: i === children.length - 1,
        });
      } else if (child.children) {
        snapshotWrappers(child, child.bind ? joinPath(path, child.bind) : path);
      }
    }
  };
  snapshotWrappers(tree, '');

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

  // ── Collect item paths with calculate binds (`jobs[*].total` targets `jobs.total`) ──
  const calculatedDisplayPaths = new Set<string>();
  for (const bind of normalizeBindsFromUnknown(definition.binds) ?? []) {
    if (bind.calculate && typeof bind.path === 'string') {
      calculatedDisplayPaths.add(bindTargetKey(bind.path));
    }
  }

  // ── Build nodes from definition items ──
  // Returns an array: normally [node], but non-container components with
  // definition children emit those children as siblings instead of nesting.
  const buildNodes = (item: FormItem, parentPath = ''): TreeNode[] => {
    const itemPath = parentPath ? `${parentPath}.${item.key}` : item.key;
    let node: TreeNode;

    if (item.type === 'display') {
      // Every display node binds its Item: renderers resolve the live label (Locale,
      // `{{}}` interpolation) and Bind relevance through `bind`. Static displays also
      // keep `nodeId` — the node ref Studio addresses them by. Nodes from trees saved
      // before displays were bound sit in `existingDisplay` and are upgraded in place.
      const existing = existingBound.get(itemPath) ?? existingDisplay.get(itemPath);
      existingBound.delete(itemPath);
      existingDisplay.delete(itemPath);
      if (existing) {
        node = { ...existing, bind: item.key, text: item.label ?? '' };
        // An imported static display has no node ref yet; generation gives it the key.
        if (!node.nodeId && !calculatedDisplayPaths.has(itemPath)) node.nodeId = item.key;
      } else if (calculatedDisplayPaths.has(itemPath)) {
        const hintComponent = widgetTokenToComponent(item.presentation?.widgetHint);
        node = { component: hintComponent ?? 'Text', bind: item.key, text: item.label ?? '' };
      } else {
        node = { component: 'Text', bind: item.key, nodeId: item.key, text: item.label ?? '' };
      }
    } else {
      const existing = existingBound.get(itemPath);
      const hintComponent = widgetTokenToComponent(item.presentation?.widgetHint);
      if (existing) {
        // An imported node may bind a dotted path; in memory `bind` is the item key.
        node = { ...existing, bind: item.key };
        // Update component if widgetHint resolves to a different component
        if (hintComponent && existing.component !== hintComponent) {
          node.component = hintComponent;
        }
      } else {
        node = { component: generatedComponentType(item), bind: item.key };
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

  // Root is always Stack, keeping its authored props (gap, style, …). Page-mode
  // structure is authored by direct-root Sections and preserved via the _layout
  // snapshot/restore mechanism above.
  const { children: _previousChildren, ...rootProps } = tree;
  let newRoot: TreeNode = { ...rootProps, component: 'Stack', nodeId: 'root', children: builtNodes };

  // ── Phase 3: Re-insert layout wrappers ──
  // One index over `newRoot`, kept current as nodes move, instead of a tree walk per
  // wrapper and per wrapped child (O(wrappers × nodes)): each node's parent, the node for
  // each definition path, nodes by bind / nodeId in document order, and the queues below.
  // A move only re-points `parentOf`; sibling lists are rebuilt once at the end.
  const parentOf = new Map<TreeNode, TreeNode>();
  const byItemPath = new Map<string, TreeNode>();
  const byBind = new Map<string, TreeNode[]>();
  const byNodeId = new Map<string, TreeNode[]>();
  /**
   * Document-order queues of definition-bound leaf-like nodes, for a saved wrapper child
   * whose key resolves at no definition path under its wrapper: it takes the next node
   * still outside every wrapper, so duplicate keys map in the rebuilt tree's order. Schema containers (groups) do not take part. A display node
   * carries both `bind` and `nodeId` and queues under both: a saved wrapper child may
   * reference it by either.
   */
  const queueByBind = new Map<string, { nodes: TreeNode[]; head: number }>();
  const queueByNodeId = new Map<string, { nodes: TreeNode[]; head: number }>();
  const push = (map: Map<string, TreeNode[]>, key: string, node: TreeNode) => {
    const list = map.get(key);
    if (list) list.push(node);
    else map.set(key, [node]);
  };
  const enqueue = (map: Map<string, { nodes: TreeNode[]; head: number }>, key: string, node: TreeNode) => {
    const queue = map.get(key);
    if (queue) queue.nodes.push(node);
    else map.set(key, { nodes: [node], head: 0 });
  };
  const indexTree = (node: TreeNode) => {
    for (const child of node.children ?? []) {
      parentOf.set(child, node);
      const itemPath = typeof child.definitionItemPath === 'string' ? child.definitionItemPath : undefined;
      if (itemPath !== undefined && !byItemPath.has(itemPath)) byItemPath.set(itemPath, child);
      if (child.bind) push(byBind, child.bind, child);
      if (child.nodeId) push(byNodeId, child.nodeId, child);
      if (itemPath !== undefined && !CONTAINER_COMPONENTS.has(child.component)) {
        if (child.bind) enqueue(queueByBind, child.bind, child);
        if (child.nodeId) enqueue(queueByNodeId, child.nodeId, child);
      }
      indexTree(child);
    }
  };
  // The rebuilt tree holds no layout wrapper yet, so every indexed node starts outside one.
  indexTree(newRoot);

  /** Where a node sits now: in `newRoot` outside every layout wrapper, inside one, or not in `newRoot`. */
  const placement = (node: TreeNode): 'free' | 'wrapped' | 'detached' => {
    let wrapped = false;
    for (let current: TreeNode | undefined = node; current; current = parentOf.get(current)) {
      if (current === newRoot) return wrapped ? 'wrapped' : 'free';
      if (current !== node && isLayoutWrapper(current)) wrapped = true;
    }
    return 'detached';
  };

  const nextFree = (queue: { nodes: TreeNode[]; head: number } | undefined): TreeNode | undefined => {
    if (!queue) return undefined;
    while (queue.head < queue.nodes.length) {
      const node = queue.nodes[queue.head++];
      if (placement(node) === 'free') return node;
    }
    return undefined;
  };

  /** The node at a definition path, when it carries the reference's key and sits where `accept` allows. */
  const atPath = (
    itemPath: string | undefined,
    key: { bind?: string; nodeId?: string },
    accept: (node: TreeNode) => boolean,
  ): TreeNode | undefined => {
    const node = itemPath === undefined ? undefined : byItemPath.get(itemPath);
    const named = node && (key.nodeId ? node.nodeId === key.nodeId : node.bind === key.bind);
    return named && accept(node) ? node : undefined;
  };
  const isFree = (node: TreeNode) => placement(node) === 'free';
  const isAttached = (node: TreeNode) => placement(node) !== 'detached';

  /**
   * A wrapper child names a node outside every wrapper — never one an earlier wrapper took.
   * By its own definition path (in-memory trees), else the path its bind or node ref has
   * under the wrapper's enclosing path (imported trees), else — for a saved child whose key
   * does not resolve there — the next such node by key in document order.
   */
  const resolveWrapperChild = (child: TreeNode, enclosingPath: string): TreeNode | undefined => {
    const key = child.bind ? { bind: child.bind } : { nodeId: child.nodeId };
    if (typeof child.definitionItemPath === 'string') {
      const own = atPath(child.definitionItemPath, key, isFree);
      if (own) return own;
    }
    const nested = atPath(joinPath(enclosingPath, (child.bind ?? child.nodeId)!), key, isFree);
    if (nested) return nested;
    const queued = nextFree(child.bind ? queueByBind.get(child.bind) : queueByNodeId.get(child.nodeId!));
    if (queued) return queued;
    const candidates = key.nodeId ? byNodeId.get(key.nodeId) : byBind.get(key.bind!);
    return candidates?.find(isFree);
  };

  /** Moves resolved nodes into the wrapper by `parentOf` alone; sibling lists settle once, below. */
  const updateWrapperChildren = (wrapperNode: TreeNode, enclosingPath: string): void => {
    if (!wrapperNode.children) return;
    const updatedChildren: TreeNode[] = [];
    for (const child of wrapperNode.children) {
      let node: TreeNode | undefined;
      if (isLayoutWrapper(child)) {
        updateWrapperChildren(child, enclosingPath);
        node = child;
      } else if (child.bind || child.nodeId) {
        node = resolveWrapperChild(child, enclosingPath);
      }
      if (node) {
        parentOf.set(node, wrapperNode);
        updatedChildren.push(node);
      }
    }
    wrapperNode.children = updatedChildren;
  };

  /** Wrappers each rebuilt node receives, in snapshot order. */
  const insertsByParent = new Map<TreeNode, WrapperSnapshot[]>();
  for (const snap of wrapperSnapshots) {
    updateWrapperChildren(snap.wrapper, snap.enclosingPath);

    // The parent's definition path disambiguates duplicate group keys; a group that moved
    // since the snapshot is still found by key.
    const { parentRef } = snap;
    const parentNode = (parentRef.nodeId === newRoot.nodeId ? newRoot : undefined)
      ?? atPath(parentRef.definitionItemPath, parentRef, isAttached)
      ?? (parentRef.nodeId ? byNodeId.get(parentRef.nodeId) : byBind.get(parentRef.bind!))?.find(isAttached)
      ?? newRoot;
    parentOf.set(snap.wrapper, parentNode);
    const inserts = insertsByParent.get(parentNode);
    if (inserts) inserts.push(snap);
    else insertsByParent.set(parentNode, [snap]);
  }

  // Settle every sibling list in one walk of the final tree: keep the children still parented
  // there (a wrapper took the rest), then place each wrapper at its saved index among them —
  // appended when it was last or the list is now shorter, snapshot order on ties. A splice
  // per moved node and per wrapper instead cost O(wrappers × siblings) on a flat root.
  // Snapshots of one parent are already in index order, so the stable sort is one linear run.
  const target = (snap: WrapperSnapshot) => (snap.wasLast ? Number.MAX_SAFE_INTEGER : snap.position);
  const settle = (parent: TreeNode): void => {
    const inserts = insertsByParent.get(parent)?.sort((a, b) => target(a) - target(b));
    if (parent.children || inserts) {
      const kept = (parent.children ?? []).filter(child => parentOf.get(child) === parent);
      if (inserts) {
        const children: TreeNode[] = [];
        let next = 0;
        for (const snap of inserts) {
          while (next < kept.length && children.length < target(snap)) children.push(kept[next++]);
          children.push(snap.wrapper);
        }
        parent.children = children.concat(kept.slice(next));
      } else {
        parent.children = kept;
      }
    }
    for (const child of parent.children ?? []) settle(child);
  };
  settle(newRoot);

  return newRoot;
}
