#!/usr/bin/env node
/**
 * @filedesc Generates TypeScript interfaces from Formspec JSON schemas into src/generated/.
 *
 * Usage: node scripts/generate-types.mjs
 * Output: src/generated/<schema-name>.ts + src/generated/index.ts
 *
 * Each schema produces a self-contained .ts file. Post-processing then:
 *  1. Deduplicates numbered variants within each file (e.g. Publisher1→Publisher)
 *  2. Replaces cross-file duplicates with imports (e.g. theme→component $refs)
 *  3. Generates a collision-free barrel (first declared schema wins)
 */
import { compile } from 'json-schema-to-typescript';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = resolve(__dirname, '../../../schemas');
const OUT_DIR = resolve(__dirname, '../src/generated');
const VM_MASTER_TABLE_FIXTURE = resolve(
  __dirname,
  '../../../tests/conformance/fixtures/validation-mapping/closed-core-5-rows-jcs.json',
);

/**
 * Map formspec.org $id URIs to local schema files.
 * Schemas use full URIs as $id (e.g. https://formspec.org/schemas/validationResult/1.0)
 * and $ref each other by those URIs. This map resolves them locally.
 */
const URI_TO_LOCAL = {};
// token-registry retired per ADR 0150 §2.3/§4.2/§10 row 9 — Category/TokenEntry/
// TokenType $defs inlined into theme.schema.json. No standalone schema to load.
for (const f of ['common', 'issuer', 'definition', 'component', 'theme', 'mapping', 'registry',
  'ontology', 'references', 'validation-mapping', 'experience', 'changelog',
  'response-actions', 'response', 'intake-handoff', 'validation-report', 'validation-result',
  'fel-functions', 'screener', 'determination', 'surface', 'data-sources',
  'app-graph-validation-report', 'module-resolution-report', 'verification-receipt']) {
  const filePath = resolve(SCHEMAS_DIR, `${f}.schema.json`);
  if (existsSync(filePath)) {
    const s = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (s.$id) URI_TO_LOCAL[s.$id] = filePath;
  }
}

/** Custom $refParser options to resolve formspec.org URIs to local files. */
const $refOptions = {
  resolve: {
    formspec: {
      order: 1,
      canRead: (file) => file.url in URI_TO_LOCAL || Object.values(URI_TO_LOCAL).some(v => file.url.endsWith(basename(v))),
      read: (file) => {
        const local = URI_TO_LOCAL[file.url];
        if (local) return readFileSync(local, 'utf-8');
        // Fallback: try matching by filename
        for (const [, path] of Object.entries(URI_TO_LOCAL)) {
          if (file.url.endsWith(basename(path))) return readFileSync(path, 'utf-8');
        }
        throw new Error(`Cannot resolve: ${file.url}`);
      },
    },
  },
};

function resolveLocalDefsRefs(value, defs) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => resolveLocalDefsRefs(item, defs));
  if (typeof value.$ref === 'string' && value.$ref.startsWith('#/$defs/')) {
    const defName = value.$ref.split('/').pop();
    return resolveLocalDefsRefs(defs[defName], defs);
  }

  const next = {};
  for (const [key, child] of Object.entries(value)) {
    next[key] = resolveLocalDefsRefs(child, defs);
  }
  return next;
}

function inlineResponseActionsCompileRefs(schema) {
  const vmPath = URI_TO_LOCAL['https://formspec.org/schemas/validationMapping/1.0'];
  const vmSchema = JSON.parse(readFileSync(vmPath, 'utf-8'));
  const vmDefs = vmSchema.$defs || {};

  function walk(value) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(walk);

    if (typeof value.$ref === 'string' && value.$ref.startsWith('https://formspec.org/schemas/validationMapping/1.0#/$defs/')) {
      const defName = value.$ref.split('/').pop();
      return resolveLocalDefsRefs(vmDefs[defName], vmDefs);
    }

    const next = {};
    for (const [key, child] of Object.entries(value)) {
      next[key] = walk(child);
    }
    return next;
  }

  return walk(schema);
}

