/** @filedesc Repeat `seedFrom` sizing and relative field `prePopulate`. */
import type { FormItem } from '@formspec-org/types';
import type { FormFieldValue } from '../interfaces.js';
import { getNestedValue, isEmptyValue } from './helpers.js';

export type SeedFromGroup = {
    path: string;
    item: FormItem;
    seedFrom: NonNullable<FormItem['seedFrom']>;
};

export function collectSeedFromGroups(items: FormItem[], prefix = ''): SeedFromGroup[] {
    const groups: SeedFromGroup[] = [];
    for (const item of items) {
        const path = prefix ? `${prefix}.${item.key}` : item.key;
        if (item.type === 'group' && item.repeatable && item.seedFrom) {
            groups.push({ path, item, seedFrom: item.seedFrom });
        }
        if (item.repeatable) {
            continue;
        }
        if (item.children?.length) {
            groups.push(...collectSeedFromGroups(item.children, path));
        }
    }
    return groups;
}

export function findRelativeSeedContext(
    fieldPath: string,
    seedFromGroups: SeedFromGroup[],
): { seedFrom: SeedFromGroup['seedFrom']; rowIndex: number } | null {
    for (const { path: groupPath, seedFrom } of seedFromGroups) {
        const prefix = `${groupPath}[`;
        if (!fieldPath.startsWith(prefix)) {
            continue;
        }
        const rest = fieldPath.slice(prefix.length);
        const close = rest.indexOf(']');
        if (close < 0) {
            continue;
        }
        const rowIndex = Number(rest.slice(0, close));
        if (!Number.isInteger(rowIndex) || rowIndex < 0) {
            continue;
        }
        const after = rest.slice(close + 1);
        if (after !== '' && !after.startsWith('.')) {
            continue;
        }
        return { seedFrom, rowIndex };
    }
    return null;
}

/** True when host primary data already sized this repeat. */
export function repeatHasHostData(
    groupPath: string,
    data: Record<string, unknown>,
    signals: Record<string, { value: FormFieldValue }>,
    minRepeat: number,
): boolean {
    const prefix = `${groupPath}[`;
    let maxIndex = -1;
    let hasNonEmptySignal = false;
    for (const key of Object.keys(data)) {
        if (key.startsWith(prefix)) {
            maxIndex = Math.max(maxIndex, parseRepeatIndex(key, groupPath));
        }
    }
    for (const key of Object.keys(signals)) {
        if (key.startsWith(prefix) && !isEmptyValue(signals[key]?.value)) {
            maxIndex = Math.max(maxIndex, parseRepeatIndex(key, groupPath));
            hasNonEmptySignal = true;
        }
    }
    if (maxIndex + 1 > minRepeat) {
        return true;
    }
    return hasNonEmptySignal;
}

function parseRepeatIndex(key: string, groupPath: string): number {
    const rest = key.slice(groupPath.length + 1);
    const close = rest.indexOf(']');
    if (close < 0) {
        return -1;
    }
    const index = Number(rest.slice(0, close));
    return Number.isInteger(index) ? index : -1;
}

export function resolvePrePopulateFromInstance(
    item: FormItem,
    fieldPath: string,
    seedFromGroups: SeedFromGroup[],
    getInstanceData: (name: string, path?: string) => FormFieldValue,
    instanceDataRoot: (name: string) => unknown,
): FormFieldValue | undefined {
    const prePopulate = item.prePopulate;
    if (!prePopulate) {
        return undefined;
    }
    const relative = findRelativeSeedContext(fieldPath, seedFromGroups);
    if (relative && prePopulate.instance === relative.seedFrom.instance) {
        const root = instanceDataRoot(relative.seedFrom.instance);
        const array = getNestedValue(root, relative.seedFrom.path);
        if (!Array.isArray(array) || relative.rowIndex >= array.length) {
            return undefined;
        }
        return getNestedValue(array[relative.rowIndex], prePopulate.path);
    }
    return getInstanceData(prePopulate.instance, prePopulate.path);
}
