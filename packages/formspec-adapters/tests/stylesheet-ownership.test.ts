/** @filedesc Verifies CSS ownership: adapters declare self-contained stylesheets that resolve from src and dist. */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { uswdsAdapter } from '../src/uswds';
import { tailwindAdapter } from '../src/tailwind';
import { readUswdsIntegrationCss } from './helpers';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every `url()` argument in a stylesheet, unquoted. Base64/percent-encoding never contains `)`. */
function cssUrls(css: string): string[] {
    return [...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)].map((m) => m[2]);
}

/** Declarations of every rule whose selector list contains `selector` exactly. */
function declarationsFor(css: string, selector: string): string {
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((m) => m[1].split(',').some((s) => s.trim() === selector))
        .map((m) => m[2])
        .join(';');
}

/** A bundler emits `new URL(x, import.meta.url)` as-is, so the literal in the module file is the contract. */
function declaredStylesheetTarget(modulePath: string): string {
    const src = readFileSync(modulePath, 'utf8');
    const m = src.match(/new URL\((['"])(.*?)\1,\s*import\.meta\.url\)/);
    expect(m, `${modulePath} declares no new URL(..., import.meta.url)`).toBeTruthy();
    return fileURLToPath(new URL(m![2], pathToFileURL(modulePath)));
}

describe('USWDS integration stylesheet is self-contained', () => {
    const css = readUswdsIntegrationCss();

    it('references no external asset', () => {
        const external = cssUrls(css).filter(
            (u) => u !== '' && !u.startsWith('data:') && !/^https?:/.test(u),
        );
        expect(external).toEqual([]);
    });

    it('inlines every @font-face source as a woff2 data URI', () => {
        const faces = [...css.matchAll(/@font-face\s*\{(.*?)\}/gs)].map((m) => m[1]);
        expect(faces.length).toBeGreaterThan(0);
        const sources = faces.flatMap((face) => cssUrls(face));
        expect(sources.length).toBe(faces.length);
        expect(sources.filter((u) => !u.startsWith('data:font/woff2;base64,'))).toEqual([]);
    });

    it('lets the Theme retune the rhythm between fields through the spacing.field token', () => {
        // USWDS's own units-3 margin is the fallback; the token the renderer publishes overrides it.
        expect(declarationsFor(css, '.usa-form-group')).toMatch(/margin-top:var\(--formspec-spacing-field,\s*1\.5rem\)/);
        // One rhythm owner: the structural stack gap would otherwise add to the margin inside repeat lists.
        expect(declarationsFor(css, '.formspec-container .formspec-stack:not(.grid-row)')).toMatch(/gap:0/);
    });

    it('spaces the field help row below the control', () => {
        expect(declarationsFor(css, '.formspec-field-help-row')).toMatch(/margin-top:1rem/);
    });

    it('types the render root without help from the page', () => {
        // USWDS applies body typography and heading styles at the document level (uswds-global), which this
        // trimmed build never forwards — without adapter-owned rules the root inherits the UA serif.
        expect(declarationsFor(css, '.formspec-container')).toMatch(/Source Sans Pro/);
        expect(declarationsFor(css, '.formspec-container h3')).toMatch(/Merriweather/);
    });
});

describe.each([
    ['uswds', uswdsAdapter, 'uswds-integration.css'] as const,
    ['tailwind', tailwindAdapter, 'tailwind-formspec-core.css'] as const,
])('the %s adapter declares its own stylesheet', (name, adapter, file) => {
    it(`declares one absolute URL for ${file}`, () => {
        expect(adapter.stylesheets).toHaveLength(1);
        expect(basename(new URL(adapter.stylesheets![0]).pathname)).toBe(file);
    });

    // Storybook and every other src-aliased consumer import `src/<adapter>/index.ts`; published hosts get
    // `dist/<adapter>/index.js`. The stylesheet sits at the package root so one literal serves both.
    it.each([`src/${name}/index.ts`, `dist/${name}/index.js`])('resolves from %s', (modulePath) => {
        const target = declaredStylesheetTarget(join(pkgRoot, modulePath));
        expect(target).toBe(join(pkgRoot, file));
        expect(existsSync(target), `${target} does not exist`).toBe(true);
    });
});
