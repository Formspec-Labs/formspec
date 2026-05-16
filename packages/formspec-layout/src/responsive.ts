/**
 * Merge responsive breakpoint overrides onto a component descriptor.
 *
 * When no numeric breakpoints are available — either because no breakpoints
 * map is supplied or because the map contains only raw media-query strings —
 * applies the single active breakpoint's overrides directly. This is the v1
 * default for themes that don't pin numeric minWidths (it is not a deprecated
 * shim and carries no removal target).
 *
 * When numeric breakpoints are available, performs a mobile-first cumulative
 * cascade per Component Spec §9.3: all breakpoints whose minWidth ≤ the active
 * breakpoint's minWidth are applied in ascending minWidth order, so later
 * breakpoints win over earlier ones for conflicting keys.
 *
 * @param comp             - Component descriptor that may contain a `responsive` map.
 * @param activeBreakpoint - Currently active breakpoint name, or `null` if none match.
 * @param breakpoints      - Optional name→minWidth map used to determine cascade order.
 * @returns A (possibly new) component descriptor with breakpoint overrides applied.
 */
export function resolveResponsiveProps(
    comp: any,
    activeBreakpoint: string | null,
    breakpoints?: Record<string, number | string> | null,
): any {
    if (!comp.responsive || !activeBreakpoint) return comp;

    // Collect only numeric breakpoints — raw media-query strings are not cascadeable
    const numericBreakpoints: Record<string, number> | null = breakpoints
        ? (() => {
            const entries = Object.entries(breakpoints).filter(
                (e): e is [string, number] => typeof e[1] === 'number',
            );
            return entries.length > 0 ? Object.fromEntries(entries) : null;
        })()
        : null;

    if (!numericBreakpoints) {
        // No numeric breakpoints — fall back to single-breakpoint merge.
        // Handles both the no-breakpoints-map case and raw media-query strings.
        const overrides = comp.responsive[activeBreakpoint];
        if (!overrides) return comp;
        return { ...comp, ...overrides };
    }

    // Mobile-first cascade: merge all breakpoints up to and including active
    const activeWidth = numericBreakpoints[activeBreakpoint];
    if (activeWidth == null) return comp;

    const sortedNames = Object.entries(numericBreakpoints)
        .filter(([name]) => comp.responsive[name])
        .sort(([, a], [, b]) => a - b)
        .filter(([, width]) => width <= activeWidth)
        .map(([name]) => name);

    if (sortedNames.length === 0) return comp;

    let result = { ...comp };
    for (const name of sortedNames) {
        result = { ...result, ...comp.responsive[name] };
    }
    return result;
}
