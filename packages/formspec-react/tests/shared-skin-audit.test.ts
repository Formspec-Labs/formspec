/** @filedesc Guards shared default-skin semantics against hard-coded color drift. */
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

describe('Shared skin audit invariants', () => {
    it('routes badge variants through semantic tokens', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-badge--primary', 'color')).toBe('var(--formspec-default-badge-primary-text)');
        expect(extractRuleProp(layoutCSS, '.formspec-badge--primary', 'background')).toBe('var(--formspec-default-badge-primary-bg)');
        expect(extractRuleProp(layoutCSS, '.formspec-badge--warning', 'color')).toBe('var(--formspec-default-badge-warning-text)');
        expect(extractRuleProp(layoutCSS, '.formspec-badge--warning', 'background')).toBe('var(--formspec-default-badge-warning-bg)');
        expect(extractRuleProp(layoutCSS, '.formspec-badge--error', 'background')).toBe('var(--formspec-default-badge-error-bg)');
    });

    it('keeps validation-summary and shape states on the shared semantic palette', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-validation-summary--visible', 'background')).toBe('var(--formspec-default-surface)');
        expect(extractRuleProp(layoutCSS, '.formspec-validation-summary-header', 'color')).toBe('var(--formspec-default-danger-text)');
        expect(extractRuleProp(layoutCSS, '.formspec-shape-error', 'color')).toBe('var(--formspec-default-danger-text)');
        expect(extractRuleProp(layoutCSS, '.formspec-shape-error', 'background')).toBe('var(--formspec-default-danger-surface)');
        expect(extractRuleProp(layoutCSS, '.formspec-shape-warning', 'color')).toBe('var(--formspec-default-warning-text)');
        expect(extractRuleProp(layoutCSS, '.formspec-shape-info', 'color')).toBe('var(--formspec-default-info-text)');
    });

    it('tokenizes rating and file-action colors instead of hard-coding them inside input widgets', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-rating-star', 'color')).toBe('var(--formspec-default-rating-empty)');
        expect(extractRuleProp(layoutCSS, '.formspec-rating-star:hover', 'color')).toBe('var(--formspec-default-rating-hover)');
        expect(extractRuleProp(layoutCSS, '.formspec-rating-star--selected', 'color')).toBe('var(--formspec-default-rating-active)');
        expect(extractRuleProp(layoutCSS, '.formspec-file-list-remove:hover', 'color')).toBe('var(--formspec-default-danger)');
        expect(extractRuleProp(layoutCSS, '.formspec-file-list-remove:hover', 'background')).toBe('var(--formspec-default-danger-surface-soft)');
        expect(extractRuleProp(layoutCSS, '.formspec-datatable-prefix', 'color')).toBe('var(--formspec-default-text-muted)');
    });

    it('uses shared inverse and muted tokens for navigation state chrome', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-modal-trigger:hover', 'color')).toBe('var(--formspec-default-text-inverse)');
        expect(extractRuleProp(layoutCSS, '.formspec-wizard-step--active', 'color')).toBe('var(--formspec-default-text-inverse)');
        expect(extractRuleProp(layoutCSS, '.formspec-wizard-step--active', 'background')).toBe('var(--formspec-default-primary-fill)');
        expect(extractRuleProp(layoutCSS, '.formspec-wizard-step--completed', 'color')).toBe('var(--formspec-default-text-inverse)');
        expect(extractRuleProp(layoutCSS, '.formspec-wizard-step--completed', 'background')).toBe('var(--formspec-default-success-fill)');
        expect(extractRuleProp(layoutCSS, '.formspec-accordion-item summary::after', 'color')).toBe('var(--formspec-default-text-muted)');
    });

    it('uses explicit 3px outline focus indicators on wrapper controls', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-input-wrapper:focus-within', 'outline')).toBe('3px solid var(--formspec-default-focus)');
        expect(extractRuleProp(layoutCSS, '.formspec-input-wrapper:focus-within', 'outline-offset')).toBe('2px');
        expect(extractRuleProp(layoutCSS, '.formspec-money:focus-within', 'outline')).toBe('3px solid var(--formspec-default-focus)');
        expect(extractRuleProp(layoutCSS, '.formspec-combobox-row:focus-within', 'outline')).toBe('3px solid var(--formspec-default-focus)');
    });

    it('gives icon-only close and clear controls a 24px target', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-alert-close', 'width')).toBe('1.5rem');
        expect(extractRuleProp(layoutCSS, '.formspec-alert-close', 'height')).toBe('1.5rem');
        expect(extractRuleProp(layoutCSS, '.formspec-combobox-chip-remove', 'width')).toBe('1.5rem');
        expect(extractRuleProp(layoutCSS, '.formspec-combobox-chip-remove', 'height')).toBe('1.5rem');
        expect(extractRuleProp(layoutCSS, '.formspec-combobox-clear', 'width')).toBe('1.5rem');
        expect(extractRuleProp(layoutCSS, '.formspec-combobox-clear', 'height')).toBe('1.5rem');
        expect(extractRuleProp(layoutCSS, '.formspec-file-list-remove', 'width')).toBe('1.5rem');
        expect(extractRuleProp(layoutCSS, '.formspec-file-list-remove', 'height')).toBe('1.5rem');
    });
});
