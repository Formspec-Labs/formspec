/** @filedesc Pack signature packages and test their public JS/types in an isolated npm consumer. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Pass an output directory to retain the exact archives, installed lock and proof.
const output = process.argv[2] ? resolve(process.argv[2]) : mkdtempSync(join(tmpdir(), 'formspec-signature-pack-'));
const archives = join(output, 'tarballs');
const consumer = join(output, 'consumer');
mkdirSync(archives, { recursive: true });
mkdirSync(consumer); // refuse to reuse an already-populated consumer
const digest = value => createHash('sha256').update(value).digest('hex');
const initialLock = digest(readFileSync(join(workspace, 'package-lock.json')));
const results = { packages: [], commands: [], dependencies: {} };
function run(command, args, cwd) {
  const stdout = execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  results.commands.push({ command, args, cwd, exitCode: 0 });
  return stdout;
}

try {
  for (const name of ['signature-port', 'signature-cose', 'signature-adapter-webcrypto']) {
    const directory = join(workspace, 'packages', `formspec-${name}`);
    // npm pack must execute prepack itself, not rely on stale prebuilt dist files.
    const [pack] = JSON.parse(run('npm', ['pack', directory, '--pack-destination', archives, '--json'], workspace));
    const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    assert.equal(metadata.private, undefined);
    assert.equal(metadata.type, 'module');
    assert.equal(metadata.license, 'Apache-2.0');
    assert.equal(metadata.publishConfig.access, 'public');
    assert.deepEqual(metadata.exports, { '.': { types: './dist/index.d.ts', default: './dist/index.js' } });
    const files = pack.files.map(file => file.path);
    assert.ok(files.includes('dist/index.js') && files.includes('dist/index.d.ts') && files.includes('LICENSE'));
    assert.ok(files.every(path => ['package.json', 'LICENSE', 'README.md', 'dist/index.js', 'dist/index.d.ts'].includes(path)), files.join(', '));
    results.packages.push({ ...pack, sha256: digest(readFileSync(join(archives, pack.filename))) });
  }
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }) + '\n');
  const typescript = JSON.parse(readFileSync(join(workspace, 'node_modules/typescript/package.json'), 'utf8')).version;
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', `typescript@${typescript}`,
    ...results.packages.map(pack => join(archives, pack.filename))], consumer);
  for (const name of ['@formspec/signature-port', '@formspec/signature-cose', '@formspec/signature-adapter-webcrypto',
    '@formspec-org/integrity-signature-port', '@formspec-org/integrity-cose', '@formspec-org/integrity-signature-adapter-webcrypto']) {
    const installed = join(consumer, 'node_modules', name);
    assert.equal(lstatSync(installed).isSymbolicLink(), false, name);
    assert.ok(realpathSync(installed).startsWith(realpathSync(consumer) + '/'), name);
    results.dependencies[name] = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')).version;
  }
  const fixtures = join(workspace, 'tests/fixtures/signature-packages');
  for (const name of ['consumer.mjs', 'consumer.mts']) copyFileSync(join(fixtures, name), join(consumer, name));
  copyFileSync(join(workspace, 'registries/signature-method-registry.json'), join(consumer, 'registry.json'));
  for (const name of ['ecdsa-p256-sha256', 'rsa-pss-sha256']) {
    copyFileSync(join(workspace, 'crates/formspec-signature-adapter-ring/tests/fixtures/golden-vectors', `${name}.json`), join(consumer, `${name}.json`));
  }
  for (const name of ['receipt-on-response', 'sig-on-receipt']) {
    copyFileSync(join(workspace, 'tests/fixtures/signature-method-uri-fail-closed', `${name}.json`), join(consumer, `${name}.json`));
  }
  writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true,
    noEmit: true, skipLibCheck: false, types: [], lib: ['ES2022', 'DOM'],
  }, files: ['consumer.mts'] }, null, 2) + '\n');
  results.runtime = run(process.execPath, ['consumer.mjs'], consumer).trim();
  run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], consumer);
  const installedLock = JSON.parse(readFileSync(join(consumer, 'package-lock.json'), 'utf8'));
  results.resolvedDependencies = Object.fromEntries(Object.entries(installedLock.packages).filter(([name]) => name.startsWith('node_modules/')));
  assert.equal(digest(readFileSync(join(workspace, 'package-lock.json'))), initialLock, 'workspace lock changed');
  writeFileSync(join(output, 'receipt.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(`${results.runtime}\nPASS: isolated NodeNext declarations${process.argv[2] ? `; receipt ${join(output, 'receipt.json')}` : ''}`);
} finally {
  if (!process.argv[2]) rmSync(output, { recursive: true, force: true });
}
