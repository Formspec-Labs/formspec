/** @filedesc ADR 0064 decisions 1+2: a variant compiles from the shipped, configurable USWDS partial through the CLI — own marker, own house rule, a changed USWDS setting, and the font-weight utilities. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readUswdsIntegrationCss } from './helpers';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(pkgRoot, 'scripts/build-css.mjs');
const fixture = join(pkgRoot, 'tests/fixtures/uswds-variant.scss');

describe('a variant compiled through the CLI', () => {
    let dir: string;
    let outCss: string;
    let css: string;
    let baseCss: string;

    beforeAll(() => {
        dir = mkdtempSync(join(tmpdir(), 'formspec-uswds-variant-'));
        outCss = join(dir, 'uswds-nj-test.css');
        execFileSync('node', [cli, fixture, outCss], { cwd: pkgRoot });
        css = readFileSync(outCss, 'utf8');
        baseCss = readUswdsIntegrationCss();
    });

    afterAll(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('marks its own adapter name, not the base "uswds"', () => {
        expect(css).toMatch(/--formspec-adapter:\s*uswds-test/);
        expect(css).not.toMatch(/--formspec-adapter:\s*uswds(?!-test)/);
    });

    it('carries the font-weight utilities the base forwards', () => {
        expect(css).toContain('.text-bold{font-weight:700}');
        expect(css).toContain('.text-normal{font-weight:normal}');
    });

    it("compiles the variant's own house rule", () => {
        expect(css).toContain('.usa-legend:not(.usa-legend--large){font-weight:700}');
    });

    it("overrides a USWDS setting the partial's own forward never mentions", () => {
        // $theme-color-primary defaults to 'blue-60v' (#005ea2); the fixture reconfigures it to 'red-60v'
        // through the forward chain alone — uswds-formspec.scss never re-lists this variable.
        expect(baseCss).toContain('#005ea2');
        expect(css).not.toContain('#005ea2');
    });

    it('stays within ~10% of the base sheet size', () => {
        const ratio = Math.abs(css.length - baseCss.length) / baseCss.length;
        expect(ratio).toBeLessThan(0.1);
    });

    it('emits a sibling class-vocabulary module next to the compiled sheet', () => {
        // Read as text rather than `import()`: the artifact lands in an OS temp dir outside this
        // package, which Vite's module graph (rightly) won't resolve — production code imports it as a
        // sibling of the stylesheet it describes, inside the package (decision 3 covers that path).
        const src = readFileSync(join(dir, 'uswds-nj-test.classes.js'), 'utf8');
        const match = src.match(/new Set\((\[[^\]]*\])\)/);
        expect(match, 'classes.js does not export new Set([...])').toBeTruthy();
        const classes: string[] = JSON.parse(match![1]);
        expect(classes).toContain('usa-input');
        expect(classes).toContain('text-bold');
        expect(classes).toContain('usa-legend');
        expect(classes).toEqual([...classes].sort());

        const dts = readFileSync(join(dir, 'uswds-nj-test.classes.d.ts'), 'utf8');
        expect(dts).toContain('ReadonlySet<string>');
    });
});
