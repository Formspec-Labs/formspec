import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  readFileSync(
    resolve(here, '../../../schemas/surface-scenario.schema.json'),
    'utf8',
  ),
) as object;
const commonSchema = JSON.parse(
  readFileSync(
    resolve(here, '../../../schemas/common.schema.json'),
    'utf8',
  ),
) as object;
const ajv = new Ajv2020({ strict: true });
addFormats(ajv);
ajv.addSchema(commonSchema);
const responseSchema = JSON.parse(readFileSync(
  resolve(here, '../../../schemas/response.schema.json'),
  'utf8',
));
// Compile the reusable evidence definitions without the unrelated Response root rules.
ajv.addSchema({ $id: responseSchema.$id, $defs: responseSchema.$defs });
const selectionSchema = JSON.parse(readFileSync(
  resolve(here, '../../../schemas/response-selection.schema.json'), 'utf8',
));
ajv.addSchema(selectionSchema);
const validate = ajv.compile(schema);

const generation = {
  anchors: ['need:preview-loaded@3'],
};

function validScenario(): Record<string, unknown> {
  return {
    $formspecSurfaceScenario: '0.1',
    version: '1.0.0',
    initialPath: '/app',
    routeParams: {
      matterId: 'matter-123',
    },
    routeParamsGeneration: generation,
    defaultProfile: 'loaded',
    'x-generation': generation,
    profiles: {
      loaded: {
        authorization: {
          default: 'authorized',
          overrides: [
            {
              catalogRef: 'https://example.test/catalog',
              sourceRef: 'query:records',
              decision: 'refused',
            },
          ],
        },
        sources: [
          {
            catalogRef: 'https://example.test/catalog',
            sourceRef: 'query:records',
            status: 'loaded',
            freshness: 'fresh',
            value: [],
            'x-generation': generation,
          },
        ],
      },
    },
    actions: {
      default: {
        status: 'complete',
        'x-generation': generation,
      },
      byAction: {
        continue: {
          status: 'defer',
          'x-generation': generation,
        },
      },
    },
  };
}

describe('Surface Preview Scenario schema', () => {
  it('accepts qualified entries with direct common Generation provenance', () => {
    expect(validate(validScenario()), JSON.stringify(validate.errors)).toBe(true);
  });

  it('rejects unqualified source-id maps', () => {
    const value = validScenario();
    const loaded = (
      value.profiles as Record<string, Record<string, unknown>>
    ).loaded!;
    loaded.sources = {
      'query:records': {
        status: 'loaded',
        freshness: 'fresh',
        value: [],
      },
    };

    expect(validate(value)).toBe(false);
  });

  it('rejects malformed direct Generation provenance', () => {
    const value = validScenario();
    const loaded = (
      value.profiles as Record<string, Record<string, unknown>>
    ).loaded!;
    const source = (loaded.sources as Array<Record<string, unknown>>)[0]!;
    source['x-generation'] = {
      anchors: ['preview-loaded'],
    };

    expect(validate(value)).toBe(false);
  });

  it('rejects route-parameter provenance without a route-parameter map', () => {
    const value = validScenario();
    delete value.routeParams;

    expect(validate(value)).toBe(false);
  });
});

it('accepts catalog selection requests with only references, context and a digest', () => {
  const isolated = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true });
  addFormats(isolated);
  isolated.addSchema(selectionSchema);
  const validateRequest = isolated.getSchema(selectionSchema.$id + '#/$defs/ResponseSelectionRequest')!;
  const request = {
    key: 'list', kind: 'catalog', catalogRef: 'urn:catalog', sourceRef: 'response:list',
    catalogDigest: 'sha256:' + 'a'.repeat(64), routeParams: { year: '2026' }, consumerSubject: { year: 2026 },
  };
  expect(validateRequest(request), JSON.stringify(validateRequest.errors)).toBe(true);
  expect(validateRequest({ ...request, catalogDigest: undefined })).toBe(false);
  expect(validateRequest({ ...request, selection: { status: 'current' } })).toBe(false);
  expect(validateRequest({ key: 'local', kind: 'definition', scope: 'edition', selection: {
    definition: { url: 'urn:list' }, subject: [], status: 'completed', cardinality: 'latest', pin: 'none',
  } })).toBe(true);
  const validateOutcome = isolated.getSchema(selectionSchema.$id + '#/$defs/ResponseSelectionOutcome')!;
  expect(validateOutcome({ status: 'available', pinned: true, none: true, records: [],
    value: null, valueDigest: request.catalogDigest })).toBe(true);
  expect(validateOutcome({ status: 'unavailable', catalogRef: request.catalogRef })).toBe(false);
});

it('allows Generation provenance on preview filing fixtures', () => {
  const value = validScenario();
  const profile = (value.profiles as Record<string, Record<string, unknown>>).loaded!;
  profile.filings = [{ responseJson: '{}', 'x-generation': generation }];
  expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
});

