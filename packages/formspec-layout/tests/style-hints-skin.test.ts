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

    // tests/e2e/browser/style-hints.spec.ts measures the painted sizes; this pins the mechanism.
    it('scales size hints through --formspec-size-scale, which the base sizes multiply, not zoom', () => {
        expect(css).not.toMatch(/\bzoom\s*:/);
        expect(css).toMatch(/:where\(\.formspec-size-compact\)\s*\{[^}]*--formspec-size-scale:\s*0\.875;/);
        expect(css).toMatch(/:where\(\.formspec-size-large\)\s*\{[^}]*--formspec-size-scale:\s*1\.125;/);
        const base = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/styles/default.base.css'), 'utf8');
        for (const selector of ['.formspec-container :where(label)', '.formspec-container :where(button)', '.formspec-legend', '.formspec-description', '.formspec-hint']) {
            const rule = base.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
            expect(rule?.[1], selector).toMatch(/font-size:\s*calc\([^;]*var\(--formspec-size-scale, 1\)\)/);
        }
    });
});
