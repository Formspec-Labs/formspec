import { describe, test, expect } from 'vitest';
import { createGenerator } from 'json-schema-faker';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = resolve(__dirname, '../../../schemas');

// ─── Schema loading & $ref resolution ────────────────────────────────

// token-registry retired per ADR 0150 §2.3/§4.2/§10 row 9 — Category/TokenEntry/
// TokenType $defs inlined into theme.schema.json. No standalone schema to fuzz.
const SCHEMA_FILES = [
  'issuer', 'definition', 'component', 'theme', 'mapping', 'registry', 'ontology',
  'references', 'validation-mapping', 'response-actions', 'experience', 'changelog',
  'response', 'intake-handoff', 'locale', 'verification-receipt', 'validation-report', 'validation-result', 'fel-functions',
];
const REF_SCHEMA_FILES = ['common', ...SCHEMA_FILES];

function loadSchemas() {
  const byId: Record<string, any> = {};
  const byFile: Record<string, any> = {};

  for (const name of REF_SCHEMA_FILES) {
    const raw = readFileSync(resolve(SCHEMAS_DIR, `${name}.schema.json`), 'utf-8');
    const schema = JSON.parse(raw);
    if (schema.$id) byId[schema.$id] = schema;
    byFile[`${name}.schema.json`] = schema;
  }

  return { byId, byFile };
}

const { byId, byFile } = loadSchemas();

/** Resolve a JSON Pointer fragment, including nested paths and RFC 6901 escapes. */
function resolvePointer(schema: any, fragment: string): any {
  return decodeURIComponent(fragment).slice(1).split('/').slice(1)
    .reduce((value, token) => value?.[token.replace(/~1/g, '/').replace(/~0/g, '~')], schema);
}

/** Inline local refs against their original document before moving them across files. */
function resolveLocalDefsRefs(obj: any, sourceSchema: Record<string, any>): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item: any) => resolveLocalDefsRefs(item, sourceSchema));

  if (typeof obj.$ref === 'string' && obj.$ref.startsWith('#/')) {
    const target = resolvePointer(sourceSchema, obj.$ref);
    if (target !== undefined) {
      const { $ref, ...siblings } = obj;
      return resolveLocalDefsRefs({ ...target, ...siblings }, sourceSchema);
    }
  }

  const result: any = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = resolveLocalDefsRefs(val, sourceSchema);
  }
  return result;
}

function resolveExternalRefs(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(resolveExternalRefs);

  if (typeof obj.$ref === 'string') {
    const ref: string = obj.$ref;

    if (ref.includes('#/$defs/')) {
      const [filePart, fragment] = ref.split('#');
      const fileName = filePart.replace(/^.*\//, '');
      const schema = byFile[fileName] || byId[filePart];
      if (schema) {
        const { $ref, ...siblings } = obj;
        const inlined = resolveLocalDefsRefs({ ...resolvePointer(schema, '#' + fragment), ...siblings }, schema);
        return resolveExternalRefs(inlined);
      }
    }

    if (byId[ref]) {
      const { $id, ...rest } = byId[ref];
      const inlined = resolveLocalDefsRefs({ ...rest }, byId[ref]);
      return resolveExternalRefs(inlined);
    }
  }

  const result: any = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = resolveExternalRefs(val);
  }
  return result;
}

function stripVendorKeywords(obj: any, parentKey?: string): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item: any) => stripVendorKeywords(item, parentKey));

  const result: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (parentKey !== 'properties' && key.startsWith('x-')) continue;
    result[key] = stripVendorKeywords(val, key);
  }
  return result;
}

/** Load schema with external refs resolved and $id stripped. */
function loadResolved(name: string) {
  const raw = JSON.parse(readFileSync(resolve(SCHEMAS_DIR, `${name}.schema.json`), 'utf-8'));
  const resolved = stripVendorKeywords(resolveExternalRefs(raw));
  delete resolved.$id;
  return resolved;
}

// ─── Tests ───────────────────────────────────────────────────────────

