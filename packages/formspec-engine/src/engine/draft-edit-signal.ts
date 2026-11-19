/** @filedesc Internal lightweight draft-mutation revision signal registry for FormEngine instances. */
import type { ReadonlyEngineSignal } from '../reactivity/types.js';

const draftEditVersions = new WeakMap<object, ReadonlyEngineSignal<number>>();

export function registerDraftEditVersionSignal(
    engine: object,
    signal: ReadonlyEngineSignal<number>,
): void {
    draftEditVersions.set(engine, signal);
}

export function getDraftEditVersionSignal(
    engine: object,
): ReadonlyEngineSignal<number> | undefined {
    return draftEditVersions.get(engine);
}
