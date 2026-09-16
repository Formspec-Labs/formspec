/** @filedesc Resolves References and Ontology sidecars into Assist field-help objects. */

import type { IFormEngine, RegistryEntry } from '@formspec-org/engine';
import {
  resolveFieldReferences,
  targetDefinitionMatches,
  unresolvedReferenceRefs,
  type FormDefinition,
  type FormItem,
  type ReferenceAudience,
} from '@formspec-org/types';
import { AssistError } from './errors.js';
import type {
  ConceptBinding,
  ConceptEquivalent,
  FieldHelp,
  FieldHelpOptions,
  OntologyDocument,
  ReferenceEntry,
  ReferencesDocument,
  ResolvedConcept,
} from './types.js';

interface FieldMetadata {
  path: string;
  item: FormItem;
}

function stripIndices(path: string): string {
  return path.replace(/\[\d+\]/g, '');
}

function wildcardPath(path: string): string {
  return path.replace(/\[\d+\]/g, '[*]');
}

/** The URI an equivalent is matched and merged by: its own `concept`, else `<system>#<code>` (Ontology spec §3.1). */
export function equivalentUri(equivalent: ConceptEquivalent): string | undefined {
  if (equivalent.concept) {
    return equivalent.concept;
  }
  return equivalent.system && equivalent.code ? `${equivalent.system}#${equivalent.code}` : undefined;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/**
 * Assist spec §5.3 step 1: the binding's equivalents first and winning on a shared URI, then the entry's
 * remaining ones; an absent `type` reads as `exact`. `undefined` when there are none, so the key stays absent.
 */
function unionEquivalents(binding: ConceptEquivalent[] = [], fromEntry: unknown): ConceptEquivalent[] | undefined {
  const own = new Set(binding.map(equivalentUri));
  const merged = [
    ...binding,
    ...(Array.isArray(fromEntry) ? (fromEntry as ConceptEquivalent[]).filter((equivalent) => !own.has(equivalentUri(equivalent))) : []),
  ];
  return merged.length === 0 ? undefined : merged.map((equivalent) => ({ ...equivalent, type: equivalent.type ?? 'exact' }));
}

/**
 * Assist spec §5.3: a binding merged with the Registry concept entry its URI names. The entry's `description`
 * is the `definition`; `display` falls back to the entry. `system` and `code` travel as a pair from ONE
 * source: the binding's own (with the Ontology `defaultSystem` filling a missing system) when the binding
 * names either, else the entry's — never the Ontology default stitched to the entry's code, a pair that names
 * nothing. Never reads `relations` or `metadata.relations`.
 */
function mergeConceptEntry(binding: ConceptBinding, entry: RegistryEntry | undefined, defaultSystem?: string): ResolvedConcept {
  const { equivalents: own, ...rest } = binding;
  const definition = text(entry?.description);
  const [system, code] = rest.system !== undefined || rest.code !== undefined || !entry
    ? [rest.system ?? defaultSystem, rest.code]
    : [text(entry.conceptSystem) ?? defaultSystem, text(entry.conceptCode)];
  const display = rest.display ?? text(entry?.metadata?.displayName);
  const equivalents = unionEquivalents(own, entry?.equivalents);
  return {
    ...rest,
    ...(definition !== undefined ? { definition } : {}),
    ...(system !== undefined ? { system } : {}),
    ...(code !== undefined ? { code } : {}),
    ...(display !== undefined ? { display } : {}),
    ...(equivalents !== undefined ? { equivalents } : {}),
  };
}

function validateTargetDefinition(
  kind: 'references' | 'ontology',
  target: { url: string; compatibleVersions?: string },
  definition: FormDefinition,
): void {
  if (!targetDefinitionMatches(target, definition)) {
    if (target.url !== definition.url) {
      throw new AssistError(
        'x-invalid-sidecar',
        `Assist ${kind} target definition URL does not match active form definition`,
      );
    }
    throw new AssistError(
      'x-invalid-sidecar',
      `Assist ${kind} target definition version is incompatible with active form definition`,
    );
  }
}

function buildFieldMetadata(definition: FormDefinition): Map<string, FieldMetadata> {
  const fields = new Map<string, FieldMetadata>();

  function visit(items: FormItem[], prefix = ''): void {
    for (const item of items) {
      const path = prefix ? `${prefix}.${item.key}` : item.key;
      if (item.type === 'field') {
        fields.set(path, { path, item });
      }
      if ('children' in item && Array.isArray(item.children)) {
        visit(item.children, path);
      }
    }
  }

  visit(definition.items);
  return fields;
}

export class ContextResolver {
  private engine: IFormEngine;
  private fields: Map<string, FieldMetadata>;
  private references: ReferencesDocument[];
  private ontologies: OntologyDocument[];
  /** Registry `concept` entries by `conceptUri` and by `name`; last-loaded wins, as the engine indexes them. */
  private conceptEntriesByUri = new Map<string, RegistryEntry>();
  private conceptEntriesByName = new Map<string, RegistryEntry>();

  public constructor(
    engine: IFormEngine,
    references: ReferencesDocument[] = [],
    ontologies: OntologyDocument[] = [],
    registryEntries: RegistryEntry[] = [],
  ) {
    this.engine = engine;
    this.fields = buildFieldMetadata(engine.getDefinition());
    this.references = [];
    this.ontologies = [];
    this.setRegistryEntries(registryEntries);
    this.setReferences(references);
    this.setOntologies(ontologies);
  }

  public setEngine(engine: IFormEngine): void {
    this.engine = engine;
    this.fields = buildFieldMetadata(engine.getDefinition());
    this.validateReferences(this.references);
    this.validateOntologies(this.ontologies);
  }

  public setReferences(references: ReferencesDocument[]): void {
    this.validateReferences(references);
    this.references = references;
  }

  public setOntologies(ontologies: OntologyDocument[]): void {
    this.validateOntologies(ontologies);
    this.ontologies = ontologies;
  }

  public setRegistryEntries(entries: RegistryEntry[]): void {
    this.conceptEntriesByUri = new Map();
    this.conceptEntriesByName = new Map();
    // Two entries claiming one IRI are two "definitions of record"; Registry spec §2.2 fails closed on an
    // unqualified collision, so neither is merged (the binding stays bare) rather than last-loaded winning.
    // Registry §2.2: identical declarations (the same document host-loaded and authored, say) are one
    // declaration; differing declarations of one name or one IRI are a collision.
    const differs = (a: RegistryEntry, b: RegistryEntry): boolean =>
      a.name !== b.name || a.version !== b.version || text(a.conceptUri) !== text(b.conceptUri);
    const contestedUris = new Set<string>();
    const contestedNames = new Set<string>();
    for (const entry of entries) {
      if (entry.category !== 'concept') {
        continue;
      }
      const byName = this.conceptEntriesByName.get(entry.name);
      if (byName && differs(byName, entry)) {
        contestedNames.add(entry.name);
      }
      this.conceptEntriesByName.set(entry.name, entry);
      const uri = text(entry.conceptUri);
      if (!uri) {
        continue;
      }
      const byUri = this.conceptEntriesByUri.get(uri);
      if (byUri && differs(byUri, entry)) {
        contestedUris.add(uri);
      }
      this.conceptEntriesByUri.set(uri, entry);
    }
    for (const uri of contestedUris) {
      this.conceptEntriesByUri.delete(uri);
    }
    // A name lookup must not resolve an entry the URI index refused (Registry §2.2 applies to both keys).
    for (const [name, entry] of this.conceptEntriesByName) {
      const uri = text(entry.conceptUri);
      if (contestedNames.has(name) || (uri !== undefined && contestedUris.has(uri))) {
        this.conceptEntriesByName.delete(name);
      }
    }
  }

  public resolve(path: string, audience: ReferenceAudience = 'agent'): FieldHelp {
    const vm = this.engine.getFieldVM(path);
    if (!vm) {
      throw new AssistError('NOT_FOUND', `Unknown field path: ${path}`, path);
    }
    const concept = this.resolveConcept(path);
    return {
      path,
      label: vm.label.value,
      references: resolveFieldReferences(this.references, path, audience),
      concept,
      equivalents: concept?.equivalents ?? [],
    };
  }

  /** Assist spec §5.3: Ontology binding (merged with the entry its URI names), then the `semanticType` entry, then the literal. */
  public resolveConcept(path: string): ResolvedConcept | undefined {
    const basePath = stripIndices(path);
    const wildcard = wildcardPath(path);

    for (let index = this.ontologies.length - 1; index >= 0; index -= 1) {
      const doc = this.ontologies[index];
      // The `[*]` key is the Ontology spec's form for repeatable-group children; the dotted key is accepted.
      const binding = doc.concepts?.[wildcard] ?? doc.concepts?.[basePath];
      if (binding) {
        return mergeConceptEntry(binding, this.conceptEntriesByUri.get(binding.concept), doc.defaultSystem);
      }
    }

    const item = this.fields.get(basePath)?.item as (FormItem & { semanticType?: string }) | undefined;
    const semanticType = item?.semanticType;
    if (semanticType) {
      const entry = this.conceptEntriesByName.get(semanticType);
      const uri = text(entry?.conceptUri);
      return uri ? mergeConceptEntry({ concept: uri }, entry) : { concept: semanticType };
    }

    return undefined;
  }

  private validateReferences(references: ReferencesDocument[]): void {
    const definition = this.engine.getDefinition();
    for (const doc of references) {
      validateTargetDefinition('references', doc.targetDefinition, definition);
      const [unresolved] = unresolvedReferenceRefs(doc);
      if (unresolved !== undefined) {
        throw new AssistError('x-invalid-sidecar', `Unknown reference definition: ${unresolved}`);
      }
    }
  }

  private validateOntologies(ontologies: OntologyDocument[]): void {
    const definition = this.engine.getDefinition();
    for (const doc of ontologies) {
      validateTargetDefinition('ontology', doc.targetDefinition, definition);
    }
  }
}

export function collectFieldMetadata(definition: FormDefinition): Map<string, FieldMetadata> {
  return buildFieldMetadata(definition);
}

/** Assist spec §5.2 step 10: the default cap on serialized `references`, and the floor a smaller request is raised to. */
export const DEFAULT_HELP_MAX_BYTES = 4096;

/** Assist spec §5.1: the fixed cap on `concept.definition` on the wire, in UTF-8 bytes including the trailing `…`. */
export const DEFINITION_MAX_BYTES = 1024;

const ELLIPSIS = '…';
const ELLIPSIS_BYTES = new TextEncoder().encode(ELLIPSIS).length;

/** Cut `value` to `maxBytes` of UTF-8 with a trailing `…`, never inside a multi-byte character. Unchanged when it fits. */
export function capUtf8(value: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length <= maxBytes) {
    return value;
  }
  let end = Math.max(0, maxBytes - ELLIPSIS_BYTES);
  // Back off continuation bytes (10xxxxxx) so the cut lands on a character boundary.
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) {
    end -= 1;
  }
  return `${new TextDecoder().decode(bytes.subarray(0, end))}${ELLIPSIS}`;
}