function withComponentBaseFields(source, schema) {
  const componentRefs = schema?.$defs?.AnyComponent?.oneOf ?? [];
  const componentNames = componentRefs
    .map((entry) => entry?.$ref?.split('/').pop())
    .filter((name) => name && name !== 'ComponentBase');

  let next = source;
  for (const name of componentNames) {
    next = next.replace(
      new RegExp(`export interface ${name} \\{`),
      `export interface ${name} extends ComponentBase {`,
    );
    next = next.replace(
      new RegExp(`export type ${name} = (?!ComponentBase & )`),
      `export type ${name} = ComponentBase & `,
    );
  }
  return next;
}

/** Schema files to generate types from. Order matters: earlier = canonical source. */
const SCHEMA_SOURCES = [
  { file: 'common.schema.json', title: 'CommonSchema' },
  { file: 'issuer.schema.json', title: 'IssuerDocument' },
  { file: 'definition.schema.json', title: 'FormDefinition' },
  { file: 'component.schema.json', title: 'ComponentDocument' },
  { file: 'theme.schema.json', title: 'ThemeDocument' },
  { file: 'mapping.schema.json', title: 'MappingDocument' },
  { file: 'registry.schema.json', title: 'RegistryDocument' },
  { file: 'ontology.schema.json', title: 'OntologyDocument' },
  { file: 'references.schema.json', title: 'ReferencesDocument' },
  { file: 'validation-mapping.schema.json', title: 'ValidationMappingDocument' },
  { file: 'response-actions.schema.json', title: 'ResponseActionsDocument' },
  { file: 'experience.schema.json', title: 'ExperienceDocument' },
  { file: 'changelog.schema.json', title: 'ChangelogDocument' },
  { file: 'validation-result.schema.json', title: 'ValidationResult' },
  { file: 'verification-receipt.schema.json', title: 'VerificationReceipt' },
  { file: 'response.schema.json', title: 'FormResponse' },
  { file: 'intake-handoff.schema.json', title: 'IntakeHandoff' },
  { file: 'validation-report.schema.json', title: 'ValidationReport' },
  { file: 'locale.schema.json', title: 'LocaleDocument' },
  { file: 'fel-functions.schema.json', title: 'FELFunctionCatalog' },
  { file: 'screener.schema.json', title: 'ScreenerDocument' },
  { file: 'determination.schema.json', title: 'DeterminationRecord' },
  { file: 'surface.schema.json', title: 'SurfaceDocument' },
  { file: 'data-sources.schema.json', title: 'DataSourcesDocument' },
  { file: 'artifact-resolution-report.schema.json', title: 'ArtifactResolutionReport' },
  { file: 'app-graph-validation-report.schema.json', title: 'AppGraphValidationReport' },
  { file: 'module-resolution-report.schema.json', title: 'ModuleResolutionReport' },
];

const FILE_BANNER = `/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
`;

// ─── Helpers ──────────────────────────────────────────────────────────

