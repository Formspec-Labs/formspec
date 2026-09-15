/** @filedesc RadioGroup behavior hook — extracts reactive state for radio button groups. */
import { effect } from '@preact/signals-core';
import type { RadioGroupBehavior, FieldRefs, BehaviorContext } from './types';
import { resolveFieldPath, toFieldId, resolveAndStripTokens, bindSharedFieldEffects, resolveFieldText, warnIfIncompatible } from './shared';

export function useRadioGroup(ctx: BehaviorContext, comp: any): RadioGroupBehavior {
    const fieldPath = resolveFieldPath(comp.bind, ctx.prefix);
    const id = comp.id || toFieldId(fieldPath);
    const item = ctx.findItemByKey(comp.bind);
    warnIfIncompatible('RadioGroup', item?.dataType || 'string');
    const itemDesc = { key: item?.key || comp.bind, type: 'field' as const, dataType: item?.dataType || 'choice' };
    const rawPresentation = ctx.resolveItemPresentation(itemDesc);
    const presentation = resolveAndStripTokens(rawPresentation, ctx.resolveToken, comp);
    const widgetClassSlots = ctx.resolveWidgetClassSlots(rawPresentation);
    const labelText = item?.label || item?.key || comp.bind;
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
        options: () => ctx.engine.getOptions?.(fieldPath) || item?.options || [],
        groupRole: 'radiogroup',
        inputName: fieldPath,
        orientation: comp.orientation,

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

            // Register change listeners on each radio via optionControls
            if (refs.optionControls) {
                for (const [_value, radio] of refs.optionControls) {
                    radio.addEventListener('change', () => {
                        if (radio.checked) {
                            ctx.engine.setValue(fieldPath, radio.value);
                        }
                    });
                }
            }

            // Value sync: engine → DOM
            disposers.push(effect(() => {
                const sig = ctx.engine.signals[fieldPath];
                if (!sig) return;
                const val = sig.value;
                if (refs.optionControls) {
                    for (const [optVal, radio] of refs.optionControls) {
                        radio.checked = optVal === String(val ?? '');
                    }
                }
            }));

            return () => disposers.forEach(d => d());
        }
    };
}
