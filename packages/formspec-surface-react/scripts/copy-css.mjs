/** @filedesc Copies the Surface shell stylesheet into dist/ after tsc emits. */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '..', 'src', 'formspec-surface.css');
const to = join(here, '..', 'dist', 'formspec-surface.css');
mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
