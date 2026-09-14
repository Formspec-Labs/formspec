/** @filedesc Contract and runtime tests for qualified Definition form hydration. */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type {
  DataSource,
  DataSourcesDocument,
  FormDefinition,
  MappingDocument,
} from '@formspec-org/types';
import {
  loadDefinitionFormInitialData,
  planDefinitionFormInitialData,
  type DataSourceCatalogHandle,
  type MappingDocumentHandle,
} from '../src/index.js';

const DEFINITION_REF = 'https://example.test/definitions/profile';
const CATALOG_REF = 'https://example.test/data/profile';
const SOURCE_REF = 'response:profile';

const definition = {
  $formspec: '1.0',
  url: DEFINITION_REF,
  version: '1.0.0',
  title: 'Profile',
  items: [
    {
      key: 'displayName',
      type: 'field',
      label: 'Display name',
      dataType: 'string',
    },
  ],
} as unknown as FormDefinition;

function source(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: SOURCE_REF,
    kind: 'definition-response',
    definitionRef: DEFINITION_REF,
    definitionVersion: '1.0.0',
    responseSelection: {
      status: 'completed',
      cardinality: 'latest',
      orderBy: 'authored-desc',
      tieBreak: 'response-id-asc',
      partitionBy: 'definition',
    },
    owner: 'formspec',
    scope: 'definition',
    availability: { level: 'definition', definitionRef: DEFINITION_REF },
    runtime: {
      delivery: 'snapshot',
      cache: { mode: 'snapshot' },
      authorizationBoundary: 'host',
      failureMode: 'block-render',
      provenance: {
        kind: 'definition-response',
        source: 'selected completed response',
      },
    },
    schema: { type: 'object' },
    ...overrides,
  } as DataSource;
}

function catalog(value = source()): DataSourceCatalogHandle {
  return {
    catalogRef: CATALOG_REF,
    document: {
      $formspecDataSources: '1.0',
      id: CATALOG_REF,
      version: '1.0.0',
      sources: [value],
    } as DataSourcesDocument,
  };
}

const mappingDocument = {
  $formspecMapping: '1.0',
  version: '1.0.0',
  definitionRef: DEFINITION_REF,
  definitionVersion: '1.0.0',
  targetSchema: { format: 'json' },
  direction: 'both',
  conformanceLevel: 'bidirectional',
  rules: [
    {
      sourcePath: 'displayName',
      targetPath: 'display_name',
      transform: 'preserve',
    },
  ],
} as MappingDocument;

const mappingHandle: MappingDocumentHandle = {
  mappingRef: 'profileRecord',
  artifactRef: 'https://example.test/mappings/profile-record',
  document: mappingDocument,
};

function readyPlan(input: {
  mappingRef?: string | undefined;
  source?: DataSource | undefined;
} = {}) {
  const plan = planDefinitionFormInitialData({
    binding: {
      catalogRef: CATALOG_REF,
      sourceRef: SOURCE_REF,
      ...(input.mappingRef ? { mappingRef: input.mappingRef } : {}),
    },
    definition,
    definitionRef: DEFINITION_REF,
    catalogs: [catalog(input.source)],
    mappings: [mappingHandle],
    context: {
      surfaceRef: 'https://example.test/surfaces/app',
      routeId: 'edit',
      slotId: 'profile',
    },
  });
  if (plan.status !== 'ready') {
    throw new Error(`expected a ready plan, received ${plan.status}`);
  }
  return plan;
}

const context = {
  surfaceId: 'app',
  surfaceRef: 'https://example.test/surfaces/app',
  routeId: 'edit',
  slotId: 'profile',
  definitionRef: DEFINITION_REF,
  params: {},
  sessionGeneration: 'route-generation-2',
};

