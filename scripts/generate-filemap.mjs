#!/usr/bin/env node
/**
 * @filedesc Extract per-file descriptions and build filemap.json for agent navigation.
 *
 * Walks the source tree, extracts the first-line description from each file using
 * language-appropriate conventions, and writes a JSON map to the repo root.
 *
 * Supported extraction patterns:
 *   - TypeScript/JavaScript: JSDoc `@filedesc` tag, or `@module` description, or first JSDoc line
 *   - Python: Module docstring first line (triple-quoted)
 *   - Rust: First `//!` module doc comment line
 *   - JSON: Top-level "title" and/or "description" fields
 *   - CSS: `@filedesc` in a block comment
 *   - Markdown: First `# heading`
 *
 * Usage:
 *   node scripts/generate-filemap.mjs              # write filemap.json
 *   node scripts/generate-filemap.mjs --check      # exit 1 if filemap.json is stale
 *   node scripts/generate-filemap.mjs --stats      # print coverage stats
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, relative, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUTPUT = resolve(ROOT, 'filemap.json');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const INCLUDE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.py', '.rs', '.json', '.css', '.html', '.md',
]);

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', '__pycache__', 'build', '.venv',
  '.mypy_cache', '.pytest_cache', '.tox', 'coverage', '.firebase',
  'archived',           // Dead code (superseded by formspec-studio)
  'target',             // Rust build artifacts
  'reconstructed-examples', // Generated example reconstructions
  'public',             // Built/deployed site output
  'storybook-static',   // Storybook build output
  'test-results',       // Playwright run output
  'playwright-report',  // Playwright HTML report output
  'playwright-report-storybook', // Storybook Playwright report output
]);

const EXCLUDE_PATTERNS = [
  /\.d\.ts$/,           // Declaration files (covered by API docs)
  /\.spec\.ts$/,        // Test files
  /\.test\.ts$/,        // Test files
  /\.test\.mjs$/,       // Test files (ESM)
  /\.spec\.tsx$/,       // Test files
  /\.test\.tsx$/,       // Test files
  /\.stories\.tsx$/,    // Storybook stories
  /test_.*\.py$/,       // Python test files
  /crates\/.*\/tests\//, // Rust test files
  /crates\/.*\/tests\.rs$/, // Rust inline test modules
  /crates\/.*\/native_tests\.rs$/, // Rust native test modules
  /conftest\.py$/,      // Pytest fixtures
  /packages\/.*\/tests\/(helpers|setup|python)\.ts$/, // Test infrastructure
  /package-lock\.json$/, // Lock files
  /tsconfig.*\.json$/,  // TS config
  /\.eslintrc/,         // Lint config
  /\.prettierrc/,       // Formatter config
  /vite\.config/,       // Build config
  /playwright\.config/, // Test config
  /filemap\.json$/,     // Our own output
  /\.bluf\.md$/,        // BLUF summaries (injected into specs, not standalone)
  /\.semantic\.md$/,    // Semantic capsules (generated artifacts)
  /\.response\.json$/,  // Test fixture response files
  /\.instance\.json$/,  // Test fixture instance files
  /fixtures\/.*\.json$/, // Test fixture JSON data
  /firebase\.json$/,    // Firebase config
  /__init__\.py$/,      // Python package markers (trivial)
  /tests\/conformance\/suite\/.*\.json$/, // Conformance test cases
  /examples\/.*\.(mapping|changelog|instance|component)\.json$/, // Example data artifacts
  /examples\/.*\/instances\/.*\.json$/, // Example instance data
  /examples\/.*\/mapping.*\.json$/,     // Example mapping configs
  /examples\/.*\/changelog\.json$/,     // Example changelogs
  /thoughts\/research\/prompt\.md$/,    // Scratch prompt files
  /thoughts\/private\//,               // Private notes
  /storybook-manifest\.json$/,         // Storybook build artifact
  /typedoc\.json$/,                    // TypeDoc config
  /docs\/api\/.*\/assets\//,            // TypeDoc generated CSS/JS assets
  /docs\/api\/rust\/trait\.impl\//,     // Rustdoc trait impl JS
  /docs\/api\/rust\/search\.desc\//,    // Rustdoc search description JS
  /docs\/api\/rust\/static\.files\//,   // Rustdoc static assets
  /docs\/api\/rust\/.*\/sidebar-items\.js$/, // Rustdoc sidebar JS
  /docs\/api\/rust\/(crates|search-index|src-files)\.js$/, // Rustdoc index JS
  /docs\/api\/rust\/type\.impl\//,     // Rustdoc type impl JS
  /docs\/api\/formspec\/(index\.html|search\.js)$/, // pdoc generated output
  /packages\/formspec-swift\/.*\/(Resources|Fixtures)\//,  // Swift embedded resources and test fixtures
  /packages\/formspec-swift\/bridge\//, // Swift WebView bridge templates
  /packages\/.*\/tests\/fixtures\//,   // Test fixture directories
  /wasm-pkg.*\/(formspec_wasm.*\.js|wasm-runtime\.mjs)$/, // Generated WASM glue
];

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

function walkDir(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) {
        results.push(...walkDir(full));
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (!INCLUDE_EXTENSIONS.has(ext)) continue;
      const rel = relative(ROOT, full);
      if (EXCLUDE_PATTERNS.some(p => p.test(rel))) continue;
      results.push(rel);
    }
  }
  return results.sort();
}

// ---------------------------------------------------------------------------
// Extractors
// ---------------------------------------------------------------------------

/**
 * Extract @filedesc from a JSDoc comment, or fall back to @module description,
 * or the first line of the first JSDoc block.
 */
