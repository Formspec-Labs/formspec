#!/usr/bin/env node
/**
 * @filedesc Emit COMPONENT_SCHEMA_PROPS allowlist from schemas/component.schema.json.
 *
 * Usage: node scripts/generate-component-schema-props.mjs
 * Output: packages/formspec-core/src/generated/component-schema-props.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SCHEMA_PATH = resolve(ROOT, 'schemas/component.schema.json');
const OUT_PATH = resolve(ROOT, 'packages/formspec-core/src/generated/component-schema-props.ts');

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
const defs = schema.$defs;

const COMPONENT_BASE_KEYS = new Set(Object.keys(defs.ComponentBase.properties));
const STRUCTURAL_KEYS = new Set(['component', 'children', 'bind']);

/** @param {string} defName */
function typeSpecificProps(defName) {
  const def = defs[defName];
  if (!def?.properties) return [];
  return Object.keys(def.properties)
    .filter((key) => !COMPONENT_BASE_KEYS.has(key) && !STRUCTURAL_KEYS.has(key))
    .sort();
}

const componentNames = defs.AnyComponent.oneOf
  .map((entry) => entry.$ref?.split('/').pop())
  .filter((name) => name && name !== 'CustomComponentRef');

/** @type {Record<string, string[]>} */
const byType = {};
for (const name of componentNames) {
  byType[name] = typeSpecificProps(name);
}

const lines = [
  '/**',
  ' * AUTO-GENERATED — DO NOT EDIT',
  ' *',
  ' * Generated from schemas/component.schema.json by scripts/generate-component-schema-props.mjs.',
  ' * Re-run: npm run codegen:component-props (from packages/formspec-core)',
  ' */',
  '',
  'export const COMPONENT_BASE_PROP_NAMES = [',
  ...[...COMPONENT_BASE_KEYS].sort().map((k) => `  '${k}',`),
  '] as const;',
  '',
  'export const COMPONENT_SCHEMA_PROPS: Record<string, readonly string[]> = {',
];

for (const name of Object.keys(byType).sort()) {
  const props = byType[name];
  lines.push(`  ${name}: [${props.map((p) => `'${p}'`).join(', ')}],`);
}

lines.push('};', '');

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, `${lines.join('\n')}\n`);
console.log(`Wrote ${OUT_PATH} (${componentNames.length} component types)`);