describe('definition-form initial-data schema', () => {
  it('admits only an exact source pair and optional Mapping handle', () => {
    const schema = JSON.parse(
      readFileSync(
        new URL('../../../schemas/surface.schema.json', import.meta.url),
        'utf8',
      ),
    ) as Record<string, any>;
    const binding = schema.$defs.DefinitionFormInitialDataBinding;
    expect(binding.required).toEqual(['catalogRef', 'sourceRef']);
    expect(binding.additionalProperties).toBe(false);
    expect(Object.keys(binding.properties).sort()).toEqual([
      'catalogRef',
      'mappingRef',
      'sourceRef',
      'x-generation',
    ]);
    expect(binding.properties.mappingRef.pattern).toBe(
      '^[a-zA-Z][a-zA-Z0-9_\\-]*$',
    );

    const definitionFormGate = schema.$defs.Slot.allOf.find(
      (gate: any) => gate.if?.properties?.slotType?.const === 'definition-form',
    );
    expect(
      definitionFormGate.then.properties.binding.properties.initialData.$ref,
    ).toBe('#/$defs/DefinitionFormInitialDataBinding');
  });
});

describe('planDefinitionFormInitialData', () => {
  it('resolves only the exact catalog, source, and Mapping handle', () => {
    expect(readyPlan()).toMatchObject({
      status: 'ready',
      binding: { catalogRef: CATALOG_REF, sourceRef: SOURCE_REF },
      descriptor: { catalogRef: CATALOG_REF, sourceRef: SOURCE_REF },
    });
    expect(readyPlan({ mappingRef: 'profileRecord' })).toMatchObject({
      status: 'ready',
      mapping: { mappingRef: 'profileRecord' },
    });

    expect(
      planDefinitionFormInitialData({
        binding: { catalogRef: CATALOG_REF, sourceRef: 'response:missing' },
        definition,
        definitionRef: DEFINITION_REF,
        catalogs: [catalog()],
        mappings: [mappingHandle],
        context: { routeId: 'edit', slotId: 'profile' },
      }),
    ).toMatchObject({ status: 'unresolved' });
    expect(
      planDefinitionFormInitialData({
        binding: {
          catalogRef: CATALOG_REF,
          sourceRef: SOURCE_REF,
          mappingRef: 'missingMapping',
        },
        definition,
        definitionRef: DEFINITION_REF,
        catalogs: [catalog()],
        mappings: [mappingHandle],
        context: { routeId: 'edit', slotId: 'profile' },
      }),
    ).toMatchObject({ status: 'unresolved' });
  });

  it('refuses a direct Definition Response for another Definition version', () => {
    expect(
      planDefinitionFormInitialData({
        binding: { catalogRef: CATALOG_REF, sourceRef: SOURCE_REF },
        definition,
        definitionRef: DEFINITION_REF,
        catalogs: [catalog(source({ definitionVersion: '2.0.0' }))],
        mappings: [],
        context: { routeId: 'edit', slotId: 'profile' },
      }),
    ).toMatchObject({ status: 'unavailable' });
  });

  it('refuses a Mapping that does not admit the loaded Definition version', () => {
    expect(
      planDefinitionFormInitialData({
        binding: {
          catalogRef: CATALOG_REF,
          sourceRef: SOURCE_REF,
          mappingRef: 'futureProfileRecord',
        },
        definition,
        definitionRef: DEFINITION_REF,
        catalogs: [catalog()],
        mappings: [
          {
            mappingRef: 'futureProfileRecord',
            artifactRef: 'https://example.test/mappings/future-profile-record',
            document: {
              ...mappingDocument,
              definitionVersion: '>=2.0.0 <3.0.0',
            },
          },
        ],
        context: { routeId: 'edit', slotId: 'profile' },
      }),
    ).toMatchObject({ status: 'unavailable' });
  });

  it('refuses a forward-only Mapping', () => {
    expect(
      planDefinitionFormInitialData({
        binding: {
          catalogRef: CATALOG_REF,
          sourceRef: SOURCE_REF,
          mappingRef: 'forwardProfileRecord',
        },
        definition,
        definitionRef: DEFINITION_REF,
        catalogs: [catalog()],
        mappings: [
          {
            mappingRef: 'forwardProfileRecord',
            artifactRef: 'https://example.test/mappings/forward-profile-record',
            document: {
              ...mappingDocument,
              direction: 'forward',
            },
          },
        ],
        context: { routeId: 'edit', slotId: 'profile' },
      }),
    ).toMatchObject({ status: 'unavailable' });
  });
});

