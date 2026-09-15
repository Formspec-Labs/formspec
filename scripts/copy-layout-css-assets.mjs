#!/usr/bin/env node
/** @filedesc Flattens a package's CSS entry points into dist and copies the shared theme/token JSON. */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const [, , srcDir, targetDir, assetDir = srcDir] = process.argv;

if (!srcDir || !targetDir) {
  console.error(`usage: ${process.argv[1]} <css-source-dir> <target-dir> [json-asset-dir]`);
  process.exit(1);
}

/** Entry points the renderer links by URL. Each must stand alone in `dist/`. */
const CSS_ENTRIES = ['formspec-layout.css', 'formspec-default.css'];
const JSON_ASSETS = ['default-theme.json', 'token-registry.json'];

const IMPORT_RE = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;/g;

/**
 * Inline every `@import` so the emitted file needs no sibling.
 * A bundler asked for `new URL('./x.css', import.meta.url)` copies the bytes
 * verbatim — it follows neither `@import` nor `url()` — so anything left
 * behind resolves against the output directory and silently 404s.
 */
function flatten(file, seen = new Set()) {
  const path = resolve(file);
  if (seen.has(path)) return '';
  seen.add(path);
  return readFileSync(path, 'utf8')
    .replace(IMPORT_RE, (_match, spec) => flatten(resolve(dirname(path), spec), seen));
}

mkdirSync(targetDir, { recursive: true });

for (const entry of CSS_ENTRIES) {
  const css = flatten(join(srcDir, entry));
  const stray = css.match(/@import[^;]*;|url\(\s*(?!['"]?data:)/);
  if (stray) {
    console.error(`${join(srcDir, entry)}: '${stray[0].trim()}' survived flattening — use a plain relative @import, or inline the asset as a data: URI.`);
    process.exit(1);
  }
  writeFileSync(join(targetDir, entry), css);
}

for (const file of JSON_ASSETS) {
  cpSync(join(assetDir, file), join(targetDir, file));
}
