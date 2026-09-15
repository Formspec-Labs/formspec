/** @filedesc Verifies CSS ownership: adapters declare self-contained stylesheets that resolve from dist/. */
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

/** A bundler emits `new URL(x, import.meta.url)` as-is, so the shipped literal is the contract. */
function declaredStylesheetTarget(builtModule: string): string {
    const src = readFileSync(builtModule, 'utf8');
    const m = src.match(/new URL\((['"])(.*?)\1,\s*import\.meta\.url\)/);
    expect(m, `${builtModule} declares no new URL(..., import.meta.url)`).toBeTruthy();
    return fileURLToPath(new URL(m![2], pathToFileURL(builtModule)));
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

    it('types the render root without help from the page', () => {
        // USWDS applies body typography and heading styles at the document level (uswds-global), which this
        // trimmed build never forwards — without adapter-owned rules the root inherits the UA serif.
        expect(declarationsFor(css, '.formspec-container')).toMatch(/Source Sans Pro/);
        expect(declarationsFor(css, '.formspec-container h3')).toMatch(/Merriweather/);
    });
});

describe.each([
    ['uswds', uswdsAdapter, 'uswds-integration.css', 'dist/uswds/index.js'] as const,
    ['tailwind', tailwindAdapter, 'tailwind-formspec-core.css', 'dist/tailwind/index.js'] as const,
])('the %s adapter declares its own stylesheet', (_name, adapter, file, builtModule) => {
    it(`declares one absolute URL for ${file}`, () => {
        expect(adapter.stylesheets).toHaveLength(1);
        expect(basename(new URL(adapter.stylesheets![0]).pathname)).toBe(file);
    });

    it('resolves that URL from the built module location', () => {
        const target = declaredStylesheetTarget(join(pkgRoot, builtModule));
        expect(existsSync(target), `${target} does not exist`).toBe(true);
    });
});
