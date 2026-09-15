'use client';

/** @filedesc useChromeText — the renderer's own words (Locale §3.1.10 `$ui.<key>`), live across a locale switch. */
import { useCallback, useContext } from 'react';
import { UI_STRINGS, fillUiParams, type ChromeStringKey } from '@formspec-org/layout';
import type { IFormEngine } from '@formspec-org/engine/render';
import { FormspecContext } from './context';
import { useSignal } from './use-signal';

/** Resolves one chrome string: what the renderer says for itself, in the respondent's language. */
export type ChromeText = (key: ChromeStringKey, params?: Record<string, string | number>) => string;

/**
 * Locale §3.1.10 `$ui.<ChromeStringKey>`: an authored override wins, else the shared English default
 * (`packages/formspec-layout/src/ui-strings.ts` — the one inventory every renderer draws from).
 * Callers subscribe to `engine.localeSignal` so a locale switch re-renders; {@link useChromeText} does that.
 */
export function chromeText(
    engine: IFormEngine | undefined,
    key: ChromeStringKey,
    params?: Record<string, string | number>,
): string {
    const authored = engine?.lookupLocaleString(`$ui.${key}`);
    return fillUiParams(authored ?? UI_STRINGS[key], params);
}

/**
 * The chrome-string resolver for the form being rendered, re-resolved on a locale switch. Outside a
 * provider — a standalone `FormspecScreener`, which carries a screener document and no Locale — it
 * answers with the English defaults.
 */
export function useChromeText(): ChromeText {
    const engine = useContext(FormspecContext)?.engine;
    useSignal(engine?.localeSignal ?? NEVER_CHANGES);
    return useCallback((key, params) => chromeText(engine, key, params), [engine]);
}

/** Stand-in signal for a render outside a provider: nothing to subscribe to, so nothing ever changes. */
const NEVER_CHANGES = { get value() { return 0; } } as { readonly value: number };
