/** @filedesc NumberInput behavior hook — extracts reactive state for numeric fields. */
import { effect } from '@preact/signals-core';
import type { NumberInputBehavior, FieldRefs, BehaviorContext } from './types';
import { resolveFieldPath, toFieldId, resolveAndStripTokens, bindSharedFieldEffects, warnIfIncompatible } from './shared';

export function useNumberInput(ctx: BehaviorContext, comp: any): NumberInputBehavior {
    const fieldPath = resolveFieldPath(comp.bind, ctx.prefix);
    const id = comp.id || toFieldId(fieldPath);
    const item = ctx.findItemByKey(comp.bind);
    warnIfIncompatible('NumberInput', item?.dataType || 'string');
    const itemDesc = { key: item?.key || comp.bind, type: 'field' as const, dataType: item?.dataType || 'decimal' };
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
        min: comp.min,
        max: comp.max,
        step: comp.step,
        showStepper: !!comp.showStepper,
        dataType: item?.dataType || 'decimal',
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

            // Stepper button disabled state: reactive based on value + readonly
            const decBtn = refs.control.querySelector('.formspec-stepper-decrement') as HTMLButtonElement | null;
            const incBtn = refs.control.querySelector('.formspec-stepper-increment') as HTMLButtonElement | null;
            if (decBtn && incBtn) {
                const stepVal = comp.step ?? 1;
                disposers.push(effect(() => {
                    const sig = ctx.engine.signals[fieldPath];
                    const val = Number(sig?.value ?? 0);
                    const isReadonly = ctx.engine.readonlySignals[fieldPath]?.value ?? false;
                    decBtn.disabled = isReadonly || (comp.min != null && val - stepVal < comp.min);
                    incBtn.disabled = isReadonly || (comp.max != null && val + stepVal > comp.max);
                }));
            }

            // Value sync: DOM → engine
            bindableInput.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                let val: number | null = target.value === '' ? null : Number(target.value);
                if (val !== null && !isNaN(val)) {
                    if (comp.min !== undefined && val < Number(comp.min)) val = Number(comp.min);
                    if (comp.max !== undefined && val > Number(comp.max)) val = Number(comp.max);
                }
                if (String(val) !== target.value) {
                    target.value = val === null ? '' : String(val);
                }
                ctx.engine.setValue(fieldPath, val);
            });

            return () => disposers.forEach(d => d());
        }
    };
}
