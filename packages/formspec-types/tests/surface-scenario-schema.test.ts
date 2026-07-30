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
