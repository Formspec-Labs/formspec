/** @filedesc DatePicker behavior hook — extracts reactive state for date/time/datetime fields. */
import { effect } from '@preact/signals-core';
import type { DatePickerBehavior, FieldRefs, BehaviorContext } from './types';
import { resolveFieldPath, toFieldId, resolveAndStripTokens, bindSharedFieldEffects, resolveFieldText, warnIfIncompatible, readRegistryMetadata } from './shared';

export function useDatePicker(ctx: BehaviorContext, comp: any): DatePickerBehavior {
    const fieldPath = resolveFieldPath(comp.bind, ctx.prefix);
    const id = comp.id || toFieldId(fieldPath);
    const item = ctx.findItemByKey(comp.bind);
    warnIfIncompatible('DatePicker', item?.dataType || 'string');
    const dataType = item?.dataType || 'date';
    const itemDesc = { key: item?.key || comp.bind, type: 'field' as const, dataType };
    const rawPresentation = ctx.resolveItemPresentation(itemDesc);
    const presentation = resolveAndStripTokens(rawPresentation, ctx.resolveToken, comp);
    const widgetClassSlots = ctx.resolveWidgetClassSlots(rawPresentation);
    const labelText = item?.label || item?.key || comp.bind;
    const vm = ctx.getFieldVM(fieldPath);
    const exts = item?.extensions;
    let extensionPlaceholder: string | undefined;
    if (exts && typeof exts === 'object') {
        for (const [extName, extEnabled] of Object.entries(exts)) {
            if (!extEnabled) continue;
            const entry = ctx.registryEntries.get(extName);
            if (!entry) continue;
            const meta = readRegistryMetadata(entry);
            if (meta.placeholder && !comp.placeholder) extensionPlaceholder = String(meta.placeholder);
        }
    }

    // Resolve input type from dataType + showTime prop
    let inputType = dataType === 'date' ? 'date' : (dataType === 'time' ? 'time' : 'datetime-local');
    if (comp.showTime === true && inputType === 'date') inputType = 'datetime-local';
    if (comp.showTime === false && inputType === 'datetime-local') inputType = 'date';

    return {
        fieldPath,
        id,
        label: labelText,
        ...resolveFieldText(item, vm),
        vm,
        presentation,
        widgetClassSlots,
        compOverrides: {
            cssClass: comp.cssClass,
            style: comp.style,
            accessibility: comp.accessibility,
        },
        remoteOptionsState: { loading: false, error: null },
        options: () => [],
        inputType,
        minDate: comp.minDate,
        maxDate: comp.maxDate,
        placeholder: comp.placeholder || extensionPlaceholder,
        width: comp.width,

        setValue(val: any): void {
            ctx.engine.setValue(fieldPath, val);
        },

        touch(): void {
            if (!ctx.touchedFields.has(fieldPath)) {
                ctx.touchedFields.add(fieldPath);
                ctx.touchedVersion.value += 1;
            }
        },

        bind(refs: FieldRefs): () => void {
            const disposers = bindSharedFieldEffects(ctx, fieldPath, vm, labelText, refs, presentation);

            const input = refs.control.querySelector('input') || refs.control;
            // USWDS date picker: the value lives on the hidden internal ISO input, not the visible
            // control the user types into (refs.control). Every other adapter leaves valueIO unset,
            // so this defaults to today's single-input behavior.
            const valueEl = (refs.valueIO?.element ?? input) as HTMLInputElement;

            // Value sync: engine → DOM
            disposers.push(effect(() => {
                const sig = ctx.engine.signals[fieldPath];
                if (!sig) return;
                const val = sig.value;
                if (document.activeElement !== refs.control) {
                    const str = val == null ? '' : String(val);
                    if (refs.valueIO) {
                        // setCalendarValue re-dispatches `change` on this same element (see the DOM → engine
                        // listener below), so writing an already-current value would loop.
                        if (refs.valueIO.element.value !== str) refs.valueIO.write(str);
                    } else {
                        (input as HTMLInputElement).value = str;
                    }
                }
            }));

            // Value sync: DOM → engine. USWDS's own date-picker JS commits the parsed/selected date to the
            // internal input via a synthetic `change` (never `input`); a native date input fires `input`.
            // Listening for both covers both without needing to know which one is mounted.
            const syncFromDOM = () => ctx.engine.setValue(fieldPath, valueEl.value);
            valueEl.addEventListener('input', syncFromDOM);
            valueEl.addEventListener('change', syncFromDOM);
            disposers.push(() => {
                valueEl.removeEventListener('input', syncFromDOM);
                valueEl.removeEventListener('change', syncFromDOM);
            });

            return () => disposers.forEach(d => d());
        }
    };
}
