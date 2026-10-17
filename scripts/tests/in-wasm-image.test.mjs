/** @filedesc node:test coverage for scripts/in-wasm-image.mjs: each checkout gets its own build, never a cached sibling's. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = resolve(dirname(fileURLToPath(import.meta.url)), '../in-wasm-image.mjs');
const hasDocker = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
const volume = `formspec-wasm-test-${process.pid}`;
const root = mkdtempSync(join(tmpdir(), 'in-wasm-image-'));
const dockerfile = 'FROM alpine:3\nRUN mkdir -p /src/formspec /src/fel-core /cache\n';
const platform = process.env.FORMSPEC_WASM_PLATFORM ?? 'linux/arm64'; // the script's default
const fixtureImage = `formspec-wasm-build:${createHash('sha256').update(dockerfile).digest('hex').slice(0, 12)}-${platform.split('/')[1]}`;
// Mimics cargo: reuse the cached output unless the source is newer than the last build.
const build = 'if [ /cache/built -nt in.txt ]; then cp /cache/out.txt out.txt; '
  + 'else cp in.txt out.txt && cp out.txt /cache/out.txt && touch /cache/built; fi';

/** A fake formspec + fel-core pair holding the real script and a tiny image. */
function checkout(name, content, mtimeSeconds) {
  const repo = join(root, name, 'formspec');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  mkdirSync(join(repo, 'docker/wasm-build'), { recursive: true });
  mkdirSync(join(repo, 'pkg'), { recursive: true });
  mkdirSync(join(root, name, 'fel-core'), { recursive: true });
  writeFileSync(join(root, name, 'fel-core/lib.txt'), 'fel-core');
  cpSync(script, join(repo, 'scripts/in-wasm-image.mjs'));
  writeFileSync(join(repo, 'docker/wasm-build/Dockerfile'), dockerfile);
  writeFileSync(join(repo, 'pkg/in.txt'), content);
  utimesSync(join(repo, 'pkg/in.txt'), mtimeSeconds, mtimeSeconds);
  for (const dir of [repo, join(root, name, 'fel-core')]) spawnSync('git', ['init', '-q'], { cwd: dir });
  return join(repo, 'pkg');
}

function run(pkg) {
  const result = spawnSync('node', ['../scripts/in-wasm-image.mjs', build, 'out.txt'], {
    cwd: pkg, encoding: 'utf8', env: { ...process.env, FORMSPEC_WASM_CACHE_VOLUME: volume },
  });
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(join(pkg, 'out.txt'), 'utf8');
}

describe('in-wasm-image', { skip: !hasDocker && 'docker is not available' }, () => {
  after(() => {
    spawnSync('docker', ['volume', 'rm', '-f', volume], { stdio: 'ignore' });
    spawnSync('docker', ['rmi', fixtureImage], { stdio: 'ignore' });
    rmSync(root, { recursive: true, force: true });
  });

  it('builds each checkout from its own sources even when it is older than the cached build', () => {
    const now = Date.now() / 1000;
    assert.equal(run(checkout('a', 'from-a', now)), 'from-a');
    assert.equal(run(checkout('b', 'from-b', now - 10 * 86400)), 'from-b');
  });
});
