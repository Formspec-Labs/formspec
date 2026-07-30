import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveToken, emitMergedThemeCssVars } from '../src/index';

function hexToRgb(hex: string): [number, number, number] {
    const normalized = hex.replace('#', '');
    const expanded = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized;
    const value = Number.parseInt(expanded, 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function srgbToLinear(channel: number): number {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(foreground: string, background: string): number {
    const [r1, g1, b1] = hexToRgb(foreground).map(srgbToLinear);
    const [r2, g2, b2] = hexToRgb(background).map(srgbToLinear);
    const l1 = 0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1;
    const l2 = 0.2126 * r2 + 0.7152 * g2 + 0.0722 * b2;
    const [lighter, darker] = l1 >= l2 ? [l1, l2] : [l2, l1];
    return (lighter + 0.05) / (darker + 0.05);
}

function readCssFallback(variableName: string): string {
    const css = readFileSync(new URL('../src/styles/default.tokens.css', import.meta.url), 'utf8');
    const escapedName = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedName}:\\s*(?:var\\([^#]+,\\s*)?(#[0-9a-fA-F]{3,8})`));
    if (!match) throw new Error(`Could not find fallback for ${variableName}`);
    return match[1];
}

function readThemeToken(tokenName: string): string {
    const theme = JSON.parse(readFileSync(new URL('../src/default-theme.json', import.meta.url), 'utf8')) as {
        tokens: Record<string, string>;
    };
    const value = theme.tokens[tokenName];
    if (!value) throw new Error(`Could not find theme token ${tokenName}`);
    return value;
}

describe('resolveToken', () => {
    it('resolves a component token', () => {
        expect(resolveToken('$token.space.lg', { 'space.lg': '32px' }, undefined)).toBe('32px');
    });

    it('falls back to theme token', () => {
        expect(resolveToken('$token.space.lg', undefined, { 'space.lg': '24px' })).toBe('24px');
    });

    it('component token takes precedence over theme token', () => {
        expect(resolveToken('$token.space.lg', { 'space.lg': '32px' }, { 'space.lg': '24px' })).toBe('32px');
    });

    it('passes through non-token values', () => {
        expect(resolveToken('16px', undefined, undefined)).toBe('16px');
        expect(resolveToken(42, undefined, undefined)).toBe(42);
        expect(resolveToken(null, undefined, undefined)).toBe(null);
    });

    it('passes through unresolved token with warning', () => {
        const warn = console.warn;
        let warned = false;
        console.warn = () => { warned = true; };
        const result = resolveToken('$token.missing', undefined, undefined);
        console.warn = warn;
        expect(result).toBe('$token.missing');
        expect(warned).toBe(true);
    });
});

describe('emitMergedThemeCssVars', () => {
    function mockElement(): { el: HTMLElement; props: Record<string, string> } {
        const props: Record<string, string> = {};
        const styleList: string[] = [];
        const el = {
            style: {
                setProperty(name: string, value: string) {
                    if (!(name in props)) styleList.push(name);
                    props[name] = value;
                },
                removeProperty(name: string) {
                    delete props[name];
                    const idx = styleList.indexOf(name);
                    if (idx >= 0) styleList.splice(idx, 1);
                },
                getPropertyValue(name: string) {
                    return props[name] ?? '';
                },
                get length() {
                    return styleList.length;
                },
                [Symbol.iterator]() {
                    return styleList[Symbol.iterator]();
                },
            },
        } as unknown as HTMLElement;
        // Index access for iteration in emitMergedThemeCssVars
        Object.defineProperty(el.style, Symbol.iterator, { value: () => styleList[Symbol.iterator]() });
        for (let i = 0; i < 100; i++) {
            Object.defineProperty(el.style, i, {
                get() { return styleList[i]; },
                configurable: true,
            });
        }
        return { el, props };
    }

    it('merges component tokens over theme tokens on the target element', () => {
        const { el } = mockElement();
        emitMergedThemeCssVars(el, {
            themeTokens: { 'color.border': '#111111', 'color.primary': '#222222' },
            componentTokens: { 'color.border': '#999999' },
        });
        expect(el.style.getPropertyValue('--formspec-color-border')).toBe('#999999');
        expect(el.style.getPropertyValue('--formspec-color-primary')).toBe('#222222');
    });

    it('removes stale tokens from a previous call', () => {
        const { el } = mockElement();
        emitMergedThemeCssVars(el, {
            themeTokens: { 'color.primary': '#111', 'color.accent': '#222' },
        });
        expect(el.style.getPropertyValue('--formspec-color-accent')).toBe('#222');

        // Switch to a theme that does not have color.accent
        emitMergedThemeCssVars(el, {
            themeTokens: { 'color.primary': '#333' },
        });
        expect(el.style.getPropertyValue('--formspec-color-primary')).toBe('#333');
        expect(el.style.getPropertyValue('--formspec-color-accent')).toBe('');
    });

    it('preserves non-formspec inline styles', () => {
        const { el, props } = mockElement();
        el.style.setProperty('display', 'block');
        emitMergedThemeCssVars(el, {
            themeTokens: { 'color.primary': '#111' },
        });
        expect(props['display']).toBe('block');

        // Second call should not remove non-formspec properties
        emitMergedThemeCssVars(el, {
            themeTokens: { 'color.primary': '#222' },
        });
        expect(props['display']).toBe('block');
    });
});

describe('default theme contrast', () => {
    it('keeps quiet text tokens above AA contrast on their intended light surfaces', () => {
        const subtleFallback = readCssFallback('--formspec-default-text-subtle');
        const faintFallback = readCssFallback('--formspec-default-text-faint');
        const dangerFallback = readCssFallback('--formspec-default-danger');
        const warningFallback = readCssFallback('--formspec-default-warning');
        const bgFallback = readCssFallback('--formspec-default-bg');
        const surfaceFallback = readCssFallback('--formspec-default-surface');
        const quietFallback = readCssFallback('--formspec-default-surface-quiet');
        const dangerSurfaceSoftFallback = readCssFallback('--formspec-default-danger-surface-soft');
        const warningSurfaceFallback = readCssFallback('--formspec-default-warning-surface');

        expect(contrastRatio(subtleFallback, bgFallback)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(subtleFallback, surfaceFallback)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(faintFallback, bgFallback)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(faintFallback, quietFallback)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(dangerFallback, dangerSurfaceSoftFallback)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(warningFallback, warningSurfaceFallback)).toBeGreaterThanOrEqual(4.5);
    });

    it('ships matching theme tokens that also clear AA on the same surfaces', () => {
        const mutedForeground = readThemeToken('color.mutedForeground');
        const error = readThemeToken('color.error');
        const warning = readThemeToken('color.warning');
        const info = readCssFallback('--formspec-default-info');
        const background = '#f6f0e6';
        const card = '#fdfaf4';
        const quietSurface = '#fcf8f1';
        const dangerSurfaceSoft = '#fdf1ef';
        const warningSurface = '#fff2db';
        const warningSurfaceSoft = '#fdf5e7';
        const infoSurfaceSoft = '#f1f7fc';
        const faintFallback = readCssFallback('--formspec-default-text-faint');

        expect(contrastRatio(mutedForeground, background)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(mutedForeground, card)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(faintFallback, quietSurface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(error, dangerSurfaceSoft)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(warning, warningSurface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(warning, warningSurfaceSoft)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(info, infoSurfaceSoft)).toBeGreaterThanOrEqual(4.5);
    });

    it('keeps primary labels readable on the fills each appearance renders', () => {
        const primary = readThemeToken('color.primary');
        const primaryForeground = readThemeToken('color.primaryForeground');
        const darkPrimaryForeground = readThemeToken('color.dark.primaryForeground');
        const tokenCss = readFileSync(
            new URL('../src/styles/default.tokens.css', import.meta.url),
            'utf8',
        );

        expect(contrastRatio(primaryForeground, primary)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(darkPrimaryForeground, primary)).toBeGreaterThanOrEqual(4.5);
        expect(tokenCss).toMatch(
            /\.formspec-container\.formspec-appearance-dark[\s\S]*--formspec-default-primary-fill:\s*var\(--formspec-color-primary,/,
        );
    });

    it('keeps unfocused control boundaries and switch-off tracks above 3:1', () => {
        const lightInput = readThemeToken('color.input');
        const darkInput = readThemeToken('color.dark.input');
        const lightCard = readThemeToken('color.card');
        const darkCard = readThemeToken('color.dark.card');
        const inputCss = readFileSync(
            new URL('../src/styles/default.inputs.css', import.meta.url),
            'utf8',
        );

        expect(contrastRatio(lightInput, lightCard)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(darkInput, darkCard)).toBeGreaterThanOrEqual(3);
        expect(inputCss).toContain(
            '--formspec-toggle-track-off: var(--formspec-default-border-input)',
        );
        expect(inputCss).not.toMatch(
            /color-mix\([^;]*--formspec-default-border-input[^;]*white/,
        );
    });
});