function extractTS(content) {
  // Look for @filedesc tag first
  const filedescMatch = content.match(/@filedesc\s+(.+?)(?:\n|\*\/)/s);
  if (filedescMatch) {
    return cleanDesc(filedescMatch[1]);
  }

  // Look for first JSDoc block at the top of the file
  const jsdocMatch = content.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  if (jsdocMatch) {
    const block = jsdocMatch[1];

    // Check for @module with description on same or next line
    const moduleMatch = block.match(/@module\s+\S+\s*\n\s*\*\s*\n\s*\*\s+(.+)/);
    if (moduleMatch) return cleanDesc(moduleMatch[1]);

    // Fallback: first non-empty, non-tag line in the JSDoc
    const lines = block.split('\n').map(l => l.replace(/^\s*\*\s?/, '').trim());
    for (const line of lines) {
      if (line && !line.startsWith('@') && line.length > 5) {
        return cleanDesc(line);
      }
    }
  }

  return null;
}

/** Extract the first line of a Python module docstring. */
function extractPython(content) {
  // Strip shebang, then skip leading comment lines and blank lines to find module docstring
  let stripped = content.replace(/^#!.*\n/, '');
  stripped = stripped.replace(/^(?:#[^\n]*\n|\s*\n)*/m, '').trimStart();
  const match = stripped.match(/^(?:"""|''')([\s\S]*?)(?:"""|''')/);
  if (match) {
    const firstLine = match[1].trim().split('\n')[0].replace(/\.\s*$/, '');
    if (firstLine) return cleanDesc(firstLine);
  }
  return null;
}

/** Extract the first //! module doc comment line from a Rust file. */
function extractRust(content) {
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*\/\/!\s+(.+)/);
    if (match) return cleanDesc(match[1]);
    // Stop at the first non-comment, non-blank line
    if (line.trim() && !line.trim().startsWith('//')) break;
  }
  return null;
}

/** Extract title + description from a JSON file. */
function extractJSON(content) {
  try {
    const obj = JSON.parse(content);
    if (obj.title && obj.description) {
      return cleanDesc(`${obj.title} — ${obj.description}`);
    }
    if (obj.title) return cleanDesc(obj.title);
    if (obj.description) return cleanDesc(obj.description);
    // package.json special case
    if (obj.name && typeof obj.name === 'string') {
      const desc = obj.description ? `${obj.name} — ${obj.description}` : obj.name;
      return cleanDesc(desc);
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

/** Extract @filedesc from a CSS block comment. */
function extractCSS(content) {
  const match = content.match(/@filedesc\s+(.+?)(?:\n|\*\/)/s);
  if (match) return cleanDesc(match[1]);

  // Fallback: first block comment first line
  const blockMatch = content.match(/^\s*\/\*\s*\n?\s*\*?\s*(.+)/);
  if (blockMatch) {
    const line = blockMatch[1].replace(/\*\/.*/, '').trim();
    if (line.length > 5) return cleanDesc(line);
  }
  return null;
}

/** Extract first heading or YAML frontmatter title from Markdown. */
function extractMarkdown(content) {
  // Check for YAML frontmatter title first
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const titleMatch = fmMatch[1].match(/^title:\s*["']?(.+?)["']?\s*$/m);
    if (titleMatch) return cleanDesc(titleMatch[1]);
  }
  // Fall back to first heading
  const match = content.match(/^#\s+(.+)/m);
  if (match) return cleanDesc(match[1]);
  return null;
}

/** Extract from HTML title or first heading. */
function extractHTML(content) {
  const titleMatch = content.match(/<title>(.+?)<\/title>/i);
  if (titleMatch) return cleanDesc(titleMatch[1]);
  const h1Match = content.match(/<h1[^>]*>(.+?)<\/h1>/i);
  if (h1Match) return cleanDesc(h1Match[1]);
  return null;
}

function cleanDesc(raw) {
  if (!raw) return null;
  let desc = raw
    .replace(/\s+/g, ' ')          // collapse whitespace
    .replace(/\*\/$/, '')           // trailing */
    .replace(/\.$/, '')             // trailing period
    .trim();
  // Truncate at 120 chars
  if (desc.length > 120) {
    desc = desc.slice(0, 117) + '...';
  }
  return desc || null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const EXTRACTORS = {
  '.ts': extractTS,
  '.tsx': extractTS,
  '.js': extractTS,
  '.mjs': extractTS,
  '.py': extractPython,
  '.rs': extractRust,
  '.json': extractJSON,
  '.css': extractCSS,
  '.md': extractMarkdown,
  '.html': extractHTML,
};

function buildFilemap() {
  const files = walkDir(ROOT);
  const map = {};
  let described = 0;

  for (const rel of files) {
    const ext = extname(rel);
    const extractor = EXTRACTORS[ext];
    if (!extractor) continue;

    try {
      const content = readFileSync(resolve(ROOT, rel), 'utf8');
      const desc = extractor(content);
      if (desc) {
        map[rel] = desc;
        described++;
      } else {
        map[rel] = null;
      }
    } catch {
      map[rel] = null;
    }
  }

  return { map, total: files.length, described };
}

function main() {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check');
  const statsMode = args.includes('--stats');

  const { map, total, described } = buildFilemap();

  const output = {
    _comment: 'Auto-generated by scripts/generate-filemap.mjs — do not hand-edit.',
    generated: new Date().toISOString(),
    coverage: `${described}/${total} files (${Math.round(described / total * 100)}%)`,
    files: map,
  };

  const json = JSON.stringify(output, null, 2) + '\n';

  if (statsMode) {
    console.log(`Filemap: ${described}/${total} files described (${Math.round(described / total * 100)}%)`);
    // Show undescribed files
    const undescribed = Object.entries(map).filter(([, v]) => v === null).map(([k]) => k);
    if (undescribed.length > 0 && undescribed.length <= 50) {
      console.log(`\nFiles missing descriptions:`);
      for (const f of undescribed) console.log(`  ${f}`);
    } else if (undescribed.length > 50) {
      console.log(`\n${undescribed.length} files missing descriptions (use --stats-full to list all)`);
    }
    return;
  }

  if (checkMode) {
    try {
      const existing = readFileSync(OUTPUT, 'utf8');
      const existingParsed = JSON.parse(existing);
      const newParsed = JSON.parse(json);
      // Compare file entries only (ignore timestamp)
      const same = JSON.stringify(existingParsed.files) === JSON.stringify(newParsed.files);
      if (!same) {
        console.error('filemap.json is stale. Run: node scripts/generate-filemap.mjs');
        process.exit(1);
      }
      console.log('filemap.json is up to date.');
    } catch {
      console.error('filemap.json missing or invalid. Run: node scripts/generate-filemap.mjs');
      process.exit(1);
    }
    return;
  }

  writeFileSync(OUTPUT, json);
  console.log(`Wrote ${OUTPUT}`);
  console.log(`Coverage: ${described}/${total} files (${Math.round(described / total * 100)}%)`);
}

main();
