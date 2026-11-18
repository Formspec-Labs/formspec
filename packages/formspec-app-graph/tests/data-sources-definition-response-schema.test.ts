/** @filedesc Catalog Response projection checks through the AppGraph engine port. */
import { beforeAll, describe, expect, it } from 'vitest';
import { initFormspecEngine, initFormspecEngineTools, lintDocument } from '@formspec-org/engine';
import {
  documentLintValidator,
  validateDataSources,
  type AppGraphContext,
  type ResolvedArtifactHandle,
} from '../src/index.js';

it.each([
  { name: 'a matching form and subject' },
  { name: 'mismatched route parameters', parameter: 'other', reason: 'subject-keys-invalid' },
  { name: 'an absent form slot', slotRef: 'missing', reason: 'form-unresolved' },
  { name: 'a bundled Definition that did not resolve', definitionRef: 'https://example.gov/unknown', reason: 'form-unresolved' },
  { name: 'a different widget contract', contract: 'test/other@1', reason: 'invalid-binding' },
  { name: 'a legacy Surface dialect', dialect: '0.3', reason: 'invalid-binding' },
  { name: 'legacy authored presentation', extra: { presentation: { locale: 'en', fields: {} } }, reason: 'invalid-binding' },
])('validates draft review with $name', ({
  parameter = 'unit', slotRef = 'report', definitionRef = DEFINITION_URL,
  contract = '@formspec-org/surface-react/ResponseReview@0.1', dialect = '0.4', extra, reason,
}) => {
  const definitionHandle = handle('definitions[0]', 'definition', {
    $formspec: '1.0', url: DEFINITION_URL, version: '1.0.0',
    subject: { type: 'urn:test:report', keys: { year: { dataType: 'integer' } } }, items: [],
  }, DEFINITION_URL);
  const base = fixture({ schema: { type: 'object' }, definitions: [definitionHandle] });
  const surfaceHandle = handle('surfaces[0]', 'surface', { $formspecSurface: dialect, routes: [
    { id: 'form', path: '/form/{unit}', params: [{ name: 'unit' }], slots: [{ id: 'report', slotType: 'definition-form',
      binding: { definitionRef, subjectKeys: { year: 'unit' } } }] },
    { id: 'review', path: `/review/{${parameter}}`, params: [{ name: parameter }], slots: [{ id: 'review', slotType: 'module-widget',
      binding: { moduleId: 'x-reports', widgetName: 'ResponseReview', draftReview: { routeRef: 'form', slotRef, ...extra } } }] },
  ] }, 'https://example.gov/surface');
  const registry = handle('registries[0]', 'registry', { entries: [
    { name: 'x-reports', category: 'module', version: '1.0.0', status: 'stable', contributes: ['x-review'] },
    { name: 'x-review', category: 'widget', version: '0.1.0', status: 'stable', widgetShape: {
      widgetName: 'ResponseReview', deliveryContractId: contract,
      dataInputs: ['definition', 'response', 'presentation'].map(name => ({ name, required: true })),
    } },
  ] }, 'https://example.gov/registry');
  const result = validateDataSources({ ...base, handles: [...base.handles, surfaceHandle, registry] });
  expect(result.filter(entry => entry.primarySource?.jsonPointer?.endsWith('/binding/draftReview'))
    .map(diagnostic => diagnostic.details?.reason)).toEqual(reason ? [reason] : []);
});

const DEFINITION_URL = 'https://example.gov/forms/intake';
const subject = { type: 'urn:example:filing', keys: {} };
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
  selection?: object;
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
      ...(options.selection ? { subject } : {}),
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
        ...(options.selection ? { responseSelection: options.selection } : { definitionRef: DEFINITION_URL }),
        owner: 'host',
        scope: 'definition',
        availability: { level: 'app' },
        runtime: { delivery: options.selection ? 'snapshot' : 'draft', failure: 'block-render' },
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
  version = '1.0.0',
): ResolvedArtifactHandle {
  const result = handle(
    slot,
    'definition',
    {
      $formspec: '1.0',
      url: DEFINITION_URL,
      version,
      subject,
      items,
    },
    DEFINITION_URL,
  );
  return { ...result, ref: { url: DEFINITION_URL, version } };
}

beforeAll(async () => {
  await initFormspecEngine();
  await initFormspecEngineTools();
});

// This fixture previously asserted the TS-only codes and details. It now exercises
// the composed graph and verifies the Rust code, source location and version.
function validate(context: AppGraphContext) {
  return [...validateDataSources(context), ...documentLintValidator(lintDocument)(context)]
    .filter(finding => finding.origin === 'app-graph-validator' || finding.code.startsWith('INSTANCE-PROJECTION-'));
}

