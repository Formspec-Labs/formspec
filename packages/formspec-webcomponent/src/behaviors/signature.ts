/** @filedesc Signature behavior hook — extracts reactive state for signature canvas fields. */
import type { SignatureBehavior, FieldRefs, BehaviorContext } from './types';
import { resolveFieldPath, toFieldId, resolveAndStripTokens, bindSharedFieldEffects, resolveFieldText, warnIfIncompatible } from './shared';

export function useSignature(ctx: BehaviorContext, comp: any): SignatureBehavior {
    const fieldPath = resolveFieldPath(comp.bind, ctx.prefix);
    const id = comp.id || toFieldId(fieldPath);
    const item = ctx.findItemByKey(comp.bind);
    warnIfIncompatible('Signature', item?.dataType || 'string');
    const itemDesc = { key: item?.key || comp.bind, type: 'field' as const, dataType: item?.dataType || 'string' };
    const rawPresentation = ctx.resolveItemPresentation(itemDesc);
    const presentation = resolveAndStripTokens(rawPresentation, ctx.resolveToken, comp);
    const widgetClassSlots = ctx.resolveWidgetClassSlots(rawPresentation);

    const labelText = item?.label || item?.key || comp.bind;
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
        height: comp.height || 200,
        strokeColor: comp.strokeColor || '#000',

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

            // Listen for signature drawn event from adapter
            refs.root.addEventListener('formspec-signature-drawn', (e: Event) => {
                const detail = (e as CustomEvent).detail;
                if (detail?.dataUrl) ctx.engine.setValue(fieldPath, detail.dataUrl);
            });

            // Listen for signature cleared event from adapter
            refs.root.addEventListener('formspec-signature-cleared', () => {
                ctx.engine.setValue(fieldPath, null);
            });

            return () => disposers.forEach(d => d());
        }
    };
}
