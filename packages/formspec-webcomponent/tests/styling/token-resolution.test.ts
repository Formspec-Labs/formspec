import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveToken } from '../../src/index';

describe('resolveToken (standalone)', () => {
    it('passes non-token strings through unchanged', () => {
        expect(resolveToken('hello', undefined, undefined)).toBe('hello');
    });

    it('passes non-string values through (number, null, undefined)', () => {
        expect(resolveToken(42, undefined, undefined)).toBe(42);
        expect(resolveToken(null, undefined, undefined)).toBeNull();
        expect(resolveToken(undefined, undefined, undefined)).toBeUndefined();
    });

    it('resolves $token.xxx from componentTokens first', () => {
        const compTokens = { 'brand.color': '#f00' };
        const themeTokens = { 'brand.color': '#0f0' };
        expect(resolveToken('$token.brand.color', compTokens, themeTokens)).toBe('#f00');
    });

    it('falls back to themeTokens when componentTokens lacks token', () => {
        const themeTokens = { 'spacing.md': '1rem' };
        expect(resolveToken('$token.spacing.md', undefined, themeTokens)).toBe('1rem');
    });

    it('returns original string and warns for unresolved token', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = resolveToken('$token.missing', {}, {});
        expect(result).toBe('$token.missing');
        expect(warn).toHaveBeenCalledWith('Unresolved token reference: $token.missing');
        warn.mockRestore();
    });

    it('resolves numeric token values', () => {
        const themeTokens = { 'breakpoint.sm': 768 };
        expect(resolveToken('$token.breakpoint.sm', undefined, themeTokens)).toBe(768);
    });
});

describe('emitTokenProperties (via FormspecRender)', () => {
    it('sets --formspec-{name} CSS custom properties with dots→dashes', async () => {
        // Import the full module to get the class and side effects
        const { FormspecRender } = await import('../../src/index');
        if (!customElements.get('formspec-render')) {
            customElements.define('formspec-render', FormspecRender);
        }

        const el = document.createElement('formspec-render') as InstanceType<typeof FormspecRender>;
        document.body.appendChild(el);

        el.themeDocument = {
            $formspecTheme: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:form' },
            tokens: { 'spacing.lg': '1.5rem' },
        };

        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Test',
            items: [{ key: 'f', type: 'field', label: 'F', dataType: 'string' }],
        };
        el.render();

        const container = el.querySelector('.formspec-container') as HTMLElement;
        expect(container).not.toBeNull();
        expect(container.style.getPropertyValue('--formspec-spacing-lg')).toBe('1.5rem');

        el.remove();
    });

    it('component tokens override theme tokens in CSS property emission', async () => {
        const { FormspecRender } = await import('../../src/index');
        if (!customElements.get('formspec-render')) {
            customElements.define('formspec-render', FormspecRender);
        }

        const el = document.createElement('formspec-render') as InstanceType<typeof FormspecRender>;
        document.body.appendChild(el);

        el.themeDocument = {
            $formspecTheme: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:form' },
            tokens: { 'color.primary': 'blue' },
        };

        el.componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:form' },
            tokens: { 'color.primary': 'red' },
            tree: { component: 'Stack', children: [] },
        };

        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Test',
            items: [],
        };
        el.render();

        const container = el.querySelector('.formspec-container') as HTMLElement;
        // Component tokens override theme tokens
        expect(container.style.getPropertyValue('--formspec-color-primary')).toBe('red');

        el.remove();
    });

    it('layers a partial tenant Theme over platform spacing and radii', async () => {
        const { FormspecRender, defaultTheme } = await import('../../src/index');
        if (!customElements.get('formspec-render')) {
            customElements.define('formspec-render', FormspecRender);
        }

        const el = document.createElement('formspec-render') as InstanceType<typeof FormspecRender>;
        document.body.appendChild(el);
        el.themeDocument = {
            $formspecTheme: '1.0',
            version: '1.0.0',
            title: 'Tenant presentation',
            tokens: { 'color.primary': '#7A1F3D' },
        };
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Test',
            items: [],
        };
        el.render();

        const container = el.querySelector('.formspec-container') as HTMLElement;
        expect(container.style.getPropertyValue('--formspec-color-primary')).toBe('#7A1F3D');
        expect(container.style.getPropertyValue('--formspec-spacing-md')).toBe(
            defaultTheme.tokens?.['spacing.md'],
        );
        expect(container.style.getPropertyValue('--formspec-radius-md')).toBe(
            defaultTheme.tokens?.['radius.md'],
        );
        expect(el.getEffectiveTheme().title).toBe('Tenant presentation');

        el.remove();
    });
});
