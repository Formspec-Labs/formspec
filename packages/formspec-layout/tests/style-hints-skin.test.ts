/** @filedesc The default skin maps every core §4.2.5.3 styleHints class the resolver emits, at zero specificity. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const STYLE_HINT_CLASSES = [
    'formspec-emphasis-primary', 'formspec-emphasis-success', 'formspec-emphasis-warning',
    'formspec-emphasis-danger', 'formspec-emphasis-muted', 'formspec-size-compact', 'formspec-size-large',
];

describe('default skin styleHints', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/styles/default.utilities.css'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '');

    it.each(STYLE_HINT_CLASSES)('styles %s inside :where(), so states and Theme classes win', (cls) => {
        const rules = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1]).filter((selector) => selector.includes(cls));
        expect(rules.length, cls).toBeGreaterThan(0);
        for (const selector of rules) expect(selector.trim().startsWith(':where('), selector).toBe(true);
    });

    it('uses rem and custom properties instead of non-standard zoom for size hints', () => {
        expect(css).not.toMatch(/\bzoom\s*:/);
        expect(css).toContain('font-size: 0.875rem');
        expect(css).toContain('font-size: 1.125rem');
        expect(css).toContain('--formspec-control-height: 2.25rem');
        expect(css).toContain('--formspec-control-height: 3rem');
    });
});
