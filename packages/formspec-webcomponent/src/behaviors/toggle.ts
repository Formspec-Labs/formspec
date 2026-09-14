/** @filedesc Toggle behavior hook — extracts reactive state for toggle switch fields. */
import { effect } from '@preact/signals-core';
import type { ToggleBehavior, FieldRefs, BehaviorContext } from './types';
import { resolveFieldPath, toFieldId, resolveAndStripTokens, bindSharedFieldEffects, resolveFieldText, warnIfIncompatible } from './shared';

export function useToggle(ctx: BehaviorContext, comp: any): ToggleBehavior {
    const fieldPath = resolveFieldPath(comp.bind, ctx.prefix);
    const id = comp.id || toFieldId(fieldPath);
    const item = ctx.findItemByKey(comp.bind);
    warnIfIncompatible('Toggle', item?.dataType || 'string');
    const itemDesc = { key: item?.key || comp.bind, type: 'field' as const, dataType: item?.dataType || 'boolean' };
    const rawPresentation = ctx.resolveItemPresentation(itemDesc);
    const presentation = resolveAndStripTokens(rawPresentation, ctx.resolveToken, comp);
    const widgetClassSlots = ctx.resolveWidgetClassSlots(rawPresentation);
    const labelText = comp.labelOverride || item?.label || item?.key || comp.bind;
    const vm = ctx.getFieldVM(fieldPath);

    // GOTCHA: when labelPosition is 'top' (default), force it to 'start' so
    // createFieldDOM adds formspec-field--inline
    if (!presentation.labelPosition || presentation.labelPosition === 'top') {
        presentation.labelPosition = 'start';
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
        onLabel: comp.onLabel,
        offLabel: comp.offLabel,

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

            const checkbox = refs.control.querySelector('input[type="checkbox"]') || refs.control;

            // Value sync: engine → DOM
            disposers.push(effect(() => {
                const sig = ctx.engine.signals[fieldPath];
                if (!sig) return;
                if (document.activeElement !== checkbox) {
                    (checkbox as HTMLInputElement).checked = !!sig.value;
                }
            }));

            // Static off/on text lives on .formspec-toggle-off / .formspec-toggle-on (adapter).
            // Emphasize the active side via .formspec-toggle--on on the container (shared CSS with React).
            disposers.push(effect(() => {
                const sig = ctx.engine.signals[fieldPath];
                const on = !!sig?.value;
                (refs.control as HTMLElement).classList.toggle('formspec-toggle--on', on);
            }));

            // Value sync: DOM → engine
            checkbox.addEventListener('input', (e) => {
                ctx.engine.setValue(fieldPath, (e.target as HTMLInputElement).checked);
            });

            return () => disposers.forEach(d => d());
        }
    };
}
