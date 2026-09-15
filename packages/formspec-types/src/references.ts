/**
 * @filedesc References sidecar processing: target-Definition matching and per-field reference resolution.
 *
 * Pure References-spec behavior shared by every consumer — the Assist provider
 * (`assist-spec.md` §5.2) and renderers showing human help alike — so it lives
 * at the openly licensed bottom layer rather than inside any one consumer.
 */
import type { Reference, ReferencesDocument } from './generated/references.js';

/** Who a reference is resolved for (`references-spec.md` §2.1 `audience`). */
export type ReferenceAudience = 'human' | 'agent' | 'both';

/** The parts of a References Document that field resolution reads. */
export type ReferenceBindings = Pick<ReferencesDocument, 'references' | 'referenceDefs'>;

type BoundEntry = Reference & { target: string };

const REFERENCE_DEF_POINTER = /^#\/referenceDefs\/(.+)$/;

function referenceDefKey(pointer: string): string | undefined {
  return pointer.match(REFERENCE_DEF_POINTER)?.[1];
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function wildcardSatisfies(range: string, version: string): boolean {
  const versionParts = version.split('.');
  return range.split('.').every((part, index) => part === 'x' || part === '*' || part === versionParts[index]);
}

function comparatorSatisfies(range: string, version: string): boolean {
  const match = range.match(/^(<=|>=|<|>|=)\s*(\d+(?:\.\d+){0,2})$/);
  if (!match) return false;
  const comparison = compareVersions(version, match[2]!);
  switch (match[1]) {
    case '<': return comparison < 0;
    case '<=': return comparison <= 0;
    case '>': return comparison > 0;
    case '>=': return comparison >= 0;
    default: return comparison === 0;
  }
}

function simpleRangeSatisfies(range: string, version: string): boolean {
  if (range === '*' || range.length === 0 || range === version) return true;
  if (range.startsWith('^')) {
    const base = range.slice(1);
    return compareVersions(version, base) >= 0 && version.split('.')[0] === base.split('.')[0];
  }
  if (range.startsWith('~')) {
    const base = range.slice(1);
    const baseParts = base.split('.');
    return compareVersions(version, base) >= 0
      && version.split('.')[0] === baseParts[0]
      && version.split('.')[1] === (baseParts[1] ?? '0');
  }
  if (range.includes(' ')) return range.split(/\s+/).every((part) => simpleRangeSatisfies(part, version));
  if (/[x*]/i.test(range)) return wildcardSatisfies(range.toLowerCase(), version);
  if (/^(<=|>=|<|>|=)/.test(range)) return comparatorSatisfies(range, version);
  return false;
}

/**
 * Whether a sidecar's `targetDefinition` binds to `definition`: the URL is
 * equal and, when both a `compatibleVersions` range and a Definition version
 * are present, the version satisfies one `||` branch of the range.
 */
export function targetDefinitionMatches(
  target: { url?: string; compatibleVersions?: string } | undefined,
  definition: { url: string; version?: string },
): boolean {
  if (!target || typeof target.url !== 'string' || target.url !== definition.url) return false;
  const { compatibleVersions } = target;
  if (!compatibleVersions || !definition.version) return true;
  const version = definition.version;
  return compatibleVersions
    .split('||')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .some((part) => simpleRangeSatisfies(part, version));
}

/**
 * The `$ref` values in `document` that name no `referenceDefs` entry — a
 * document error processors must report, never skip (`references-spec.md`
 * §4.6.3 rule 2). Empty when every pointer resolves.
 */
export function unresolvedReferenceRefs(document: ReferenceBindings): string[] {
  return (document.references ?? []).flatMap((raw) => {
    if (!raw.$ref) return [];
    const key = referenceDefKey(raw.$ref);
    return key !== undefined && document.referenceDefs?.[key] ? [] : [raw.$ref];
  });
}

function resolveBinding(raw: ReferencesDocument['references'][number], document: ReferenceBindings): BoundEntry {
  if (!raw.$ref) return raw as BoundEntry;
  const key = referenceDefKey(raw.$ref);
  const base = key === undefined ? undefined : document.referenceDefs?.[key];
  if (!base) throw new Error(`Unknown reference definition: ${raw.$ref}`);
  const { $ref: _ref, ...overrides } = raw;
  // The key is the resolved identity — an override may not restate or change it
  // (`references-spec.md` §4.6.3 rule 5), so it is applied after the overrides.
  return { ...base, ...overrides, id: key } as BoundEntry;
}

/** The field path, its index-stripped and wildcard forms, every ancestor of each, and `#`. */
function targetCandidates(path: string): Set<string> {
  const base = path.replace(/\[\d+\]/g, '');
  const wildcard = path.replace(/\[\d+\]/g, '[*]');
  const targets = new Set<string>([path, base, wildcard, '#']);
  for (const form of path === base ? [base] : [base, wildcard]) {
    const parts = form.split('.');
    for (let index = parts.length - 1; index > 0; index -= 1) {
      targets.add(parts.slice(0, index).join('.'));
    }
  }
  return targets;
}

function priorityRank(priority: Reference['priority']): number {
  return priority === 'primary' ? 0 : priority === 'background' ? 2 : 1;
}

function audienceMatches(entry: ReferenceAudience, requested: ReferenceAudience): boolean {
  return requested === 'both' || entry === 'both' || entry === requested;
}

/**
 * The references that apply to `path` for `audience`, grouped by `type`
 * (`assist-spec.md` §5.2; `references-spec.md` §5.1). Collects bindings that
 * target the exact path, an explicitly walked ancestor (index-stripped and
 * `[*]` forms for repeat paths), or `#` — an explicit walk, not inheritance
 * (`references-spec.md` §4.5). `$ref` bindings resolve with shallow sibling
 * overrides and take the `referenceDefs` key as `id` (§4.6.3 rule 5), so one
 * definition bound to a group and to its child is collected once, not twice —
 * that is one reference reused, not a duplicate id (§2.3). Each group sorts
 * primary → supplementary → background, keeping document order within a tier.
 * Resolved entries drop their `target`.
 *
 * Throws when any binding in any document carries an unresolvable `$ref`: a
 * broken document is an error, not a silently thinner answer.
 */
export function resolveFieldReferences(
  documents: readonly ReferenceBindings[],
  path: string,
  audience: ReferenceAudience,
): Partial<Record<string, Reference[]>> {
  const candidates = targetCandidates(path);
  const grouped = new Map<string, BoundEntry[]>();
  const seenIds = new Set<string>();

  for (const document of documents) {
    for (const raw of document.references ?? []) {
      const entry = resolveBinding(raw, document);
      if (!candidates.has(entry.target) || !audienceMatches(entry.audience, audience)) continue;
      if (typeof entry.id === 'string') {
        if (seenIds.has(entry.id)) continue;
        seenIds.add(entry.id);
      }
      const bucket = grouped.get(entry.type) ?? [];
      bucket.push(entry);
      grouped.set(entry.type, bucket);
    }
  }

  return Object.fromEntries(
    [...grouped].map(([type, entries]) => [
      type,
      // Array.prototype.sort is stable, so equal ranks keep document order.
      entries
        .slice()
        .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority))
        .map(({ target: _target, ...entry }) => entry as Reference),
    ]),
  );
}
