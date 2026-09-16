/** @filedesc CheckboxGroup behavior hook — extracts reactive state for multi-select checkbox groups. */
import { effect } from '@preact/signals-core';
import type { CheckboxGroupBehavior, FieldRefs, BehaviorContext } from './types';
import { resolveFieldPath, toFieldId, resolveAndStripTokens, bindSharedFieldEffects, resolveFieldText, fieldOptions, warnIfIncompatible, markFieldTouched } from './shared';

export function useCheckboxGroup(ctx: BehaviorContext, comp: any): CheckboxGroupBehavior {
    const fieldPath = resolveFieldPath(comp.bind, ctx.prefix);
    const id = comp.id || toFieldId(fieldPath);
    const item = ctx.findItemByKey(comp.bind);
    warnIfIncompatible('CheckboxGroup', item?.dataType || 'string');
    const itemDesc = { key: item?.key || comp.bind, type: 'field' as const, dataType: item?.dataType || 'multiChoice' };
    const rawPresentation = ctx.resolveItemPresentation(itemDesc);
    const presentation = resolveAndStripTokens(rawPresentation, ctx.resolveToken, comp);
    const widgetClassSlots = ctx.resolveWidgetClassSlots(rawPresentation);
    const labelText = item?.label || item?.key || comp.bind;
    const vm = ctx.getFieldVM(fieldPath);

    const { options, remoteOptionsState } = fieldOptions(ctx, fieldPath, vm, item);

    // Mutable ref for the current optionControls from the adapter
    let currentOptionControls: Map<string, HTMLInputElement> | undefined;

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
        remoteOptionsState,
        options,
        groupRole: 'group',
        selectAll: !!comp.selectAll,
        columns: comp.columns,

        setValue(val: any): void {
            ctx.engine.setValue(fieldPath, val);
        },

        touch: () => markFieldTouched(ctx, fieldPath),

        bind(refs: FieldRefs): () => void {
            const disposers = bindSharedFieldEffects(ctx, fieldPath, vm, labelText, refs, presentation);
            currentOptionControls = refs.optionControls;

            // Register change listeners on each checkbox via optionControls
            if (refs.optionControls) {
                for (const [_value, cb] of refs.optionControls) {
                    cb.addEventListener('change', () => {
                        const checked: string[] = [];
                        if (currentOptionControls) {
                            for (const [optVal, optCb] of currentOptionControls) {
                                if (optCb.checked) checked.push(optVal);
                            }
                        }
                        ctx.engine.setValue(fieldPath, checked);
                    });
                }
            }

            // Value sync: engine → DOM
            disposers.push(effect(() => {
                const sig = ctx.engine.signals[fieldPath];
                if (!sig) return;
                const val: string[] = Array.isArray(sig.value)
                    ? sig.value.filter((value): value is string => typeof value === 'string')
                    : [];
                if (currentOptionControls) {
                    for (const [optVal, cb] of currentOptionControls) {
                        cb.checked = val.includes(optVal);
                    }
                }
            }));

            return () => disposers.forEach(d => d());
        }
    };
}