describe('definition-response source.schema describes Response.data', () => {
  it('rejects top-level FormResponse envelope properties with exact schema and Definition pointers', () => {
    const diagnostics = validate(fixture({
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
      'INSTANCE-PROJECTION-PATH-MISSING',
      'INSTANCE-PROJECTION-PATH-MISSING',
      'INSTANCE-PROJECTION-PATH-MISSING',
      'INSTANCE-PROJECTION-PATH-MISSING',
      'INSTANCE-PROJECTION-PATH-MISSING',
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
    expect(diagnostics[1]?.details).toEqual({ upstreamVersion: '1.0.0' });
  });

  it('accepts a field schema whose top-level properties are Definition data keys', () => {
    const diagnostics = validate(fixture({
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { name: { type: 'string' } },
      },
    }));

    expect(diagnostics).toEqual([]);
  });

  it('accepts legitimate Definition fields named status and data', () => {
    const diagnostics = validate(fixture({
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

  it('accepts integer values under JSON Schema number and refuses incompatible types', () => {
    const items = [
      { key: 'count', type: 'field', label: 'Count', dataType: 'integer' },
      { key: 'name', type: 'field', label: 'Name', dataType: 'string' },
    ];
    const diagnostics = validate(fixture({
      items,
      schema: { type: 'object', properties: { count: { type: 'number' }, name: { type: 'boolean' } } },
    }));
    expect(diagnostics).toMatchObject([{
      code: 'INSTANCE-PROJECTION-FIELD-TYPE-MISMATCH',
      primarySource: { jsonPointer: '/sources/0/schema/properties/name/type' },
      details: { upstreamVersion: '1.0.0' },
    }]);
  });

  it('fails closed on an unresolved Definition without guessing schema properties', () => {
    const diagnostics = validate(fixture({
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
    const diagnostics = validate(fixture({
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
    const valid = validate(fixture({
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

    const nestedChildAtRoot = validate(fixture({
      schema: {
        type: 'object',
        properties: { recordId: { type: 'string' } },
      },
      items,
    }));
    expect(nestedChildAtRoot).toMatchObject([{
      code: 'INSTANCE-PROJECTION-PATH-MISSING',
      primarySource: {
        jsonPointer: '/sources/0/schema/properties/recordId',
      },
      relatedSources: [{
        artifactSlot: 'definitions[0]',
        jsonPointer: '/items',
      }],
      details: { upstreamVersion: '1.0.0' },
    }]);
  });

  it('reports unsupported top-level schema composition on the catalog source', () => {
    const diagnostics = validate(fixture({
      schema: {
        allOf: [{
          type: 'object',
          properties: { name: { type: 'string' } },
        }],
      },
    }));

    expect(diagnostics).toMatchObject([{
      code: 'INSTANCE-PROJECTION-SCHEMA-UNSUPPORTED',
      primarySource: {
        artifactSlot: 'dataSources[0]',
        jsonPointer: '/sources/0/schema/allOf',
      },
      // Schema composition is a source-level defect independent of upstream version.
      relatedSources: [],
      details: { upstreamVersion: null },
    }]);
  });
});

it('checks list item keys against the Definition selected by URL and range', () => {
  const diagnostics = validate(fixture({
    selection: {
      definition: { url: DEFINITION_URL, compatibleVersions: '^1.0.0' },
      subject: [],
      status: 'completed',
      cardinality: 'latest-per-subject',
      pin: 'none',
    },
    schema: { type: 'array', items: { type: 'object', properties: { missing: { type: 'string' } } } },
  }));
  expect(diagnostics).toMatchObject([{
    code: 'INSTANCE-PROJECTION-PATH-MISSING',
    primarySource: { jsonPointer: '/sources/0/schema/items/properties/missing' },
  }]);
});

describe('catalog Definition version range', () => {
  function selection(compatibleVersions: string, mapping?: string) {
    return {
      definition: { url: DEFINITION_URL, compatibleVersions },
      subject: [], status: 'completed', cardinality: 'latest', pin: 'none',
      ...(mapping === undefined ? {} : { mapping }),
    };
  }

  const schema = { type: 'object', properties: { name: { type: 'string' } } };

  it.each([
    ['^2.0.0', 'INSTANCE-PROJECTION-NO-ELIGIBLE-VERSION', ''],
    ['not a semver range', 'INSTANCE-PROJECTION-VERSION-INVALID', '/compatibleVersions'],
  ])('refuses an empty or invalid range %s', (range, code, suffix) => {
    expect(validate(fixture({ schema, selection: selection(range) }))).toMatchObject([{
      code,
      primarySource: { jsonPointer: `/sources/0/responseSelection/definition${suffix}` },
      details: { upstreamVersion: null },
    }]);
  });

  it('reports duplicate loaded copies of an admitted version', () => {
    expect(validate(fixture({
      schema, selection: selection('^1.0.0'),
      definitions: [definition('definitions[0]', []), definition('definitions[1]', [])],
    }))).toMatchObject([{
      code: 'INSTANCE-PROJECTION-VERSION-AMBIGUOUS',
      primarySource: { jsonPointer: '/sources/0/responseSelection/definition' },
    }]);
  });

  it('checks every distinct admitted version and excludes versions outside the range', () => {
    const definitions = [
      definition('definitions[0]', [{ key: 'name', type: 'field' }]),
      definition('definitions[1]', [], '1.1.0'),
      definition('definitions[2]', [], '2.0.0'),
    ];
    expect(validate(fixture({
      schema, selection: selection('^1.0.0'), definitions,
      manifestDefinitionRefs: definitions.map(handle => ({ url: DEFINITION_URL, version: handle.ref!.version! })),
    }))).toMatchObject([{
      code: 'INSTANCE-PROJECTION-PATH-MISSING',
      relatedSources: [{ artifactSlot: 'definitions[1]', jsonPointer: '/items' }],
    }]);
  });

  it('reports an unsupported Mapping on the catalog source', () => {
    expect(validate(fixture({
      schema, selection: selection('^1.0.0', 'urn:mapping:intake'),
    }))).toMatchObject([{
      code: 'INSTANCE-PROJECTION-SCHEMA-UNSUPPORTED',
      primarySource: { jsonPointer: '/sources/0/responseSelection/mapping' },
      // The catalog Mapping cannot be proved from any supplied version alone.
      details: { upstreamVersion: null },
    }]);
  });
});
