/** @filedesc Verifies canonical primary-action button styling in the shared skin. */
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

describe('Primary action button parity', () => {
    it('uses flat primary backgrounds instead of gradients for submit and add actions', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-submit', 'background')).toBe('var(--formspec-default-primary-fill)');
        expect(extractRuleProp(layoutCSS, '.formspec-datatable-add', 'background')).toBe('var(--formspec-default-primary-fill)');
        expect(extractRuleProp(layoutCSS, '.formspec-button-primary', 'background')).toBe('var(--formspec-default-primary-fill)');
    });

    it('uses a solid hover state instead of a gradient', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-submit:hover', 'background')).toBe('var(--formspec-default-primary-fill-strong)');
        expect(extractRuleProp(layoutCSS, '.formspec-datatable-add:hover', 'background')).toBe('var(--formspec-default-primary-fill-strong)');
        expect(extractRuleProp(layoutCSS, '.formspec-button-primary:hover:not(:disabled)', 'background')).toBe('var(--formspec-default-primary-fill-strong)');
    });

    it('uses a shared destructive fill for remove actions', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-button-danger', 'background')).toBe('var(--formspec-default-danger-fill)');
        expect(extractRuleProp(layoutCSS, '.formspec-button-danger', 'color')).toBe('var(--formspec-default-text-inverse)');
        expect(extractRuleProp(layoutCSS, '.formspec-button-danger', 'border-color')).toBe('var(--formspec-default-danger-fill)');
        expect(extractRuleProp(layoutCSS, '.formspec-button-danger:hover:not(:disabled)', 'background')).toContain('var(--formspec-default-danger-fill) 88%, black');
    });

    it('keeps primary action text on the light foreground token in dark mode', () => {
        // Dark fills keep the light-mode primary, so their text is the light-mode foreground.
        // A theme's color.dark.primaryForeground is picked for the light color.dark.primary tint,
        // so it is often dark: #0E1826 on #1D3FAE measured 2.0:1. No stylesheet reads it.
        expect(layoutCSS).toContain('--formspec-default-primary-fill: var(--formspec-color-primary, #1D3FAE)');
        expect(layoutCSS).not.toContain('--formspec-default-text-inverse: var(--formspec-color-dark-primaryForeground');
        expect(layoutCSS.match(/--formspec-default-text-inverse: var\(--formspec-color-primaryForeground, #FFFFFF\)/gi)).toHaveLength(2);
    });

    it('lets the file upload browse button inherit the shared secondary button colors', () => {
        expect(layoutCSS).not.toContain('color: #374151;');
        expect(layoutCSS).not.toContain('.formspec-file-browse-btn,\n.formspec-signature-clear {');
    });
});
