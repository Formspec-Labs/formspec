'use client';

/** @filedesc useRepeatAffordances — repeat chrome state: group relevance plus Add/Remove bounded by minRepeat/maxRepeat. */
import { useMemo } from 'react';
import { signal } from '@preact/signals-core';
import { useFormspecContext, findItemByKey } from './context';
import { useSignal } from './use-signal';
import { useRepeatCount } from './use-repeat-count';

export interface RepeatAffordances {
    count: number;
    /** False while the repeatable group is non-relevant (core Bind `relevant` hides the node and its descendants). */
    relevant: boolean;
    /** False once count reaches `maxRepeat` (core §4.2.2: implementations MUST prevent adding beyond it). */
    canAdd: boolean;
    /** False while count is at or below `minRepeat` (component §4.4: remove affordances are subject to it). */
    canRemove: boolean;
}

const ALWAYS_RELEVANT = signal(true);

/**
 * Repeat chrome state for the repeatable group at `repeatPath`. Same rule as formspec-webcomponent
 * `src/rendering/repeat-affordances.ts`; this package sits on the same layer, so it cannot import it.
 * Bounds gate presentation only; the engine still reports MIN_REPEAT / MAX_REPEAT cardinality results.
 */
export function useRepeatAffordances(repeatPath: string): RepeatAffordances {
    const { engine } = useFormspecContext();
    const count = useRepeatCount(repeatPath);
    const relevanceSignal = useMemo(
        () => engine.relevantSignals[repeatPath] ?? ALWAYS_RELEVANT,
        [engine, repeatPath],
    );
    const relevant = useSignal(relevanceSignal);
    const item = findItemByKey(engine.getDefinition().items ?? [], repeatPath);
    const minRepeat: number = item?.minRepeat ?? 0;
    const maxRepeat: number | undefined = item?.maxRepeat;
    return {
        count,
        relevant,
        canAdd: maxRepeat === undefined || count < maxRepeat,
        canRemove: count > minRepeat,
    };
}
