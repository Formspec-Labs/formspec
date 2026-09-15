/**
 * @filedesc Canonical `widgetConfig.width` vocabulary (theme §4.2 Width Stops) — single source for the
 * seven stop names, shared by every layer that names or validates one (planner carry, adapter class
 * mapping, behavior typing). The ex-unit sizes themselves stay prose in theme-spec.md and the skin CSS —
 * this module only fixes the closed set of names, so it can't drift out of sync with itself.
 */

/** A `widgetConfig.width` value (theme §4.2). */
export type WidthStop = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** The seven stops, narrowest first — the same order theme-spec.md's table and the skin CSS use. */
export const WIDTH_STOPS: readonly WidthStop[] = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'];
