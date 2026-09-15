/** @filedesc Character count copy for TextInput theme widgetConfig.maxLength (USWDS usa-character-count wording). */
import { UI_STRINGS, fillUiParams, type ChromeStringKey } from './ui-strings.js';

/** A Locale-override lookup for one `$ui.<ChromeStringKey>` suffix; `null`/absent falls to {@link UI_STRINGS}. */
export type UiStringLookup = (key: ChromeStringKey) => string | null | undefined;

function chromeString(key: ChromeStringKey, lookup: UiStringLookup | undefined): string {
    return lookup?.(key) ?? UI_STRINGS[key];
}

/** The sr-only limit message a control's aria-describedby names. */
export function characterCountLimitMessage(maxLength: number, lookup?: UiStringLookup): string {
    return fillUiParams(chromeString('characterCount.limit', lookup), { max: maxLength });
}

/** The visible and announced count status (usa-character-count `getCountMessage`). */
export function characterCountStatus(length: number, maxLength: number, lookup?: UiStringLookup): string {
    if (length === 0) {
        return fillUiParams(chromeString('characterCount.allowed', lookup), { max: maxLength });
    }
    const remaining = maxLength - length;
    const count = Math.abs(remaining);
    const over = remaining < 0;
    const key: ChromeStringKey = over
        ? (count === 1 ? 'characterCount.overOne' : 'characterCount.over')
        : (count === 1 ? 'characterCount.leftOne' : 'characterCount.left');
    return fillUiParams(chromeString(key, lookup), { count });
}

/** Typing pause before the polite live status repeats the count, so screen readers are not flooded. */
export const CHARACTER_COUNT_ANNOUNCE_DELAY_MS = 1000;
