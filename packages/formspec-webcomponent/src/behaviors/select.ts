/** @filedesc Select behavior hook — extracts reactive state for dropdown select fields. */
import { effect } from '@preact/signals-core';
import type { SelectBehavior, FieldRefs, BehaviorContext } from './types';
import { resolveFieldPath, toFieldId, resolveAndStripTokens, bindSharedFieldEffects, warnIfIncompatible } from './shared';
import { bindSelectCombobox } from './select-combobox-bind';

export function useSelect(ctx: BehaviorContext, comp: any): SelectBehavior {
    const fieldPath = resolveFieldPath(comp.bind, ctx.prefix);
    const id = comp.id || toFieldId(fieldPath);
    const item = ctx.findItemByKey(comp.bind);
    const multiple = !!comp.multiple;
    const searchable = !!comp.searchable;
    warnIfIncompatible('Select', item?.dataType || 'string');
    const itemDesc = { key: item?.key || comp.bind, type: 'field' as const, dataType: item?.dataType || 'choice' };
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

    const dataType = item?.dataType || 'choice';

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
        placeholder: comp.placeholder || extensionPlaceholder,
        clearable: comp.clearable,
        dataType,
        searchable,
        multiple,

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
            if (searchable || multiple) {
                const placeholderText = comp.placeholder || extensionPlaceholder || 'Select\u2026';
                return bindSelectCombobox(
                    ctx,
                    {
                        fieldPath,
                        dataType,
                        multiple,
                        searchable,
                        clearable: !!comp.clearable,
                        placeholder: placeholderText,
                        vm,
                        labelText,
                        getOptions: () =>
                            ctx.engine.getOptions?.(fieldPath) || item?.options || [],
                    },
                    refs,
                );
            }

            const disposers = bindSharedFieldEffects(ctx, fieldPath, vm, labelText, refs);

            const selectEl = refs.control.querySelector('select') || refs.control;

            // Value sync: engine → DOM (uses 'change', not 'input')
            disposers.push(effect(() => {
                const sig = ctx.engine.signals[fieldPath];
                if (!sig) return;
                const val = sig.value;
                if (document.activeElement !== selectEl) {
                    (selectEl as HTMLSelectElement).value = val == null ? '' : String(val);
                }
            }));

            // Value sync: DOM → engine (coerce to number for numeric dataTypes)
            selectEl.addEventListener('change', (e) => {
                const raw = (e.target as HTMLSelectElement).value;
                // Must match `SelectClearSentinel` in adapters/default/select.ts
                if (raw === '__formspec_clear__') {
                    ctx.engine.setValue(fieldPath, null);
                    return;
                }
                let val: any = raw;
                if (['integer', 'decimal', 'number'].includes(dataType)) {
                    val = raw === '' ? null : Number(raw);
                }
                ctx.engine.setValue(fieldPath, val);
            });

            return () => disposers.forEach(d => d());
        }
    };
}
