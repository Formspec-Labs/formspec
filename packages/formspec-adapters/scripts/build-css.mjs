/** @filedesc Compiles the self-contained USWDS adapter stylesheet and copies the Tailwind core CSS to the package root. */

import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPackageJSON } from 'node:module';

/** Sentinel asset root set as `$theme-font-path` / `$theme-image-path` in uswds-formspec.scss. */
const ASSET_PREFIX = '@uswds/';

const MEDIA_TYPES = {
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
};

// Both stylesheets land at the package root so `../../<name>.css` reaches them identically from
// `src/<adapter>/index.ts` and `dist/<adapter>/index.js` — the same placement formspec-engine uses for
// `wasm-pkg-runtime/`. A src-aliased consumer (Storybook) would 404 a dist-only path.
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

copyFileSync(
    join(pkgRoot, 'src/tailwind/tailwind-formspec-core.css'),
    join(pkgRoot, 'tailwind-formspec-core.css'),
);

// Locate the @uswds/uswds package root regardless of workspace hoisting.
const uswdsRoot = dirname(findPackageJSON('@uswds/uswds', import.meta.url));
const uswdsDist = join(uswdsRoot, 'dist');

// No source map: inlining assets shifts every byte offset, so a map of the compiled output would lie.
const out = join(pkgRoot, 'uswds-integration.css');
execSync(
    `npx sass src/uswds/uswds-formspec.scss ${out} --style=compressed --no-source-map ` +
        `--load-path=${join(uswdsRoot, 'packages')} --quiet-deps`,
    { cwd: pkgRoot, stdio: 'inherit' },
);

// A bundler emits `new URL('../uswds-integration.css', import.meta.url)` verbatim and never follows the
// `url()` references inside it, so every asset must travel in the file itself.
const assets = new Map();
let inlined = 0;

const css = readFileSync(out, 'utf8').replace(/url\(\s*(['"]?)(.*?)\1\s*\)/g, (whole, _quote, ref) => {
    if (!ref.startsWith(ASSET_PREFIX)) {
        // `url("")` is USWDS's `@supports (mask: url(""))` feature probe, not an asset.
        if (ref === '' || ref.startsWith('data:') || /^https?:/.test(ref)) return whole;
        throw new Error(`url(${ref}) escapes the artifact — inline it or drop the rule`);
    }
    const file = join(uswdsDist, ref.slice(ASSET_PREFIX.length));
    if (!assets.has(file)) {
        const type = MEDIA_TYPES[extname(file)];
        if (!type) throw new Error(`no media type registered for ${file}`);
        assets.set(file, `url(data:${type};base64,${readFileSync(file).toString('base64')})`);
    }
    inlined += 1;
    return assets.get(file);
});

writeFileSync(out, css);
console.log(
    `uswds-integration.css: ${(statSync(out).size / 1024).toFixed(0)} KB, ` +
        `${assets.size} assets inlined (${inlined} references)`,
);
