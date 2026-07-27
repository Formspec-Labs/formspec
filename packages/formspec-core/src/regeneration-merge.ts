/**
 * @filedesc Regeneration merge — deterministic three-way merge that preserves designer edits across AI rebuilds.
 *
 * Implements `specs/component/regeneration-merge-spec.md` §2–§9 (Levels 1–3 of
 * §11: algorithm, report shape, invariants). Level 4 resolver composition is
 * NOT implemented here — the merge is report-only and never invokes the
 * Component / Component Reference Fields / Experience resolvers; that
 * composition belongs to the review surface that consumes `MergeReport`.
 *
 * The engine is document-family agnostic. §6 is written over "nodes carrying
 * `x-generation.anchors`", which is a Component shape, but the same three-way
 * algorithm is what a Surface regeneration needs. So identity, children, and
 * node-type live behind {@link MergeDocumentAdapter}: {@link componentMergeAdapter}
 * reads `x-generation.anchors[]`, {@link surfaceMergeAdapter} derives
 * `surface:` / `route:` / `slot:` anchors from the spec-required stable ids. The
 * conformance corpus (`tests/conformance/fixtures/regeneration-merge/`) runs
 * through the Component adapter; nothing in the algorithm is adapter-aware.
 *
 * No mutation: every input is read-only and both outputs are fresh documents.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Report shape — `schemas/regeneration-merge-report.schema.json` v1.0
// ─────────────────────────────────────────────────────────────────────────────

/** The complete `COMP-REGENERATION-*` code set (spec §7.2). */
export type MergeCode =
  | 'COMP-REGENERATION-NO-COMMON-ANCESTOR'
  | 'COMP-REGENERATION-DESIGNER-PRECEDES'
  | 'COMP-REGENERATION-DESIGNER-REMOVED'
  | 'COMP-REGENERATION-PROPERTY-CONFLICT'
  | 'COMP-REGENERATION-WIDGET-SWAP'
  | 'COMP-REGENERATION-DESIGNER-SURVIVED'
  | 'COMP-REGENERATION-REGENERATED'
  | 'COMP-REGENERATION-ORPHAN-NODE'
  | 'COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE'
  | 'COMP-REGENERATION-ORPHAN-DETACHED'
  | 'COMP-REGENERATION-RENAME-MIGRATED'
  | 'COMP-REGENERATION-PENDING-REVIEW';

export type MergeSeverity = 'error' | 'warning' | 'info';

/** One `MergeReport` record. `nodePath` is a JSON Pointer into `merged`. */
export interface MergeEntry {
  anchors: string[];
  nodePath: string;
  code: MergeCode;
  severity: MergeSeverity;
  reason: string;
  propertyDeltas?: string[];
}

/** An `orphaned[]` record — carries the §8.3 reattachment metadata. */
export interface OrphanEntry extends MergeEntry {
  reattachedTo: string;
  cascaded: boolean;
  detached: boolean;
}

export interface MergeReport {
  version: '1.0';
  surviving: MergeEntry[];
  regenerated: MergeEntry[];
  orphaned: OrphanEntry[];
  pendingReview: MergeEntry[];
  conflicts: MergeEntry[];
}

/** The §9.1 `$formspecAnchorMappings` input. `kind` is tolerated, never read. */
export interface AnchorMappingsInput {
  $formspecAnchorMappings?: string;
  anchorMappings?: ReadonlyArray<{ from: string; to: string; kind?: string }>;
}

/**
 * §2.2 `RegenerationMergeContext`. The peer documents are carried for
 * downstream resolver composition (§11.5) and are never read by the algorithm.
 */
export interface RegenerationMergeContext {
  anchorMappings?: AnchorMappingsInput | null;
  definition?: unknown;
  experience?: unknown;
  responseActions?: unknown;
  registry?: unknown;
  ontology?: unknown;
  hostPolicy?: unknown;
}

export interface RegenerationMergeInputs<TDoc> {
  /** The §2.4 common ancestor. `null`/`undefined` degrades to fresh generation. */
  oldGenerated: TDoc | null | undefined;
  designerEdited: TDoc;
  newGenerated: TDoc;
}

export interface RegenerationMergeResult<TDoc> {
  merged: TDoc;
  report: MergeReport;
}

