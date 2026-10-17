/** @filedesc node:test coverage for scripts/in-wasm-image.mjs: each checkout gets its own build, never a cached sibling's; a sibling builds in an extended image. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
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
const extension = 'FROM wasm-build\nRUN echo extended > /extended\n';
const tagOf = (...files) => `formspec-wasm-build:${files.reduce((hash, file) => hash.update(file), createHash('sha256')).digest('hex').slice(0, 12)}-${platform.split('/')[1]}`;
const fixtureImage = tagOf(dockerfile);
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

function run(pkg, args = ['../scripts/in-wasm-image.mjs', build, 'out.txt']) {
  const result = spawnSync('node', args, {
    cwd: pkg, encoding: 'utf8', env: { ...process.env, FORMSPEC_WASM_CACHE_VOLUME: volume },
  });
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(join(pkg, 'out.txt'), 'utf8');
}

describe('in-wasm-image', { skip: !hasDocker && 'docker is not available' }, () => {
  after(() => {
    spawnSync('docker', ['volume', 'rm', '-f', volume], { stdio: 'ignore' });
    spawnSync('docker', ['rmi', tagOf(dockerfile, extension), fixtureImage], { stdio: 'ignore' });
    rmSync(root, { recursive: true, force: true });
  });

  it('builds each checkout from its own sources even when it is older than the cached build', () => {
    const now = Date.now() / 1000;
    assert.equal(run(checkout('a', 'from-a', now)), 'from-a');
    assert.equal(run(checkout('b', 'from-b', now - 10 * 86400)), 'from-b');
  });

  it('runs a sibling checkout in the extended image with only the sources it names', () => {
    const pkg = checkout('c', 'from-c', Date.now() / 1000);
    const other = join(pkg, '../../other');
    mkdirSync(join(other, 'ext'), { recursive: true });
    mkdirSync(join(other, 'pkg'));
    writeFileSync(join(other, 'ext/Dockerfile'), extension);
    writeFileSync(join(other, 'pkg/in.txt'), 'from-other');
    spawnSync('git', ['init', '-q'], { cwd: other });
    const command = 'cat /extended /src/fel-core/lib.txt in.txt > out.txt && test ! -e /src/formspec/pkg';
    assert.equal(run(join(other, 'pkg'), ['../../formspec/scripts/in-wasm-image.mjs', '--image', '../ext',
      '--source', 'other', '--source', 'fel-core', command, 'out.txt']), 'extended\nfel-corefrom-other');
  });

  it('exits 128 plus the signal number when terminated, so SIGTERM reads as 143', async () => {
    const pkg = checkout('c', 'from-c', Date.now() / 1000);
    const child = spawn('node', ['../scripts/in-wasm-image.mjs', 'echo ready; sleep 60', 'out.txt'], {
      cwd: pkg, env: { ...process.env, FORMSPEC_WASM_CACHE_VOLUME: volume }, stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise((ready) => child.stdout.on('data', (chunk) => { if (String(chunk).includes('ready')) ready(); }));
    const exited = new Promise((done) => child.on('exit', (code, signal) => done({ code, signal })));
    child.kill('SIGTERM');
    assert.deepEqual(await exited, { code: 143, signal: null });
  });
});
