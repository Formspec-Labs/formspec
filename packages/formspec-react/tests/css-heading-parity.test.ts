/** @filedesc Verifies heading scale in the canonical layout-owned default CSS. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';

/** Read a CSS file and recursively inline its @import "./..." references. */
function readCSSResolved(filePath: string): string {
    const raw = readFileSync(filePath, 'utf-8');
    const dir = dirname(filePath);
    return raw.replace(/@import\s+"(\.[^"]+)";/g, (_match, rel) => {
        try { return readCSSResolved(resolve(dir, rel)); }
        catch { return _match; }
    });
}

const layoutCSS = readCSSResolved(
    resolve(__dirname, '../../formspec-layout/src/formspec-default.css')
);

/**
 * Extract a CSS property value from a rule whose selector list includes
 * `hN.formspec-heading`. Handles combined selectors like `h5.formspec-heading,\nh6.formspec-heading`.
 */
function extractHeadingProp(css: string, level: number, prop: string): string | null {
    // Find all rule blocks, then check if any selector list contains hN.formspec-heading
    const ruleRe = /([^{}]+)\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(css)) !== null) {
        const selectors = m[1];
        const body = m[2];
        if (selectors.includes(`h${level}.formspec-heading`)) {
            const propRe = new RegExp(`${prop}:\\s*([^;]+);`);
            const pm = body.match(propRe);
            if (pm) return pm[1].trim();
        }
    }
    return null;
}

describe('Canonical heading scale', () => {
    // Values from formspec-layout/src/styles/default.base.css — the canonical source.
    const expectedScale: Record<number, { size: string; weight: string }> = {
        1: { size: '1.55rem', weight: '700' },
        2: { size: '1.28rem', weight: '700' },
        3: { size: '1.02rem', weight: '650' },
        4: { size: '0.9375rem', weight: '600' },
        5: { size: '0.875rem', weight: '600' },
        6: { size: '0.875rem', weight: '600' },
    };

    for (const level of [1, 2, 3, 4, 5, 6]) {
        it(`h${level} font-size matches the expected scale`, () => {
            const size = extractHeadingProp(layoutCSS, level, 'font-size');
            // A display heading Item scales with its styleHints `size` (core §4.2.5.3).
            expect(size).toBe(`calc(${expectedScale[level].size} * var(--formspec-size-scale, 1))`);
        });

        it(`h${level} font-weight matches the expected scale`, () => {
            const weight = extractHeadingProp(layoutCSS, level, 'font-weight');
            expect(weight).toBe(expectedScale[level].weight);
        });
    }
});