/** Extract exported type/interface names from TS source. */
function extractExportedNames(source) {
  const names = [];
  for (const m of source.matchAll(/^export (?:interface|type) (\w+)/gm)) {
    names.push(m[1]);
  }
  // Also catch re-export syntax: export type { Foo };
  for (const m of source.matchAll(/^export type \{ (\w+) \};?/gm)) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

/**
 * Extract the structural body of a named type/interface, normalized for comparison.
 * Handles `interface Foo { }` and `type Foo = { } & { };` (intersection types).
 */
function extractNormalizedBody(source, name) {
  const re = new RegExp(`export (?:interface|type) ${name}\\b`);
  const match = re.exec(source);
  if (!match) return null;

  // Find the first { after the declaration
  let pos = match.index + match[0].length;
  while (pos < source.length && source[pos] !== '{') pos++;
  if (pos >= source.length) return null;

  // Count braces to find the full body, handling intersection continuations
  const start = pos;
  let depth = 0;
  while (pos < source.length) {
    if (source[pos] === '{') depth++;
    else if (source[pos] === '}') {
      depth--;
      if (depth === 0) {
        // Peek ahead for & (intersection continuation)
        let peek = pos + 1;
        while (peek < source.length && /[\s\n]/.test(source[peek])) peek++;
        if (source[peek] === '&') { pos = peek + 1; continue; }
        break;
      }
    }
    pos++;
  }

  return source.substring(start, pos + 1)
    .replace(/\/\*\*[\s\S]*?\*\//g, '') // strip JSDoc
    .replace(/\/\/.*/g, '')              // strip line comments
    .replace(/\s+/g, ' ')               // normalize whitespace
    .trim();
}

/** Remove a complete declaration block (preceding JSDoc + export) from source. */
function removeDeclBlock(source, name) {
  const re = new RegExp(`export (?:interface|type) ${name}\\b`);
  const match = re.exec(source);
  if (!match) return source;

  // Find block start — include preceding JSDoc
  let start = match.index;
  const before = source.substring(0, start).trimEnd();
  if (before.endsWith('*/')) {
    const jsdocIdx = before.lastIndexOf('/**');
    if (jsdocIdx !== -1) start = jsdocIdx;
  }
  // Eat preceding blank lines (keep one separator)
  while (start > 0 && source[start - 1] === '\n') start--;
  if (start > 0) start++;

  // Find block end — matching closing brace, handling intersections
  let pos = match.index + match[0].length;
  const nextBrace = source.indexOf('{', pos);
  const nextSemicolon = source.indexOf(';', pos);
  if (nextSemicolon !== -1 && (nextBrace === -1 || nextSemicolon < nextBrace)) {
    pos = nextSemicolon + 1;
    while (pos < source.length && source[pos] === '\n') pos++;
    return source.substring(0, start) + source.substring(pos);
  }

  if (nextBrace === -1) return source;
  pos = nextBrace;
  let depth = 0;
  while (pos < source.length) {
    if (source[pos] === '{') depth++;
    else if (source[pos] === '}') {
      depth--;
      if (depth === 0) {
        let peek = pos + 1;
        while (peek < source.length && /[\s\n]/.test(source[peek])) peek++;
        if (source[peek] === '&') { pos = peek + 1; continue; }
        pos++;
        if (pos < source.length && source[pos] === ';') pos++;
        while (pos < source.length && source[pos] === '\n') pos++;
        break;
      }
    }
    pos++;
  }

  return source.substring(0, start) + source.substring(pos);
}

// ─── Post-processing passes ──────────────────────────────────────────

function addCommonImport(source, names) {
  const importRe = /import type \{ ([^}]+) \} from '\.\/common\.js';/;
  const match = importRe.exec(source);
  if (match) {
    const existing = match[1].split(',').map(s => s.trim()).filter(Boolean);
    for (const name of names) {
      if (!existing.includes(name)) existing.push(name);
    }
    return source.replace(importRe, `import type { ${existing.join(', ')} } from './common.js';`);
  }
  const inserted = source.replace(
    '/* eslint-disable */\n',
    `/* eslint-disable */\nimport type { ${names.join(', ')} } from './common.js';\n`
  );
  return inserted !== source
    ? inserted
    : `import type { ${names.join(', ')} } from './common.js';\n${source}`;
}

function dedupeTypeImports(source) {
  const importsBySource = new Map();
  let result = source.replace(
    /^import type \{ ([^}]+) \} from '([^']+)';\n?/gm,
    (_line, names, from) => {
      if (!importsBySource.has(from)) importsBySource.set(from, []);
      const imports = importsBySource.get(from);
      for (const name of names.split(',').map(s => s.trim()).filter(Boolean)) {
        if (!imports.includes(name)) imports.push(name);
      }
      return '';
    },
  );

  if (importsBySource.size === 0) return source;

  const lines = [...importsBySource.entries()]
    .map(([from, names]) => `import type { ${names.join(', ')} } from '${from}';`)
    .join('\n');
  result = result.replace('/* eslint-disable */\n', `/* eslint-disable */\n${lines}\n`);
  return result.replace(/\n{3,}/g, '\n\n');
}

