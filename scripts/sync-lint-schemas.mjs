#!/usr/bin/env node
/**
 * @filedesc Sync canonical /schemas into crates/formspec-lint/schemas.
 *
 * Mirrors only files already present in the lint crate. Drop a schema into
 * crates/formspec-lint/schemas to opt it into future syncs.
 */
import { copyFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'schemas');
const DST = join(ROOT, 'crates/formspec-lint/schemas');

const mirrored = readdirSync(DST)
  .filter((file) => file.endsWith('.schema.json') || file === 'token-registry.json')
  .sort();

for (const file of mirrored) {
  copyFileSync(join(SRC, file), join(DST, file));
  console.log(`synced ${file}`);
}
