/** @filedesc Verifies canonical field spacing ownership and wrapper imports. */
import { describe, expect, it } from 'vitest';
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

const reactCSS = readFileSync(
    resolve(__dirname, '../src/formspec.css'), 'utf-8'
);
const reactAddonCSS = readFileSync(
    resolve(__dirname, '../src/formspec-react-addon.css'), 'utf-8'
);
const wcCSS = readFileSync(
    resolve(__dirname, '../../formspec-webcomponent/src/formspec-default.css'), 'utf-8'
);
const layoutCSSRaw = readFileSync(
    resolve(__dirname, '../../formspec-layout/src/formspec-default.css'), 'utf-8'
);
const layoutCSS = readCSSResolved(
    resolve(__dirname, '../../formspec-layout/src/formspec-default.css')
);
const layoutStructuralCSS = readCSSResolved(
    resolve(__dirname, '../../formspec-layout/src/formspec-layout.css')
);
const layoutTheme = JSON.parse(readFileSync(
    resolve(__dirname, '../../formspec-layout/src/default-theme.json'), 'utf-8'
));

function extractRuleProp(css: string, selector: string, prop: string): string | null {
    const ruleRe = /([^{}]+)\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = ruleRe.exec(css)) !== null) {
        if (match[1].split(',').some(part => part.includes(selector))) {
            const propMatch = match[2].match(new RegExp(`${prop}:\\s*([^;]+);`));
            if (propMatch) return propMatch[1].trim();
        }
    }
    return null;
}

describe('Field spacing token ownership', () => {
    it('uses the xs spacing token for .formspec-field gap in the canonical layout CSS', () => {
        const expected = 'var(--formspec-spacing-xs, 0.25rem)';
        expect(extractRuleProp(layoutCSS, '.formspec-field', 'gap')).toBe(expected);
    });

    it('bundles structural layout into the canonical default CSS', () => {
        expect(layoutCSSRaw).toContain('@import "./formspec-layout.css";');
        expect(extractRuleProp(layoutStructuralCSS, '.formspec-stack', 'gap')).toBe('var(--formspec-spacing-field, 0.75rem)');
    });

    it('keeps React and WC source CSS as thin wrappers over the canonical assets', () => {
        // React links no stylesheets itself, so it wraps the combined layout + skin bundle.
        expect(reactCSS).toContain('@import "../../formspec-layout/src/formspec-default.css";');
        expect(reactCSS).not.toContain('@import "../../formspec-layout/src/formspec-layout.css";');
        expect(reactCSS).not.toContain('./formspec-react-addon.css');
        // <formspec-render> links formspec-layout.css for every adapter, so its default is the skin alone.
        expect(wcCSS).toContain('@import "../../formspec-layout/src/formspec-skin.css";');
        expect(wcCSS).not.toContain('formspec-default.css');
    });

    it('defines spacing tokens in the canonical layout-owned theme', () => {
        expect(layoutTheme.tokens['spacing.xs']).toBe('0.25rem');
        expect(layoutTheme.tokens['spacing.field']).toBe('0.75rem');
    });

    it('defines the refined default typography and color tokens in the canonical theme', () => {
        expect(layoutTheme.tokens['font.family']).toBe('"Instrument Sans", "Avenir Next", "Segoe UI", sans-serif');
        expect(layoutTheme.tokens['color.primary']).toBe('#27594f');
        expect(layoutTheme.tokens['color.surface']).toBe('#f2ece2');
    });

    it('ships a single canonical dark token override block in the canonical CSS bundle', () => {
        expect(layoutCSS).toContain('color-scheme: light;');
        expect(layoutCSS).toContain('.formspec-container.formspec-appearance-dark');
        expect(layoutCSS).toContain('--formspec-default-bg: var(--formspec-color-dark-background, #161311)');
        expect(layoutCSS).toContain('--formspec-default-text: var(--formspec-color-dark-foreground, #f3ecdf)');
        expect(layoutCSS).toContain('--formspec-default-surface: var(--formspec-color-dark-card, #211c19)');
        expect(layoutCSS).not.toContain('@media (prefers-color-scheme: dark)');
        expect(layoutCSS).not.toContain('.formspec-appearance-light .formspec-container');
        expect(layoutCSS).not.toContain('.formspec-appearance-dark .formspec-container');
    });

    it('uses a less boxy grouped-choice layout in the canonical CSS', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-checkbox-group', 'border-left')).toBe('none');
        expect(extractRuleProp(layoutCSS, '.formspec-checkbox-group', 'padding-left')).toBe('0');
    });

    it('keeps toggle supporting content on full-width rows', () => {
        expect(extractRuleProp(
            layoutCSS,
            '.formspec-field--inline.formspec-field--toggle',
            'grid-template-columns',
        )).toBe('minmax(0, 1fr) auto');
        expect(layoutCSS).toMatch(/\.formspec-field--toggle\s*>\s*:is\(/);
        expect(layoutCSS).toContain('grid-column: 1 / -1;');
        expect(extractRuleProp(
            layoutCSS,
            '.formspec-field--toggle > .formspec-error:empty',
            'display',
        )).toBe('block');
        expect(extractRuleProp(
            layoutCSS,
            '.formspec-field--toggle > .formspec-error:empty',
            'visibility',
        )).toBe('hidden');
    });

    it('neutralizes native fieldset and legend chrome so grouped controls match across renderers', () => {
        expect(extractRuleProp(layoutCSS, '.formspec-fieldset', 'border')).toBe('0');
        expect(extractRuleProp(layoutCSS, '.formspec-fieldset', 'padding')).toBe('0');
        expect(extractRuleProp(layoutCSS, '.formspec-fieldset', 'gap')).toBe(
            'var(--formspec-spacing-xs, 0.25rem)',
        );
        expect(extractRuleProp(layoutCSS, '.formspec-legend', 'display')).toBe('block');
        expect(extractRuleProp(layoutCSS, '.formspec-legend', 'font-size')).toBe('0.84rem');
    });

    it('keeps shared field skin selectors in the canonical layout bundle instead of the React add-on', () => {
        const sharedSelectors = [
            '.formspec-file-upload',
            '.formspec-toggle-label',
            '.formspec-money',
            '.formspec-money-field',
            '.formspec-rating',
            '.formspec-slider',
            '.formspec-input-adornment',
            '.formspec-signature',
        ];

        for (const selector of sharedSelectors) {
            expect(layoutCSS).toContain(selector);
            expect(reactAddonCSS).not.toContain(selector);
        }
    });

    it('does not leave renderer-specific selector rules in the React add-on file', () => {
        expect(layoutCSS).toContain('.formspec-screener');
        expect(layoutCSS).toContain('.formspec-validation-summary');
        expect(reactAddonCSS).not.toMatch(/^\s*\.formspec-/m);
    });
});
