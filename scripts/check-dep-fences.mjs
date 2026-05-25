/** @filedesc Validates that internal package dependencies only flow downward through defined layers. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Layer assignments — lower number = lower level.
 * Rule: a package at layer N may only depend on packages at layer < N.
 */
const LAYERS = {
  '@formspec-org/types':    0,
  '@formspec-org/app-graph': 1,
  '@formspec-org/engine':   1,
  '@formspec-org/layout':   1,
  '@formspec-org/assist':   2,
  '@formspec-org/webcomponent': 2,
  '@formspec-org/core':         2,
  '@formspec-org/react':        2,
  '@formspec-org/adapters':     3,
  '@formspec-org/chat':         5,
  // @formspec-org/studio-core, /mcp, /studio extracted to sibling
  // formspec-studio repo (2026-05-04). Layer enforcement for those
  // packages now lives in formspec-studio/.
};

const PACKAGES_DIR = new URL('../packages/', import.meta.url).pathname;

function getInternalDeps(pkg) {
  const deps = new Set();
  for (const field of ['dependencies', 'peerDependencies', 'devDependencies']) {
    if (pkg[field]) {
      for (const name of Object.keys(pkg[field])) {
        if (name in LAYERS) deps.add(name);
      }
    }
  }
  return deps;
}

let violations = 0;
let checked = 0;

const dirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

for (const dir of dirs) {
  const pkgPath = join(PACKAGES_DIR, dir, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    continue;
  }

  const name = pkg.name;
  if (!(name in LAYERS)) {
    console.warn(`⚠  ${name} has no layer assignment — add it to LAYERS in check-dep-fences.mjs`);
    continue;
  }

  const myLayer = LAYERS[name];
  const deps = getInternalDeps(pkg);
  checked++;

  for (const dep of deps) {
    const depLayer = LAYERS[dep];
    if (depLayer >= myLayer) {
      console.error(
        `✗  ${name} (layer ${myLayer}) depends on ${dep} (layer ${depLayer}) — ` +
        `dependencies must point to a strictly lower layer`
      );
      violations++;
    }
  }
}

// --- WASM fence: only @formspec/engine may import generated WASM glue ---

const WASM_OWNER = 'formspec-engine';
const WASM_PATTERN = /(?:wasm-pkg(?:-runtime|-tools)?|formspec-wasm|formspec_wasm(?:_runtime|_tools)?)/;

for (const dir of dirs) {
  if (dir === WASM_OWNER) continue;
  const srcDir = join(PACKAGES_DIR, dir, 'src');
  if (!existsSync(srcDir)) continue;

  let grepOut = '';
  try {
    grepOut = execSync(
      `grep -rn "wasm-pkg\\|formspec-wasm\\|formspec_wasm\\|formspec_wasm_runtime\\|formspec_wasm_tools" "${srcDir}" --include="*.ts" --include="*.mts" --include="*.js" --include="*.mjs" 2>/dev/null || true`,
      { encoding: 'utf8' },
    );
  } catch { /* empty */ }

  for (const line of grepOut.split('\n').filter(Boolean)) {
    if (!WASM_PATTERN.test(line)) continue;
    console.error(`✗  ${dir} imports WASM — only ${WASM_OWNER} may use the WASM package`);
    console.error(`   ${line}`);
    violations++;
  }
}

// --- summary ---

if (violations === 0) {
  console.log(`✓  All ${checked} packages respect dependency fences (including WASM exclusivity)`);
  process.exit(0);
} else {
  console.error(`\n✗  ${violations} violation(s) found`);
  process.exit(1);
}
