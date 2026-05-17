/** @filedesc TextInput behavior hook — extracts reactive state for text/textarea fields. */
import { effect } from '@preact/signals-core';
import type { TextInputBehavior, FieldRefs, BehaviorContext } from './types';
import { resolveFieldPath, toFieldId, resolveAndStripTokens, bindSharedFieldEffects, warnIfIncompatible } from './shared';

export function useTextInput(ctx: BehaviorContext, comp: any): TextInputBehavior {
    const fieldPath = resolveFieldPath(comp.bind, ctx.prefix);
    const id = comp.id || toFieldId(fieldPath);
    const item = ctx.findItemByKey(comp.bind);
    warnIfIncompatible('TextInput', item?.dataType || 'string');
    const itemDesc = { key: item?.key || comp.bind, type: 'field' as const, dataType: item?.dataType || 'string' };
    const rawPresentation = ctx.resolveItemPresentation(itemDesc);
    const presentation = resolveAndStripTokens(rawPresentation, ctx.resolveToken, comp);
    const widgetClassSlots = ctx.resolveWidgetClassSlots(rawPresentation);

    // Resolve extension-driven input attributes
    const extensionAttrs: Record<string, string> = {};
    let resolvedInputType: string | undefined;
    const exts = item?.extensions;
    if (exts && typeof exts === 'object') {
        for (const [extName, extEnabled] of Object.entries(exts)) {
            if (!extEnabled) continue;
            const entry = ctx.registryEntries.get(extName);
            if (!entry) continue;
            const meta = entry.metadata;
            const constraints = entry.constraints;
            if (meta?.inputType) {
                resolvedInputType = meta.inputType;
            } else if (meta?.inputMode === 'email') {
                resolvedInputType = 'email';
            } else if (meta?.inputMode === 'tel') {
                resolvedInputType = 'tel';
            }
            if (meta?.inputMode && !comp.inputMode) extensionAttrs.inputMode = meta.inputMode;
            if (meta?.autocomplete) extensionAttrs.autocomplete = meta.autocomplete;
            if (meta?.sensitive) extensionAttrs.autocomplete = 'off';
            if (constraints?.maxLength != null) extensionAttrs.maxLength = String(constraints.maxLength);
            if (constraints?.pattern) extensionAttrs.pattern = constraints.pattern;
            if (meta?.mask && !comp.placeholder) extensionAttrs.placeholder = meta.mask;
        }
    }

    const labelText = comp.labelOverride || item?.label || item?.key || comp.bind;
    const vm = ctx.getFieldVM(fieldPath);

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
        placeholder: comp.placeholder,
        inputMode: comp.inputMode,
        maxLines: comp.maxLines,
        prefix: comp.prefix,
        suffix: comp.suffix,
        resolvedInputType,
        extensionAttrs,

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

            // Resolve the actual input element once for both sync directions
            const inputEl = refs.control.querySelector('input') || refs.control.querySelector('textarea') || refs.control;

            // Value sync: engine → DOM
            disposers.push(effect(() => {
                const sig = ctx.engine.signals[fieldPath];
                if (!sig) return;
                const val = sig.value;
                if (document.activeElement !== inputEl) {
                    (inputEl as HTMLInputElement).value = val == null ? '' : String(val);
                }
            }));

            // Value sync: DOM → engine
            inputEl.addEventListener('input', (e) => {
                ctx.engine.setValue(fieldPath, (e.target as HTMLInputElement).value);
            });

            return () => disposers.forEach(d => d());
        }
    };
}
