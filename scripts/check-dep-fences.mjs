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
  '@formspec-org/outcome-verification': 1,
  '@formspec-org/app-graph': 1,
  '@formspec-org/surface-bundle-signing': 1,
  '@formspec-org/engine':   1,
  '@formspec-org/layout':   1,
  '@formspec-org/assist':   2,
  '@formspec-org/webcomponent': 2,
  '@formspec-org/core':         2,
  '@formspec-org/react':        2,
  '@formspec-org/surface':      2,
  '@formspec-org/adapters':     3,
  '@formspec-org/surface-react': 3,
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

// --- License fence: an openly licensed package never reaches a source-available one ---
//
// Layers alone allow it: `assist` (BUSL-1.1, layer 2) sits below
// `surface-react` (Apache-2.0, layer 3), and that import is what stopped
// Apache-2.0 hosts from vendoring the binding. A capability both need moves
// to an openly licensed lower layer; host-specific behavior enters through a
// port. Checks every manifest field plus source imports, so a hoisted
// workspace symlink cannot hide an undeclared import.

const SOURCE_AVAILABLE_LICENSES = new Set(['BUSL-1.1']);
const SOURCE_EXTENSIONS = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

const manifests = new Map();
for (const dir of dirs) {
  try {
    const pkg = JSON.parse(readFileSync(join(PACKAGES_DIR, dir, 'package.json'), 'utf8'));
    manifests.set(pkg.name, { dir, pkg });
  } catch { /* not a package */ }
}
const restricted = [...manifests.entries()]
  .filter(([, { pkg }]) => SOURCE_AVAILABLE_LICENSES.has(pkg.license))
  .map(([name]) => name);

for (const [name, { dir, pkg }] of manifests) {
  if (SOURCE_AVAILABLE_LICENSES.has(pkg.license)) continue;
  const license = pkg.license ?? 'unlicensed';

  for (const field of ['dependencies', 'peerDependencies', 'devDependencies', 'optionalDependencies']) {
    for (const dep of Object.keys(pkg[field] ?? {})) {
      if (!restricted.includes(dep)) continue;
      console.error(
        `✗  ${name} (${license}) lists ${dep} (${manifests.get(dep).pkg.license}) in ${field} — ` +
        `openly licensed packages must not depend on source-available ones`,
      );
      violations++;
    }
  }

  const srcDir = join(PACKAGES_DIR, dir, 'src');
  if (!existsSync(srcDir)) continue;
  for (const file of readdirSync(srcDir, { recursive: true })) {
    if (!SOURCE_EXTENSIONS.test(file)) continue;
    const text = readFileSync(join(srcDir, file), 'utf8');
    for (const dep of restricted) {
      const specifier = new RegExp(`['"]${dep.replace('/', '\\/')}(?:\\/[^'"]*)?['"]`);
      if (!specifier.test(text)) continue;
      console.error(
        `✗  ${name} (${license}) imports ${dep} (${manifests.get(dep).pkg.license}) in src/${file} — ` +
        `openly licensed packages must not import source-available ones`,
      );
      violations++;
    }
  }
}

// --- summary ---

if (violations === 0) {
  console.log(`✓  All ${checked} packages respect dependency fences (including WASM exclusivity and license fences)`);
  process.exit(0);
} else {
  console.error(`\n✗  ${violations} violation(s) found`);
  process.exit(1);
}
