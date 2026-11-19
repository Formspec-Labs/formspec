'use client';

/** @filedesc useRepeatAffordances — the engine's repeat affordance rule (relevance, min/maxRepeat Add/Remove) for React. */
import { useMemo } from 'react';
import { computed } from '@preact/signals-core';
import { readRepeatAffordances, type RepeatAffordanceLocks, type RepeatAffordanceState } from '@formspec-org/engine/render';
import { useFormspecContext, findItemByKey } from './context';
import { useSignal } from './use-signal';

export interface RepeatAffordanceHookState extends RepeatAffordanceState {
    /** True when the repeatable group declares `seedFrom` (upstream carried rows). */
    isSeeded: boolean;
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
            return { ...base, isSeeded: Boolean(item?.seedFrom) };
        }),
        [engine, repeatPath, allowAdd, allowRemove],
    );
    return useSignal(state);
}
