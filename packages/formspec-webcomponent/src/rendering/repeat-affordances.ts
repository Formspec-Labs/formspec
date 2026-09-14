/** @filedesc Reactive repeat chrome state (the engine's repeat affordance rule as signals) and the scoped row render loop. */
import { computed, effect, untracked, type ReadonlySignal } from '@preact/signals-core';
import { readRepeatAffordances, type RepeatAffordanceState } from '@formspec-org/engine/render';

/** `RepeatAffordanceState` as signals, one per field, so each effect re-runs only when its own field changes. */
export type RepeatAffordances = { [K in keyof RepeatAffordanceState]: ReadonlySignal<RepeatAffordanceState[K]> };

/** Derive repeat chrome state for the repeatable group at `repeatPath` (rule: engine `readRepeatAffordances`). */
export function repeatAffordances(...args: Parameters<typeof readRepeatAffordances>): RepeatAffordances {
    const state = computed(() => readRepeatAffordances(...args));
    return {
        count: computed(() => state.value.count),
        relevant: computed(() => state.value.relevant),
        canAdd: computed(() => state.value.canAdd),
        canRemove: computed(() => state.value.canRemove),
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
