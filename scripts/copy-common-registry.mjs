#!/usr/bin/env node
/** @filedesc Copies formspec-common.registry.json into formspec-core dist for package export. */
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'registries', 'formspec-common.registry.json');
const generatedDir = join(root, 'packages', 'formspec-core', 'src', 'generated');
const distDir = join(root, 'packages', 'formspec-core', 'dist');
const fileName = 'formspec-common.registry.json';

mkdirSync(generatedDir, { recursive: true });
mkdirSync(distDir, { recursive: true });
cpSync(source, join(generatedDir, fileName));
cpSync(source, join(distDir, fileName));
