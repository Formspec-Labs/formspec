/** @filedesc Verifies CSS ownership: adapters declare self-contained, layered stylesheets that resolve from src and dist (ADR 0063 D-4). */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { uswdsAdapter } from '../src/uswds';
import { tailwindAdapter } from '../src/tailwind';
import { readUswdsBaseCss, readUswdsFormspecCss } from './helpers';

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

/** Every `new URL(x, import.meta.url)` target in a module file, resolved to an absolute path. */
function declaredStylesheetTargets(modulePath: string): string[] {
    const src = readFileSync(modulePath, 'utf8');
    const matches = [...src.matchAll(/new URL\((['"])(.*?)\1,\s*import\.meta\.url\)/g)];
    expect(matches.length, `${modulePath} declares no new URL(..., import.meta.url)`).toBeGreaterThan(0);
    return matches.map((m) => fileURLToPath(new URL(m[2], pathToFileURL(modulePath))));
}

describe('USWDS base layer is self-contained (ADR 0063 D-4)', () => {
    const css = readUswdsBaseCss();

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

    it('carries the design system alone — no Formspec-owned selector', () => {
        expect(css).not.toMatch(/\.formspec-[\w-]/);
        expect(css).not.toContain('--formspec-uswds-rules');
    });

    it('carries the base-layer presence probe class a bare USWDS build always defines', () => {
        expect(declarationsFor(css, '.usa-sr-only')).toMatch(/position:absolute/);
    });
});

describe('USWDS rules layer carries only Formspec\'s own rules (ADR 0063 D-4)', () => {
    const css = readUswdsFormspecCss();

    it('is small — a house-rules layer, not a second copy of the design system', () => {
        expect(css.length).toBeLessThan(20 * 1024);
    });

    it('declares the presence marker on the render root', () => {
        expect(declarationsFor(css, '.formspec-container')).toMatch(/--formspec-uswds-rules:\s*1/);
    });

    it('types headings at zero specificity, so a USWDS component heading keeps its own type', () => {
        expect(declarationsFor(css, ':where(.formspec-container) h2')).toMatch(/Merriweather/);
        expect(css).not.toMatch(/(^|[},])\.formspec-container h[1-6]\b/);
    });

    it('lets the Theme retune the rhythm between blocks through the spacing.field token', () => {
        // USWDS's own units-3 margin is the fallback; the token the renderer publishes overrides it. Display
        // text and dividers share the one gap above, and no block adds a bottom margin to double it.
        for (const selector of ['.usa-form-group', '.formspec-uswds-text-wrap', '.formspec-uswds-divider', '.formspec-uswds-divider--labeled']) {
            expect(declarationsFor(css, selector)).toMatch(/margin-top:var\(--formspec-spacing-field,\s*1\.5rem\)/);
        }
        expect(declarationsFor(css, '.formspec-uswds-divider')).toMatch(/margin-bottom:0/);
    });

    it('spaces the field help row below the control', () => {
        expect(declarationsFor(css, '.formspec-field-help-row')).toMatch(/margin-top:1rem/);
    });

    it('owns rich-text paragraph rhythm the way USWDS types its own paragraphs', () => {
        expect(declarationsFor(css, '.formspec-rich-paragraph')).toMatch(/margin-top:0;margin-bottom:0/);
    });

    it("carries USWDS's own reset, scoped to the render root at zero specificity", () => {
        // A page without USWDS's global CSS would otherwise leave UA styles on what the adapter renders: a
        // 2px legend inset, 13px Arial on radio, checkbox and date-picker buttons, UA control margins.
        expect(declarationsFor(css, ':where(.formspec-container) legend')).toMatch(/padding:0/);
        expect(declarationsFor(css, ':where(.formspec-container) button')).toMatch(/font-family:inherit/);
        // `:where()` keeps the reset at element specificity, so USWDS's component classes still win over it,
        // as they do over the page-wide normalize. Plain nesting under the class would invert that.
        expect(css).not.toMatch(/(^|[},])\.formspec-container (legend|button|input)\b/);
    });

    it('keeps the native modal dialog in the top layer and scrollable', () => {
        const dialog = declarationsFor(css, 'dialog.usa-modal');
        expect(dialog).toMatch(/position:fixed/);
        expect(dialog).toMatch(/margin:auto/);
        expect(dialog).toMatch(/overflow:auto/);
        expect(dialog).not.toMatch(/overflow:visible/);
    });
});

describe('the uswds adapter declares both layers with their stated probes (ADR 0063 D-4)', () => {
    it('declares the base layer probed by usa-sr-only/position:absolute', () => {
        expect(uswdsAdapter.stylesheets![0].presentWhen).toEqual({ className: 'usa-sr-only', property: 'position', value: 'absolute' });
    });

    it('declares the rules layer probed by its own marker', () => {
        expect(uswdsAdapter.stylesheets![1].presentWhen).toEqual({
            className: 'formspec-container',
            property: '--formspec-uswds-rules',
            value: '1',
        });
    });

    it.each([['src/uswds/index.ts'], ['dist/uswds/index.js']])('resolves both layer hrefs from %s', (modulePath) => {
        const targets = declaredStylesheetTargets(join(pkgRoot, modulePath));
        const basenames = targets.map((t) => t.split('/').pop());
        expect(basenames).toContain('uswds-base.css');
        expect(basenames).toContain('uswds-formspec.css');
        for (const target of targets) expect(existsSync(target), `${target} does not exist`).toBe(true);
    });
});

describe('the tailwind adapter declares its own single-layer stylesheet', () => {
    it('declares one layer for tailwind-formspec-core.css, probed by the marker that sheet sets', () => {
        expect(tailwindAdapter.stylesheets).toHaveLength(1);
        const [layer] = tailwindAdapter.stylesheets!;
        expect(new URL(layer.href).pathname.split('/').pop()).toBe('tailwind-formspec-core.css');
        expect(layer.presentWhen).toEqual({ className: 'formspec-container', property: '--formspec-tailwind-rules', value: '1' });
        const sheet = readFileSync(join(pkgRoot, 'src/tailwind/tailwind-formspec-core.css'), 'utf8');
        expect(sheet).toMatch(/\.formspec-container\s*\{\s*--formspec-tailwind-rules:\s*1;/);
    });

    // Storybook and every other src-aliased consumer import `src/tailwind/index.ts`; published hosts get
    // `dist/tailwind/index.js`. The stylesheet sits at the package root so one literal serves both.
    it.each(['src/tailwind/index.ts', 'dist/tailwind/index.js'])('resolves from %s', (modulePath) => {
        const [target] = declaredStylesheetTargets(join(pkgRoot, modulePath));
        expect(target).toBe(join(pkgRoot, 'tailwind-formspec-core.css'));
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

describe('the uswds adapter declares its class vocabulary as the union of both layers (ADR 0064 decision 2+3)', () => {
    it('is a non-empty set carrying the classes both compiled sheets select', () => {
        expect(uswdsAdapter.classVocabulary).toBeInstanceOf(Set);
        expect(uswdsAdapter.classVocabulary!.size).toBeGreaterThan(0);
        // Base layer.
        expect(uswdsAdapter.classVocabulary!.has('usa-input')).toBe(true);
        expect(uswdsAdapter.classVocabulary!.has('usa-legend')).toBe(true);
        // Base layer's font-weight utilities (`$output-these-utilities` whitelist).
        expect(uswdsAdapter.classVocabulary!.has('text-bold')).toBe(true);
        expect(uswdsAdapter.classVocabulary!.has('text-normal')).toBe(true);
        // Rules layer — proves the vocabulary is a union, not the base layer alone.
        expect(uswdsAdapter.classVocabulary!.has('formspec-required')).toBe(true);
    });

    it('never carries a class neither compiled sheet selects', () => {
        expect(uswdsAdapter.classVocabulary!.has('this-class-does-not-exist')).toBe(false);
    });
});
