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

const SCHEMA_FILES = [
  'definition', 'component', 'theme', 'mapping', 'registry',
  'response', 'verification-receipt', 'validation-report', 'validation-result', 'fel-functions',
  'token-registry',
];

function loadSchemas() {
  const byId: Record<string, any> = {};
  const byFile: Record<string, any> = {};

  for (const name of SCHEMA_FILES) {
    const raw = readFileSync(resolve(SCHEMAS_DIR, `${name}.schema.json`), 'utf-8');
    const schema = JSON.parse(raw);
    if (schema.$id) byId[schema.$id] = schema;
    byFile[`${name}.schema.json`] = schema;
  }

  return { byId, byFile };
}

const { byId, byFile } = loadSchemas();

/**
 * Recursively inline cross-file $refs so the schema is self-contained.
 * Local (#/) refs are left for faker/ajv to handle natively.
 */
/**
 * Resolve `#/$defs/X` refs within an object against a specific schema's $defs.
 * Used when inlining a definition from another schema whose local refs would
 * otherwise dangle in the target schema's context.
 */
function resolveLocalDefsRefs(obj: any, sourceDefs: Record<string, any>): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item: any) => resolveLocalDefsRefs(item, sourceDefs));

  if (typeof obj.$ref === 'string' && obj.$ref.startsWith('#/$defs/')) {
    const defName = obj.$ref.split('/').pop()!;
    if (sourceDefs[defName]) {
      return resolveLocalDefsRefs({ ...sourceDefs[defName] }, sourceDefs);
    }
  }

  const result: any = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = resolveLocalDefsRefs(val, sourceDefs);
  }
  return result;
}

function resolveExternalRefs(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(resolveExternalRefs);

  if (typeof obj.$ref === 'string') {
    const ref: string = obj.$ref;
    if (ref.startsWith('#')) return obj;

    if (ref.includes('#/$defs/')) {
      const [filePart, fragment] = ref.split('#');
      const fileName = filePart.replace(/^.*\//, '');
      const schema = byFile[fileName] || byId[filePart];
      if (schema) {
        const defName = fragment.split('/').pop()!;
        const inlined = resolveLocalDefsRefs({ ...schema.$defs[defName] }, schema.$defs || {});
        return resolveExternalRefs(inlined);
      }
    }

    if (byId[ref]) {
      const { $id, ...rest } = byId[ref];
      return resolveExternalRefs({ ...rest });
    }
  }

  const result: any = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = resolveExternalRefs(val);
  }
  return result;
}

/** Load schema with external refs resolved and $id stripped. */
function loadResolved(name: string) {
  const raw = JSON.parse(readFileSync(resolve(SCHEMAS_DIR, `${name}.schema.json`), 'utf-8'));
  const resolved = resolveExternalRefs(raw);
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
const HARD_SCHEMAS = new Set(['mapping']);

// Schemas with registry URI or base64 patterns that json-schema-faker does
// not reliably synthesize from pattern alone. Their committed examples remain
// subject to the normal validity threshold.
const EXAMPLE_BACKED_SCHEMAS = new Set(['verification-receipt']);

describe('schema fuzz: random instances validate against resolved schema', () => {
  for (const name of SCHEMA_FILES) {
    test(`${name}`, async () => {
      const resolved = loadResolved(name);
      const isHard = HARD_SCHEMAS.has(name);
      const needsExamples = EXAMPLE_BACKED_SCHEMAS.has(name);

      const ajv = new Ajv2020({ allErrors: true, strict: false });
      addFormats(ajv);
      const validate = ajv.compile(resolved);

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
        const instance = await activeGen.generate(resolved);
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
