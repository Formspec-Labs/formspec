import { clampJsonNumber, stepJsonNumber, jsonValueText } from '@formspec-org/engine';
/** @filedesc NumberInput behavior hook — extracts reactive state for numeric fields. */
import { effect } from '@preact/signals-core';
import type { NumberInputBehavior, FieldRefs, BehaviorContext } from './types';
import { resolveFieldPath, toFieldId, resolveAndStripTokens, bindSharedFieldEffects, resolveFieldText, warnIfIncompatible, readRegistryMetadata, markFieldTouched } from './shared';

export function useNumberInput(ctx: BehaviorContext, comp: any): NumberInputBehavior {
    const fieldPath = resolveFieldPath(comp.bind, ctx.prefix);
    const id = comp.id || toFieldId(fieldPath);
    const item = ctx.findItemByKey(comp.bind);
    warnIfIncompatible('NumberInput', item?.dataType || 'string');
    const itemDesc = { key: item?.key || comp.bind, type: 'field' as const, dataType: item?.dataType || 'decimal' };
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
        min: comp.min,
        max: comp.max,
        step: comp.step,
        showStepper: !!comp.showStepper,
        dataType: item?.dataType || 'decimal',
        placeholder: comp.placeholder || extensionPlaceholder,
        prefix: item?.prefix,
        suffix: item?.suffix,
        width: comp.width,

        setValue(val: any): void {
            ctx.engine.setValue(fieldPath, val);
        },

        stepBy(direction: -1 | 1): void {
            const next = stepJsonNumber(ctx.engine.signals[fieldPath]?.value, comp.step, direction, comp.min, comp.max);
            if (next !== undefined) ctx.engine.setValue(fieldPath, next);
        },

        touch: () => markFieldTouched(ctx, fieldPath),

        bind(refs: FieldRefs): () => void {
            const disposers = bindSharedFieldEffects(ctx, fieldPath, vm, labelText, refs, presentation);

            const bindableInput = refs.control.querySelector('input') || refs.control;

            // Value sync: engine → DOM
            disposers.push(effect(() => {
                const sig = ctx.engine.signals[fieldPath];
                if (!sig) return;
                const val = sig.value;
                if (document.activeElement !== bindableInput) {
                    (bindableInput as HTMLInputElement).value = jsonValueText(val);
                }
            }));

            // Stepper button disabled state: reactive based on value + readonly
            const decBtn = refs.control.querySelector('.formspec-stepper-decrement') as HTMLButtonElement | null;
            const incBtn = refs.control.querySelector('.formspec-stepper-increment') as HTMLButtonElement | null;
            if (decBtn && incBtn) {
                const stepVal = comp.step ?? 1;
                disposers.push(effect(() => {
                    const sig = ctx.engine.signals[fieldPath];
                    const val = sig?.value ?? 0;
                    const isReadonly = ctx.engine.readonlySignals[fieldPath]?.value ?? false;
                    decBtn.disabled = isReadonly || stepJsonNumber(val, stepVal, -1, comp.min, comp.max) === undefined;
                    incBtn.disabled = isReadonly || stepJsonNumber(val, stepVal, 1, comp.min, comp.max) === undefined;
                }));
            }

            // Value sync: DOM → engine
            bindableInput.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                let val: any = target.value === '' ? null : target.value;
                try { if (val !== null) val = clampJsonNumber(val, comp.min, comp.max); }
                catch { /* Keep invalid text in the model so validation blocks completion. */ }
                target.value = jsonValueText(val);
                ctx.engine.setValue(fieldPath, val);
            });

            return () => disposers.forEach(d => d());
        }
    };
}
