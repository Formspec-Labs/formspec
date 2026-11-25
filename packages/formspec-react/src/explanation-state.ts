'use client';

/** @filedesc A form's explanation state: read at once for answers and Submits, and once edits pause. */
import { useEffect, useMemo } from 'react';
import { effect, signal, untracked } from '@preact/signals-core';
import type { IFormEngine, ReadonlyEngineSignal } from '@formspec-org/engine';

export type ExplanationState = ReturnType<IFormEngine['getExplanationState']>;

/** How long edits must pause before the explanation state is read again. */
export const EXPLANATION_READ_PAUSE_MS = 250;

/**
 * Reading the explanation state costs a Submit evaluation, so a burst of keystrokes is read once, after it
 * pauses. A new engine, an answer (the explanation entries change), an imperative refresh, or a Submit is
 * read at once. Until the next read, readers see the last one. `null` when no warning Shape asks for an answer.
 */
export function useExplanationState(
    engine: IFormEngine,
    latestSubmit: ReadonlyEngineSignal<unknown>,
): ReadonlyEngineSignal<ExplanationState | null> {
    const reads = useMemo(() => {
        if (typeof engine.getExplanationState !== 'function') return false;
        return typeof engine.hasWarningExplanations === 'function'
            ? engine.hasWarningExplanations()
            : true;
    }, [engine]);
    const state = useMemo(() => signal<ExplanationState | null>(reads ? engine.getExplanationState() : null), [engine, reads]);
    useEffect(() => {
        if (!reads) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let started = false;
        const read = () => {
            clearTimeout(timer);
            // Untracked: subscribing to the engine's state would re-read it on every edit.
            const next = untracked(() => engine.getExplanationState());
            if (state.peek() !== next) state.value = next;
        };
        const stopAnswers = effect(() => {
            engine.getExplanationEntries?.();
            latestSubmit.value;
            engine.explanationRefreshVersion?.value;
            if (started) read();
        });
        const stopEdits = effect(() => {
            if (engine.evaluationVersion) {
                engine.evaluationVersion.value;
            } else {
                engine.getEvaluatedFormState?.({ profile: 'off' });
            }
            if (!started) return;
            clearTimeout(timer);
            timer = setTimeout(read, EXPLANATION_READ_PAUSE_MS);
        });
        started = true;
        // An edit between the render's read and this effect would otherwise wait for the next one.
        read();
        return () => {
            stopAnswers();
            stopEdits();
            clearTimeout(timer);
        };
    }, [engine, reads, latestSubmit, state]);
    return state;
}
