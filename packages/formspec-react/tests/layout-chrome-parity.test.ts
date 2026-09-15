/** @filedesc Verifies shared layout chrome styling for advanced containers and navigation. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';

/**
 * Strip top-level `@media (...) { ... }` blocks via balanced-brace scanning. `extractRuleProp`'s regex
 * below assumes one `{`/`}` pair per rule; an unstripped `@media` wrapper nests a second pair inside the
 * first, which desyncs every rule match that follows it in the file. None of this suite's assertions
 * target a selector that lives inside a media query, so dropping those blocks is lossless here.
 */
function stripMediaBlocks(css: string): string {
    let out = '';
    let i = 0;
    while (i < css.length) {
        const atMedia = css.slice(i).match(/^@media[^{]*\{/);
        if (!atMedia) { out += css[i]; i += 1; continue; }
        let depth = 1;
        let j = i + atMedia[0].length;
        while (j < css.length && depth > 0) {
            if (css[j] === '{') depth += 1;
            else if (css[j] === '}') depth -= 1;
            j += 1;
        }
        i = j;
    }
    return out;
}

/**
 * A `/* comment *\/` directly above a selector becomes part of `extractRuleProp`'s captured selector
 * text below (its regex treats everything between the previous `}` and the next `{` as one selector
 * list) — an exact-match `part.trim() === selector` then never matches. Strip comments so a rule's own
 * explanatory prose can't desync selector matching.
 */
function stripComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function readCSSResolved(filePath: string): string {
    const raw = readFileSync(filePath, 'utf-8');
    const dir = dirname(filePath);
    const resolved = raw.replace(/@import\s+"(\.[^"]+)";/g, (_match, rel) => {
        try { return readCSSResolved(resolve(dir, rel)); }
        catch { return _match; }
    });
    return stripComments(stripMediaBlocks(resolved));
}

function extractRuleProp(css: string, selector: string, prop: string): string | null {
    const ruleRe = /([^{}]+)\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    let resolvedValue: string | null = null;
    while ((match = ruleRe.exec(css)) !== null) {
        if (match[1].split(',').some((part) => part.trim() === selector)) {
            const propMatch = match[2].match(new RegExp(`${prop}:\\s*([^;]+);`));
            if (propMatch) resolvedValue = propMatch[1].trim();
        }
    }
    return resolvedValue;
}

const layoutCSS = readCSSResolved(
    resolve(__dirname, '../../formspec-layout/src/formspec-default.css'),
);

describe('Layout chrome parity', () => {
    it('uses container-managed spacing for cards instead of card-managed bottom margins', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-card', 'margin-bottom')).toBe('0');
        expect(extractRuleProp(layoutCSS, '.formspec-card', 'display')).toBe('flex');
        expect(extractRuleProp(layoutCSS, '.formspec-card', 'gap')).toBe('1rem');
    });

    it('gives tabs a stronger active surface and readable inactive text', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-tab', 'color')).toBe('var(--formspec-default-text-subtle)');
        expect(extractRuleProp(layoutCSS, '.formspec-tab--active', 'background')).toBe('var(--formspec-default-primary-fill)');
        expect(extractRuleProp(layoutCSS, '.formspec-tab--active', 'color')).toBe('var(--formspec-default-text-inverse)');
    });

    it('keeps collapsible and accordion headers on strong text over distinct header surfaces', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-collapsible summary', 'color')).toBe('var(--formspec-default-text-strong)');
        expect(extractRuleProp(layoutCSS, '.formspec-collapsible summary', 'background')).toContain('var(--formspec-default-surface-muted)');
        expect(extractRuleProp(layoutCSS, '.formspec-collapsible-content', 'background')).toBe('var(--formspec-default-surface)');
        expect(extractRuleProp(layoutCSS, '.formspec-accordion-item summary', 'color')).toBe('var(--formspec-default-text-strong)');
        expect(extractRuleProp(layoutCSS, '.formspec-accordion-content', 'background')).toBe('var(--formspec-default-surface)');
    });

    it('keeps panel headers on the shared elevated surface with strong text', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-panel-header', 'background')).toBe('var(--formspec-default-surface-muted)');
        expect(extractRuleProp(layoutCSS, '.formspec-panel-header', 'color')).toBe('var(--formspec-default-text-strong)');
    });

    it('strengthens the wizard side-nav and content split', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-wizard--with-sidenav', 'background')).toBe('var(--formspec-default-surface)');
        expect(extractRuleProp(layoutCSS, '.formspec-wizard-content', 'background')).toBe('var(--formspec-default-surface)');
        expect(extractRuleProp(layoutCSS, '.formspec-wizard-step-indicator', 'color')).toBe('var(--formspec-default-text-strong)');
        expect(extractRuleProp(layoutCSS, '.formspec-wizard-step', 'color')).toBe('var(--formspec-default-text)');
        expect(extractRuleProp(layoutCSS, '.formspec-wizard-step-label', 'color')).toBe('var(--formspec-default-text)');
        expect(extractRuleProp(layoutCSS, '.formspec-wizard-step-label', 'font-size')).toBe('0.9375rem');
        expect(extractRuleProp(layoutCSS, '.formspec-wizard-sidenav-label', 'color')).toBe('var(--formspec-default-text)');
        expect(extractRuleProp(layoutCSS, '.formspec-wizard-sidenav-item--completed', 'opacity')).toBe('1');
        expect(extractRuleProp(layoutCSS, '.formspec-wizard-sidenav-item--active', 'background')).toContain('var(--formspec-default-primary)');
    });

    it('keeps the shared destructive button fill on remove actions', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-button-danger', 'color')).toBe('var(--formspec-default-text-inverse)');
        expect(extractRuleProp(layoutCSS, '.formspec-button-danger', 'background')).toBe('var(--formspec-default-danger-fill)');
        expect(extractRuleProp(layoutCSS, '.formspec-button-danger', 'border-color')).toBe('var(--formspec-default-danger-fill)');
    });

    it('keeps repeat-instance spacing and remove-button layout separate from the shared danger button shell', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-repeat-list', 'gap')).toBe('var(--formspec-spacing-field, 0.75rem)');
        expect(extractRuleProp(layoutCSS, '.formspec-repeat-instance', 'gap')).toBe('var(--formspec-spacing-field, 0.75rem)');
        expect(extractRuleProp(layoutCSS, '.formspec-repeat-remove', 'padding')).toBe('0.72rem 1rem');
        expect(extractRuleProp(layoutCSS, '.formspec-repeat-remove', 'font-size')).toBe('0.875rem');
        expect(extractRuleProp(layoutCSS, '.formspec-repeat-remove', 'box-shadow')).toContain('var(--formspec-default-danger-fill)');
        expect(extractRuleProp(layoutCSS, '.formspec-repeat-instance-header', 'justify-content')).toBe('space-between');
        expect(extractRuleProp(layoutCSS, '.formspec-repeat-instance-label', 'color')).toBe('var(--formspec-default-text-strong)');
        expect(extractRuleProp(layoutCSS, '.formspec-repeat-instance-header > .formspec-repeat-remove', 'margin-block')).toBe('0');
    });
});
