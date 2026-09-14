/** @filedesc Reactive repeat chrome state (relevance, min/maxRepeat Add/Remove) and the scoped row render loop. */
import { computed, effect, untracked, type ReadonlySignal } from '@preact/signals-core';
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

/** One render of a repeat's instance rows. */
export interface RepeatRowsPass {
    count: number;
    canRemove: boolean;
    /** This pass's own disposal list: register every row effect here, never on the host's list. */
    cleanupFns: Array<() => void>;
}

/**
 * Render a repeat's rows now and again whenever `count` or `canRemove` changes.
 * Each pass disposes the previous pass's row effects first (otherwise every add/remove cycle
 * strands a full set of field effects), and builds rows untracked: a signal a row reads while
 * rendering (an interpolated label) updates that text in place, never re-renders every row.
 */
export function renderRepeatRows(
    cleanupFns: Array<() => void>,
    affordances: Pick<RepeatAffordances, 'count' | 'canRemove'>,
    build: (pass: RepeatRowsPass) => void,
): void {
    const rowCleanupFns: Array<() => void> = [];
    const disposeRows = () => {
        for (const cleanup of rowCleanupFns.splice(0)) cleanup();
    };
    cleanupFns.push(effect(() => {
        const count = affordances.count.value;
        const canRemove = affordances.canRemove.value;
        untracked(() => {
            disposeRows();
            build({ count, canRemove, cleanupFns: rowCleanupFns });
        });
    }));
    cleanupFns.push(disposeRows);
}
