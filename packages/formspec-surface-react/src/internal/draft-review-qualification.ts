/** @filedesc Track qualified committed-draft review inputs and engine-derived relevance by object identity. */

const qualifiedDraftReviews = new WeakSet<object>();
const draftReviewIrrelevantPaths = new WeakMap<object, ReadonlySet<string>>();

export function qualifyDraftReview(data: object, irrelevantPaths?: ReadonlySet<string>): void {
  qualifiedDraftReviews.add(data);
  if (irrelevantPaths && irrelevantPaths.size > 0) {
    draftReviewIrrelevantPaths.set(data, irrelevantPaths);
  }
}

export function isQualifiedDraftReview(data: object): boolean {
  return qualifiedDraftReviews.has(data);
}

export function getDraftReviewIrrelevantPaths(data: object): ReadonlySet<string> | undefined {
  return draftReviewIrrelevantPaths.get(data);
}