/** The wire projection of a References entry (§5.1): the small, trusted-enough keys; `content` only on request. */
const WIRE_REFERENCE_KEYS = ['title', 'type', 'uri', 'excerpt', 'rel', 'priority'] as const;

const PRIORITY_RANK: Record<string, number> = { primary: 0, supplementary: 1, background: 2 };

const utf8Length = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

type WireEntry = Record<string, unknown>;

function projectReferenceEntry(entry: ReferenceEntry, includeContent: boolean): WireEntry {
  const projected: WireEntry = {};
  for (const key of WIRE_REFERENCE_KEYS) {
    if (entry[key] !== undefined) {
      projected[key] = entry[key];
    }
  }
  if (includeContent && entry.content !== undefined) {
    projected.content = entry.content;
  }
  return projected;
}

/**
 * The model-facing projection of a `FieldHelp` (Assist spec §5.1–5.2): each reference entry keeps
 * `title`, `type`, `uri`, `excerpt`, `rel`, `priority` (+ `content` when `includeContent`), and the
 * serialized `references` object is held under `maxBytes` (UTF-8 bytes of compact JSON) by degrading
 * before dropping: strip `content`, then `excerpt`, then whole entries — never below one entry per
 * type. Every pass takes the lowest priority tier first (`background` → `supplementary` → `primary`);
 * within a tier, a later type group first, then the last entry in document order. `truncated.omitted`
 * counts dropped entries per type and is present whenever anything was cut. `concept.definition` is cut on its
 * own at {@link DEFINITION_MAX_BYTES} with a trailing `…` (§5.1). Pure; the input is not mutated.
 */
