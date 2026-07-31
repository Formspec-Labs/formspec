import { describe, expect, it } from 'vitest';
import {
  DATA_SOURCE_CONTRACT_CODES,
  validateDataSources,
  type AppGraphContext,
  type ResolvedArtifactHandle,
} from '../src/index.js';

const DEFINITION_URL = 'https://example.gov/forms/intake';
const CATALOG_URL = 'https://example.gov/data/intake';

function handle(
  slot: string,
  artifactKind: string,
  document: unknown,
  url: string,
): ResolvedArtifactHandle {
  return {
    slot,
    artifactKind,
    status: 'loaded',
    source: `memory://${slot}`,
    ref: { url, version: '1.0.0' },
    document,
  };
}

interface FixtureOptions {
  schema: unknown;
  items?: unknown[];
  definitions?: ResolvedArtifactHandle[];
  manifestDefinitionRefs?: Array<{ url: string; version: string }>;
}

function fixture(options: FixtureOptions): AppGraphContext {
  const definitions = options.definitions ?? [handle(
    'definitions[0]',
    'definition',
    {
      $formspec: '1.0',
      url: DEFINITION_URL,
      version: '1.0.0',
      items: options.items ?? [{ key: 'name', type: 'field', label: 'Name', dataType: 'string' }],
    },
    DEFINITION_URL,
  )];
  const manifest = handle(
    'app',
    'appManifest',
    {
      definitions: options.manifestDefinitionRefs ?? [{ url: DEFINITION_URL, version: '1.0.0' }],
      dataSources: [{ url: CATALOG_URL, version: '1.0.0' }],
    },
    'https://example.gov/apps/intake',
  );
  const catalog = handle(
    'dataSources[0]',
    'dataSources',
    {
      $formspecDataSources: '1.0',
      id: CATALOG_URL,
      version: '1.0.0',
      sources: [{
        id: 'response:intake',
        kind: 'definition-response',
        definitionRef: DEFINITION_URL,
        owner: 'host',
        scope: 'definition',
        availability: { level: 'app' },
        runtime: { delivery: 'draft', failure: 'block-render' },
        cache: { mode: 'draft' },
        schema: options.schema,
      }],
    },
    CATALOG_URL,
  );
  return {
    manifest,
    handles: [manifest, catalog, ...definitions],
    schemaResults: [],
    evidenceResults: [],
  };
}

function definition(
  slot: string,
  items: unknown[],
): ResolvedArtifactHandle {
  return handle(
    slot,
    'definition',
    {
      $formspec: '1.0',
      url: DEFINITION_URL,
      version: '1.0.0',
      items,
    },
    DEFINITION_URL,
  );
}

