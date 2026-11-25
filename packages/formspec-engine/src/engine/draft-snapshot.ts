/** @filedesc Capture editable field data, repeat arrays, and undeclared properties for draft persistence. */
import type { FormItem } from '@formspec-org/types';
import type { JsonRecord, JsonValue } from '../interfaces.js';

/** Match the Response data tree, where dependent questions share their scalar parent's object. */
export function captureDraftData(
    items: FormItem[],
    fieldValue: (path: string) => JsonValue | undefined,
    repeatCount: (path: string) => number | undefined,
    undeclaredEntries?: (scopePath: string) => Iterable<[string, JsonValue]>,
): JsonRecord {
    function capture(items: FormItem[], modelPrefix: string, dataScope: string): JsonRecord {
        const entries: Array<[string, JsonValue]> = [];
        const emitted = new Set<string>();
        appendItems(items, modelPrefix, dataScope, entries, emitted);
        if (undeclaredEntries) {
            for (const [key, value] of undeclaredEntries(dataScope)) {
                if (!emitted.has(key)) {
                    entries.push([key, value]);
                }
            }
        }
        return Object.fromEntries(entries);
    }

    function appendItems(
        items: FormItem[],
        modelPrefix: string,
        dataScope: string,
        into: Array<[string, JsonValue]>,
        emitted: Set<string>,
    ): void {
        for (const item of items) {
            if (item.type === 'display') continue;
            const modelPath = modelPrefix ? `${modelPrefix}.${item.key}` : item.key;
            const children = item.children ?? [];
            if (item.type === 'field') {
                const value = fieldValue(modelPath);
                if (value !== undefined) {
                    into.push([item.key, value]);
                    emitted.add(item.key);
                }
                appendItems(children, modelPath, dataScope, into, emitted);
            } else if (item.type === 'group' && item.repeatable) {
                const count = repeatCount(modelPath);
                if (count === undefined) continue;
                const groupDataPath = dataScope ? `${dataScope}.${item.key}` : item.key;
                const rows = Array.from(
                    { length: count },
                    (_, index) => capture(children, `${modelPath}[${index}]`, `${groupDataPath}[${index}]`),
                );
                into.push([item.key, rows]);
                emitted.add(item.key);
            } else if (item.type === 'group') {
                const groupDataPath = dataScope ? `${dataScope}.${item.key}` : item.key;
                const group = capture(children, modelPath, groupDataPath);
                if (Object.keys(group).length > 0) {
                    into.push([item.key, group]);
                    emitted.add(item.key);
                }
            }
        }
    }
    return capture(items, '', '');
}
