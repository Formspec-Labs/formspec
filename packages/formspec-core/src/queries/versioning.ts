/**
 * Pure query functions for versioning diff and changelog preview.
 */
import type { FormDefinition, FormItem } from '@formspec-org/types';
import type { ProjectState, Change, FormspecChangelog } from '../types.js';

/** Deterministic JSON stringification for comparing item payloads independent of property order. */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return `{${pairs.join(',')}}`;
}

export type FlattenedItem = {
  path: string;
  parentPath: string;
  key: string;
  item: FormItem;
  snapshot: string;
  signature: string;
};

/** Flatten an item tree into comparable rows carrying both exact-path and rename-tolerant signatures. */
export function flattenItems(items: FormItem[], prefix = '', visited?: WeakSet<object>): FlattenedItem[] {
  const seen = visited ?? new WeakSet<object>();
  const rows: FlattenedItem[] = [];
  for (const item of items) {
    if (seen.has(item as object)) continue;
    seen.add(item as object);
    const path = prefix ? `${prefix}.${item.key}` : item.key;
    const parentPath = prefix;
    const withoutChildren = { ...(item as Record<string, unknown>) };
    delete withoutChildren.children;
    const signatureSource = { ...withoutChildren };
    delete signatureSource.key;
    rows.push({
      path,
      parentPath,
      key: item.key,
      item,
      snapshot: stableStringify(withoutChildren),
      signature: stableStringify(signatureSource),
    });
    if (item.children?.length) {
      rows.push(...flattenItems(item.children, path, seen));
    }
  }
  return rows;
}

/**
 * Compute a structured diff from a baseline (or a specific published version)
 * to the current definition state.
 */
export function diffFromBaseline(state: ProjectState, fromVersion?: string): Change[] {
  let baseline: FormDefinition;
  if (fromVersion) {
    const release = state.versioning.releases.find(r => r.version === fromVersion);
    if (!release) throw new Error(`Version not found: ${fromVersion}`);
    baseline = release.snapshot;
  } else {
    baseline = state.versioning.baseline;
  }

  const current = state.definition;
  const changes: Change[] = [];
  const baselineRows = flattenItems(baseline.items);
  const currentRows = flattenItems(current.items);
  const baselineByPath = new Map(baselineRows.map((row) => [row.path, row]));
  const currentByPath = new Map(currentRows.map((row) => [row.path, row]));

  const baselinePaths = new Set(baselineByPath.keys());
  const currentPaths = new Set(currentByPath.keys());

  // Same-path item modifications.
  for (const path of baselinePaths) {
    if (!currentPaths.has(path)) continue;
    const previous = baselineByPath.get(path)!;
    const next = currentByPath.get(path)!;
    if (previous.snapshot === next.snapshot) continue;
    changes.push({
      type: 'modified',
      target: 'item',
      path,
      impact: 'compatible',
      before: previous.item,
      after: next.item,
    });
  }

  const removedPaths = [...baselinePaths].filter((path) => !currentPaths.has(path));
  const addedPaths = [...currentPaths].filter((path) => !baselinePaths.has(path));
  const unmatchedAdded = new Set(addedPaths);

  for (const removedPath of removedPaths) {
    const removed = baselineByPath.get(removedPath)!;
    const pairedPath = [...unmatchedAdded].find((candidatePath) => {
      const added = currentByPath.get(candidatePath)!;
      return added.signature === removed.signature;
    });
    if (!pairedPath) continue;

    const added = currentByPath.get(pairedPath)!;
    unmatchedAdded.delete(pairedPath);

    const renamedOnly = removed.parentPath === added.parentPath && removed.key !== added.key;
    changes.push({
      type: renamedOnly ? 'renamed' : 'moved',
      target: 'item',
      path: removedPath,
      impact: 'breaking',
      before: removedPath,
      after: pairedPath,
      description: `${removedPath} -> ${pairedPath}`,
    });
  }

  const pairedRemoved = new Set(
    changes
      .filter((change) => change.type === 'renamed' || change.type === 'moved')
      .map((change) => change.path),
  );

  for (const removedPath of removedPaths) {
    if (pairedRemoved.has(removedPath)) continue;
    changes.push({
      type: 'removed',
      target: 'item',
      path: removedPath,
      impact: 'breaking',
    });
  }

  for (const addedPath of unmatchedAdded) {
    changes.push({
      type: 'added',
      target: 'item',
      path: addedPath,
      impact: 'compatible',
    });
  }

  if (baseline.title !== current.title) {
    changes.push({
      type: 'modified',
      target: 'metadata',
      path: 'title',
      impact: 'cosmetic',
      before: baseline.title,
      after: current.title,
    });
  }

  return changes.sort((a, b) => {
    if (a.target !== b.target) return a.target.localeCompare(b.target);
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.type.localeCompare(b.type);
  });
}

/**
 * Preview what the changelog would look like without committing to a publish.
 */
export function previewChangelog(state: ProjectState): FormspecChangelog {
  const changes = diffFromBaseline(state);
  let semverImpact: 'breaking' | 'compatible' | 'cosmetic' = 'cosmetic';
  for (const c of changes) {
    if (c.impact === 'breaking') { semverImpact = 'breaking'; break; }
    if (c.impact === 'compatible') semverImpact = 'compatible';
  }

  return {
    definitionUrl: state.definition.url,
    fromVersion: state.versioning.baseline.version,
    toVersion: state.definition.version,
    semverImpact,
    changes,
  };
}
