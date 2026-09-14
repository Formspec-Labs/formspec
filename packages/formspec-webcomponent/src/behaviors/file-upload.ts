/** @filedesc FileUpload behavior hook — extracts reactive state for file input fields. */
import type { FileUploadBehavior, FieldRefs, BehaviorContext } from './types';
import { resolveFieldPath, toFieldId, resolveAndStripTokens, bindSharedFieldEffects, resolveFieldText, warnIfIncompatible } from './shared';
import { formatBytes } from '../format';

type FileMeta = { name: string; size: number; type: string };

export function useFileUpload(ctx: BehaviorContext, comp: any): FileUploadBehavior {
    const fieldPath = resolveFieldPath(comp.bind, ctx.prefix);
    const id = comp.id || toFieldId(fieldPath);
    const item = ctx.findItemByKey(comp.bind);
    warnIfIncompatible('FileUpload', item?.dataType || 'string');
    const itemDesc = { key: item?.key || comp.bind, type: 'field' as const, dataType: item?.dataType || 'string' };
    const rawPresentation = ctx.resolveItemPresentation(itemDesc);
    const presentation = resolveAndStripTokens(rawPresentation, ctx.resolveToken, comp);
    const widgetClassSlots = ctx.resolveWidgetClassSlots(rawPresentation);

    const labelText = comp.labelOverride || item?.label || item?.key || comp.bind;
    const vm = ctx.getFieldVM(fieldPath);
    const multiple = comp.multiple === true;
    const maxSize = typeof comp.maxSize === 'number' ? comp.maxSize : undefined;

    // Mutable file accumulator — lives for the lifetime of the behavior instance.
    let accumulated: FileMeta[] = [];
    let fileListCallback: (() => void) | null = null;

    const syncToEngine = () => {
        ctx.engine.setValue(fieldPath, multiple ? [...accumulated] : (accumulated[0] || null));
        fileListCallback?.();
    };

    const addFiles = (incoming: FileMeta[]): string | null => {
        if (maxSize != null) {
            const oversized = incoming.find(f => f.size > maxSize);
            if (oversized) return `"${oversized.name}" exceeds the maximum size of ${formatBytes(maxSize)}.`;
        }
        if (multiple) {
            for (const f of incoming) {
                if (!accumulated.some(e => e.name === f.name && e.size === f.size)) {
                    accumulated.push(f);
                }
            }
        } else {
            accumulated = [incoming[0]];
        }
        syncToEngine();
        return null;
    };

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
        accept: comp.accept,
        multiple,
        dragDrop: comp.dragDrop !== false,
        maxSize,
        files: () => accumulated,

        setValue(val: any): void {
            ctx.engine.setValue(fieldPath, val);
        },

        touch(): void {
            if (!ctx.touchedFields.has(fieldPath)) {
                ctx.touchedFields.add(fieldPath);
                ctx.touchedVersion.value += 1;
            }
        },

        removeFile(index: number) {
            accumulated = accumulated.filter((_, i) => i !== index);
            syncToEngine();
        },

        clearFiles() {
            accumulated = [];
            syncToEngine();
        },

        bind(refs: FieldRefs): () => void {
            const disposers = bindSharedFieldEffects(ctx, fieldPath, vm, labelText, refs);

            // Wire adapter's file-list rebuild callback
            fileListCallback = (refs as any)._rebuildFileList || null;

            const fileInput = refs.control.tagName === 'INPUT' ? refs.control : refs.control.querySelector('input[type="file"]');
            if (fileInput) {
                fileInput.addEventListener('change', () => {
                    const files = Array.from((fileInput as HTMLInputElement).files || []);
                    const err = addFiles(files.map(f => ({ name: f.name, size: f.size, type: f.type })));
                    // Show size error via the error element
                    if (err && refs.error) refs.error.textContent = err;
                    else if (refs.error) refs.error.textContent = '';
                    // Reset input so same file can be re-selected after removal
                    (fileInput as HTMLInputElement).value = '';
                });
            }

            const onFilesDrop = (e: Event) => {
                const detail = (e as CustomEvent).detail;
                if (detail?.fileData) {
                    const err = addFiles(detail.fileData);
                    if (err && refs.error) refs.error.textContent = err;
                    else if (refs.error) refs.error.textContent = '';
                }
            };
            refs.root.addEventListener('formspec-files-dropped', onFilesDrop);

            return () => disposers.forEach(d => d());
        }
    };
}
