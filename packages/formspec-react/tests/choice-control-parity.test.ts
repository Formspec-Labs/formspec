/** @filedesc Verifies accessible sizing for checkbox and radio controls in the shared skin. */
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

describe('Choice control sizing parity', () => {
    it('sizes checkbox and radio glyphs above the browser default', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-checkbox-group input[type="checkbox"]', 'width')).toBe('1.125rem');
        expect(extractRuleProp(layoutCSS, '.formspec-checkbox-group input[type="checkbox"]', 'height')).toBe('1.125rem');
        expect(extractRuleProp(layoutCSS, '.formspec-radio-group input[type="radio"]', 'width')).toBe('1.125rem');
        expect(extractRuleProp(layoutCSS, '.formspec-radio-group input[type="radio"]', 'height')).toBe('1.125rem');
    });

    it('gives grouped choices and switches a 44px target', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-checkbox-group label', 'min-height')).toBe('2.75rem');
        expect(extractRuleProp(layoutCSS, '.formspec-radio-group label', 'min-height')).toBe('2.75rem');
        expect(extractRuleProp(
            layoutCSS,
            '.formspec-toggle input[type="checkbox"][role="switch"]',
            'height',
        )).toBe('2.75rem');
    });
});
