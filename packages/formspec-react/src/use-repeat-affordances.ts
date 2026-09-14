'use client';

/** @filedesc useRepeatAffordances — the engine's repeat affordance rule (relevance, min/maxRepeat Add/Remove) for React. */
import { useMemo } from 'react';
import { computed } from '@preact/signals-core';
import { readRepeatAffordances, type RepeatAffordanceState } from '@formspec-org/engine/render';
import { useFormspecContext, findItemByKey } from './context';
import { useSignal } from './use-signal';

/** Repeat chrome state for the repeatable group at `repeatPath` (rule: engine `readRepeatAffordances`). */
export function useRepeatAffordances(repeatPath: string): RepeatAffordanceState {
    const { engine } = useFormspecContext();
    const state = useMemo(
        () => computed(() => readRepeatAffordances(
            engine,
            repeatPath,
            findItemByKey(engine.getDefinition().items ?? [], repeatPath),
        )),
        [engine, repeatPath],
    );
    return useSignal(state);
}
