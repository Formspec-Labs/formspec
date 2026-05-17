/** @filedesc DatePicker behavior hook — extracts reactive state for date/time/datetime fields. */
import { effect } from '@preact/signals-core';
import type { DatePickerBehavior, FieldRefs, BehaviorContext } from './types';
import { resolveFieldPath, toFieldId, resolveAndStripTokens, bindSharedFieldEffects, warnIfIncompatible } from './shared';

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
    const labelText = comp.labelOverride || item?.label || item?.key || comp.bind;
    const vm = ctx.getFieldVM(fieldPath);
    const exts = item?.extensions;
    let extensionPlaceholder: string | undefined;
    if (exts && typeof exts === 'object') {
        for (const [extName, extEnabled] of Object.entries(exts)) {
            if (!extEnabled) continue;
            const entry = ctx.registryEntries.get(extName);
            if (!entry) continue;
            if (entry.metadata?.placeholder && !comp.placeholder) extensionPlaceholder = entry.metadata.placeholder;
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
        hint: comp.hintOverride || item?.hint || null,
        description: item?.description || null,
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
            const disposers = bindSharedFieldEffects(ctx, fieldPath, vm, labelText, refs);

            const bindableInput = refs.control.querySelector('input') || refs.control;

            // Value sync: engine → DOM
            disposers.push(effect(() => {
                const sig = ctx.engine.signals[fieldPath];
                if (!sig) return;
                const val = sig.value;
                if (document.activeElement !== bindableInput) {
                    (bindableInput as HTMLInputElement).value = val == null ? '' : String(val);
                }
            }));

            // Value sync: DOM → engine
            bindableInput.addEventListener('input', (e) => {
                ctx.engine.setValue(fieldPath, (e.target as HTMLInputElement).value);
            });

            return () => disposers.forEach(d => d());
        }
    };
}
