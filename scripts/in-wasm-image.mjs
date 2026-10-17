#!/usr/bin/env node
/**
 * @filedesc Runs a shell command in the pinned WASM build image (docker/wasm-build) on a copy of this checkout.
 * usage: in-wasm-image.mjs '<command run from the current package dir>' <output path>...
 * Sources are streamed in and outputs copied back with `docker cp`, so no host path has to be mountable.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const felCore = resolve(repo, '../fel-core'); // crates depend on it as `../../../fel-core`
const context = join(repo, 'docker/wasm-build');
// One pinned platform so published and vendored bytes are the same on every host. arm64 is the
// platform that was measured; an x86_64 host runs it under emulation (slow), and a job that only
// needs a working build, not the pinned bytes, can set FORMSPEC_WASM_PLATFORM=linux/amd64.
const platform = process.env.FORMSPEC_WASM_PLATFORM ?? 'linux/arm64';
const tag = `formspec-wasm-build:${createHash('sha256').update(readFileSync(join(context, 'Dockerfile'))).digest('hex').slice(0, 12)}-${platform.split('/')[1]}`;
const [command, ...outputs] = process.argv.slice(2);
if (!command || outputs.length === 0) {
  console.error("usage: in-wasm-image.mjs '<command>' <output path>...");
  process.exit(2);
}

function docker(args, options = {}) {
  const result = spawnSync('docker', args, { stdio: 'inherit', ...options });
  if (result.error?.code === 'ENOENT') throw new Error('docker is required to build the engine WASM reproducibly.');
  if (result.status !== 0 && !options.allowFailure) throw new Error(`docker ${args[0]} failed (${result.status}).`);
  return result;
}

/** Streams a checkout's tracked and untracked-unignored files (never node_modules or target) into the container. */
function copyIn(source, container, destination) {
  const listing = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: source, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  if (listing.status !== 0) throw new Error(`git ls-files failed in ${source}:\n${listing.stderr}`);
  const files = listing.stdout.split('\0').filter((file) => file && existsSync(join(source, file)));
  const tar = spawnSync('tar', ['-cf', '-', '--no-xattrs', '--null', '-T', '-'], {
    cwd: source, input: `${files.join('\0')}\0`, maxBuffer: 1024 * 1024 * 1024,
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  if (tar.status !== 0) throw new Error(`tar failed in ${source}.`);
  docker(['cp', '-', `${container}:${destination}`], { input: tar.stdout, stdio: ['pipe', 'inherit', 'inherit'] });
}

if (docker(['image', 'inspect', tag], { stdio: 'ignore', allowFailure: true }).status !== 0) {
  docker(['build', '--platform', platform, '-t', tag, context]);
}
const workdir = join('/src/formspec', relative(repo, process.cwd()));
const container = docker(
  ['create', '--platform', platform, '-v', `formspec-wasm-cache-${platform.replace('/', '-')}:/cache`, '-w', workdir, tag, 'sh', '-c', command],
  { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' },
).stdout.trim();
try {
  copyIn(repo, container, '/src/formspec');
  copyIn(felCore, container, '/src/fel-core');
  docker(['start', '-a', container]);
  for (const output of outputs) {
    rmSync(resolve(output), { recursive: true, force: true });
    docker(['cp', `${container}:${join(workdir, output)}`, '.']);
  }
} finally {
  docker(['rm', '-f', container], { stdio: 'ignore', allowFailure: true });
}
