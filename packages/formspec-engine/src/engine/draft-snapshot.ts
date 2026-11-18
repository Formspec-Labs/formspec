/** @filedesc Capture editable field data and repeat arrays for draft persistence. */
import type { FormItem } from '@formspec-org/types';
import type { JsonRecord, JsonValue } from '../interfaces.js';

/** Match the Response data tree, where dependent questions share their scalar parent's object. */
export function captureDraftData(
    items: FormItem[],
    fieldValue: (path: string) => JsonValue | undefined,
    repeatCount: (path: string) => number | undefined,
): JsonRecord {
    function capture(items: FormItem[], prefix: string): JsonRecord {
        const entries: Array<[string, JsonValue]> = [];
        appendItems(items, prefix, entries);
        return Object.fromEntries(entries);
    }

    function appendItems(items: FormItem[], prefix: string, into: Array<[string, JsonValue]>): void {
        for (const item of items) {
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            const children = item.children ?? [];
            if (item.type === 'field') {
                const value = fieldValue(path);
                if (value !== undefined) into.push([item.key, value]);
                appendItems(children, path, into);
            } else if (item.type === 'group' && item.repeatable) {
                const count = repeatCount(path);
                if (count === undefined) continue;
                const rows = Array.from({ length: count }, (_, index) => capture(children, `${path}[${index}]`));
                into.push([item.key, rows]);
            } else if (item.type === 'group') {
                const group = capture(children, path);
                if (Object.keys(group).length > 0) into.push([item.key, group]);
            }
        }
    }
    return capture(items, '');
}
