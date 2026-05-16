#!/usr/bin/env node
/** @filedesc Copies layout CSS, default theme, and token registry into a package dist directory. */
import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const [, , srcDir, targetDir] = process.argv;

if (!srcDir || !targetDir) {
  console.error(`usage: ${process.argv[1]} <source-dir> <target-dir>`);
  process.exit(1);
}

const ROOT_FILES = [
  'formspec-layout.css',
  'formspec-default.css',
  'default-theme.json',
  'token-registry.json',
];

mkdirSync(join(targetDir, 'styles'), { recursive: true });

for (const file of ROOT_FILES) {
  cpSync(join(srcDir, file), join(targetDir, file));
}

cpSync(join(srcDir, 'styles'), join(targetDir, 'styles'), { recursive: true });
