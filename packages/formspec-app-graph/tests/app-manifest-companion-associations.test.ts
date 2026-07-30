/** @filedesc Schema gates for ordered plural companion-document associations. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const SCHEMAS = resolve(fileURLToPath(new URL('../../../schemas/', import.meta.url)));
const commonSchema = JSON.parse(
  readFileSync(resolve(SCHEMAS, 'common.schema.json'), 'utf8'),
);
const manifestSchema = JSON.parse(
  readFileSync(resolve(SCHEMAS, 'bundle-manifest.schema.json'), 'utf8'),
);
const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false,
});
ajv.addSchema(commonSchema);
const validate = ajv.compile(manifestSchema);

function manifest(partial: Record<string, unknown> = {}) {
  return {
    $formspecBundle: '2.4',
    version: '1.0.0',
    id: 'https://example.test/apps/companion-documents',
    definitions: [
      { url: 'https://example.test/definitions/organization', version: '1.0.0' },
      { url: 'https://example.test/definitions/public', version: '1.0.0' },
    ],
    ...partial,
  };
}

describe('App Manifest companion document associations', () => {
  it('preserves the legacy singleton associations', () => {
    expect(validate(manifest({
      references: { url: 'https://example.test/references/organization', version: '1.0.0' },
      ontology: { url: 'https://example.test/ontology/organization', version: '1.0.0' },
      responseActions: { url: 'https://example.test/response-actions/submit', version: '1.0.0' },
    }))).toBe(true);
  });

  it('accepts ordered plural target-aware associations in 2.4', () => {
    expect(validate(manifest({
      referenceDocuments: [
        { url: 'https://example.test/references/organization', version: '1.0.0' },
        { url: 'https://example.test/references/public', version: '1.0.0' },
      ],
      ontologies: [
        { url: 'https://example.test/ontology/organization', version: '1.0.0' },
        { url: 'https://example.test/ontology/public', version: '1.0.0' },
      ],
      responseActionDocuments: [
        { url: 'https://example.test/response-actions/submit', version: '1.0.0' },
        { url: 'https://example.test/response-actions/operations', version: '1.0.0' },
      ],
    }))).toBe(true);
  });

  it('rejects plural associations on older manifest versions', () => {
    expect(validate(manifest({
      $formspecBundle: '2.3',
      referenceDocuments: [
        { url: 'https://example.test/references/public', version: '1.0.0' },
      ],
      ontologies: [
        { url: 'https://example.test/ontology/public', version: '1.0.0' },
      ],
      responseActionDocuments: [
        { url: 'https://example.test/response-actions/operations', version: '1.0.0' },
      ],
    }))).toBe(false);
  });

  it('rejects empty plural association arrays', () => {
    expect(validate(manifest({
      referenceDocuments: [],
      ontologies: [],
      responseActionDocuments: [],
    }))).toBe(false);
  });
});
