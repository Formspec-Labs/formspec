/** @filedesc CheckboxGroup behavior hook — extracts reactive state for multi-select checkbox groups. */
import { effect } from '@preact/signals-core';
import type { CheckboxGroupBehavior, FieldRefs, BehaviorContext } from './types';
import { resolveFieldPath, toFieldId, resolveAndStripTokens, bindSharedFieldEffects, warnIfIncompatible } from './shared';

export function useCheckboxGroup(ctx: BehaviorContext, comp: any): CheckboxGroupBehavior {
    const fieldPath = resolveFieldPath(comp.bind, ctx.prefix);
    const id = comp.id || toFieldId(fieldPath);
    const item = ctx.findItemByKey(comp.bind);
    warnIfIncompatible('CheckboxGroup', item?.dataType || 'string');
    const itemDesc = { key: item?.key || comp.bind, type: 'field' as const, dataType: item?.dataType || 'multiChoice' };
    const rawPresentation = ctx.resolveItemPresentation(itemDesc);
    const presentation = resolveAndStripTokens(rawPresentation, ctx.resolveToken, comp);
    const widgetClassSlots = ctx.resolveWidgetClassSlots(rawPresentation);
    const labelText = comp.labelOverride || item?.label || item?.key || comp.bind;
    const vm = ctx.getFieldVM(fieldPath);

    // Handle remote options
    const optionSignal = ctx.engine.getOptionsSignal?.(fieldPath);
    const optionStateSignal = ctx.engine.getOptionsStateSignal?.(fieldPath);
    if (optionSignal || optionStateSignal) {
        let initialized = false;
        ctx.cleanupFns.push(effect(() => {
            optionSignal?.value;
            optionStateSignal?.value;
            if (!initialized) {
                initialized = true;
                return;
            }
            ctx.rerender();
        }));
    }
    const remoteOptionsState = ctx.engine.getOptionsState?.(fieldPath) || { loading: false, error: null };

    // Mutable ref for the current optionControls from the adapter
    let currentOptionControls: Map<string, HTMLInputElement> | undefined;

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
        remoteOptionsState,
        options: () => ctx.engine.getOptions?.(fieldPath) || item?.options || [],
        groupRole: 'group',
        selectAll: !!comp.selectAll,
        columns: comp.columns,

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
