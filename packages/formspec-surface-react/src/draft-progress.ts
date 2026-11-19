/** @filedesc Summarize draft progress with warning-explanation findings counted under toCheck. */
import {
  summarizeFormProgress,
  type FormProgressSummary,
  type PageSequenceEntry,
} from '@formspec-org/layout';
import type { EvaluatedFormState } from '@formspec-org/types';

/**
 * Summarize evaluated form progress for tracker rollups.
 *
 * Under `on-submit` validation, warnings that require an explanation or acknowledgement
 * emit an `explanation` error alongside the underlying warning, and `summarizeFormProgress`
 * folds the pair into `toFix`. On overview trackers, those unresolved warnings belong under
 * `toCheck` while `form.ready` remains false until they are resolved.
 */
export function summarizeDraftProgress(
  sections: readonly PageSequenceEntry[],
  evaluated: EvaluatedFormState,
): FormProgressSummary {
  const summary = summarizeFormProgress(sections, evaluated);
  if (summary.form.toFix === null || summary.form.toCheck === null) return summary;

  let formExplanationCount = 0;
  const sectionExplanationCounts = new Map<string, number>();
  for (const finding of summary.findings) {
    if (finding.result.constraintKind !== 'explanation' || finding.result.severity !== 'error') {
      continue;
    }
    formExplanationCount += 1;
    if (finding.sectionId !== undefined) {
      sectionExplanationCounts.set(
        finding.sectionId,
        (sectionExplanationCounts.get(finding.sectionId) ?? 0) + 1,
      );
    }
  }
  if (formExplanationCount === 0) return summary;

  const shiftForm = Math.min(summary.form.toFix, formExplanationCount);
  return {
    ...summary,
    form: {
      ...summary.form,
      toFix: summary.form.toFix - shiftForm,
      toCheck: summary.form.toCheck + shiftForm,
    },
    sections: summary.sections.map((section) => {
      const count = section.id !== undefined ? sectionExplanationCounts.get(section.id) ?? 0 : 0;
      if (count === 0 || section.counts.toFix === null || section.counts.toCheck === null) {
        return section;
      }
      const shift = Math.min(section.counts.toFix, count);
      return {
        ...section,
        counts: {
          ...section.counts,
          toFix: section.counts.toFix - shift,
          toCheck: section.counts.toCheck + shift,
        },
      };
    }),
  };
}
