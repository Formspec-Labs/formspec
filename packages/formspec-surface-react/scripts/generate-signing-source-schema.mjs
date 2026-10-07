/** @filedesc Materialize the canonical Common source schema for Registry's self-contained props validation. */
import { readFileSync, writeFileSync } from 'node:fs';
const schema = JSON.parse(readFileSync(new URL('../../../schemas/common.schema.json', import.meta.url), 'utf8'));
const source = schema.$defs.SigningContentSource;
const path = new URL('../src/generated/signing-content-source-schema.ts', import.meta.url);
const output = `/** AUTO-GENERATED from common.schema.json SigningContentSource; run npm run schema:generate. */\nexport const SIGNING_CONTENT_SOURCE_PROPS_SCHEMA = ${JSON.stringify(source, null, 2)} as const;\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== output) throw new Error('Signing source config schema is stale');
} else writeFileSync(path, output);