describe('loadDefinitionFormInitialData', () => {
  it('delivers Response.data and preserves identity, generation, and revision separately', async () => {
    const order: string[] = [];
    const responseData = { displayName: 'Ada' };
    const delivery = await loadDefinitionFormInitialData({
      plan: readyPlan(),
      definition,
      definitionRef: DEFINITION_REF,
      context,
      authorize: () => {
        order.push('authorize');
        return { status: 'authorized' };
      },
      loader: () => {
        order.push('load');
        return {
          status: 'loaded',
          freshness: 'fresh',
          recordId: 'response-17',
          revision: 4,
          // Definition-response loaders deliver this Response.data object.
          value: responseData,
        };
      },
      validatePayload: ({ value }) => {
        order.push('validate');
        expect(value).toBe(responseData);
        return { valid: true };
      },
      site: { surfaceId: 'app', routeId: 'edit', slotId: 'profile' },
    });

    expect(order).toEqual(['authorize', 'load', 'validate']);
    expect(delivery).toEqual({
      status: 'ready',
      data: { displayName: 'Ada' },
      freshness: 'fresh',
      recordId: 'response-17',
      generation: 'route-generation-2',
      revision: 4,
      diagnostics: [],
    });
    if (delivery.status === 'ready') {
      expect(delivery.data).not.toHaveProperty('recordId');
      expect(delivery.data).not.toHaveProperty('generation');
      expect(delivery.data).not.toHaveProperty('revision');
    }
  });

  it('runs the resolved Mapping DSL document only when mappingRef is authored', async () => {
    const map = vi.fn(() => ({
      status: 'mapped' as const,
      data: { displayName: 'Mapped Ada' },
    }));
    const delivery = await loadDefinitionFormInitialData({
      plan: readyPlan({
        mappingRef: 'profileRecord',
        source: source({ kind: 'document-resource' } as Partial<DataSource>),
      }),
      definition,
      definitionRef: DEFINITION_REF,
      context,
      authorize: () => ({ status: 'authorized' }),
      loader: () => ({
        status: 'loaded',
        freshness: 'fresh',
        recordId: 'profile-2',
        value: { display_name: 'Mapped Ada' },
      }),
      validatePayload: () => ({ valid: true }),
      map,
      site: { routeId: 'edit', slotId: 'profile' },
    });

    expect(map).toHaveBeenCalledWith({
      mapping: mappingDocument,
      definition,
      value: { display_name: 'Mapped Ada' },
    });
    expect(delivery).toMatchObject({
      status: 'ready',
      data: { displayName: 'Mapped Ada' },
      recordId: 'profile-2',
    });
  });

  it('fails closed before load on authorization refusal', async () => {
    const loader = vi.fn();
    await expect(
      loadDefinitionFormInitialData({
        plan: readyPlan(),
        definition,
        definitionRef: DEFINITION_REF,
        context,
        authorize: () => ({ status: 'refused', reason: 'not this actor' }),
        loader,
        validatePayload: () => ({ valid: true }),
        site: { routeId: 'edit', slotId: 'profile' },
      }),
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'unauthorized' });
    expect(loader).not.toHaveBeenCalled();
  });

  it('fails closed when the delivered payload does not satisfy its schema', async () => {
    await expect(
      loadDefinitionFormInitialData({
        plan: readyPlan(),
        definition,
        definitionRef: DEFINITION_REF,
        context,
        authorize: () => ({ status: 'authorized' }),
        loader: () => ({
          status: 'loaded',
          freshness: 'fresh',
          recordId: 'response-18',
          value: { unexpected: true },
        }),
        validatePayload: () => ({ valid: false, reason: 'required property missing' }),
        site: { routeId: 'edit', slotId: 'profile' },
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'payload-invalid',
    });
  });
});
