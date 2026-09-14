'use client';

/** @filedesc useRepeatAffordances — the engine's repeat affordance rule (relevance, min/maxRepeat Add/Remove) for React. */
import { useMemo } from 'react';
import { computed } from '@preact/signals-core';
import { readRepeatAffordances, type RepeatAffordanceLocks, type RepeatAffordanceState } from '@formspec-org/engine/render';
import { useFormspecContext, findItemByKey } from './context';
import { useSignal } from './use-signal';

/**
 * Repeat chrome state for the repeatable group at `repeatPath` (rule: engine `readRepeatAffordances`), with the
 * node's `allowAdd` / `allowRemove` locks (component §4.4).
 */
export function useRepeatAffordances(repeatPath: string, locks: RepeatAffordanceLocks = {}): RepeatAffordanceState {
    const { engine } = useFormspecContext();
    const { allowAdd, allowRemove } = locks;
    const state = useMemo(
        () => computed(() => readRepeatAffordances(
            engine,
            repeatPath,
            findItemByKey(engine.getDefinition().items ?? [], repeatPath),
            { allowAdd, allowRemove },
        )),
        [engine, repeatPath, allowAdd, allowRemove],
    );
    return useSignal(state);
}
