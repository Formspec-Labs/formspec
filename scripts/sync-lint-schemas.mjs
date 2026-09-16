#!/usr/bin/env node
/**
 * @filedesc Sync canonical /schemas into crates/formspec-lint/schemas, and the two /specs JSON files the lint compiles in into crates/formspec-lint/specs.
 *
 * Mirrors only files already present in the lint crate. Drop a schema into
 * crates/formspec-lint/schemas to opt it into future syncs. The crate carries
 * these copies because a published crate cannot reach outside itself;
 * crates/formspec-lint/tests/mirror_is_canonical.rs fails when a copy is stale.
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

const SPECS_SRC = join(ROOT, 'specs');
const SPECS_DST = join(ROOT, 'crates/formspec-lint/specs');
for (const file of readdirSync(SPECS_DST).filter((f) => f.endsWith('.json')).sort()) {
  copyFileSync(join(SPECS_SRC, file), join(SPECS_DST, file));
  console.log(`synced specs/${file}`);
}
