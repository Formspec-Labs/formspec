#!/usr/bin/env node
/** @filedesc Bundles the host page's browser entry (renderer + engine glue, no wasm) into dist/host/formspec-host.js. */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
mkdirSync(`${root}dist/host`, { recursive: true });

await build({
  entryPoints: [`${root}dist/host-boot.js`],
  outfile: `${root}dist/host/formspec-host.js`,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  // The wasm is supplied as bytes by the page, so the engine's `new URL(…, import.meta.url)` fetch path never runs.
  logLevel: 'warning',
});
