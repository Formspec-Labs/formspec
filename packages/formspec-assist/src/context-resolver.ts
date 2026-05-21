/** @filedesc Resolves References and Ontology sidecars into Assist field-help objects. */

import type { IFormEngine, RegistryEntry } from '@formspec-org/engine';
import type { FormDefinition, FormItem } from '@formspec-org/types';
import { AssistError } from './errors.js';
import type {
  BoundReference,
  ConceptBinding,
  ConceptEquivalent,
  FieldHelp,
  OntologyDocument,
  ReferenceEntry,
  ReferencesDocument,
} from './types.js';

type Audience = 'human' | 'agent' | 'both';

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

function priorityRank(priority?: string): number {
  switch (priority) {
    case 'primary':
      return 0;
    case 'background':
      return 2;
    default:
      return 1;
  }
}

function audienceMatches(entryAudience: Audience, requested: Audience): boolean {
  if (requested === 'both') {
    return true;
  }
  return entryAudience === 'both' || entryAudience === requested;
}

function refKey($ref: string): string | null {
  const match = $ref.match(/^#\/referenceDefs\/(.+)$/);
  return match ? match[1] : null;
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

function resolveReference(
  raw: ReferencesDocument['references'][number],
  defs: ReferencesDocument['referenceDefs'],
): BoundReference {
  if ('$ref' in raw && raw.$ref) {
    const key = refKey(raw.$ref);
    if (!key || !defs?.[key]) {
      throw new AssistError('x-invalid-sidecar', `Unknown reference definition: ${raw.$ref}`);
    }
    const { $ref: _ref, target, ...overrides } = raw as { $ref: string; target: string } & Partial<ReferenceEntry>;
    return {
      ...defs[key],
      ...overrides,
      target,
    } as BoundReference;
  }
  return raw as BoundReference;
}

function buildTargetCandidates(path: string): Set<string> {
  const base = stripIndices(path);
  const wildcard = wildcardPath(path);
  const targets = new Set<string>([path, base, wildcard]);
  targets.add('#');
  const parts = base.split('.');
  for (let index = parts.length - 1; index > 0; index -= 1) {
    targets.add(parts.slice(0, index).join('.'));
  }
  if (path !== base) {
    const wildcardParts = wildcard.split('.');
    for (let index = wildcardParts.length - 1; index > 0; index -= 1) {
      targets.add(wildcardParts.slice(0, index).join('.'));
    }
  }
  return targets;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }
  return 0;
}

function wildcardSatisfies(range: string, version: string): boolean {
  const rangeParts = range.split('.');
  const versionParts = version.split('.');
  return rangeParts.every((part, index) => part === 'x' || part === '*' || part === versionParts[index]);
}

function comparatorSatisfies(range: string, version: string): boolean {
  const match = range.match(/^(<=|>=|<|>|=)\s*(\d+(?:\.\d+){0,2})$/);
  if (!match) {
    return false;
  }
  const [, operator, targetVersion] = match;
  const comparison = compareVersions(version, targetVersion);
  switch (operator) {
    case '<':
      return comparison < 0;
    case '<=':
      return comparison <= 0;
    case '>':
      return comparison > 0;
    case '>=':
      return comparison >= 0;
    case '=':
      return comparison === 0;
    default:
      return false;
  }
}

function simpleRangeSatisfies(range: string, version: string): boolean {
  if (range === '*' || range.length === 0) {
    return true;
  }
  if (range === version) {
    return true;
  }
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
  if (range.includes(' ')) {
    return range.split(/\s+/).every((part) => simpleRangeSatisfies(part, version));
  }
  if (/[x*]/i.test(range)) {
    return wildcardSatisfies(range.toLowerCase(), version);
  }
  if (/^(<=|>=|<|>|=)/.test(range)) {
    return comparatorSatisfies(range, version);
  }
  return false;
}

function versionSatisfies(compatibleVersions: string | undefined, version: string | undefined): boolean {
  if (!compatibleVersions || !version) {
    return true;
  }
  return compatibleVersions
    .split('||')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .some((part) => simpleRangeSatisfies(part, version));
}

export function targetDefinitionMatches(
  target: { url?: string; compatibleVersions?: string } | undefined,
  definition: FormDefinition,
): boolean {
  if (!target || typeof target.url !== 'string' || target.url !== definition.url) {
    return false;
  }
  return versionSatisfies(target.compatibleVersions, definition.version);
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

  public resolve(path: string, audience: Audience = 'agent'): FieldHelp {
    const vm = this.engine.getFieldVM(path);
    if (!vm) {
      throw new AssistError('NOT_FOUND', `Unknown field path: ${path}`, path);
    }
    const concept = this.resolveConcept(path);
    return {
      path,
      label: vm.label.value,
      references: this.resolveReferences(path, audience),
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

  private resolveReferences(path: string, audience: Audience): Partial<Record<string, ReferenceEntry[]>> {
    const candidates = buildTargetCandidates(path);
    const grouped = new Map<string, Array<ReferenceEntry & { __order: number }>>();
    let order = 0;

    for (const doc of this.references) {
      for (const raw of doc.references ?? []) {
        const resolved = resolveReference(raw, doc.referenceDefs);
        if (!resolved || !candidates.has(resolved.target) || !audienceMatches(resolved.audience, audience)) {
          continue;
        }
        const bucket = grouped.get(resolved.type) ?? [];
        bucket.push({
          ...resolved,
          __order: order,
        });
        grouped.set(resolved.type, bucket);
        order += 1;
      }
    }

    return Object.fromEntries(
      [...grouped.entries()].map(([type, entries]) => [
        type,
        entries
          .slice()
          .sort((left, right) => {
            const priorityDiff = priorityRank(left.priority) - priorityRank(right.priority);
            return priorityDiff !== 0 ? priorityDiff : left.__order - right.__order;
          })
          .map(({ __order: _order, target: _target, ...entry }) => entry),
      ]),
    );
  }

  private validateReferences(references: ReferencesDocument[]): void {
    const definition = this.engine.getDefinition();
    for (const doc of references) {
      validateTargetDefinition('references', doc.targetDefinition, definition);
      for (const raw of doc.references ?? []) {
        if ('$ref' in raw && raw.$ref) {
          const key = refKey(raw.$ref);
          if (!key || !doc.referenceDefs?.[key]) {
            throw new AssistError('x-invalid-sidecar', `Unknown reference definition: ${raw.$ref}`);
          }
        }
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

export function normalizeFieldPath(path: string): string {
  return stripIndices(path);
}
