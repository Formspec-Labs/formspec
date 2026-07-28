/** @filedesc Verifies canonical display-component skin rules that affect both renderers. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';

function readCSSResolved(filePath: string): string {
    const raw = readFileSync(filePath, 'utf-8');
    const dir = dirname(filePath);
    return raw.replace(/@import\s+"(\.[^"]+)";/g, (_match, rel) => {
        try { return readCSSResolved(resolve(dir, rel)); }
        catch { return _match; }
    });
}

function extractRuleProp(css: string, selector: string, prop: string): string | null {
    const ruleRe = /([^{}]+)\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = ruleRe.exec(css)) !== null) {
        if (match[1].split(',').some((part) => part.includes(selector))) {
            const propMatch = match[2].match(new RegExp(`${prop}:\\s*([^;]+);`));
            if (propMatch) return propMatch[1].trim();
        }
    }
    return null;
}

const layoutCSS = readCSSResolved(
    resolve(__dirname, '../../formspec-layout/src/formspec-default.css'),
);

describe('Display component skin parity', () => {
    it('assigns semantic text color to the shared display paragraph class', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-text', 'color')).toBe('var(--formspec-default-text)');
    });

    it('uses a stronger divider tone so display dividers remain visible in dark mode', () => {
        expect(extractRuleProp(layoutCSS, 'hr.formspec-divider', 'color')).toBe(
            'color-mix(in srgb, var(--formspec-default-border-strong) 68%, var(--formspec-default-border))',
        );
    });

    it('puts the brand accent on the root stack every rendered form contains', () => {
        expect(
            extractRuleProp(layoutCSS, '.formspec-container > .formspec-stack', 'border-inline-start'),
        ).toBe('3px solid var(--formspec-default-primary)');
    });

    it('ships dark-mode alert foreground overrides with higher-contrast colors', () => {
        expect(layoutCSS).toContain('.formspec-container.formspec-appearance-dark');
        expect(layoutCSS).toContain('--formspec-default-info-text: #d7eaff;');
        expect(layoutCSS).toContain('--formspec-default-warning-text: #ffe0a6;');
        expect(layoutCSS).toContain('--formspec-default-danger-text: #ffc7bf;');
        expect(layoutCSS).toContain('--formspec-default-success-text: #c7efd3;');
        expect(extractRuleProp(layoutCSS, '.formspec-alert--info', 'color')).toBe('var(--formspec-default-info-text)');
        expect(extractRuleProp(layoutCSS, '.formspec-alert--warning', 'color')).toBe('var(--formspec-default-warning-text)');
        expect(extractRuleProp(layoutCSS, '.formspec-alert--error', 'color')).toBe('var(--formspec-default-danger-text)');
        expect(extractRuleProp(layoutCSS, '.formspec-alert--success', 'color')).toBe('var(--formspec-default-success-text)');
    });
});
