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
        // One rhythm owner: the structural sheet carries no gaps (ADR 0064 decision 3), so no override here.
        expect(declarationsFor(css, '.formspec-container .formspec-stack:not(.grid-row)')).toBe('');
    });

    it('spaces the field help row below the control', () => {
        expect(declarationsFor(css, '.formspec-field-help-row')).toMatch(/margin-top:1rem/);
    });

    it('keeps the native modal dialog in the top layer and scrollable', () => {
        // `.usa-modal` itself says `position: relative`, which would drop an open dialog into page flow.
        const dialog = declarationsFor(css, 'dialog.usa-modal');
        expect(dialog).toMatch(/position:fixed/);
        expect(dialog).toMatch(/margin:auto/);
        expect(dialog).toMatch(/overflow:auto/);
        expect(dialog).not.toMatch(/overflow:visible/);
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

describe('the tailwind adapter owns its layout rhythm (ADR 0064 decision 3)', () => {
    const css = readFileSync(join(pkgRoot, 'src/tailwind/tailwind-formspec-core.css'), 'utf8');
    it('declares the container and stack gaps the structural sheet no longer carries', () => {
        expect(css).toMatch(/\.formspec-container\s*\{\s*gap: var\(--formspec-spacing-md/);
        expect(css).toMatch(/\.formspec-stack:not\(\.grid-row\),[\s\S]*?gap: var\(--formspec-spacing-field/);
    });
});

describe('the uswds adapter declares its class vocabulary from the generated artifact (ADR 0064 decision 2+3)', () => {
    it('is a non-empty set carrying the classes the compiled sheet selects', () => {
        expect(uswdsAdapter.classVocabulary).toBeInstanceOf(Set);
        expect(uswdsAdapter.classVocabulary!.size).toBeGreaterThan(0);
        expect(uswdsAdapter.classVocabulary!.has('usa-input')).toBe(true);
        expect(uswdsAdapter.classVocabulary!.has('usa-legend')).toBe(true);
    });

    it('includes the font-weight utilities the `$output-these-utilities` whitelist forwards', () => {
        expect(uswdsAdapter.classVocabulary!.has('text-bold')).toBe(true);
        expect(uswdsAdapter.classVocabulary!.has('text-normal')).toBe(true);
    });

    it('never carries a class the compiled sheet does not select', () => {
        expect(uswdsAdapter.classVocabulary!.has('this-class-does-not-exist')).toBe(false);
    });
});
