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
  OntologyDocument,
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

export function normalizeFieldPath(path: string): string {
  return stripIndices(path);
}