export function minimizeFieldHelp(help: FieldHelp, options: FieldHelpOptions = {}): FieldHelp {
  const includeContent = options.includeContent === true;
  // `maxBytes` below the floor is refused upstream by the tool schema (`minimum: 512`); in-process callers get the default.
  const maxBytes = options.maxBytes ?? DEFAULT_HELP_MAX_BYTES;
  const references: Record<string, WireEntry[]> = {};
  const candidates: Array<{ type: string; entry: WireEntry; rank: number; typeIndex: number; index: number }> = [];
  Object.entries(help.references).forEach(([type, entries], typeIndex) => {
    if (!entries || entries.length === 0) {
      return;
    }
    references[type] = entries.map((entry) => projectReferenceEntry(entry, includeContent));
    references[type].forEach((entry, index) => {
      candidates.push({ type, entry, rank: PRIORITY_RANK[String(entry.priority ?? 'supplementary')] ?? 1, typeIndex, index });
    });
  });
  candidates.sort((left, right) => right.rank - left.rank || right.typeIndex - left.typeIndex || right.index - left.index);

  const omitted: Record<string, number> = {};
  let cut = false;
  // Running byte total: each cut re-measures only the entry it touched, so the loop costs O(total bytes),
  // not O(cuts × total bytes). Stripping a key changes the entry's own length; dropping an entry from a
  // bucket that keeps at least one other removes the entry and one separating comma.
  let total = utf8Length(references);
  const stripKey = (key: 'content' | 'excerpt') => ({ entry }: (typeof candidates)[number]): boolean => {
    if (entry[key] === undefined) {
      return false;
    }
    const before = utf8Length(entry);
    delete entry[key];
    total += utf8Length(entry) - before;
    return true;
  };
  const cuts: Array<(candidate: (typeof candidates)[number]) => boolean> = [
    stripKey('content'),
    stripKey('excerpt'),
    ({ type, entry }) => {
      const bucket = references[type];
      if (bucket.length <= 1) {
        return false;
      }
      bucket.splice(bucket.indexOf(entry), 1);
      total -= utf8Length(entry) + 1;
      omitted[type] = (omitted[type] ?? 0) + 1;
      return true;
    },
  ];
  for (const apply of cuts) {
    for (const candidate of candidates) {
      if (total <= maxBytes) {
        break;
      }
      if (apply(candidate)) {
        cut = true;
      }
    }
  }

  return {
    ...help,
    references: references as FieldHelp['references'],
    ...(help.concept?.definition !== undefined
      ? { concept: { ...help.concept, definition: capUtf8(help.concept.definition, DEFINITION_MAX_BYTES) } }
      : {}),
    ...(cut ? { truncated: { omitted } } : {}),
  };
}

export function normalizeFieldPath(path: string): string {
  return stripIndices(path);
}
