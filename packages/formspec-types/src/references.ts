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

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: readonly string[];
}

const CONCRETE_SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;

const PARTIAL_SEMVER =
  /^(\*|x|X|0|[1-9]\d*)(?:\.(\*|x|X|0|[1-9]\d*)(?:\.(\*|x|X|0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?)?)?$/;

const NUMERIC_IDENTIFIER = /^\d+$/;

function parseSemver(raw: string): ParsedSemver | null {
  const match = raw.match(CONCRETE_SEMVER);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function compareSemver(left: ParsedSemver, right: ParsedSemver): number {
  if (left.major !== right.major) return left.major > right.major ? 1 : -1;
  if (left.minor !== right.minor) return left.minor > right.minor ? 1 : -1;
  if (left.patch !== right.patch) return left.patch > right.patch ? 1 : -1;
  const leftPre = left.prerelease;
  const rightPre = right.prerelease;
  if (leftPre.length === 0 && rightPre.length === 0) return 0;
  if (leftPre.length === 0) return 1;
  if (rightPre.length === 0) return -1;
  const length = Math.max(leftPre.length, rightPre.length);
  for (let index = 0; index < length; index += 1) {
    const a = leftPre[index];
    const b = rightPre[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const aNum = NUMERIC_IDENTIFIER.test(a);
    const bNum = NUMERIC_IDENTIFIER.test(b);
    if (aNum && bNum) {
      const diff = BigInt(a) - BigInt(b);
      if (diff !== 0n) return diff > 0n ? 1 : -1;
      continue;
    }
    if (aNum !== bNum) return aNum ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return 0;
}

function isWildcardToken(part: string | undefined): boolean {
  return part === undefined || part === '*' || part === 'x' || part === 'X';
}

interface ParsedPartial {
  major: number | null;
  minor: number | null;
  patch: number | null;
  prerelease: readonly string[];
}

function parsePartial(raw: string): ParsedPartial | null {
  const match = raw.match(PARTIAL_SEMVER);
  if (!match) return null;
  const [, majorRaw, minorRaw, patchRaw, preRaw] = match;
  const majorWild = isWildcardToken(majorRaw);
  const minorWild = isWildcardToken(minorRaw);
  const patchWild = isWildcardToken(patchRaw);
  if (majorWild && (!minorWild || !patchWild || preRaw !== undefined)) return null;
  if (minorWild && (!patchWild || preRaw !== undefined)) return null;
  return {
    major: majorWild ? null : Number(majorRaw),
    minor: minorWild ? null : Number(minorRaw),
    patch: patchWild ? null : Number(patchRaw),
    prerelease: preRaw ? preRaw.split('.') : [],
  };
}

function zeroFloor(major: number, minor = 0, patch = 0): ParsedSemver {
  return { major, minor, patch, prerelease: ['0'] };
}

function tokenSatisfies(token: string, version: ParsedSemver): boolean {
  const opMatch = token.match(/^(<=|>=|<|>|=|\^|~)(.*)$/);
  const op = opMatch ? opMatch[1]! : '';
  const body = opMatch ? opMatch[2]! : token;
  if (body.length === 0) return op === '';
  const partial = parsePartial(body);
  if (!partial) return false;
  const { major, minor, patch, prerelease } = partial;

  if (op === '^') {
    if (major === null) return true;
    if (minor === null) {
      return compareSemver(version, zeroFloor(major)) >= 0
        && compareSemver(version, zeroFloor(major + 1)) < 0;
    }
    if (patch === null) {
      const upper = major > 0 ? zeroFloor(major + 1) : zeroFloor(0, minor + 1);
      return compareSemver(version, zeroFloor(major, minor)) >= 0
        && compareSemver(version, upper) < 0;
    }
    const lower: ParsedSemver = { major, minor, patch, prerelease };
    const upper = major > 0
      ? zeroFloor(major + 1)
      : minor > 0
        ? zeroFloor(0, minor + 1)
        : zeroFloor(0, 0, patch + 1);
    return compareSemver(version, lower) >= 0 && compareSemver(version, upper) < 0;
  }

  if (op === '~') {
    if (major === null) return true;
    if (minor === null) {
      return compareSemver(version, zeroFloor(major)) >= 0
        && compareSemver(version, zeroFloor(major + 1)) < 0;
    }
    const lower: ParsedSemver = patch === null
      ? zeroFloor(major, minor)
      : { major, minor, patch, prerelease };
    return compareSemver(version, lower) >= 0
      && compareSemver(version, zeroFloor(major, minor + 1)) < 0;
  }

  if (op === '' || op === '=') {
    if (major === null) return true;
    if (minor === null) {
      return compareSemver(version, zeroFloor(major)) >= 0
        && compareSemver(version, zeroFloor(major + 1)) < 0;
    }
    if (patch === null) {
      return compareSemver(version, zeroFloor(major, minor)) >= 0
        && compareSemver(version, zeroFloor(major, minor + 1)) < 0;
    }
    return compareSemver(version, { major, minor, patch, prerelease }) === 0;
  }

  if (major === null) {
    return op === '<=' || op === '>=';
  }

  if (op === '>=') {
    const bound: ParsedSemver = minor === null
      ? zeroFloor(major)
      : patch === null
        ? zeroFloor(major, minor)
        : { major, minor, patch, prerelease };
    return compareSemver(version, bound) >= 0;
  }
  if (op === '<') {
    const bound: ParsedSemver = minor === null
      ? zeroFloor(major)
      : patch === null
        ? zeroFloor(major, minor)
        : { major, minor, patch, prerelease };
    return compareSemver(version, bound) < 0;
  }
  if (op === '<=') {
    if (minor === null) return compareSemver(version, zeroFloor(major + 1)) < 0;
    if (patch === null) return compareSemver(version, zeroFloor(major, minor + 1)) < 0;
    return compareSemver(version, { major, minor, patch, prerelease }) <= 0;
  }
  if (op === '>') {
    if (minor === null) return compareSemver(version, zeroFloor(major + 1)) >= 0;
    if (patch === null) return compareSemver(version, zeroFloor(major, minor + 1)) >= 0;
    return compareSemver(version, { major, minor, patch, prerelease }) > 0;
  }
  return false;
}

function expandHyphenRanges(branch: string): string | null {
  let invalid = false;
  const expanded = branch.replace(/(\S+)\s+-\s+(\S+)/g, (_full, leftRaw: string, rightRaw: string) => {
    const left = parsePartial(leftRaw);
    const right = parsePartial(rightRaw);
    if (!left || !right) {
      invalid = true;
      return '';
    }
    const lower = left.major === null
      ? '*'
      : left.minor === null
        ? `>=${left.major}.0.0-0`
        : left.patch === null
          ? `>=${left.major}.${left.minor}.0-0`
          : `>=${leftRaw}`;
    const upper = right.major === null
      ? '*'
      : right.minor === null
        ? `<${right.major + 1}.0.0-0`
        : right.patch === null
          ? `<${right.major}.${right.minor + 1}.0-0`
          : `<=${rightRaw}`;
    return `${lower} ${upper}`;
  });
  return invalid ? null : expanded;
}

function branchSatisfies(branch: string, version: ParsedSemver): boolean {
  if (branch === '*') return true;
  const expanded = expandHyphenRanges(branch);
  if (expanded === null) return false;
  const normalized = expanded.replace(/(<=|>=|<|>|=|\^|~)\s+/g, '$1').trim();
  if (normalized.length === 0) return true;
  return normalized.split(/\s+/).every((token) => tokenSatisfies(token, version));
}

/**
 * Whether a sidecar's `targetDefinition` binds to `definition`: the URL is
 * equal and, when both a `compatibleVersions` range and a Definition version
 * are present, the version satisfies one `||` branch of the range (using
 * Formspec Core's Node-semver `includePrerelease: true` semantics).
 */
export function targetDefinitionMatches(
  target: { url?: string; compatibleVersions?: string } | undefined,
  definition: { url: string; version?: string },
): boolean {
  if (!target || typeof target.url !== 'string' || target.url !== definition.url) return false;
  const { compatibleVersions } = target;
  if (!compatibleVersions || !definition.version) return true;
  const parsedVersion = parseSemver(definition.version);
  if (!parsedVersion) return false;
  const branches = compatibleVersions.split('||').map((part) => part.trim());
  if (branches.some((part) => part.length === 0)) return false;
  return branches.some((branch) => branchSatisfies(branch, parsedVersion));
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