function customComponentNameType() {
  const prefixes = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    .split('')
    .map(ch => `  | \`${ch}\${string}\``)
    .join('\n');
  return `export type CustomComponentName =\n${prefixes};\n`;
}

/**
 * Fix known codegen issues:
 * - patternProperties generates `[k: string]: {}` which is too narrow
 *   when named properties have richer types. Widen to `unknown`.
 * - x-* extension lanes are patternProperties/propertyNames in schema; restore
 *   template-literal key types so non-extension root keys stay rejected.
 * - JSON Schema string patterns collapse to `string`; restore the few
 *   public authoring contracts TypeScript can represent directly.
 */
function postProcess(ts, moduleName) {
  let result = ts.replace(/\[k: string\]: \{\};/g, '[k: string]: unknown;');
  result = result.replace(
    /(via the `patternProperty` "\^x-"\.\n\s+\*\/\n\s*)\[k: string\]: unknown;/g,
    '$1[k: `x-${string}`]: unknown;'
  );

  if (moduleName === 'common') {
    result = result.replace(
      /export type ValueClass =\n  \| (\([^\n]+\))\n  \| string;/m,
      'export type ValueClass =\n  | $1\n  | `x-${string}`;',
    );
    result = result.replace(
      'export type CustomWidgetName = string;',
      'export type CustomWidgetName = `x-${string}`;',
    );
    result = result.replace(
      'export interface Extensions {}',
      'export interface Extensions {\n  [k: `x-${string}`]: unknown;\n}',
    );
  }

  if (moduleName === 'definition') {
    result = addCommonImport(result, ['WidgetName', 'Extensions']);
    result = result.replace(/widgetHint\?:[\s\S]*?;\n  \/\*\*/m, 'widgetHint?: WidgetName;\n  /**');
    result = result.replace(/extensions\?: \{\};/g, 'extensions?: Extensions;');
  }

  if (moduleName === 'theme') {
    result = addCommonImport(result, ['ThemeWidgetName', 'Extensions']);
    result = result.replace(/widget\?:[\s\S]*?;\n  \/\*\*/gm, 'widget?: ThemeWidgetName;\n  /**');
    result = result.replace(/extensions\?: \{\};/g, 'extensions?: Extensions;');
  }

  if (moduleName === 'component') {
    result = result.replace(
      /export interface CustomComponentRef \{/,
      `${customComponentNameType()}\nexport interface CustomComponentRef {`,
    );
    result = result.replace(
      /(export interface CustomComponentRef \{[\s\S]*?component: )string(;)/m,
      '$1CustomComponentName$2',
    );
  }

  if (moduleName === 'response-actions') {
    // Schema declares additionalProperties: false on Action and
    // ValidationOverride. The codegen emits an intersection with
    // `{ [k: string]: unknown }` for any object with patternProperties
    // anywhere in its inheritance chain (here: VM ValidationTuple's
    // composed-in ValidationTuplePredicate). Strip that intersection so
    // the closedness contract the schema promises survives in TS.
    result = result.replace(
      /export type Action = \{\s*\[k: string\]: unknown;\s*\} & (\{[\s\S]*?\n\});/m,
      'export type Action = $1;'
    );
    result = result.replace(
      /export type ValidationOverride = \{\s*\[k: string\]: unknown;\s*\} & (\{[\s\S]*?\n\});/m,
      'export type ValidationOverride = $1;'
    );
    // ActionIntent: schema declares it as the closed enum OR x-prefixed
    // publisher extension. The codegen emits `(enum) | string` which
    // collapses the closed-enum benefit. Replace `| string` with
    // `| \`x-${string}\`` so the extension lane still types correctly.
    result = result.replace(
      /export type ActionIntent = (\([^)]+\)) \| string;/,
      'export type ActionIntent = $1 | `x-${string}`;'
    );
  }

  if (moduleName === 'response') {
    result = addCommonImport(result, ['ValueClass']);
    result = result.replace(
      /(export interface ResponseProvenanceEntry \{[\s\S]*?  \*\/\n  )class:[\s\S]*?;\n  \/\*\*/m,
      '$1class: ValueClass;\n  /**',
    );
    result = result.replace(
      /(export interface ResponseDerivationEntry \{[\s\S]*?  \*\/\n  )value\?: \{\s*\[k: string\]: unknown;\s*\};/m,
      '$1value?: unknown;',
    );
  }

  if (moduleName === 'validation-mapping') {
    result = result.replace(
      'export type ValidationTuple = ValidationTuplePredicate;',
      `export type ValidationTuple = {
  profile: ValidationProfile;
  blocking: BlockingPolicy;
  persistence: PersistencePolicy;
};`,
    );
  }

  if (moduleName === 'data-sources') {
    // json-schema-to-typescript widens some allOf/conditional closed
    // objects into `{ [k: string]: unknown } & {...}`. Data Sources relies on
    // closed objects to reject fine-grained authorization and ambiguous
    // availability fields, so strip the broad intersection while preserving
    // explicit x-* extension lanes on DataSource.
    for (const name of ['DataSource', 'Availability', 'RuntimeBehavior', 'CacheRule']) {
      result = result.replace(
        new RegExp(`export type ${name} = \\{\\s*\\[k: string\\]: unknown;\\s*\\} & (\\{[\\s\\S]*?\\n\\});`, 'm'),
        `export type ${name} = $1;`
      );
    }
  }

  if (moduleName === 'app-graph-validation-report') {
    result = result.replace(
      /export type Origin =\s*\|\s*\('app-graph-validator' \| 'artifact-resolver' \| 'module-resolver' \| 'surface-local-lint' \| 'schema-validator'\)\s*\|\s*string;/m,
      "export type Origin =\n  | ('app-graph-validator' | 'artifact-resolver' | 'module-resolver' | 'surface-local-lint' | 'schema-validator')\n  | `x-${string}`;",
    );
  }

  if (moduleName === 'artifact-resolution-report') {
    result = result.replace(
      /export type ArtifactResolutionHandleStatus = \('loaded' \| 'missing' \| 'unsupported' \| 'invalid-discriminator'\) \| string;/,
      "export type ArtifactResolutionHandleStatus =\n  | ('loaded' | 'missing' | 'unsupported' | 'invalid-discriminator')\n  | `x-${string}`;",
    );
    result = result.replace(
      /document\?: \{\s*\[k: string\]: unknown;\s*\};/m,
      'document?: unknown;',
    );
  }

  if (moduleName === 'module-resolution-report') {
    result = result.replace(
      /export interface ModuleResolutionExtensions \{\s*\[k: string\]: unknown;\s*\}/m,
      'export interface ModuleResolutionExtensions {\n  [k: `x-${string}`]: unknown;\n}',
    );
  }

  return result;
}

/**
 * Remove numbered type variants within a single file whose body is
 * identical to the un-numbered base (e.g. Publisher1, Publisher2 → Publisher).
 */
function deduplicateNumberedTypes(source) {
  const allNames = [...source.matchAll(/^export (?:interface|type) (\w+)/gm)].map(m => m[1]);

  // Group: Foo1, Foo2 → base Foo (only when Foo itself exists)
  const groups = new Map();
  for (const name of allNames) {
    const m = name.match(/^(.+?)(\d+)$/);
    if (!m || !allNames.includes(m[1])) continue;
    if (!groups.has(m[1])) groups.set(m[1], []);
    groups.get(m[1]).push(name);
  }

  if (groups.size === 0) return source;

  let result = source;
  let count = 0;

  for (const [base, variants] of groups) {
    const baseBody = extractNormalizedBody(result, base);
    if (!baseBody) continue;

    for (const variant of variants) {
      const varBody = extractNormalizedBody(result, variant);
      if (!varBody || baseBody !== varBody) continue;

      result = removeDeclBlock(result, variant);
      result = result.replace(new RegExp(`\\b${variant}\\b`, 'g'), base);
      count++;
    }
  }

  if (count > 0) result = result.replace(/\n{3,}/g, '\n\n');
  return result;
}

/**
 * Remove exported types that are never referenced outside their own declaration.
 * Only targets numbered variants (e.g. ComponentBase1) to avoid false positives
 * on intentionally standalone types.
 */
function removeDeadNumberedTypes(source) {
  const allNames = [...source.matchAll(/^export (?:interface|type) (\w+)/gm)].map(m => m[1]);
  const numbered = allNames.filter(n => /\d+$/.test(n));

  let result = source;
  let count = 0;

  for (const name of numbered) {
    // Count all occurrences (declaration + references)
    const refs = [...result.matchAll(new RegExp(`\\b${name}\\b`, 'g'))];
    if (refs.length <= 1) {
      result = removeDeclBlock(result, name);
      count++;
    }
  }

  if (count > 0) result = result.replace(/\n{3,}/g, '\n\n');
  return { source: result, removed: count };
}

/**
 * Walk a schema and collect cross-file $ref targets.
 * Returns Map<consumerSchemaName, Array<{ sourceSchema, defName: string | null }>>
 *
 * Two patterns:
 *  - File-relative $defs: "component.schema.json#/$defs/Tokens" → { sourceSchema: 'component', defName: 'Tokens' }
 *  - URI root ref: "https://formspec.org/schemas/validationResult/1.0" → { sourceSchema: 'validationResult', defName: null }
 */
function buildCrossFileRefGraph(schemasDir, schemaSources, uriToLocal) {
  // Map $id URIs → schema module names
  const uriToModule = {};
  for (const { file } of schemaSources) {
    const schema = JSON.parse(readFileSync(resolve(schemasDir, file), 'utf-8'));
    if (schema.$id) uriToModule[schema.$id] = basename(file, '.schema.json');
  }

  const graph = new Map();

  for (const { file } of schemaSources) {
    const schemaName = basename(file, '.schema.json');
    const schema = JSON.parse(readFileSync(resolve(schemasDir, file), 'utf-8'));
    const seen = new Set();
    const refs = [];

    (function walk(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) { obj.forEach(walk); return; }
      if (typeof obj.$ref === 'string' && !obj.$ref.startsWith('#')) {
        const ref = obj.$ref;
        if (ref.includes('#/$defs/')) {
          const [filePart, fragment] = ref.split('#');
          const sourceSchema = uriToModule[filePart] || basename(filePart, '.schema.json');
          const defName = fragment.split('/').pop();
          const key = `${sourceSchema}:${defName}`;
          if (!seen.has(key)) { seen.add(key); refs.push({ sourceSchema, defName }); }
        } else if (uriToModule[ref]) {
          const sourceSchema = uriToModule[ref];
          const key = `${sourceSchema}:*`;
          if (!seen.has(key)) { seen.add(key); refs.push({ sourceSchema, defName: null }); }
        }
      }
      Object.values(obj).forEach(walk);
    })(schema);

    if (refs.length > 0) graph.set(schemaName, refs);
  }

  return graph;
}

/**
 * Replace cross-file duplicate types with imports from the canonical source,
 * guided by the schema $ref graph (no heuristics or body-length thresholds).
 *
 * Two cases:
 *  - $defs ref: type name in consumer matches the $defs key → direct name lookup.
 *  - Root URI ref: consumer's generated name differs → body comparison scoped
 *    to the specific source root type (no false positives since we KNOW the ref exists).
 *
 * Returns the number of cross-file duplicates replaced.
 */
function crossFileDedup(modules, refGraph, schemaSources) {
  const moduleMap = new Map(modules.map(m => [m.name, m]));
  // Map module name → root type title from SCHEMA_SOURCES
  const moduleTitle = new Map(schemaSources.map(s => [basename(s.file, '.schema.json'), s.title]));

  let totalReplaced = 0;

  for (const mod of modules) {
    const refs = refGraph.get(mod.name);
    if (!refs) continue;

    const toRemove = [];
    const imports = []; // { canonicalName, canonicalModule, localName }

    for (const { sourceSchema, defName } of refs) {
      const sourceMod = moduleMap.get(sourceSchema);
      if (!sourceMod) continue;

      if (defName) {
        // $defs ref: type name matches defName directly
        if (mod.name === 'response-actions' && defName === 'ActionIntent') {
          continue;
        }
        if (mod.exports.includes(defName) && sourceMod.exports.includes(defName)) {
          toRemove.push(defName);
          imports.push({ canonicalName: defName, canonicalModule: sourceSchema, localName: defName });
        }
      } else {
        // Root URI ref: find the consumer's copy by body-matching against the source root type
        const sourceTitle = moduleTitle.get(sourceSchema);
        if (!sourceTitle || !sourceMod.exports.includes(sourceTitle)) continue;

        const sourceBody = extractNormalizedBody(sourceMod.source, sourceTitle);
        if (!sourceBody) continue;

        for (const name of mod.exports) {
          const body = extractNormalizedBody(mod.source, name);
          if (body === sourceBody) {
            toRemove.push(name);
            imports.push({ canonicalName: sourceTitle, canonicalModule: sourceSchema, localName: name });
            break;
          }
        }
      }
    }

    if (toRemove.length === 0) continue;

    // Remove inline declarations
    for (const name of toRemove) {
      mod.source = removeDeclBlock(mod.source, name);
    }

    // Group imports by source module
    const byModule = new Map();
    for (const imp of imports) {
      if (!byModule.has(imp.canonicalModule)) byModule.set(imp.canonicalModule, []);
      byModule.get(imp.canonicalModule).push(imp);
    }

    // Generate import lines + alias re-exports
    const lines = [];
    for (const [sourceModule, imps] of byModule) {
      const importParts = imps.map(i =>
        i.localName === i.canonicalName
          ? i.canonicalName
          : `${i.canonicalName} as ${i.localName}`
      );
      lines.push(`import type { ${importParts.join(', ')} } from './${sourceModule}.js';`);
    }

    // Re-export renamed types so the barrel can pick them up
    const renamedExports = imports
      .filter(i => i.localName !== i.canonicalName)
      .map(i => i.localName);
    if (renamedExports.length > 0) {
      lines.push(`export type { ${renamedExports.join(', ')} };`);
    }

    // Insert after eslint-disable
    mod.source = mod.source.replace(
      '/* eslint-disable */\n',
      `/* eslint-disable */\n${lines.join('\n')}\n`
    );

    // Update exports list
    mod.exports = extractExportedNames(mod.source);
    mod.source = mod.source.replace(/\n{3,}/g, '\n\n');
    totalReplaced += toRemove.length;
  }

  return totalReplaced;
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Phase 1: compile each schema into a self-contained TS file
  const modules = [];

  for (const { file, title } of SCHEMA_SOURCES) {
    const schemaPath = resolve(SCHEMAS_DIR, file);
    const rawSchema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    const schema = file === 'response-actions.schema.json'
      ? inlineResponseActionsCompileRefs(rawSchema)
      : rawSchema;
    if (file === 'response-actions.schema.json') {
      delete schema.$id;
    }
    schema.title = title;

    const ts = await compile(schema, title, {
      bannerComment: '',
      additionalProperties: false,
      unreachableDefinitions: true,
      style: { semi: true, singleQuote: true },
      cwd: SCHEMAS_DIR,
      $refOptions,
    });

    const moduleName = basename(file, '.schema.json');
    let source = FILE_BANNER + postProcess(ts, moduleName);
    if (file === 'component.schema.json') {
      source = withComponentBaseFields(source, rawSchema);
    }

    modules.push({
      name: moduleName,
      source,
    });
  }

  // Phase 2: within-file dedup (Publisher1→Publisher where bodies match)
  let totalIntraDeduped = 0;
  for (const mod of modules) {
    const before = extractExportedNames(mod.source).length;
    mod.source = deduplicateNumberedTypes(mod.source);
    mod.exports = extractExportedNames(mod.source);
    totalIntraDeduped += before - mod.exports.length;
  }

  // Phase 3: remove dead numbered types (e.g. ComponentBase1-37 unreferenced after dedup)
  let totalDeadRemoved = 0;
  for (const mod of modules) {
    const { source, removed } = removeDeadNumberedTypes(mod.source);
    mod.source = source;
    if (removed > 0) mod.exports = extractExportedNames(mod.source);
    totalDeadRemoved += removed;
  }

  for (const mod of modules) {
    console.log(`  ✓ ${mod.name}.ts (${mod.exports.length} types)`);
  }

  // Phase 4: cross-file dedup guided by schema $ref graph
  const refGraph = buildCrossFileRefGraph(SCHEMAS_DIR, SCHEMA_SOURCES, URI_TO_LOCAL);
  const totalCrossDeduped = crossFileDedup(modules, refGraph, SCHEMA_SOURCES);

  // Phase 5: write files
  for (const mod of modules) {
    mod.source = dedupeTypeImports(mod.source);
    writeFileSync(resolve(OUT_DIR, `${mod.name}.ts`), mod.source);
  }

  // Phase 5a: emit fixture-pinned runtime constants.
  // ADR 0150 §4.2/§10 moved the closed-core VM master rows out of
  // schemas/validation-mapping.schema.json#/$defs/MasterTable/const and into
  // the JCS byte-equality fixture. Runtime resolution still needs a generated
  // const so packages do not hand-author duplicate intent defaults.
  const vmMasterTable = JSON.parse(readFileSync(VM_MASTER_TABLE_FIXTURE, 'utf-8'));
  if (!Array.isArray(vmMasterTable) || vmMasterTable.length === 0) {
    throw new Error('VM MasterTable JCS fixture missing or empty — cannot emit runtime const');
  }
  const masterTableSource = `${FILE_BANNER}import type { MappingEntry } from './validation-mapping.js';

/**
 * Frozen mirror of tests/conformance/fixtures/validation-mapping/closed-core-5-rows-jcs.json.
 * Runtime consumers (Response Actions intent->validation-tuple resolution)
 * MUST consult this generated const, never a hand-authored copy.
 */
export const VALIDATION_MAPPING_MASTER_TABLE: readonly MappingEntry[] =
  ${JSON.stringify(vmMasterTable, null, 2).replace(/\n/g, '\n  ')} as const;
`;
  writeFileSync(resolve(OUT_DIR, 'validation-mapping-master-table.ts'), masterTableSource);

  // Phase 6: generate collision-free barrel (exclude numbered codegen artifacts)
  const claimed = new Set();
  const barrelLines = [FILE_BANNER];

  for (const { name, exports } of modules) {
    const unique = exports.filter((e) => !claimed.has(e) && !/\d+$/.test(e));
    if (unique.length === 0) continue;

    unique.forEach((e) => claimed.add(e));
    barrelLines.push(
      `export type { ${unique.join(', ')} } from './${name}.js';`
    );
  }
  // Generated runtime const — not a type, exported as value.
  barrelLines.push(
    `export { VALIDATION_MAPPING_MASTER_TABLE } from './validation-mapping-master-table.js';`
  );

  barrelLines.push('');
  writeFileSync(resolve(OUT_DIR, 'index.ts'), barrelLines.join('\n'));

  console.log(`  ✓ index.ts (${claimed.size} types)`);
  if (totalIntraDeduped > 0) console.log(`  ↳ ${totalIntraDeduped} within-file duplicates collapsed`);
  if (totalDeadRemoved > 0) console.log(`  ↳ ${totalDeadRemoved} unreferenced numbered types removed`);
  if (totalCrossDeduped > 0) console.log(`  ↳ ${totalCrossDeduped} cross-file duplicates replaced with imports`);
  console.log(`\n✓ Generated ${modules.length} schema type files`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
