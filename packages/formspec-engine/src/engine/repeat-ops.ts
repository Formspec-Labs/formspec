/** @filedesc Repeat-row subtree clearing and snapshot/restore of nested group field values. */

import type { FormItem } from '@formspec-org/types';
import type { ValidationResult } from '@formspec-org/types';
import type { OptionEntry } from '@formspec-org/types';
import type { EngineSignal } from '../reactivity/types.js';
import type {
    WriteSource, RemoteOptionsState } from '../interfaces.js';

/** Remove indexed paths under a repeat root from signal stores and `_data` (reactive structure only). */
export function clearRepeatIndexedSubtree(options: {
    rootRepeatPath: string;
    signals: Record<string, EngineSignal<any>>;
    relevantSignals: Record<string, EngineSignal<boolean>>;
    requiredSignals: Record<string, EngineSignal<boolean>>;
    readonlySignals: Record<string, EngineSignal<boolean>>;
    errorSignals: Record<string, EngineSignal<string | null>>;
    validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    writeSources: Record<string, EngineSignal<WriteSource | null>>;
    optionSignals: Record<string, EngineSignal<OptionEntry[]>>;
    optionStateSignals: Record<string, EngineSignal<RemoteOptionsState>>;
    repeats: Record<string, EngineSignal<number>>;
    data: Record<string, any>;
}): void {
    const prefix = `${options.rootRepeatPath}[`;
    const stores: Array<Record<string, unknown>> = [
        options.signals,
        options.relevantSignals,
        options.requiredSignals,
        options.readonlySignals,
        options.errorSignals,
        options.validationResults,
        options.writeSources,
        options.optionSignals,
        options.optionStateSignals,
        options.repeats,
    ];

    for (const store of stores) {
        for (const key of Object.keys(store)) {
            if (key.startsWith(prefix)) {
                delete store[key];
            }
        }
    }

    for (const key of Object.keys(options.data)) {
        if (key.startsWith(prefix)) {
            delete options.data[key];
        }
    }
}

/** Snapshot nested field values under a repeat prefix (used when removing a repeat row). */
export function snapshotRepeatGroupTree(
    items: FormItem[],
    prefix: string,
    readFieldValue: (path: string) => unknown,
    getRepeatCount: (path: string) => number,
): Record<string, unknown> {
    const snapshot: Record<string, unknown> = {};
    for (const item of items) {
        const path = `${prefix}.${item.key}`;
        if (item.type === 'field') {
            snapshot[item.key] = readFieldValue(path);
            continue;
        }
        if (item.type === 'group') {
            if (item.repeatable) {
                const count = getRepeatCount(path);
                const rows: Record<string, unknown>[] = [];
                for (let index = 0; index < count; index += 1) {
                    rows.push(
                        snapshotRepeatGroupTree(item.children ?? [], `${path}[${index}]`, readFieldValue, getRepeatCount),
                    );
                }
                snapshot[item.key] = rows;
            } else {
                snapshot[item.key] = snapshotRepeatGroupTree(item.children ?? [], path, readFieldValue, getRepeatCount);
            }
        }
    }
    return snapshot;
}

/** Restore nested field values after repeat rows were reindexed. */
export function applyRepeatGroupTreeSnapshot(
    items: FormItem[],
    prefix: string,
    snapshot: Record<string, unknown> | undefined,
    writeField: (path: string, value: unknown) => void,
): void {
    for (const item of items) {
        const path = `${prefix}.${item.key}`;
        if (item.type === 'field') {
            writeField(path, snapshot?.[item.key]);
            continue;
        }
        if (item.type === 'group') {
            if (item.repeatable) {
                const rows = Array.isArray(snapshot?.[item.key]) ? (snapshot[item.key] as Record<string, unknown>[]) : [];
                for (let index = 0; index < rows.length; index += 1) {
                    applyRepeatGroupTreeSnapshot(
                        item.children ?? [],
                        `${path}[${index}]`,
                        rows[index] ?? {},
                        writeField,
                    );
                }
            } else {
                applyRepeatGroupTreeSnapshot(item.children ?? [], path, snapshot?.[item.key] as Record<string, unknown>, writeField);
            }
        }
    }
}
