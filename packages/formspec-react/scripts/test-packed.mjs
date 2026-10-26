/** @filedesc Packs @formspec-org/react and its local deps, installs the tarballs outside the workspace, probes both formats. */
// Usage: node scripts/test-packed.mjs [workDir]  (default: a fresh OS temp dir)
// Catches what the workspace hides: files missing from `files`, exports pointing
// at unpacked paths, deps resolvable only through workspace symlinks.
// Packs with --ignore-scripts, so build first; the probe never loads engine WASM.
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { PROBES, EXPECTED } from '../tests/consumer-probe.mjs';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoModules = resolve(pkgDir, '../../node_modules');
const work = process.argv[2] ? resolve(process.argv[2]) : mkdtempSync(join(tmpdir(), 'formspec-react-packed-'));
const tarballs = join(work, 'tarballs');
const consumer = join(work, 'consumer');
mkdirSync(tarballs, { recursive: true });
mkdirSync(consumer, { recursive: true });

const readPkg = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

// Local packages = deps the workspace links (symlinks) rather than installs.
const localDir = (name) => {
    const link = join(repoModules, name);
    try { return lstatSync(link).isSymbolicLink() ? realpathSync(link) : null; } catch { return null; }
};
const packs = new Map([['@formspec-org/react', pkgDir]]);
const queue = [pkgDir];
const thirdPartyPeers = new Set();
while (queue.length) {
    const pkg = readPkg(queue.pop());
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
        const dir = localDir(name);
        if (dir && !packs.has(name)) { packs.set(name, dir); queue.push(dir); }
    }
    if (pkg.name === '@formspec-org/react') {
        for (const name of Object.keys(pkg.peerDependencies ?? {})) if (!localDir(name)) thirdPartyPeers.add(name);
    }
}

const npm = (args, cwd) => execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const files = [...packs.values()].map((dir) => {
    const [{ filename }] = JSON.parse(npm(['pack', dir, '--ignore-scripts', '--json', '--pack-destination', tarballs], work));
    return join(tarballs, filename);
});
console.log(`packed: ${[...packs.keys()].join(', ')}`);

writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'packed-consumer', private: true }));
npm(['install', '--no-audit', '--no-fund', '--no-package-lock', ...files, ...thirdPartyPeers], consumer);

let failed = false;
for (const [kind, args] of Object.entries(PROBES)) {
    const out = JSON.parse(execFileSync(process.execPath, args, { cwd: consumer, encoding: 'utf8' }));
    const ok = isDeepStrictEqual(out, EXPECTED);
    failed ||= !ok;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${kind}() ${ok ? '' : JSON.stringify(out)}`);
}
console.log(`consumer: ${consumer}`);
process.exit(failed ? 1 : 0);
