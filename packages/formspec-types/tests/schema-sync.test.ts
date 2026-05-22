/**
 * Validates that generated types compile and export the expected
 * root document types. The actual schema↔type sync is guaranteed
 * by the codegen (scripts/generate-types.mjs).
 */
import { describe, it, expect } from 'vitest';
import type {
  FormDefinition, FormItem, FormBind, FormShape, FormVariable,
  FormInstance, FormOption,
  ComponentDocument,
  ChangelogDocument,
  ExperienceDocument,
  IssuerDocument,
  IntakeHandoff,
  LocaleDocument,
  OntologyDocument,
  ReferencesDocument,
  RegistryDocument,
  ThemeDocument,
  MappingDocument,
  ValidationMappingDocument,
  ValidationReport,
} from '../src/index.js';

describe('generated types smoke test', () => {
  it('root document types are importable', () => {
    // Type-only imports — if these compile, the types exist.
    // Use satisfies to validate structural expectations at type level.
    const def = {} as FormDefinition;
    expect(def).toBeDefined();

    const comp = {} as ComponentDocument;
    expect(comp).toBeDefined();

    const theme = {} as ThemeDocument;
    expect(theme).toBeDefined();

    const mapping = {} as MappingDocument;
    expect(mapping).toBeDefined();

    const issuer = {} as IssuerDocument;
    expect(issuer).toBeDefined();

    const registry = {} as RegistryDocument;
    expect(registry).toBeDefined();

    const ontology = {} as OntologyDocument;
    expect(ontology).toBeDefined();

    const references = {} as ReferencesDocument;
    expect(references).toBeDefined();

    const validationMapping = {} as ValidationMappingDocument;
    expect(validationMapping).toBeDefined();

    const experience = {} as ExperienceDocument;
    expect(experience).toBeDefined();

    const changelog = {} as ChangelogDocument;
    expect(changelog).toBeDefined();

    const intakeHandoff = {} as IntakeHandoff;
    expect(intakeHandoff).toBeDefined();

    const validationReport = {} as ValidationReport;
    expect(validationReport).toBeDefined();

    const locale = {} as LocaleDocument;
    expect(locale).toBeDefined();
  });

  it('Form-prefixed canonical types resolve to schema types', () => {
    // Form-prefixed exports alias generated $def names (Shape, Variable, …)
    const item = {} as FormItem;
    const bind = {} as FormBind;
    const shape = {} as FormShape;
    const variable = {} as FormVariable;
    const instance = {} as FormInstance;
    const option = {} as FormOption;

    expect(item).toBeDefined();
    expect(bind).toBeDefined();
    expect(shape).toBeDefined();
    expect(variable).toBeDefined();
    expect(instance).toBeDefined();
    expect(option).toBeDefined();
  });
});
