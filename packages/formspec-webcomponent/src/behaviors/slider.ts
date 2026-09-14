/** @filedesc Slider behavior hook — extracts reactive state for range slider fields. */
import { effect } from '@preact/signals-core';
import type { SliderBehavior, FieldRefs, BehaviorContext } from './types';
import { resolveFieldPath, toFieldId, resolveAndStripTokens, bindSharedFieldEffects, resolveFieldText, warnIfIncompatible } from './shared';

export function useSlider(ctx: BehaviorContext, comp: any): SliderBehavior {
    const fieldPath = resolveFieldPath(comp.bind, ctx.prefix);
    const id = comp.id || toFieldId(fieldPath);
    const item = ctx.findItemByKey(comp.bind);
    warnIfIncompatible('Slider', item?.dataType || 'string');
    const itemDesc = { key: item?.key || comp.bind, type: 'field' as const, dataType: item?.dataType || 'decimal' };
    const rawPresentation = ctx.resolveItemPresentation(itemDesc);
    const presentation = resolveAndStripTokens(rawPresentation, ctx.resolveToken, comp);
    const widgetClassSlots = ctx.resolveWidgetClassSlots(rawPresentation);

    const labelText = comp.labelOverride || item?.label || item?.key || comp.bind;
    const vm = ctx.getFieldVM(fieldPath);

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
        min: comp.min ?? undefined,
        max: comp.max ?? undefined,
        step: comp.step ?? undefined,
        showTicks: comp.showTicks === true,
        showValue: comp.showValue !== false,

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

            const rangeInput = refs.control.querySelector('input[type="range"]') || refs.control;

            // Value sync: DOM → engine
            rangeInput.addEventListener('input', () => {
                const val = (rangeInput as HTMLInputElement).value === '' ? null : Number((rangeInput as HTMLInputElement).value);
                ctx.engine.setValue(fieldPath, val);
            });

            // Value sync: engine → DOM + value display update
            const valueDisplay = refs.root.querySelector('.formspec-slider-value') as HTMLElement | null;
            const minFallback = String(comp.min ?? 0);
            disposers.push(effect(() => {
                const sig = ctx.engine.signals[fieldPath];
                if (!sig) return;
                const val = sig.value;
                if (document.activeElement !== rangeInput) {
                    (rangeInput as HTMLInputElement).value = val != null ? String(val) : minFallback;
                }
                if (valueDisplay) {
                    valueDisplay.textContent = val != null ? String(val) : (rangeInput as HTMLInputElement).value;
                }
            }));

            return () => disposers.forEach(d => d());
        }
    };
}
