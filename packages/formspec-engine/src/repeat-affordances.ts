/** @filedesc Repeat chrome rule shared by renderers: relevance, Add/Remove bounded by min/maxRepeat and allowAdd/allowRemove locks. */
import type { FormItem } from '@formspec-org/types';
import type { IFormEngine } from './interfaces.js';

/** What a repeat renderer needs to show or hide its heading, Add, and Remove controls. */
export interface RepeatAffordanceState {
    count: number;
    /** False while the repeatable group is non-relevant (core Bind `relevant` hides the node and its descendants). */
    relevant: boolean;
    /** False once count reaches `maxRepeat` (core §4.2.2: implementations MUST prevent adding beyond it), or when Add is locked. */
    canAdd: boolean;
    /** False while count is at or below `minRepeat` (component §4.4: remove affordances are subject to it), or when Remove is locked. */
    canRemove: boolean;
}

/**
 * Presentation-only Add/Remove locks (component §4.4): an Accordion's or DataTable's `allowAdd` / `allowRemove`
 * props, or a theme `widgetConfig` on a repeatable group rendered without a Component Document (theme §4.2).
 * Only `false` locks; cardinality validation and data-supplied instances are unaffected.
 */
export interface RepeatAffordanceLocks {
    allowAdd?: boolean;
    allowRemove?: boolean;
}

/**
 * Read repeat chrome state for the repeatable group at `repeatPath`. It reads the engine's count and
 * relevance signals, so a caller inside a computed, effect, or subscription tracks both.
 * Bounds gate presentation only; the engine still reports MIN_REPEAT / MAX_REPEAT cardinality results.
 */
export function readRepeatAffordances(
    engine: Pick<IFormEngine, 'repeats' | 'relevantSignals'>,
    repeatPath: string,
    item: Pick<FormItem, 'minRepeat' | 'maxRepeat'> | null | undefined,
    locks: RepeatAffordanceLocks = {},
): RepeatAffordanceState {
    const count = engine.repeats[repeatPath]?.value ?? 0;
    const maxRepeat = item?.maxRepeat;
    return {
        count,
        relevant: engine.relevantSignals[repeatPath]?.value ?? true,
        canAdd: locks.allowAdd !== false && (maxRepeat === undefined || count < maxRepeat),
        canRemove: locks.allowRemove !== false && count > (item?.minRepeat ?? 0),
    };
}
