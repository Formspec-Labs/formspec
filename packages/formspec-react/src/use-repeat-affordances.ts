'use client';

/** @filedesc useRepeatAffordances — the engine's repeat affordance rule (relevance, min/maxRepeat Add/Remove) for React. */
import { useMemo } from 'react';
import { computed } from '@preact/signals-core';
import type { FormItem } from '@formspec-org/types';
import type { IFormEngine, RepeatAffordanceLocks, RepeatAffordanceState } from '@formspec-org/engine/render';
import { readRepeatAffordances } from '@formspec-org/engine/render';
import { useFormspecContext, findItemByKey } from './context';
import { useSignal } from './use-signal';

export interface RepeatAffordanceHookState extends RepeatAffordanceState {
    /** True when the repeatable group declares `seedFrom` (upstream carried rows). */
    isSeeded: boolean;
    /** Exact upstream array length when determinable from runtime or static instance data, else null. */
    upstreamSeededCount: number | null;
}

function walkInstancePath(root: unknown, path?: string): unknown {
    if (!path) return root;
    let current: unknown = root;
    for (const segment of path.split('.').filter(Boolean)) {
        if (current === null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[segment];
    }
    return current;
}

function resolveUpstreamSeededCount(engine: IFormEngine, item: FormItem | undefined): number | null {
    const seedFrom = item?.seedFrom as { instance?: string; path?: string; where?: string } | undefined;
    if (!seedFrom?.instance || seedFrom.where) return null;
    // Subscribe to instanceVersion when available so runtime-loaded instances recalculate cleanly.
    (engine as { instanceVersion?: { value: unknown } }).instanceVersion?.value;
    const runtimeReader = (engine as { getInstanceData?: (name: string, path?: string) => unknown }).getInstanceData;
    if (typeof runtimeReader === 'function') {
        const fromRuntime = runtimeReader.call(engine, seedFrom.instance, seedFrom.path);
        if (Array.isArray(fromRuntime)) return fromRuntime.length;
    }
    const instances = (engine.getDefinition?.() as { instances?: Record<string, { data?: unknown }> } | undefined)?.instances;
    const fromStatic = walkInstancePath(instances?.[seedFrom.instance]?.data, seedFrom.path);
    return Array.isArray(fromStatic) ? fromStatic.length : null;
}

/**
 * Repeat chrome state for the repeatable group at `repeatPath` (rule: engine `readRepeatAffordances`), with the
 * node's `allowAdd` / `allowRemove` locks (component §4.4).
 */
export function useRepeatAffordances(repeatPath: string, locks: RepeatAffordanceLocks = {}): RepeatAffordanceHookState {
    const { engine } = useFormspecContext();
    const { allowAdd, allowRemove } = locks;
    const state = useMemo(
        () => computed(() => {
            const item = findItemByKey(engine.getDefinition().items ?? [], repeatPath);
            const base = readRepeatAffordances(
                engine,
                repeatPath,
                item,
                { allowAdd, allowRemove },
            );
            const isSeeded = Boolean(item?.seedFrom);
            return {
                ...base,
                isSeeded,
                upstreamSeededCount: isSeeded ? resolveUpstreamSeededCount(engine, item) : null,
            };
        }),
        [engine, repeatPath, allowAdd, allowRemove],
    );
    return useSignal(state);
}
