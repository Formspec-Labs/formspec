#!/usr/bin/env node
/** @filedesc Runs a package script only where the private integrity-stack sibling is checked out. */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SIBLING = join(dirname(fileURLToPath(import.meta.url)), '../../integrity-stack');

/**
 * A handful of packages here are built from this repository plus the private `integrity-stack` sibling
 * (`@integrity-stack/*` file: dependencies). A public checkout has no sibling beside it, so their build
 * would fail on imports it cannot resolve. They are internal — nothing published depends on them — so the
 * script stands aside with a note instead, and runs normally wherever the sibling exists.
 */
const [command, ...args] = process.argv.slice(2);
if (!existsSync(SIBLING)) {
    console.log(`note: ../integrity-stack absent — skipping \`${[command, ...args].join(' ')}\``);
    process.exit(0);
}
const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
