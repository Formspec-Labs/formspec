/** @filedesc Pack the neutral browser fixture and its portable desktop test driver. */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { build } from 'vite';

if (!process.argv[2]) throw new Error('usage: node scripts/pack-native-date-speech.mjs <output directory>');
const output = resolve(process.argv[2]);
if (existsSync(output)) throw new Error(`Choose a new output directory: ${output}`);

const packages = new Map();
function include(name, requireFrom) {
  let source = dirname(requireFrom.resolve(name));
  let metadata;
  for (;;) {
    const path = join(source, 'package.json');
    if (existsSync(path)) {
      const json = JSON.parse(readFileSync(path, 'utf8'));
      if (json.name === name) { metadata = json; break; }
    }
    const parent = dirname(source);
    if (parent === source) throw new Error(`Cannot locate the installed manifest for ${name}`);
    source = parent;
  }
  if (packages.has(name)) {
    if (packages.get(name) !== source) throw new Error(`The test driver resolves two copies of ${name}`);
    return;
  }
  packages.set(name, source);
  const childRequire = createRequire(join(source, 'package.json'));
  // All required dependencies, including both of Guidepup's peer dependencies. Platform-specific
  // optional packages (such as fsevents for Playwright watch mode) do not ship in this runner.
  for (const dependency of Object.keys({ ...metadata.dependencies, ...metadata.peerDependencies })) {
    if (metadata.optionalDependencies?.[dependency] || metadata.peerDependenciesMeta?.[dependency]?.optional) continue;
    include(dependency, childRequire);
  }
}

include('@guidepup/playwright', createRequire(import.meta.url));
for (const [name, source] of packages) {
  const target = join(output, 'node_modules', name);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, {
    recursive: true,
    dereference: true,
    filter: path => !['node_modules', '.local-browsers'].includes(basename(path)),
  });
}
for (const path of [
  'playwright.native-date-speech.config.ts',
  'scripts/prepare-native-date-reader.mjs',
  'scripts/serve-native-date-speech.mjs',
  'tests/e2e/harness-server.ts',
  'tests/e2e/playwright/react-native-date-speech.spec.ts',
]) {
  const target = join(output, path);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(path, target);
}
await build({
  build: {
    outDir: join(output, 'browser'),
    rollupOptions: { input: resolve('tests/e2e/fixtures/surface-browser.html') },
  },
});
