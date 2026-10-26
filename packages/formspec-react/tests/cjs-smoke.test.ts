/** @filedesc A plain Node consumer can require() and import() the package by name and render with react-dom/server (fs-oc8z). */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PROBES, EXPECTED } from './consumer-probe.mjs';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Fresh Node process, loading by name through the exports map: vitest's own
// loader would mask what a CommonJS (CRA/Jest-style) consumer sees. Workspace
// symlinks still apply here; `npm run test:packed` covers the published tarballs.
describe.each(Object.entries(PROBES))('%s() consumer of the built package', (_kind, args) => {
    it('resolves every entry by name and renders', () => {
        const out = JSON.parse(execFileSync(process.execPath, args, { cwd: pkgDir, encoding: 'utf8' }));
        expect(out).toEqual(EXPECTED);
    });
});