describe('definition-response source.schema describes Response.data', () => {
  it('rejects top-level FormResponse envelope properties with exact schema and Definition pointers', () => {
    const diagnostics = validateDataSources(fixture({
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          definition: { type: 'string' },
          status: { type: 'string' },
          authored: { type: 'string' },
          data: { type: 'object' },
        },
      },
      items: [{ key: 'name', type: 'field', label: 'Name', dataType: 'string' }],
    }));

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      DATA_SOURCE_CONTRACT_CODES.definitionDataSchemaMismatch,
      DATA_SOURCE_CONTRACT_CODES.definitionDataSchemaMismatch,
      DATA_SOURCE_CONTRACT_CODES.definitionDataSchemaMismatch,
      DATA_SOURCE_CONTRACT_CODES.definitionDataSchemaMismatch,
      DATA_SOURCE_CONTRACT_CODES.definitionDataSchemaMismatch,
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.primarySource?.jsonPointer)).toEqual([
      '/sources/0/schema/properties/authored',
      '/sources/0/schema/properties/data',
      '/sources/0/schema/properties/definition',
      '/sources/0/schema/properties/id',
      '/sources/0/schema/properties/status',
    ]);
    expect(diagnostics.every((diagnostic) =>
      diagnostic.relatedSources?.length === 1
      && diagnostic.relatedSources[0]?.artifactSlot === 'definitions[0]'
      && diagnostic.relatedSources[0]?.jsonPointer === '/items'
    )).toBe(true);
    expect(diagnostics[1]?.details).toMatchObject({
      reason: 'schema-property-not-definition-data-key',
      sourceRef: 'response:intake',
      definitionRef: DEFINITION_URL,
      property: 'data',
      definitionDataKeys: ['name'],
    });
  });

  it('accepts a field schema whose top-level properties are Definition data keys', () => {
    const diagnostics = validateDataSources(fixture({
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { name: { type: 'string' } },
      },
    }));

    expect(diagnostics).toEqual([]);
  });

  it('accepts legitimate Definition fields named status and data', () => {
    const diagnostics = validateDataSources(fixture({
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          data: { type: 'string' },
        },
      },
      items: [
        { key: 'status', type: 'field', label: 'Status', dataType: 'string' },
        { key: 'data', type: 'field', label: 'Data', dataType: 'string' },
      ],
    }));

    expect(diagnostics).toEqual([]);
  });

  it('fails closed on an unresolved Definition without guessing schema properties', () => {
    const diagnostics = validateDataSources(fixture({
      schema: { type: 'object', properties: { name: { type: 'string' } } },
      definitions: [],
    }));

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'DATA-SOURCE-AVAILABILITY-REF',
      primarySource: {
        artifactSlot: 'dataSources[0]',
        jsonPointer: '/sources/0/definitionRef',
      },
      relatedSources: [{
        artifactSlot: 'app',
        jsonPointer: '/definitions',
      }],
      details: {
        reason: 'source-definition-unresolved',
        manifestMatches: 1,
        definitionMatches: 0,
      },
    });
  });

  it('fails closed on an ambiguous exact Definition resolution', () => {
    const items = [{ key: 'name', type: 'field', label: 'Name', dataType: 'string' }];
    const diagnostics = validateDataSources(fixture({
      schema: { type: 'object', properties: { name: { type: 'string' } } },
      definitions: [definition('definitions[0]', items), definition('definitions[1]', items)],
    }));

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'DATA-SOURCE-AVAILABILITY-REF',
      primarySource: {
        jsonPointer: '/sources/0/definitionRef',
      },
      relatedSources: [{
        artifactSlot: 'app',
        jsonPointer: '/definitions',
      }, {
        artifactSlot: 'definitions[0]',
        jsonPointer: '/url',
      }, {
        artifactSlot: 'definitions[1]',
        jsonPointer: '/url',
      }],
      details: {
        reason: 'source-definition-ambiguous',
        manifestMatches: 1,
        definitionMatches: 2,
      },
    });
  });

  it('treats root groups as top-level keys and keeps nested repeat children nested', () => {
    const items = [{
      key: 'applications',
      type: 'group',
      label: 'Applications',
      repeatable: true,
      children: [{ key: 'recordId', type: 'field', label: 'Record ID', dataType: 'string' }],
    }, {
      key: 'count',
      type: 'field',
      label: 'Count',
      dataType: 'integer',
    }, {
      key: 'instructions',
      type: 'display',
      label: 'Instructions',
    }];
    const valid = validateDataSources(fixture({
      schema: {
        type: 'object',
        properties: {
          applications: {
            type: 'array',
            items: {
              type: 'object',
              properties: { recordId: { type: 'string' } },
            },
          },
          count: { type: 'integer' },
        },
      },
      items,
    }));
    expect(valid).toEqual([]);

    const nestedChildAtRoot = validateDataSources(fixture({
      schema: {
        type: 'object',
        properties: { recordId: { type: 'string' } },
      },
      items,
    }));
    expect(nestedChildAtRoot).toMatchObject([{
      code: DATA_SOURCE_CONTRACT_CODES.definitionDataSchemaMismatch,
      primarySource: {
        jsonPointer: '/sources/0/schema/properties/recordId',
      },
      relatedSources: [{
        artifactSlot: 'definitions[0]',
        jsonPointer: '/items',
      }],
      details: {
        property: 'recordId',
        definitionDataKeys: ['applications', 'count'],
      },
    }]);
  });

  it('reports unsupported top-level schema composition as indeterminate instead of guessing', () => {
    const diagnostics = validateDataSources(fixture({
      schema: {
        allOf: [{
          type: 'object',
          properties: { name: { type: 'string' } },
        }],
      },
    }));

    expect(diagnostics).toMatchObject([{
      code: DATA_SOURCE_CONTRACT_CODES.definitionDataSchemaIndeterminate,
      primarySource: {
        artifactSlot: 'dataSources[0]',
        jsonPointer: '/sources/0/schema/allOf',
      },
      relatedSources: [{
        artifactSlot: 'definitions[0]',
        jsonPointer: '/items',
      }],
      details: {
        reason: 'top-level-schema-composition-unsupported',
        unsupportedKeywords: ['allOf'],
      },
    }]);
  });
});
