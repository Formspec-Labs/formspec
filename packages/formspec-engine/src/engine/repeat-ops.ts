/** @filedesc Repeat-row subtree clearing and capture of field state and nested repeats. */

import type { FormItem } from '@formspec-org/types';
import type { ValidationResult } from '@formspec-org/types';
import type { OptionEntry } from '@formspec-org/types';
import type { EngineSignal } from '../reactivity/types.js';
import type { FormFieldValue, RemoteOptionsState, WriteSource } from '../interfaces.js';

/** Remove the selected repeat paths from signal stores and primary data. */
export function clearRepeatIndexedSubtree(options: {
    includesPath: (path: string) => boolean;
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
        options.data,
    ];

    for (const store of stores) {
        for (const key of Object.keys(store)) {
            if (options.includesPath(key)) {
                delete store[key];
            }
        }
    }
}

interface RepeatFieldState {
    value: FormFieldValue;
    writeSource: WriteSource | null;
    preserveSourceSeed: boolean;
}

export interface RepeatRowSnapshot {
    fields: Array<RepeatFieldState & { path: string }>;
    repeats: Array<{ path: string; item: FormItem; count: number }>;
}

/** Capture paths relative to the row so the same state can be restored at its new index. */
export function snapshotRepeatRow(
    items: FormItem[],
    rowPath: string,
    readField: (path: string) => RepeatFieldState,
    getRepeatCount: (path: string) => number,
): RepeatRowSnapshot {
    const snapshot: RepeatRowSnapshot = { fields: [], repeats: [] };

    function visit(items: FormItem[], prefix: string): void {
        for (const item of items) {
            if (item.type === 'display') continue;
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            const children = item.children ?? [];
            if (item.type === 'group' && item.repeatable) {
                const count = getRepeatCount(`${rowPath}.${path}`);
                snapshot.repeats.push({ path, item, count });
                for (let index = 0; index < count; index += 1) {
                    visit(children, `${path}[${index}]`);
                }
            } else {
                if (item.type === 'field') snapshot.fields.push({ path, ...readField(`${rowPath}.${path}`) });
                visit(children, path);
            }
        }
    }

    visit(items, '');
    return snapshot;
}