it('validates declarative in-progress draft fixtures on scenario profiles', () => {
  const value = validScenario();
  const profile = (value.profiles as Record<string, Record<string, unknown>>).loaded!;
  profile.drafts = [
    {
      definitionUrl: 'https://example.test/definitions/annual-report',
      definitionVersion: '1.0.0',
      subject: {
        type: 'https://example.test/definitions/annual-report',
        keys: { year: 2026, unit: 'north' },
      },
      data: {
        summary: 'Draft in progress',
        rows: [{ code: 'A1' }],
      },
      responseId: 'urn:uuid:11111111-2222-4333-8444-555555555555',
      authored: '2026-01-15T12:00:00Z',
      'x-generation': generation,
    },
    {
      definitionUrl: 'https://example.test/definitions/intake',
      data: { applicantName: 'Alex Rivera' },
    },
  ];
  expect(validate(value), JSON.stringify(validate.errors)).toBe(true);

  // Rejects alias or unknown properties even when required definitionUrl and data are present.
  for (const alias of ['form', 'formId', 'id', 'status']) {
    const withAlias = validScenario();
    (withAlias.profiles as Record<string, Record<string, unknown>>).loaded!.drafts = [
      {
        definitionUrl: 'https://example.test/definitions/intake',
        data: {},
        [alias]: 'https://example.test/definitions/intake',
      },
    ];
    expect(validate(withAlias), `expected alias "${alias}" to be rejected`).toBe(false);
  }

  // Rejects standalone non-URI subject.type and invalid subject key names without needing a bundle.
  const badSubjectType = validScenario();
  (badSubjectType.profiles as Record<string, Record<string, unknown>>).loaded!.drafts = [
    {
      definitionUrl: 'https://example.test/definitions/annual-report',
      subject: {
        type: 'not a URI',
        keys: { year: 2026 },
      },
      data: {},
    },
  ];
  expect(validate(badSubjectType)).toBe(false);

  const badSubjectKeyName = validScenario();
  (badSubjectKeyName.profiles as Record<string, Record<string, unknown>>).loaded!.drafts = [
    {
      definitionUrl: 'https://example.test/definitions/annual-report',
      subject: {
        type: 'https://example.test/definitions/annual-report',
        keys: { 'bad-key': 1 },
      },
      data: {},
    },
  ];
  expect(validate(badSubjectKeyName)).toBe(false);

  // Rejects non-object data payload.
  const badData = validScenario();
  (badData.profiles as Record<string, Record<string, unknown>>).loaded!.drafts = [
    {
      definitionUrl: 'https://example.test/definitions/intake',
      data: ['not-an-object'],
    },
  ];
  expect(validate(badData)).toBe(false);

  // Rejects non-integer / non-string subject key values or extra subject.id.
  const badSubjectKey = validScenario();
  (badSubjectKey.profiles as Record<string, Record<string, unknown>>).loaded!.drafts = [
    {
      definitionUrl: 'https://example.test/definitions/annual-report',
      subject: {
        type: 'https://example.test/definitions/annual-report',
        keys: { year: 2026.5 },
      },
      data: {},
    },
  ];
  expect(validate(badSubjectKey)).toBe(false);

  const extraSubjectProp = validScenario();
  (extraSubjectProp.profiles as Record<string, Record<string, unknown>>).loaded!.drafts = [
    {
      definitionUrl: 'https://example.test/definitions/annual-report',
      subject: {
        type: 'https://example.test/definitions/annual-report',
        keys: { year: 2026 },
        id: 'should-be-derived',
      },
      data: {},
    },
  ];
  expect(validate(extraSubjectProp)).toBe(false);
});

it('keeps the bundled Core selection and evidence definitions in sync', () => {
  const { $defs } = selectionSchema;
  const validation = ({ title: _title, description: _description, $comment: _comment, ...body }:
    Record<string, unknown>) => body;
  const { $defs: core } = responseSchema;
  const common = commonSchema as { $id: string; $defs: Record<string, Record<string, unknown>> };
  const canonicalDefinition = validation(core.ResponseSelection.properties.definition);
  expect(canonicalDefinition.$ref).toBe(`${common.$id}#/$defs/TargetDefinition`);
  expect(validation($defs.ResponseSelection)).toEqual({
    ...validation(core.ResponseSelection),
    properties: {
      ...core.ResponseSelection.properties,
      definition: { ...canonicalDefinition, $ref: '#/$defs/TargetDefinition' },
    },
  });
  for (const name of ['SubjectPredicate', 'Sha256Digest', 'ResolvedInstanceRecord']) {
    expect(validation($defs[name])).toEqual(validation(core[name]));
  }
  expect(validation($defs.ResponseSelectionMapping)).toEqual(validation(core.ResolvedInstance.properties.mapping));
  expect(validation($defs.ResponseSelectionSubjectKeys).additionalProperties)
    .toEqual(responseSchema.properties.subject.properties.keys.additionalProperties);
  expect(validation($defs.TargetDefinition)).toEqual(validation(common.$defs.TargetDefinition!));
});
