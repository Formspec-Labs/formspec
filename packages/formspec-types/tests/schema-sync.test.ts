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
  ResponseActionsDocument,
  DataSourcesDocument,
  ArtifactResolutionReport,
  AppGraphValidationReport,
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

    const responseActions = {} as ResponseActionsDocument;
    expect(responseActions).toBeDefined();

    const dataSources = {} as DataSourcesDocument;
    expect(dataSources).toBeDefined();

    const artifactResolutionReport = {} as ArtifactResolutionReport;
    expect(artifactResolutionReport).toBeDefined();

    const appGraphValidationReport = {} as AppGraphValidationReport;
    expect(appGraphValidationReport).toBeDefined();

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

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('generated types — tightness against permissive intersections', () => {
  it('Action and ValidationOverride do NOT carry [k: string]: unknown intersections', () => {
    // Schemas response-actions.schema.json declare additionalProperties: false
    // on Action and ValidationOverride. The generated TS types must NOT
    // intersect with `{ [k: string]: unknown }`; that widening accepts any
    // key and defeats the closedness contract the schema promises.
    const src = readFileSync(
      resolve(__dirname, '../src/generated/response-actions.ts'),
      'utf-8',
    );
    expect(src).not.toMatch(/export type Action = \{\s*\[k: string\]: unknown;\s*\} &/m);
    expect(src).not.toMatch(/export type ValidationOverride = \{\s*\[k: string\]: unknown;\s*\} &/m);
  });

  it('ActionIntent is NOT widened to a plain `| string` union', () => {
    // The schema declares ActionIntent as the closed enum OR an x-prefixed
    // publisher extension. `| string` collapses both to plain string and
    // swallows the closed-enum benefit. The generated type must keep the
    // enum literal union (template-literal `x-${string}` is the acceptable
    // form for the extension lane).
    const src = readFileSync(
      resolve(__dirname, '../src/generated/response-actions.ts'),
      'utf-8',
    );
    expect(src).not.toMatch(/ActionIntent =[^;]*\) \| string;/);
  });

  it('ValueClass preserves known classes plus x-* extensions', () => {
    const commonSrc = readFileSync(
      resolve(__dirname, '../src/generated/common.ts'),
      'utf-8',
    );
    const responseSrc = readFileSync(
      resolve(__dirname, '../src/generated/response.ts'),
      'utf-8',
    );
    expect(commonSrc).toContain('| `x-${string}`;');
    expect(commonSrc).not.toMatch(/export type ValueClass =[\s\S]*\| string;/);
    expect(responseSrc).toContain('class: ValueClass;');
    expect(responseSrc).toContain('value?: unknown;');
  });

  it('ValidationMapping ValidationTuple remains a required closed triple', () => {
    // ValidationTuple is the exact override shape. It must not collapse to
    // ValidationTuplePredicate, whose axes are optional and whose object is
    // intentionally open for composition by MappingEntry.
    const src = readFileSync(
      resolve(__dirname, '../src/generated/validation-mapping.ts'),
      'utf-8',
    );
    expect(src).not.toContain('export type ValidationTuple = ValidationTuplePredicate;');
    expect(src).toMatch(
      /export type ValidationTuple = \{\s*profile: ValidationProfile;\s*blocking: BlockingPolicy;\s*persistence: PersistencePolicy;\s*\};/m,
    );
  });

  it('Data Sources closed runtime and availability types do NOT carry broad indexes', () => {
    // Data Sources rejects fine-grained authorization fields and ambiguous
    // availability selectors through closed schema objects. Generated types
    // must not re-open those objects with `[k: string]: unknown`.
    const src = readFileSync(
      resolve(__dirname, '../src/generated/data-sources.ts'),
      'utf-8',
    );
    for (const typeName of ['DataSource', 'Availability', 'RuntimeBehavior', 'CacheRule']) {
      expect(src).not.toMatch(
        new RegExp(`export type ${typeName} = \\{\\s*\\[k: string\\]: unknown;\\s*\\} &`, 'm'),
      );
    }
    expect(src).toContain('[k: `x-${string}`]: unknown;');
  });

  it('AppGraphValidationReport Origin preserves known origins plus x-* extensions', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/generated/app-graph-validation-report.ts'),
      'utf-8',
    );
    expect(src).toContain('| `x-${string}`;');
    expect(src).not.toMatch(/export type Origin =[\s\S]*\| string;/);
  });

  it('ArtifactResolutionReport keeps resolver handles narrow and documents opaque', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/generated/artifact-resolution-report.ts'),
      'utf-8',
    );
    expect(src).toContain('| `x-${string}`;');
    expect(src).not.toMatch(/export type ArtifactResolutionHandleStatus =[\s\S]*\| string;/);
    expect(src).toContain('document?: unknown;');
    expect(src).toContain('[k: `x-${string}`]: unknown;');
  });

  it('ModuleResolutionReport keeps resolver origins and extension refs narrow', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/generated/module-resolution-report.ts'),
      'utf-8',
    );
    const indexSrc = readFileSync(
      resolve(__dirname, '../src/generated/index.ts'),
      'utf-8',
    );
    expect(src).toContain("export type ModuleResolutionOrigin = 'module-resolver';");
    expect(src).toContain("export type ModuleResolutionPhase = 'module-resolution';");
    expect(src).not.toMatch(/export type ModuleResolutionOrigin =[^;]*\| string;/);
    expect(src).not.toMatch(/export type ModuleResolutionPhase =[^;]*\| string;/);
    expect(src).toContain('[k: `x-${string}`]: unknown;');
    expect(indexSrc).toContain('ModuleResolutionReport');
  });
});
