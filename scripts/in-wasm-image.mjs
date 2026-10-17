#!/usr/bin/env node
/**
 * @filedesc Runs a shell command in the pinned WASM build image (docker/wasm-build) on a copy of this checkout and its siblings.
 * usage: in-wasm-image.mjs [--source <sibling>]... [--image <dir>] '<command run from the current dir>' <output path>...
 *   --source  a checkout next to this one, copied in as /src/<sibling>. Default: formspec and fel-core.
 *   --image   a Dockerfile directory whose Dockerfile starts `FROM wasm-build` (this image, as a named build
 *             context), for a sibling that needs tools this image does not carry.
 * Sources are streamed in and outputs copied back with `docker cp`, so no host path has to be mountable.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const context = join(repo, 'docker/wasm-build');
// One pinned platform so published and vendored bytes are the same on every host. arm64 is the
// platform that was measured; an x86_64 host runs it under emulation (slow). Developers on x86 who
// only need a working build, not the pinned bytes, can set FORMSPEC_WASM_PLATFORM=linux/amd64.
const platform = process.env.FORMSPEC_WASM_PLATFORM ?? 'linux/arm64';
const arch = platform.split('/')[1];
const dockerfile = (dir) => readFileSync(join(dir, 'Dockerfile'));
const recipe = (...dirs) => dirs.reduce((hash, dir) => hash.update(dockerfile(dir)), createHash('sha256')).digest('hex').slice(0, 12);
// Test seam: the cache volume holds cargo's registry and target dir, shared by every checkout.
const cacheVolume = process.env.FORMSPEC_WASM_CACHE_VOLUME ?? `formspec-wasm-cache-${platform.replace('/', '-')}`;
const { values, positionals: [command, ...outputs] } = parseArgs({
  allowPositionals: true,
  options: { source: { type: 'string', multiple: true }, image: { type: 'string' } },
});
if (!command || outputs.length === 0) {
  console.error("usage: in-wasm-image.mjs [--source <sibling>]... [--image <dir>] '<command>' <output path>...");
  process.exit(2);
}
// This checkout is always /src/formspec, whatever its directory is called; crates reach siblings as `../<name>`.
const sources = new Map((values.source ?? ['formspec', 'fel-core']).map((name) => [name, name === 'formspec' ? repo : resolve(repo, '..', name)]));
const [source, inside] = [...sources].map(([name, path]) => [name, relative(path, process.cwd())])
  .find(([, rel]) => !rel.startsWith('..') && !isAbsolute(rel)) ?? [];
if (!source) {
  console.error(`run from inside one of the sources: ${[...sources.keys()].join(', ')}`);
  process.exit(2);
}
const workdir = join('/src', source, inside);

function docker(args, options = {}) {
  const result = spawnSync('docker', args, { stdio: 'inherit', ...options });
  if (result.error?.code === 'ENOENT') throw new Error('docker is required to build WASM reproducibly.');
  if (result.status !== 0 && !options.allowFailure) throw new Error(`docker ${args[0]} failed (${result.status}).`);
  return result;
}

/** Builds `tag` from `dir` once; a changed Dockerfile is a new tag. */
function image(tag, dir, ...args) {
  if (docker(['image', 'inspect', tag], { stdio: 'ignore', allowFailure: true }).status !== 0) {
    docker(['build', '--platform', platform, ...args, '-t', tag, dir]);
  }
  return tag;
}

/** Streams a tar of `files` (relative to `cwd`) into the container at `destination`. */
function tarInto(cwd, files, container, destination) {
  const tar = spawnSync('tar', ['-cf', '-', '--no-xattrs', '--null', '-T', '-'], {
    cwd, input: `${files.join('\0')}\0`, maxBuffer: 1024 * 1024 * 1024,
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  if (tar.status !== 0) throw new Error(`tar failed in ${cwd}.`);
  docker(['cp', '-', `${container}:${destination}`], { input: tar.stdout, stdio: ['pipe', 'inherit', 'inherit'] });
}

/** Streams a checkout's tracked and untracked-unignored files (never node_modules or target) into the container. */
function copyIn(source, container, destination) {
  const listing = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: source, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  if (listing.status !== 0) throw new Error(`git ls-files failed in ${source}:\n${listing.stderr}`);
  tarInto(source, listing.stdout.split('\0').filter((file) => file && existsSync(join(source, file))), container, destination);
}

const base = image(`formspec-wasm-build:${recipe(context)}-${arch}`, context);
const extension = values.image && resolve(values.image);
const tag = extension
  ? image(`formspec-wasm-build:${recipe(context, extension)}-${arch}`, extension, '--build-context', `wasm-build=docker-image://${base}`)
  : base;
// `docker cp` keeps host mtimes, and cargo rebuilds only sources newer than the shared target dir's
// last build: without this, a checkout older than another checkout's build gets that build's output.
const freshen = 'find /src -type f -exec touch {} + &&';
const container = docker(
  ['create', '--platform', platform, '-v', `${cacheVolume}:/cache`, '-w', workdir, tag, 'sh', '-c', `${freshen} ${command}`],
  { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' },
).stdout.trim();
const stop = () => { docker(['rm', '-f', container], { stdio: 'ignore', allowFailure: true }); };
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { stop(); process.exit(130); });
}
const empty = mkdtempSync(join(tmpdir(), 'in-wasm-image-'));
try {
  // `docker cp` from stdin needs an existing destination: create /src/<source> for each first.
  for (const name of sources.keys()) mkdirSync(join(empty, name));
  tarInto(empty, [...sources.keys()], container, '/src');
  for (const [name, path] of sources) copyIn(path, container, `/src/${name}`);
  const status = await new Promise((done) => {
    spawn('docker', ['start', '-a', container], { stdio: 'inherit' }).on('exit', (code) => done(code ?? 1));
  });
  if (status !== 0) throw new Error(`build exited ${status}.`);
  for (const output of outputs) {
    rmSync(resolve(output), { recursive: true, force: true });
    docker(['cp', `${container}:${join(workdir, output)}`, '.']);
  }
} finally {
  rmSync(empty, { recursive: true, force: true });
  stop();
}
