/** @filedesc Shared widgetConfig.width carry (theme §4.2 Width Stops) for both planners. */

/** Widgets whose control an adapter can size to the expected answer (theme §4.2 Width Stops). */
export const WIDTH_STOP_WIDGETS = new Set(['TextInput', 'NumberInput', 'MoneyInput', 'DatePicker', 'Select']);

/**
 * Copy `widgetConfig.width` onto `props.width` for a width-stop widget — same carry as
 * `widgetConfig.rows` → `maxLines`, shared so the definition-fallback and component-tree planners
 * agree regardless of which one planned a given field. A no-op for any other widget, or when
 * `width` is absent; `props.width` is left untouched if already set.
 */
export function carryWidthStop(
    componentType: string,
    widgetConfig: Record<string, unknown> | undefined,
    props: Record<string, unknown>,
): void {
    if (WIDTH_STOP_WIDGETS.has(componentType) && widgetConfig?.width !== undefined) {
        props.width ??= widgetConfig.width;
    }
}
