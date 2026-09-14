/** @filedesc Reactive repeat chrome state: group relevance plus Add/Remove bounded by minRepeat/maxRepeat. */
import { computed, type ReadonlySignal } from '@preact/signals-core';
import type { FormItem } from '@formspec-org/types';
import type { IFormEngine } from '@formspec-org/engine/render';

/** What a repeat renderer needs to show or hide its heading, Add, and Remove controls. */
export interface RepeatAffordances {
    count: ReadonlySignal<number>;
    /** False while the repeatable group is non-relevant (core Bind `relevant` hides the node and its descendants). */
    relevant: ReadonlySignal<boolean>;
    /** False once count reaches `maxRepeat` (core §4.2.2: implementations MUST prevent adding beyond it). */
    canAdd: ReadonlySignal<boolean>;
    /** False while count is at or below `minRepeat` (component §4.4: remove affordances are subject to it). */
    canRemove: ReadonlySignal<boolean>;
}

/**
 * Derive repeat chrome state for the repeatable group at `repeatPath`.
 * Bounds are presentation gates only; the engine still reports MIN_REPEAT / MAX_REPEAT cardinality results.
 */
export function repeatAffordances(
    engine: Pick<IFormEngine, 'repeats' | 'relevantSignals'>,
    repeatPath: string,
    item: Pick<FormItem, 'minRepeat' | 'maxRepeat'> | null | undefined,
): RepeatAffordances {
    const minRepeat = item?.minRepeat ?? 0;
    const maxRepeat = item?.maxRepeat;
    const count = computed(() => engine.repeats[repeatPath]?.value ?? 0);
    return {
        count,
        relevant: computed(() => engine.relevantSignals[repeatPath]?.value ?? true),
        canAdd: computed(() => maxRepeat === undefined || count.value < maxRepeat),
        canRemove: computed(() => count.value > minRepeat),
    };
}
