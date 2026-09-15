/** @filedesc uiText — resolve a renderer chrome string (Locale §3.1.10 `$ui.<ChromeStringKey>`) as a LocalizedText signal. */
import { computed } from '@preact/signals-core';
import type { IFormEngine } from '@formspec-org/engine/render';
import { UI_STRINGS, fillUiParams, type ChromeStringKey } from '@formspec-org/layout';
import type { LocalizedText } from './layout-behaviors.js';

/**
 * Resolve `$ui.<key>` through the active Locale (Locale spec §3.1.10), following a switch like a label
 * does (`engine.localeSignal`). Precedence: an authored `$ui.<key>` Locale string, else `fallback` — a
 * site's own design-system default (USWDS's `- Select -`, the default adapter's longer signature-canvas
 * aria text, ...) — else the shared English default in {@link UI_STRINGS}. `{{$param}}` placeholders are
 * filled literally from `params`, never FEL: a chrome string carries no other FEL (§3.1.10).
 *
 * `engine` is `undefined` only during the pre-engine skeleton pass (`AdapterContext.engine`), which draws
 * inert placeholder markup before boot; the result is then the static fallback/default text.
 */
export function uiText(
    engine: IFormEngine | undefined,
    key: ChromeStringKey,
    params?: Record<string, string | number>,
    fallback?: string,
): LocalizedText {
    return computed(() => {
        engine?.localeSignal.value;
        const authored = engine?.lookupLocaleString(`$ui.${key}`) ?? null;
        const template = authored ?? fallback ?? UI_STRINGS[key];
        return fillUiParams(template, params);
    });
}
