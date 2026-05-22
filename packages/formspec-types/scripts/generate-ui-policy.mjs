#!/usr/bin/env node
/**
 * @filedesc Generates the TypeScript UI policy module from specs/ui-policy.json.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '../../..');
const POLICY_PATH = resolve(ROOT_DIR, 'specs/ui-policy.json');
const OUT_PATH = resolve(__dirname, '../src/ui-policy.ts');
const CHECK_MODE = process.argv.includes('--check');

function readPolicy() {
  return JSON.parse(readFileSync(POLICY_PATH, 'utf8'));
}

function generate(policy) {
  const json = JSON.stringify(policy, null, 2);
  return `/**
 * AUTO-GENERATED -- DO NOT EDIT
 *
 * Generated from specs/ui-policy.json by scripts/generate-ui-policy.mjs.
 * Re-run: npm run policy:generate
 */

/* eslint-disable */

export const UI_POLICY = ${json} as const;

export type UiPolicy = typeof UI_POLICY;
`;
}

function main() {
  const content = generate(readPolicy());
  mkdirSync(dirname(OUT_PATH), { recursive: true });

  if (CHECK_MODE) {
    if (!existsSync(OUT_PATH)) {
      console.error(`missing generated file: ${relative(ROOT_DIR, OUT_PATH)}`);
      process.exit(1);
    }
    const existing = readFileSync(OUT_PATH, 'utf8');
    if (existing !== content) {
      console.error('generated ui-policy.ts is stale -- run: npm run --workspace @formspec-org/types policy:generate');
      process.exit(1);
    }
    return;
  }

  if (existsSync(OUT_PATH) && readFileSync(OUT_PATH, 'utf8') === content) {
    return;
  }
  writeFileSync(OUT_PATH, content);
  console.log(`wrote ${relative(ROOT_DIR, OUT_PATH)}`);
}

main();
