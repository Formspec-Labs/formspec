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
