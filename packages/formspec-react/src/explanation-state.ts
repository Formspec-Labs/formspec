'use client';

/** @filedesc A form's paused Submit evaluation and explanation state: read at once for answers and Submits, and once edits pause. */
import { useCallback, useEffect, useMemo } from 'react';
import { batch, effect, signal, untracked } from '@preact/signals-core';
import type { IFormEngine, ReadonlyEngineSignal, SubmitEvaluationSnapshot } from '@formspec-org/engine';

export type ExplanationState = ReturnType<IFormEngine['getExplanationState']>;

/** How long edits must pause before the paused Submit evaluation is read again. */
export const EXPLANATION_READ_PAUSE_MS = 250;

export interface PausedSubmitState {
    /** Full Submit-profile snapshot (`evaluated` + `explanations`), or `null` when no Submit-timing Shape or explanation mode is declared. */
    submitEvaluation: ReadonlyEngineSignal<SubmitEvaluationSnapshot | null>;
    /** Explanation state derived from the same Submit evaluation, or `null` when no warning Shape asks for an answer. */
    explanationState: ReadonlyEngineSignal<ExplanationState | null>;
}

const EMPTY_EXPLANATION_STATE: ExplanationState = {
    findings: [],
    groups: [],
    instances: [],
    entries: [],
    candidateEntries: [],
    pendingStamps: false,
};

/**
 * Reading the Submit profile (for Submit-timing findings and/or warning explanations) costs one Submit
 * evaluation, so a burst of keystrokes is read once, after it pauses. A new engine, an answer (the
 * explanation entries change), an imperative refresh, or a Submit is read at once. Until the next read,
 * readers see the last one. Both signals share one `engine.getSubmitEvaluation()` call so typing never
 * runs Submit evaluations and pauses never run two.
 */
export function useSubmitEvaluation(
    engine: IFormEngine,
    latestSubmit: ReadonlyEngineSignal<unknown>,
): PausedSubmitState {
    const needsExplanations = useMemo(() => {
        if (typeof engine.getExplanationState !== 'function') return false;
        return typeof engine.hasWarningExplanations === 'function'
            ? engine.hasWarningExplanations()
            : true;
    }, [engine]);
    const needsSubmitShapes = useMemo(() => {
        if (typeof engine.hasSubmitTimingShapes === 'function') {
            return engine.hasSubmitTimingShapes();
        }
        return (engine.getDefinition?.()?.shapes ?? []).some(
            shape => (shape.timing ?? 'continuous') === 'submit',
        );
    }, [engine]);
    const reads = needsExplanations || needsSubmitShapes;

    const readSnapshot = useCallback((): {
        submit: SubmitEvaluationSnapshot | null;
        explanations: ExplanationState | null;
    } => {
        if (!reads) return { submit: null, explanations: null };
        if (typeof engine.getSubmitEvaluation === 'function') {
            const snapshot = engine.getSubmitEvaluation();
            return {
                submit: snapshot,
                explanations: needsExplanations ? snapshot.explanations : null,
            };
        }
        const explanations = needsExplanations && typeof engine.getExplanationState === 'function'
            ? engine.getExplanationState()
            : null;
        const evaluated = needsSubmitShapes && typeof engine.getEvaluatedFormState === 'function'
            ? engine.getEvaluatedFormState({ profile: 'on-submit' })
            : null;
        return {
            submit: evaluated ? { evaluated, explanations: explanations ?? EMPTY_EXPLANATION_STATE } : null,
            explanations,
        };
    }, [engine, reads, needsExplanations, needsSubmitShapes]);

    const signals = useMemo(() => {
        const initial = readSnapshot();
        return {
            submitEvaluation: signal<SubmitEvaluationSnapshot | null>(initial.submit),
            explanationState: signal<ExplanationState | null>(initial.explanations),
        };
    }, [readSnapshot]);

    useEffect(() => {
        if (!reads) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let started = false;
        const read = () => {
            clearTimeout(timer);
            // Untracked: subscribing to the engine's state would re-read it on every edit.
            const next = untracked(readSnapshot);
            batch(() => {
                if (signals.submitEvaluation.peek() !== next.submit) {
                    signals.submitEvaluation.value = next.submit;
                }
                if (signals.explanationState.peek() !== next.explanations) {
                    signals.explanationState.value = next.explanations;
                }
            });
        };
        let lastSubmitVal: unknown = untracked(() => latestSubmit.value);
        const stopAnswers = effect(() => {
            engine.getExplanationEntries?.();
            const submit = latestSubmit.value as { validationReport?: unknown } | null | undefined;
            engine.explanationRefreshVersion?.value;
            const submitChanged = submit !== lastSubmitVal;
            lastSubmitVal = submit;
            if (!started) return;
            if (
                submitChanged
                && submit?.validationReport
                && signals.submitEvaluation.peek()?.evaluated.report === submit.validationReport
            ) {
                return;
            }
            read();
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
    }, [engine, reads, latestSubmit, readSnapshot, signals]);

    return signals;
}

export function useExplanationState(
    engine: IFormEngine,
    latestSubmit: ReadonlyEngineSignal<unknown>,
): ReadonlyEngineSignal<ExplanationState | null> {
    return useSubmitEvaluation(engine, latestSubmit).explanationState;
}
