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

function normalizeEquivalents(equivalents?: ConceptEquivalent[]): ConceptEquivalent[] | undefined {
  if (!equivalents || equivalents.length === 0) {
    return undefined;
  }
  return equivalents.map((entry) => ({
    ...entry,
    type: entry.type ?? 'exact',
  }));
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
  private registryEntries: RegistryEntry[];

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
    this.registryEntries = registryEntries;
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
    this.registryEntries = entries;
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

  public resolveConcept(path: string): ConceptBinding | undefined {
    const basePath = stripIndices(path);
    const wildcard = wildcardPath(path);

    for (let index = this.ontologies.length - 1; index >= 0; index -= 1) {
      const doc = this.ontologies[index];
      const binding = doc.concepts?.[basePath] ?? doc.concepts?.[wildcard];
      if (binding) {
        return {
          ...binding,
          system: binding.system ?? doc.defaultSystem,
          equivalents: normalizeEquivalents(binding.equivalents),
        };
      }
    }

    const item = this.fields.get(basePath)?.item as (FormItem & { semanticType?: string }) | undefined;
    const semanticType = item?.semanticType;
    if (semanticType) {
      const registryEntry = this.registryEntries.find((entry) => entry.category === 'concept' && entry.name === semanticType);
      if (registryEntry?.conceptUri) {
        return {
          concept: String(registryEntry.conceptUri),
          system: registryEntry.conceptSystem ? String(registryEntry.conceptSystem) : undefined,
          code: registryEntry.conceptCode ? String(registryEntry.conceptCode) : undefined,
          display:
            typeof registryEntry.metadata?.displayName === 'string'
              ? registryEntry.metadata.displayName
              : registryEntry.description,
          equivalents: normalizeEquivalents(registryEntry.equivalents as ConceptEquivalent[] | undefined),
        };
      }
      return { concept: semanticType };
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
export const MIN_HELP_MAX_BYTES = 512;

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
 * counts dropped entries per type and is present whenever anything was cut. Pure; the input is not mutated.
 */
export function minimizeFieldHelp(help: FieldHelp, options: FieldHelpOptions = {}): FieldHelp {
  const includeContent = options.includeContent === true;
  const maxBytes = Math.max(MIN_HELP_MAX_BYTES, options.maxBytes ?? DEFAULT_HELP_MAX_BYTES);
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
  let over = utf8Length(references) > maxBytes;
  const cuts: Array<(candidate: (typeof candidates)[number]) => boolean> = [
    ({ entry }) => entry.content !== undefined && delete entry.content,
    ({ entry }) => entry.excerpt !== undefined && delete entry.excerpt,
    ({ type, entry }) => {
      const bucket = references[type];
      if (bucket.length <= 1) {
        return false;
      }
      bucket.splice(bucket.indexOf(entry), 1);
      omitted[type] = (omitted[type] ?? 0) + 1;
      return true;
    },
  ];
  for (const apply of cuts) {
    for (const candidate of candidates) {
      if (!over) {
        break;
      }
      if (apply(candidate)) {
        cut = true;
        over = utf8Length(references) > maxBytes;
      }
    }
  }

  return {
    ...help,
    references: references as FieldHelp['references'],
    ...(cut ? { truncated: { omitted } } : {}),
  };
}

export function normalizeFieldPath(path: string): string {
  return stripIndices(path);
}
