/** @filedesc Compiles uswds-formspec.scss and copies Tailwind core plugin CSS into dist/. */

import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPackageJSON } from 'node:module';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(pkgRoot, 'dist'), { recursive: true });

copyFileSync(
  join(pkgRoot, 'src/tailwind/tailwind-formspec-core.css'),
  join(pkgRoot, 'dist/tailwind-formspec-core.css'),
);

// Locate the @uswds/uswds package root regardless of workspace hoisting.
const pkgJson = findPackageJSON('@uswds/uswds', import.meta.url);
const loadPath = join(dirname(pkgJson), 'packages');

const uswdsOut = join(pkgRoot, 'dist/uswds-formspec.css');
execSync(
  `npx sass src/uswds/uswds-formspec.scss ${uswdsOut} --style=compressed --load-path=${loadPath} --quiet-deps`,
  { cwd: pkgRoot, stdio: 'inherit' },
);
// Public subpath export (fs-fp3e): ship CSS as a file, not a JS string.
copyFileSync(uswdsOut, join(pkgRoot, 'dist/uswds-integration.css'));