/**
 * Generate random instances and validate against the RESOLVED schema.
 *
 * json-schema-faker doesn't fully support if/then/else or complex allOf
 * conditional requirements, so not every generated instance will be valid.
 * We generate MAX_ATTEMPTS instances and require at least MIN_VALID to pass
 * schema validation — this proves the schema is self-consistent and the
 * faker can produce structurally correct instances.
 */
const MAX_ATTEMPTS = 20;
const MIN_VALID = 3;

// Schemas with heavy if/then/else conditionals that json-schema-faker
// can't reliably satisfy. These get more attempts and a lower bar.
const HARD_SCHEMAS = new Set(['mapping', 'theme']);

// json-schema-faker cannot reliably generate the verification receipt's
// registry URI and base64 patterns or satisfy the Response schema's
// conditionals. Their committed examples must meet the normal validity threshold.
const EXAMPLE_BACKED_SCHEMAS = new Set(['verification-receipt', 'response']);

test('inlined local refs resolve nested JSON pointers and escaped names', () => {
  const schema = { $defs: { 'a/b': { properties: { '~key': { type: 'string', minLength: 1 } } } } };
  expect(resolveLocalDefsRefs({ $ref: '#/$defs/a~1b/properties/~0key' }, schema))
    .toEqual({ type: 'string', minLength: 1 });
});

test('external nested JSON pointers retain their referenced schema', () => {
  expect(resolveExternalRefs({ $ref: 'https://formspec.org/schemas/response/1.0#/$defs/AuthoredSignature/properties/signingActId' }))
    .toEqual(byFile['response.schema.json'].$defs.AuthoredSignature.properties.signingActId);
});

test('external refs beside a local $ref are still resolved', () => {
  const resolved = resolveExternalRefs({
    $defs: {
      ComponentBase: { type: 'object' },
    },
    $ref: '#/$defs/ComponentBase',
    properties: {
      generation: {
        $ref: 'https://formspec.org/schemas/common/1.0#/$defs/Generation',
      },
    },
  });

  expect(resolved.$ref).toBe('#/$defs/ComponentBase');
  expect(resolved.properties.generation.$ref).toBeUndefined();
  expect(() => new Ajv2020({ strict: false }).compile(resolved)).not.toThrow();
});

