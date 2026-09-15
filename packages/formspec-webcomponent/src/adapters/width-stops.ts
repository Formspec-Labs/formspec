/** @filedesc Shared `widgetConfig.width` → CSS class mapping (theme §4.2 Width Stops) for default and external adapters. */
import { WIDTH_STOPS, type WidthStop } from '@formspec-org/types';

const KNOWN_STOPS = new Set<string>(WIDTH_STOPS);

/**
 * `<prefix>--<stop>` for a recognized `widgetConfig.width` (theme §4.2), leading-space-prefixed so it
 * appends onto an existing class string; `''` when `width` is absent or not one of the seven stops. A
 * design system names its own prefix (`formspec-input`, `usa-input`) but the stop vocabulary — and
 * which values count as "recognized" — is one closed set, `@formspec-org/types`' `WIDTH_STOPS`, so no
 * adapter can drift onto a different set of names.
 */
export function widthStopClass(prefix: string, width: string | undefined): string {
    return width && KNOWN_STOPS.has(width) ? ` ${prefix}--${width}` : '';
}

export type { WidthStop };