/** Thrown when an input document fails the adapter's §2.1 admission gate. */
export class RegenerationMergeInputError extends Error {
  readonly role: string;
  constructor(message: string, role: string) {
    super(message);
    this.name = 'RegenerationMergeInputError';
    this.role = role;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Document adapter — the one seam between §6 and a document family
// ─────────────────────────────────────────────────────────────────────────────

export type MergeNode = Record<string, unknown>;

export interface MergeDocumentAdapter<TDoc> {
  /** Family name, quoted into report reasons. */
  readonly name: string;
  /** JSON Pointer of the merged root node. */
  readonly rootPointer: string;
  /** Node-local pointer of the anchor array, when the family stores one. */
  readonly anchorsPointer?: string;
  /** Node-local property carrying the widget type (§6.5 widget swap). */
  readonly typeKey?: string;
  root(doc: TDoc): MergeNode | undefined;
  /** Rebuild a document from `newGenerated`'s doc-level members + merged root. */
  document(newGenerated: TDoc, mergedRoot: MergeNode): TDoc;
  /** Child-array property at this depth, or undefined at a leaf level. */
  childrenKey(node: MergeNode, depth: number): string | undefined;
  /** Raw anchor strings for merge identity (normalized by §3.1 downstream). */
  anchors(node: MergeNode, depth: number): unknown;
  /** §3.3 stable local discriminator for same-parent duplicate anchor sets. */
  discriminator(node: MergeNode): string | undefined;
  /** §2.1 admission gate. Throws {@link RegenerationMergeInputError}. */
  assertInput?(doc: TDoc, role: string): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON helpers
// ─────────────────────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    return ak.length === bk.length
      && ak.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function escapePointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

function unescapePointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function pointerTokens(pointer: string): string[] {
  return pointer.split('/').slice(1).map(unescapePointerToken);
}

/** Join a parent pointer with child steps, tolerating a `/` document root. */
function joinPointer(parent: string, ...steps: Array<string | number>): string {
  const base = parent === '/' ? '' : parent;
  return `${base}${steps.map(s => `/${escapePointerToken(String(s))}`).join('')}`;
}

interface Slot {
  present: boolean;
  value: unknown;
}

function readPointer(node: MergeNode | undefined, pointer: string): Slot {
  if (node === undefined) return { present: false, value: undefined };
  let cursor: unknown = node;
  for (const token of pointerTokens(pointer)) {
    if (!isPlainObject(cursor) || !Object.prototype.hasOwnProperty.call(cursor, token)) {
      return { present: false, value: undefined };
    }
    cursor = cursor[token];
  }
  return { present: true, value: cursor };
}

function writePointer(node: MergeNode, pointer: string, slot: Slot): void {
  const tokens = pointerTokens(pointer);
  const last = tokens.pop();
  if (last === undefined) return;
  let cursor: Record<string, unknown> = node;
  for (const token of tokens) {
    const next = cursor[token];
    if (!isPlainObject(next)) {
      if (!slot.present) return;
      const fresh: Record<string, unknown> = {};
      cursor[token] = fresh;
      cursor = fresh;
      continue;
    }
    cursor = next;
  }
  if (slot.present) cursor[last] = clone(slot.value);
  else delete cursor[last];
}

function slotEqual(a: Slot, b: Slot): boolean {
  return a.present === b.present && deepEqual(a.value, b.value);
}

/**
 * Node-local pointer diff. Recurses through plain objects so a changed
 * `x-generation.source` reports as `/x-generation/source` rather than as a
 * whole-object delta; arrays compare atomically (§5.2 — array order is
 * significant).
 */
function collectPointerDiffs(
  a: MergeNode | undefined,
  b: MergeNode | undefined,
  prefix: string,
  skipTopLevel: ReadonlySet<string>,
  out: Set<string>,
): void {
  const keys = new Set<string>([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const key of keys) {
    if (prefix === '' && skipTopLevel.has(key)) continue;
    const av = a?.[key];
    const bv = b?.[key];
    const pointer = `${prefix}/${escapePointerToken(key)}`;
    if (isPlainObject(av) && isPlainObject(bv)) {
      collectPointerDiffs(av, bv, pointer, skipTopLevel, out);
      continue;
    }
    if (!deepEqual(av, bv)) out.add(pointer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 — source-anchor identity
// ─────────────────────────────────────────────────────────────────────────────

/** §3.1 — string-only, duplicate-stripped, bytewise-sorted anchor set. */
export function computeAnchorSet(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<string>();
  for (const item of raw) if (typeof item === 'string') set.add(item);
  return [...set].sort();
}

interface AnchorSubstitution {
  map: ReadonlyMap<string, string>;
  /** `from` anchors mapped to more than one `to` — §9.2 makes them ambiguous. */
  conflicting: ReadonlySet<string>;
}

const IDENTITY_SUBSTITUTION: AnchorSubstitution = { map: new Map(), conflicting: new Set() };

function buildSubstitution(input: AnchorMappingsInput | null | undefined): AnchorSubstitution {
  const targets = new Map<string, Set<string>>();
  for (const entry of input?.anchorMappings ?? []) {
    if (typeof entry?.from !== 'string' || typeof entry?.to !== 'string') continue;
    const seen = targets.get(entry.from) ?? new Set<string>();
    seen.add(entry.to);
    targets.set(entry.from, seen);
  }
  const map = new Map<string, string>();
  const conflicting = new Set<string>();
  for (const [from, tos] of targets) {
    if (tos.size === 1) map.set(from, [...tos][0]!);
    else conflicting.add(from);
  }
  return { map, conflicting };
}

/** §9.2 — one-pass, non-transitive anchor substitution. */
function substitute(
  anchors: string[],
  sub: AnchorSubstitution,
): { anchors: string[]; ambiguous: boolean; changed: boolean } {
  let ambiguous = false;
  let changed = false;
  const out = new Set<string>();
  for (const anchor of anchors) {
    if (sub.conflicting.has(anchor)) ambiguous = true;
    const mapped = sub.map.get(anchor);
    if (mapped !== undefined && mapped !== anchor) changed = true;
    out.add(mapped ?? anchor);
  }
  return { anchors: [...out].sort(), ambiguous, changed };
}

// ─────────────────────────────────────────────────────────────────────────────
// §6.3 — match indexes
// ─────────────────────────────────────────────────────────────────────────────

interface IndexedNode {
  node: MergeNode;
  depth: number;
  parent: IndexedNode | null;
  childrenKey: string | undefined;
  children: IndexedNode[];
  /** §3.1 anchor set after §9 substitution. Empty ⇒ UNMATCHABLE. */
  anchors: string[];
  /** True when §9 substitution changed this node's anchor set. */
  renamed: boolean;
  /** §9.2 conflicting-mapping ambiguity. */
  mappingAmbiguous: boolean;
  rawKey: string | null;
  key: string | null;
}

class MatchIndex {
  readonly nodes: IndexedNode[] = [];
  private readonly byKey = new Map<string, IndexedNode[]>();

  constructor(
    private readonly adapter: MergeDocumentAdapter<unknown>,
    root: MergeNode | undefined,
    private readonly sub: AnchorSubstitution,
  ) {
    if (root !== undefined) this.walk(root, 0, null);
    this.assignKeys();
  }

  get root(): IndexedNode | undefined {
    return this.nodes[0];
  }

  private walk(node: MergeNode, depth: number, parent: IndexedNode | null): void {
    const mapped = substitute(computeAnchorSet(this.adapter.anchors(node, depth)), this.sub);
    const childrenKey = this.adapter.childrenKey(node, depth);
    const indexed: IndexedNode = {
      node,
      depth,
      parent,
      childrenKey,
      children: [],
      anchors: mapped.anchors,
      renamed: mapped.changed,
      mappingAmbiguous: mapped.ambiguous,
      rawKey: mapped.anchors.length === 0 ? null : JSON.stringify(mapped.anchors),
      key: null,
    };
    this.nodes.push(indexed);
    parent?.children.push(indexed);
    const rawChildren = childrenKey === undefined ? undefined : node[childrenKey];
    if (Array.isArray(rawChildren)) {
      for (const child of rawChildren) {
        if (isPlainObject(child)) this.walk(child, depth + 1, indexed);
      }
    }
  }

  private assignKeys(): void {
    const rawCounts = new Map<string, number>();
    for (const node of this.nodes) {
      if (node.rawKey === null) continue;
      rawCounts.set(node.rawKey, (rawCounts.get(node.rawKey) ?? 0) + 1);
    }
    const memo = new Map<IndexedNode, string | null>();
    const resolve = (node: IndexedNode): string | null => {
      if (memo.has(node)) return memo.get(node) ?? null;
      memo.set(node, null); // total on malformed input; trees have no cycles
      const key = compute(node);
      memo.set(node, key);
      return key;
    };
    const parentKeyOf = (node: IndexedNode): string | null =>
      node.parent === null ? '#root' : resolve(node.parent);

    const compute = (node: IndexedNode): string | null => {
      if (node.rawKey === null || node.mappingAmbiguous) return null;
      // §3.2 — raw anchor-set equality is the normal path.
      if ((rawCounts.get(node.rawKey) ?? 0) <= 1) return node.rawKey;
      // §3.3 — the match key first extends to (anchor_set, parent_match_key).
      const parentKey = parentKeyOf(node);
      if (parentKey === null) return null;
      const level2 = `${node.rawKey}|p=${parentKey}`;
      const peers = this.nodes.filter(
        n => n !== node && n.rawKey === node.rawKey && !n.mappingAmbiguous && parentKeyOf(n) !== null,
      );
      const level2Peers = peers.filter(n => `${n.rawKey}|p=${parentKeyOf(n)}` === level2);
      if (level2Peers.length === 0) return level2;
      // §3.3 — a stable local discriminator, never the component type.
      const discriminator = this.adapter.discriminator(node.node);
      if (discriminator === undefined || discriminator.length === 0) return null;
      const level3 = `${level2}|d=${discriminator}`;
      const collides = level2Peers.some(n => {
        const d = this.adapter.discriminator(n.node);
        return d !== undefined && d.length > 0 && `${level2}|d=${d}` === level3;
      });
      return collides ? null : level3;
    };

    for (const node of this.nodes) node.key = resolve(node);
    for (const node of this.nodes) {
      if (node.key === null) continue;
      const bucket = this.byKey.get(node.key) ?? [];
      bucket.push(node);
      this.byKey.set(node.key, bucket);
    }
  }

  /** Deterministic lookup — nothing for a missing or ambiguous key. */
  lookup(key: string | null): IndexedNode | undefined {
    if (key === null) return undefined;
    const bucket = this.byKey.get(key);
    return bucket !== undefined && bucket.length === 1 ? bucket[0] : undefined;
  }

  has(key: string | null): boolean {
    return key !== null && (this.byKey.get(key)?.length ?? 0) > 0;
  }

  isAmbiguous(key: string | null): boolean {
    return key !== null && (this.byKey.get(key)?.length ?? 0) > 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Merged tree — built first, pointered afterwards
// ─────────────────────────────────────────────────────────────────────────────

interface MergedTreeNode {
  node: MergeNode;
  key: string | null;
  childrenKey: string | undefined;
  /** True when the node the shell came from carried the child-array property. */
  hadChildrenKey: boolean;
  children: MergedTreeNode[];
  /** Assigned by {@link assignPointers} once the tree is final. */
  pointer: string;
}

type ReportArray = 'surviving' | 'regenerated' | 'orphaned' | 'pendingReview' | 'conflicts';

interface PendingEntry {
  array: ReportArray;
  code: MergeCode;
  anchors: string[];
  reason: string;
  propertyDeltas?: string[];
  target: MergedTreeNode | null;
  orphan?: { reattachedTo: MergedTreeNode; cascaded: boolean; detached: boolean };
}

const SEVERITY_BY_CODE: Record<MergeCode, MergeSeverity> = {
  'COMP-REGENERATION-NO-COMMON-ANCESTOR': 'error',
  'COMP-REGENERATION-DESIGNER-PRECEDES': 'warning',
  'COMP-REGENERATION-DESIGNER-REMOVED': 'warning',
  'COMP-REGENERATION-PROPERTY-CONFLICT': 'warning',
  'COMP-REGENERATION-WIDGET-SWAP': 'warning',
  'COMP-REGENERATION-DESIGNER-SURVIVED': 'info',
  'COMP-REGENERATION-REGENERATED': 'info',
  'COMP-REGENERATION-ORPHAN-NODE': 'warning',
  'COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE': 'info',
  'COMP-REGENERATION-ORPHAN-DETACHED': 'warning',
  'COMP-REGENERATION-RENAME-MIGRATED': 'info',
  'COMP-REGENERATION-PENDING-REVIEW': 'info',
};

interface OrderOutcome {
  /** True when designer and old disagree on matched-child order. */
  reordered: boolean;
  /** True when the designer order is the one to apply (§6.6 designer-only). */
  applyDesignerOrder: boolean;
  survivingPointers: string[];
  conflictPointers: string[];
}

const NO_REORDER: OrderOutcome = {
  reordered: false,
  applyDesignerOrder: false,
  survivingPointers: [],
  conflictPointers: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// The merge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §2.1 — three-way regeneration merge, or the §6.2 absent-common-ancestor
 * degradation when `oldGenerated` is null.
 *
 * Deterministic, no-mutation, report-only: returns fresh `merged` and `report`
 * documents and never writes to an input.
 */
export function regenerationMergeWithAdapter<TDoc>(
  adapter: MergeDocumentAdapter<TDoc>,
  inputs: RegenerationMergeInputs<TDoc>,
  context: RegenerationMergeContext = {},
): RegenerationMergeResult<TDoc> {
  const { oldGenerated, designerEdited, newGenerated } = inputs;
  if (adapter.assertInput) {
    if (oldGenerated !== null && oldGenerated !== undefined) adapter.assertInput(oldGenerated, 'old_generated');
    adapter.assertInput(designerEdited, 'designer_edited');
    adapter.assertInput(newGenerated, 'new_generated');
  }

  const report: MergeReport = {
    version: '1.0',
    surviving: [],
    regenerated: [],
    orphaned: [],
    pendingReview: [],
    conflicts: [],
  };

  // §6.2 — no common ancestor: fresh generation plus the required diagnostic.
  if (oldGenerated === null || oldGenerated === undefined) {
    report.conflicts.push({
      anchors: [],
      nodePath: adapter.rootPointer,
      code: 'COMP-REGENERATION-NO-COMMON-ANCESTOR',
      severity: 'error',
      reason:
        'No old_generated common ancestor was supplied; the operation degraded to fresh generation and designer edits were not preserved.',
    });
    return { merged: clone(newGenerated), report };
  }

  const generic = adapter as unknown as MergeDocumentAdapter<unknown>;
  const sub = buildSubstitution(context.anchorMappings);
  const newIndex = new MatchIndex(generic, adapter.root(newGenerated), IDENTITY_SUBSTITUTION);
  const oldIndex = new MatchIndex(generic, adapter.root(oldGenerated), sub);
  const designerIndex = new MatchIndex(generic, adapter.root(designerEdited), sub);

  const entries: PendingEntry[] = [];
  const represented = new Set<MergeNode>();
  const mergedByKey = new Map<string, MergedTreeNode>();

  const push = (entry: PendingEntry): void => {
    entries.push({
      ...entry,
      ...(entry.propertyDeltas !== undefined && entry.propertyDeltas.length > 0
        ? { propertyDeltas: [...new Set(entry.propertyDeltas)].sort() }
        : {}),
    });
  };

  /** Node-local copy: everything except the node's own child array. */
  const shell = (source: MergeNode, childrenKey: string | undefined): { node: MergeNode; hadChildrenKey: boolean } => {
    const node = clone(source);
    const hadChildrenKey = childrenKey !== undefined && Object.prototype.hasOwnProperty.call(node, childrenKey);
    if (childrenKey !== undefined) delete node[childrenKey];
    return { node, hadChildrenKey };
  };

  const resolvesInNew = (key: string | null): key is string => newIndex.lookup(key) !== undefined;

  /** Child keys of `node` restricted to the ones generated assembly can place. */
  const assemblyChildKeys = (indexed: IndexedNode | undefined): string[] =>
    (indexed?.children ?? []).map(child => child.key).filter(resolvesInNew);

  /** True when two key sequences carry the same common members in a different order. */
  const orderDiffers = (a: string[], b: string[]): boolean => {
    const common = new Set(a.filter(key => b.includes(key)));
    const left = a.filter(key => common.has(key));
    const right = b.filter(key => common.has(key));
    return left.length === right.length && left.some((key, i) => key !== right[i]);
  };

  /**
   * A child-array delta counts against "clean regenerated" only when it changes
   * what the generated assembly places: a designer child new_generated also
   * produces, a generated child the designer deleted outright, or a reorder of
   * children both sides still carry. Designer children new_generated does not
   * produce are orphan-pass business (§6.6, §6.7), and a child the designer only
   * moved elsewhere still exists in `designer_index`.
   */
  const childCompositionChanged = (oldNode: IndexedNode, designerNode: IndexedNode): boolean => {
    const oldKeys = assemblyChildKeys(oldNode);
    const designerKeys = assemblyChildKeys(designerNode);
    return designerKeys.some(key => !oldIndex.has(key)) || oldKeys.some(key => !designerIndex.has(key));
  };

  /** §6.6 — classify the matched-child order three ways. */
  const orderOutcome = (
    newNode: IndexedNode,
    oldNode: IndexedNode,
    designerNode: IndexedNode,
  ): OrderOutcome => {
    const childrenKey = newNode.childrenKey;
    if (childrenKey === undefined) return NO_REORDER;
    const oldKeys = assemblyChildKeys(oldNode);
    const designerKeys = assemblyChildKeys(designerNode);
    if (!orderDiffers(oldKeys, designerKeys)) return NO_REORDER;
    const newKeys = assemblyChildKeys(newNode);
    const pointer = `/${escapePointerToken(childrenKey)}`;
    if (!orderDiffers(newKeys, oldKeys)) {
      return { reordered: true, applyDesignerOrder: true, survivingPointers: [pointer], conflictPointers: [] };
    }
    if (orderDiffers(newKeys, designerKeys)) {
      return { reordered: true, applyDesignerOrder: false, survivingPointers: [], conflictPointers: [pointer] };
    }
    return { reordered: true, applyDesignerOrder: false, survivingPointers: [], conflictPointers: [] };
  };

  const diffs = (a: IndexedNode, b: IndexedNode, skipTopLevel: ReadonlySet<string>): Set<string> => {
    const out = new Set<string>();
    collectPointerDiffs(a.node, b.node, '', skipTopLevel, out);
    return out;
  };

  /**
   * §6.5 — three-way node merge. Returns the merged shell plus the report
   * entries the node earns; entries are pushed by the caller in pre-order.
   */
  const threeWay = (
    newNode: IndexedNode,
    oldNode: IndexedNode,
    designerNode: IndexedNode,
    order: OrderOutcome,
  ): { shell: { node: MergeNode; hadChildrenKey: boolean }; emit: Array<Omit<PendingEntry, 'target'>> } => {
    const childrenKey = newNode.childrenKey;
    const skipTopLevel: ReadonlySet<string> = new Set(childrenKey === undefined ? [] : [childrenKey]);
    const typeKey = adapter.typeKey;
    const emit: Array<Omit<PendingEntry, 'target'>> = [];
    const anchors = newNode.anchors;

    if (typeKey !== undefined && !deepEqual(oldNode.node[typeKey], designerNode.node[typeKey])) {
      // §6.5 — a widget swap changes the node's property vocabulary, so a
      // property-by-property overlay across two different widgets is not
      // meaningful. The designer node wins whole and the swap is the finding.
      const typePointer = `/${escapePointerToken(typeKey)}`;
      emit.push({
        array: 'conflicts',
        code: 'COMP-REGENERATION-WIDGET-SWAP',
        anchors,
        reason: `Designer changed the widget from ${String(oldNode.node[typeKey])} to ${String(designerNode.node[typeKey])}.`,
        propertyDeltas: [typePointer],
      });
      const conflicting = [...diffs(oldNode, designerNode, skipTopLevel)].filter(pointer => {
        if (pointer === typePointer) return false;
        const oldSlot = readPointer(oldNode.node, pointer);
        const newSlot = readPointer(newNode.node, pointer);
        const designerSlot = readPointer(designerNode.node, pointer);
        return !slotEqual(oldSlot, newSlot) && !slotEqual(newSlot, designerSlot);
      });
      if (conflicting.length > 0) {
        emit.push({
          array: 'conflicts',
          code: 'COMP-REGENERATION-PROPERTY-CONFLICT',
          anchors,
          reason: 'Designer and generator changed the same node-local property to different values.',
          propertyDeltas: conflicting,
        });
      }
      return { shell: shell(designerNode.node, childrenKey), emit };
    }

    const merged = shell(newNode.node, childrenKey);
    const designerDeltas = diffs(oldNode, designerNode, skipTopLevel);
    const generatorDeltas = diffs(oldNode, newNode, skipTopLevel);

    const surviving: string[] = [...order.survivingPointers];
    const conflicting: string[] = [...order.conflictPointers];
    for (const pointer of designerDeltas) {
      const oldSlot = readPointer(oldNode.node, pointer);
      const newSlot = readPointer(newNode.node, pointer);
      const designerSlot = readPointer(designerNode.node, pointer);
      if (slotEqual(newSlot, designerSlot)) continue; // both landed on the same value
      writePointer(merged.node, pointer, designerSlot);
      if (slotEqual(oldSlot, newSlot)) surviving.push(pointer);
      else conflicting.push(pointer);
    }

    const renamed = designerNode.renamed || oldNode.renamed;
    const regenerated = [...generatorDeltas].filter(pointer => {
      const oldSlot = readPointer(oldNode.node, pointer);
      const designerSlot = readPointer(designerNode.node, pointer);
      if (!slotEqual(oldSlot, designerSlot)) return false;
      // §9.4 — the anchor-set update is represented by RENAME-MIGRATED alone.
      return !(renamed && adapter.anchorsPointer !== undefined && pointer === adapter.anchorsPointer);
    });

    if (renamed) {
      emit.push({
        array: 'surviving',
        code: 'COMP-REGENERATION-RENAME-MIGRATED',
        anchors,
        reason: 'Anchor-mapping substitution preserved presentation continuity across a renamed source anchor.',
        ...(adapter.anchorsPointer !== undefined ? { propertyDeltas: [adapter.anchorsPointer] } : {}),
      });
    }
    if (surviving.length > 0) {
      emit.push({
        array: 'surviving',
        code: 'COMP-REGENERATION-DESIGNER-SURVIVED',
        anchors,
        reason: 'Non-conflicting designer edits survived in the merged node.',
        propertyDeltas: surviving,
      });
    }
    if (conflicting.length > 0) {
      emit.push({
        array: 'conflicts',
        code: 'COMP-REGENERATION-PROPERTY-CONFLICT',
        anchors,
        reason: 'Designer and generator changed the same node-local property to different values.',
        propertyDeltas: conflicting,
      });
    }
    if (regenerated.length > 0) {
      emit.push({
        array: 'regenerated',
        code: 'COMP-REGENERATION-REGENERATED',
        anchors,
        reason: 'Generated property updates from new_generated remained in the merged node.',
        propertyDeltas: regenerated,
      });
    } else if (designerDeltas.size === 0 && !order.reordered && !childCompositionChanged(oldNode, designerNode)) {
      emit.push({
        array: 'regenerated',
        code: 'COMP-REGENERATION-REGENERATED',
        anchors,
        reason: 'Clean generated node matched old and designer.',
      });
    }
    return { shell: merged, emit };
  };

  /**
   * §6.4 — generated-node assembly. Returns null when the node must not appear
   * in `merged` (the designer-removed row).
   */
  const assemble = (newNode: IndexedNode, parentMerged: MergedTreeNode | null): MergedTreeNode | null => {
    const isRoot = parentMerged === null;
    const key = newNode.key;
    const childrenKey = newNode.childrenKey;
    const ambiguousInNew = newIndex.isAmbiguous(key);

    const node: MergedTreeNode = {
      node: {},
      key,
      childrenKey,
      hadChildrenKey: false,
      children: [],
      pointer: '',
    };
    const emit: Array<Omit<PendingEntry, 'target'>> = [];
    let oldMatch: IndexedNode | undefined;
    let designerMatch: IndexedNode | undefined;
    let order: OrderOutcome = NO_REORDER;
    let built: { node: MergeNode; hadChildrenKey: boolean };

    if (key === null) {
      // §6.4 — unmatchable shells pass through; children still recurse.
      built = shell(newNode.node, childrenKey);
    } else if (ambiguousInNew) {
      built = shell(newNode.node, childrenKey);
      emit.push({
        array: 'pendingReview',
        code: 'COMP-REGENERATION-PENDING-REVIEW',
        anchors: newNode.anchors,
        reason: 'Generated node is ambiguous under source-anchor identity and needs human review.',
      });
    } else {
      oldMatch = oldIndex.lookup(key);
      designerMatch = designerIndex.lookup(key);
      if (oldMatch === undefined && designerMatch === undefined) {
        built = shell(newNode.node, childrenKey);
        emit.push({
          array: 'pendingReview',
          code: 'COMP-REGENERATION-PENDING-REVIEW',
          anchors: newNode.anchors,
          reason: 'New generated node has no deterministic old or designer match.',
        });
      } else if (oldMatch === undefined && designerMatch !== undefined) {
        represented.add(designerMatch.node);
        built = shell(designerMatch.node, childrenKey);
        emit.push({
          array: 'conflicts',
          code: 'COMP-REGENERATION-DESIGNER-PRECEDES',
          anchors: newNode.anchors,
          reason: 'Designer-authored node precedes a newly generated node at the same source anchor.',
        });
      } else if (oldMatch !== undefined && designerMatch === undefined) {
        if (!isRoot) {
          // No merged node exists, so the loss is anchored at the merged parent —
          // the nearest surviving location a reviewer can open.
          push({
            array: 'conflicts',
            code: 'COMP-REGENERATION-DESIGNER-REMOVED',
            anchors: newNode.anchors,
            reason: 'Designer removed a generated node that the generator still produces.',
            target: parentMerged,
          });
          return null;
        }
        // §2.3 requires the merged document to have a root, so the root can
        // never take the designer-removed path. An unmatched designer root is
        // surfaced by the §6.7 orphan pass instead.
        built = shell(newNode.node, childrenKey);
      } else {
        represented.add(designerMatch!.node);
        order = orderOutcome(newNode, oldMatch!, designerMatch!);
        const result = threeWay(newNode, oldMatch!, designerMatch!, order);
        built = result.shell;
        emit.push(...result.emit);
      }
    }

    node.node = built.node;
    node.hadChildrenKey = built.hadChildrenKey;
    if (key !== null && !ambiguousInNew && !mergedByKey.has(key)) mergedByKey.set(key, node);
    for (const entry of emit) push({ ...entry, target: node });

    if (childrenKey !== undefined) {
      for (const child of newNode.children) {
        const mergedChild = assemble(child, node);
        if (mergedChild !== null) node.children.push(mergedChild);
      }
      if (order.applyDesignerOrder && designerMatch !== undefined) {
        applyDesignerOrder(node, assemblyChildKeys(designerMatch));
      }
    }
    return node;
  };

  /** §6.6 — matched children take the designer order; new children hold place. */
  const applyDesignerOrder = (parent: MergedTreeNode, designerKeys: string[]): void => {
    const positions: number[] = [];
    parent.children.forEach((child, i) => {
      if (child.key !== null && designerKeys.includes(child.key)) positions.push(i);
    });
    const ordered = designerKeys
      .map(key => parent.children.find(child => child.key === key))
      .filter((child): child is MergedTreeNode => child !== undefined);
    positions.forEach((position, i) => {
      const next = ordered[i];
      if (next !== undefined) parent.children[position] = next;
    });
  };

  const newRoot = newIndex.root;
  const mergedRoot = newRoot === undefined ? null : assemble(newRoot, null);
  if (mergedRoot === null) return { merged: clone(newGenerated), report };

  // §6.7 — exactly one uncovered-orphan pass, designer pre-order.
  const selected = new Set<IndexedNode>();
  const hasRepresentedDescendant = (node: IndexedNode): boolean =>
    node.children.some(child => represented.has(child.node) || hasRepresentedDescendant(child));
  const hasSelectedAncestor = (node: IndexedNode): boolean => {
    for (let cursor = node.parent; cursor !== null; cursor = cursor.parent) {
      if (selected.has(cursor)) return true;
    }
    return false;
  };
  const mergedFor = (node: IndexedNode): MergedTreeNode | undefined =>
    node.key === null || newIndex.isAmbiguous(node.key) ? undefined : mergedByKey.get(node.key);

  for (const designerNode of designerIndex.nodes) {
    if (represented.has(designerNode.node)) continue;
    if (hasRepresentedDescendant(designerNode)) continue;
    const key = designerNode.key;
    const uncovered =
      key === null
      || designerIndex.isAmbiguous(key)
      || newIndex.isAmbiguous(key)
      || newIndex.lookup(key) === undefined;
    if (!uncovered || hasSelectedAncestor(designerNode)) continue;
    selected.add(designerNode);

    let host = designerNode.parent === null ? undefined : mergedFor(designerNode.parent);
    let cascaded = false;
    let detached = false;
    if (host === undefined) {
      for (
        let ancestor = designerNode.parent === null ? null : designerNode.parent.parent;
        ancestor !== null && host === undefined;
        ancestor = ancestor.parent
      ) {
        host = mergedFor(ancestor);
        if (host !== undefined) cascaded = true;
      }
    }
    if (host === undefined) {
      host = mergedRoot;
      detached = true;
    }

    const copied: MergedTreeNode = {
      node: clone(designerNode.node),
      key: designerNode.key,
      childrenKey: undefined,
      hadChildrenKey: false,
      children: [],
      pointer: '',
    };
    host.children.push(copied);
    const orphan = { reattachedTo: host, cascaded, detached };
    push({
      array: 'orphaned',
      code: 'COMP-REGENERATION-ORPHAN-NODE',
      anchors: designerNode.anchors,
      reason:
        'Designer-authored subtree had no deterministic match in new_generated and was preserved by orphan reattachment.',
      target: copied,
      orphan,
    });
    if (cascaded) {
      push({
        array: 'orphaned',
        code: 'COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE',
        anchors: designerNode.anchors,
        reason: 'Original parent did not survive; the orphan reattached to the nearest surviving ancestor.',
        target: copied,
        orphan,
      });
    }
    if (detached) {
      push({
        array: 'orphaned',
        code: 'COMP-REGENERATION-ORPHAN-DETACHED',
        anchors: designerNode.anchors,
        reason: 'No surviving ancestor resolved; the orphan reattached under the merged root.',
        target: copied,
        orphan,
      });
    }
  }

  assignPointers(mergedRoot, adapter.rootPointer);
  materialize(mergedRoot);

  for (const entry of entries) {
    const record: MergeEntry = {
      anchors: entry.anchors,
      nodePath: entry.target?.pointer ?? adapter.rootPointer,
      code: entry.code,
      severity: SEVERITY_BY_CODE[entry.code],
      reason: entry.reason,
      ...(entry.propertyDeltas !== undefined ? { propertyDeltas: entry.propertyDeltas } : {}),
    };
    if (entry.array === 'orphaned' && entry.orphan !== undefined) {
      report.orphaned.push({
        ...record,
        reattachedTo: entry.orphan.reattachedTo.pointer,
        cascaded: entry.orphan.cascaded,
        detached: entry.orphan.detached,
      });
      continue;
    }
    (report[entry.array] as MergeEntry[]).push(record);
  }

  return { merged: adapter.document(newGenerated, mergedRoot.node), report };
}

function assignPointers(node: MergedTreeNode, pointer: string): void {
  node.pointer = pointer;
  const childrenKey = node.childrenKey;
  if (childrenKey === undefined) return;
  node.children.forEach((child, i) => assignPointers(child, joinPointer(pointer, childrenKey, i)));
}

/**
 * Write child arrays back onto the merged nodes. A child array is emitted only
 * when it has members or when the node the shell came from carried the key, so
 * a leaf that never declared `children` does not grow an empty one.
 */
function materialize(node: MergedTreeNode): void {
  const childrenKey = node.childrenKey;
  if (childrenKey === undefined) return;
  node.children.forEach(materialize);
  if (node.children.length === 0 && !node.hadChildrenKey) return;
  node.node[childrenKey] = node.children.map(child => child.node);
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapters
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal Component document shape the merge reads. */
export interface ComponentDocumentLike {
  $formspecComponent?: string;
  tree?: MergeNode;
  [key: string]: unknown;
}

/**
 * Component v1.1 adapter — identity from `x-generation.anchors[]` (Component
 * Reference Fields), children from `children[]`, widget from `component`.
 */
export const componentMergeAdapter: MergeDocumentAdapter<ComponentDocumentLike> = {
  name: 'component',
  rootPointer: '/tree',
  anchorsPointer: '/x-generation/anchors',
  typeKey: 'component',
  root: doc => (isPlainObject(doc.tree) ? doc.tree : undefined),
  document: (newGenerated, mergedRoot) => ({ ...clone(newGenerated), tree: mergedRoot }),
  childrenKey: () => 'children',
  anchors: node => {
    const generation = node['x-generation'];
    return isPlainObject(generation) ? generation.anchors : undefined;
  },
  discriminator: node => {
    for (const key of ['id', 'bind', 'actionRef']) {
      const value = node[key];
      if (typeof value === 'string' && value.length > 0) return `${key}=${value}`;
    }
    return undefined;
  },
  assertInput: (doc, role) => {
    if (doc?.$formspecComponent !== '1.1') {
      throw new RegenerationMergeInputError(
        `regeneration merge requires $formspecComponent "1.1" for ${role}; received ${JSON.stringify(doc?.$formspecComponent)}`,
        role,
      );
    }
  },
};

/** Minimal Surface document shape the merge reads. */
export interface SurfaceDocumentLike {
  $formspecSurface?: string;
  routes?: unknown;
  [key: string]: unknown;
}

const SURFACE_LEVELS = ['surface', 'route', 'slot'] as const;

/**
 * Surface adapter — the Surface family carries no `x-generation`, so identity
 * comes from the spec-required stable ids (`surface:<id>`, `route:<id>`,
 * `slot:<id>`). That is an id match, not a path or ordinal heuristic: §3.3
 * already names a non-empty `id` as the stable local discriminator, and a
 * route/slot id is the only identity this family defines.
 */
export const surfaceMergeAdapter: MergeDocumentAdapter<SurfaceDocumentLike> = {
  name: 'surface',
  rootPointer: '/',
  root: doc => doc as MergeNode,
  document: (_newGenerated, mergedRoot) => mergedRoot as SurfaceDocumentLike,
  childrenKey: (_node, depth) => (depth === 0 ? 'routes' : depth === 1 ? 'slots' : undefined),
  anchors: (node, depth) => {
    const level = SURFACE_LEVELS[depth];
    const id = node.id;
    if (level === undefined || typeof id !== 'string' || id.length === 0) return undefined;
    return [`${level}:${id}`];
  },
  discriminator: node => (typeof node.id === 'string' && node.id.length > 0 ? `id=${node.id}` : undefined),
};

/** §2.1 three-way regeneration merge over Component v1.1 documents. */
export function regenerationMerge(
  inputs: RegenerationMergeInputs<ComponentDocumentLike>,
  context: RegenerationMergeContext = {},
): RegenerationMergeResult<ComponentDocumentLike> {
  return regenerationMergeWithAdapter(componentMergeAdapter, inputs, context);
}

/** §2.1 three-way regeneration merge over Surface documents. */
export function regenerationMergeSurface(
  inputs: RegenerationMergeInputs<SurfaceDocumentLike>,
  context: RegenerationMergeContext = {},
): RegenerationMergeResult<SurfaceDocumentLike> {
  return regenerationMergeWithAdapter(surfaceMergeAdapter, inputs, context);
}

/** Report entries whose severity is `error` or `warning` — the review queue. */
export function mergeReviewQueue(report: MergeReport): MergeEntry[] {
  return [
    ...report.conflicts,
    ...report.orphaned,
    ...report.pendingReview,
    ...report.surviving,
    ...report.regenerated,
  ].filter(entry => entry.severity !== 'info');
}
