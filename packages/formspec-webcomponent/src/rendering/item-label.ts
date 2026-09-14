/** @filedesc Live label of a display or group Item from the engine's Item label cascade. */
import { computed, type ReadonlySignal } from '@preact/signals-core';
import type { IFormEngine } from '@formspec-org/engine/render';
import type { FormItem } from '@formspec-org/types';

/**
 * The label a respondent sees for the display or group Item at instance `path`, from
 * `engine.getItemLabelSignal` (Locale `<key>.label@context` → `<key>.label` → `labels[context]` → inline,
 * `{{}}` in the Item's scope). Recomputes on locale, label context, or interpolated value changes;
 * `fallback` stands in for a missing Item or an empty label.
 */
export function itemLabel(
    engine: IFormEngine,
    item: FormItem | null | undefined,
    path: string,
    fallback = '',
): ReadonlySignal<string> {
    const label = item ? engine.getItemLabelSignal(path) : undefined;
    return computed(() => {
        if (!item) return fallback;
        return (label ? label.value : engine.getLabel(item)) || fallback;
    });
}
