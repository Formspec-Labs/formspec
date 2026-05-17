/** @filedesc Token resolution and CSS custom property emission for theme/component tokens. */
import {
    resolveToken as resolveTokenBase,
    emitMergedThemeCssVars,
} from '@formspec-org/layout';
import type { StylingHost } from './index';

export function resolveToken(host: StylingHost, val: unknown): unknown {
    return resolveTokenBase(
        val,
        host._componentDocument?.tokens,
        host.getEffectiveTheme().tokens,
    );
}

/** Emit theme tokens as CSS custom properties on a target element (defaults to documentElement). */
export function emitThemeTokens(
    tokens: Record<string, string | number>,
    target?: HTMLElement,
): void {
    const el = target ?? document.documentElement;
    for (const [key, value] of Object.entries(tokens)) {
        el.style.setProperty(`--formspec-${key.replace(/\./g, '-')}`, String(value));
    }
}

export function emitTokenProperties(host: StylingHost, container: HTMLElement): void {
    const effectiveTheme = host.getEffectiveTheme();
    emitMergedThemeCssVars(container, {
        themeTokens: effectiveTheme.tokens || {},
        componentTokens: host._componentDocument?.tokens,
    });
}
