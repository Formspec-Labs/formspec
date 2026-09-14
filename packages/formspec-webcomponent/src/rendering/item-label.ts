/** @filedesc Live label of a display or group Item: Locale `<key>.label`, else the inline label, `{{}}` in Item scope. */
import { computed, type ReadonlySignal } from '@preact/signals-core';
import { interpolateMessage } from '@formspec-org/engine';
import type { IFormEngine } from '@formspec-org/engine/render';
import type { FormItem } from '@formspec-org/types';

/**
 * The label a respondent sees for the display or group Item at instance `path`: the Locale
 * `<key>.label` string, else the inline label, FEL `{{}}`-interpolated in the Item's scope
 * (Locale §3.3.2). Field labels come from the field view model instead. Recomputes when the locale
 * or an interpolated value changes; `fallback` stands in for a missing Item or an empty label.
 */
export function itemLabel(
    engine: IFormEngine,
    item: FormItem | null | undefined,
    path: string,
    fallback = '',
): ReadonlySignal<string> {
    return computed(() => {
        if (!item) return fallback;
        engine.localeSignal.value;
        const inline = interpolateMessage(
            engine.getLabel(item),
            (expr) => engine.compileExpression(expr, path)(),
        ).text;
        return engine.resolveLocaleString(`${item.key}.label`, inline, path) || fallback;
    });
}
