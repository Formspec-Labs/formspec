#!/usr/bin/env node
/**
 * @filedesc Generate default-theme.json and CSS token fallbacks from token-registry.json.
 *
 * The token registry (schemas/token-registry.json) is the single source of truth for
 * token names, defaults, and dark-mode overrides. Each category in the document
 * conforms to theme.schema.json#/$defs/Category (Category/TokenEntry/TokenType
 * inlined per ADR 0150 §2.3/§4.2/§10 row 9 — standalone token-registry.schema.json
 * retired, structural shape preserved in theme.schema.json so theme.tokenMeta and
 * the runtime token registry share the same Category contract). Structural
 * validation of the runtime document lives in tests/conformance/
 * test_token_registry_retirement.py; this script trusts the validated input and
 * generates:
 *
 *   1. packages/formspec-layout/src/default-theme.json  — tokens section from registry defaults
 *   2. packages/formspec-layout/src/styles/default.tokens.css — patched var() fallbacks
 *   3. Synced copies of token-registry.json to:
 *        - crates/formspec-lint/schemas/token-registry.json
 *        - packages/formspec-layout/src/token-registry.json
 *
 * Usage:
 *   node scripts/generate-theme-from-registry.mjs          # write all outputs
 *   node scripts/generate-theme-from-registry.mjs --check   # exit 1 if any output is stale
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const REGISTRY_PATH = resolve(ROOT, 'schemas/token-registry.json');
const THEME_PATH = resolve(ROOT, 'packages/formspec-layout/src/default-theme.json');
const TOKENS_CSS_PATH = resolve(ROOT, 'packages/formspec-layout/src/styles/default.tokens.css');

const REGISTRY_COPIES = [
  resolve(ROOT, 'crates/formspec-lint/schemas/token-registry.json'),
  resolve(ROOT, 'packages/formspec-layout/src/token-registry.json'),
];

const checkMode = process.argv.includes('--check');

// ---------------------------------------------------------------------------
// Token extraction
// ---------------------------------------------------------------------------

function extractTokens(registry) {
  const light = {};
  const dark = {};
  for (const [catKey, category] of Object.entries(registry.categories)) {
    for (const [tokenKey, entry] of Object.entries(category.tokens)) {
      if (entry.default !== undefined) {
        light[tokenKey] = entry.default;
      }
      if (category.darkPrefix && entry.dark !== undefined) {
        const suffix = tokenKey.slice(catKey.length + 1);
        dark[`${category.darkPrefix}.${suffix}`] = entry.dark;
      }
    }
  }
  return { ...light, ...dark };
}

// ---------------------------------------------------------------------------
// Theme generation
// ---------------------------------------------------------------------------

function generateTheme(tokens) {
  return {
    _generated: 'DO NOT EDIT — generated from schemas/token-registry.json by scripts/generate-theme-from-registry.mjs',
    $formspecTheme: '1.0',
    version: '1.0.0',
    name: 'formspec-default',
    targetDefinition: {
      url: 'urn:formspec:any',
      compatibleVersions: '>=1.0.0',
    },
    tokens,
  };
}

// ---------------------------------------------------------------------------
// CSS fallback patching
// ---------------------------------------------------------------------------

/**
 * Build a map from CSS custom property name to its registry default value.
 * Token key "color.primary" becomes "--formspec-color-primary".
 */
function buildCssVarMap(tokens) {
  const map = {};
  for (const [key, value] of Object.entries(tokens)) {
    if (typeof value !== 'string') continue;
    const cssVar = `--formspec-${key.replace(/\./g, '-')}`;
    map[cssVar] = value;
  }
  return map;
}

/**
 * Patch CSS fallback values in var() expressions.
 * Only patches simple fallbacks (hex, rem values, font stacks) — skips nested var() and
 * color-mix() expressions to avoid breaking computed values.
 */
function patchCssFallbacks(cssContent, cssVarMap) {
  // Match: var(--formspec-<name>, <fallback>)
  // where <fallback> does NOT start with var( or color-mix(
  return cssContent.replace(
    /var\((--formspec-[a-zA-Z0-9-]+),\s*([^)]+)\)/g,
    (match, varName, fallback) => {
      const trimmed = fallback.trim();
      // Skip nested var() or color-mix() expressions
      if (trimmed.startsWith('var(') || trimmed.startsWith('color-mix(')) {
        return match;
      }
      // Only patch if we have a registry value for this var
      if (cssVarMap[varName] !== undefined) {
        return `var(${varName}, ${cssVarMap[varName]})`;
      }
      return match;
    }
  );
}

// ---------------------------------------------------------------------------
// File comparison
// ---------------------------------------------------------------------------

function contentMatches(filePath, expected) {
  try {
    const actual = readFileSync(filePath, 'utf8');
    return actual === expected;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const registryRaw = readFileSync(REGISTRY_PATH, 'utf8');
const existingCss = readFileSync(TOKENS_CSS_PATH, 'utf8');

const tokens = extractTokens(registry);
const theme = generateTheme(tokens);
const themeJson = JSON.stringify(theme, null, 2) + '\n';

const cssVarMap = buildCssVarMap(tokens);
const patchedCss = patchCssFallbacks(existingCss, cssVarMap);

if (checkMode) {
  let stale = false;

  if (!contentMatches(THEME_PATH, themeJson)) {
    console.error('STALE: default-theme.json tokens do not match registry');
    stale = true;
  }

  if (!contentMatches(TOKENS_CSS_PATH, patchedCss)) {
    console.error('STALE: default.tokens.css fallbacks do not match registry');
    stale = true;
  }

  for (const copyPath of REGISTRY_COPIES) {
    if (!contentMatches(copyPath, registryRaw)) {
      const rel = copyPath.replace(ROOT + '/', '');
      console.error(`STALE: ${rel} does not match schemas/token-registry.json`);
      stale = true;
    }
  }

  if (stale) {
    console.error('\nRun: node scripts/generate-theme-from-registry.mjs');
    process.exit(1);
  }

  console.log('All theme/token outputs are up to date.');
  process.exit(0);
}

// Write mode
writeFileSync(THEME_PATH, themeJson, 'utf8');
console.log('Wrote default-theme.json');

writeFileSync(TOKENS_CSS_PATH, patchedCss, 'utf8');
console.log('Wrote default.tokens.css');

for (const copyPath of REGISTRY_COPIES) {
  writeFileSync(copyPath, registryRaw, 'utf8');
  const rel = copyPath.replace(ROOT + '/', '');
  console.log(`Synced ${rel}`);
}

console.log(`\nGenerated ${Object.keys(tokens).length} tokens from registry.`);
