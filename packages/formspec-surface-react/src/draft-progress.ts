/** @filedesc Read a draft's Submit-profile evaluation with its explanation state and summarize it for trackers. */
import type { IFormEngine } from '@formspec-org/engine';
import {
  summarizeFormProgress,
  type ExplanationStateLike,
  type FormProgressSummary,
  type PageSequenceEntry,
} from '@formspec-org/layout';
import type { EvaluatedFormState } from '@formspec-org/types';

/** What a tracker summary needs from the engine, read while it is alive. */
export interface SubmitEvaluation {
  evaluated: EvaluatedFormState;
  explanations: ExplanationStateLike;
}

/**
 * Reads the Submit-profile evaluated state and matching explanation state from a single Submit
 * evaluation (`engine.getSubmitEvaluation()`), avoiding a second Submit evaluation and clock skew.
 * Falls back to separate reads only for minimal test doubles without `getSubmitEvaluation`.
 */
export function readSubmitEvaluation(
  engine: Pick<IFormEngine, 'getEvaluatedFormState' | 'getExplanationState' | 'getSubmitEvaluation'>,
): SubmitEvaluation {
  if (typeof engine.getSubmitEvaluation === 'function') {
    return engine.getSubmitEvaluation();
  }
  return {
    evaluated: engine.getEvaluatedFormState({ profile: 'on-submit' }),
    explanations: engine.getExplanationState(),
  };
}

export function summarizeDraftProgress(
  sections: readonly PageSequenceEntry[],
  { evaluated, explanations }: SubmitEvaluation,
): FormProgressSummary {
  return summarizeFormProgress(sections, evaluated, explanations);
}