const CUSTOM_VALID_INSTANCES: Record<string, any[]> = {
  definition: [
    {
      $formspec: '1.0',
      url: 'https://example.gov/forms/simple',
      version: '1.0.0',
      status: 'draft',
      title: 'Simple Definition',
      items: [
        { key: 'name', type: 'field', label: 'Name', dataType: 'string' },
      ],
    },
    {
      $formspec: '1.0',
      url: 'https://example.gov/forms/preparation',
      version: '2026.1.0',
      status: 'active',
      title: 'Preparation Definition',
      metadata: {
        preparation: {
          documents: [
            {
              id: 'proofOfIdentity',
              label: 'Proof of identity',
              required: true,
              itemPaths: ['applicantName'],
            },
          ],
          expectedAcquisitionWindows: {
            proofOfIdentity: {
              label: 'same day',
              minDays: 0,
              maxDays: 0,
            },
          },
        },
        assurance: {
          ial: 'L2',
          aal: 'L2',
          jurisdiction: 'example.gov',
        },
      },
      items: [
        { key: 'applicantName', type: 'field', label: 'Applicant name', dataType: 'string' },
      ],
    },
    {
      $formspec: '1.0',
      url: 'https://example.gov/forms/fee',
      version: '1.2.0',
      status: 'draft',
      title: 'Fee Definition',
      items: [
        { key: 'income', type: 'field', label: 'Income', dataType: 'decimal' },
        { key: 'filingFee', type: 'field', label: 'Filing fee', dataType: 'decimal' },
      ],
      variables: [
        { name: 'feeBase', expression: '$income', scope: '#' },
      ],
      binds: [
        { path: 'filingFee', calculate: '@feeBase * 0.1' },
      ],
      fees: {
        currency: 'USD',
        lineItems: [
          {
            id: 'filingFee',
            label: 'Filing fee',
            calculate: '@feeBase * 0.1',
          },
        ],
      },
    },
  ],
  'response-actions': [
    {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      targetDefinition: { url: 'https://example.gov/forms/intake' },
      actions: [
        {
          id: 'submit',
          intent: 'submit',
          effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
        },
      ],
    },
    {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      targetDefinition: {
        url: 'https://example.gov/forms/intake',
        compatibleVersions: '>=1.0.0',
      },
      actions: [
        {
          id: 'customSave',
          intent: 'x-custom-save',
          preconditions: [{ id: 'ready', expression: '@response.id != null', severity: 'block' }],
          validation: { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' },
          effects: [
            { type: 'ledgerAppend', eventKind: 'draft.saved', idempotencyKey: '@invocation.id' },
          ],
        },
      ],
    },
    {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      targetDefinition: { url: 'https://example.gov/forms/intake' },
      actions: [
        {
          id: 'handoff',
          intent: 'submit',
          effects: [
            { type: 'mappingExecution', mappingRef: 'payload', idempotencyKey: '@invocation.id & "/mapping"' },
            {
              type: 'handoffAssembly',
              handoffProfileRef: 'standard',
              recipientRef: 'workflowHost',
              idempotencyKey: '@invocation.id & "/handoff"',
            },
          ],
        },
      ],
    },
  ],
};

describe('schema fuzz: random instances validate against resolved schema', () => {
  for (const name of SCHEMA_FILES) {
    test(`${name}`, async () => {
      const resolved = loadResolved(name);
      const customInstances = CUSTOM_VALID_INSTANCES[name];
      const isHard = HARD_SCHEMAS.has(name);
      const needsExamples = EXAMPLE_BACKED_SCHEMAS.has(name);

      const ajv = new Ajv2020({ allErrors: true, strict: false });
      addFormats(ajv);
      const validate = ajv.compile(resolved);

      if (customInstances) {
        const failures = customInstances
          .map((instance, index) => ({ index, valid: validate(instance), errors: validate.errors }))
          .filter(result => !result.valid)
          .map(result => {
            const errs = (result.errors || []).slice(0, 3)
              .map(e => `${e.instancePath || '/'}: ${e.message}`);
            return `  instance ${result.index}: ${errs.join('; ')}`;
          });

        expect(failures, failures.join('\n')).toHaveLength(0);
        return;
      }

      const gen = createGenerator({
        fillProperties: true,
        optionalsProbability: 0.6,
        maxItems: 3,
        maxLength: 20,
      });

      // Hard schemas have conditional requirements (if/then/else) that
      // json-schema-faker can't reliably satisfy with optional-property
      // probability alone. Force all optional properties so conditionals
      // are always satisfied.
      const hardGen = createGenerator({
        fillProperties: true,
        alwaysFakeOptionals: true,
        useExamplesValue: true,
        maxItems: 3,
        maxLength: 20,
      });

      const exampleGen = createGenerator({
        fillProperties: true,
        useExamplesValue: true,
        optionalsProbability: 0.6,
        maxItems: 3,
        maxLength: 20,
      });

      const activeGen = isHard ? hardGen : needsExamples ? exampleGen : gen;

      const attempts = isHard ? 50 : MAX_ATTEMPTS;
      const minValid = isHard ? 1 : MIN_VALID;
      let validCount = 0;
      const failures: string[] = [];

      for (let i = 0; i < attempts; i++) {
        let instance: unknown;
        try {
          instance = await activeGen.generate(resolved);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`  attempt ${i}: generator error: ${message}`);
          continue;
        }

        if (validate(instance)) {
          validCount++;
        } else {
          const errs = (validate.errors || []).slice(0, 3)
            .map(e => `${e.instancePath || '/'}: ${e.message}`);
          failures.push(`  attempt ${i}: ${errs.join('; ')}`);
        }

        if (validCount >= minValid) break;
      }

      expect(
        validCount,
        `Only ${validCount}/${minValid} valid instances generated for ${name}.\n` +
        `Sample failures:\n${failures.slice(0, 5).join('\n')}`
      ).toBeGreaterThanOrEqual(minValid);
    });
  }
});
