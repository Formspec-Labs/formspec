/** @filedesc Track qualified committed-draft review inputs by object identity. */

const qualifiedDraftReviews = new WeakSet<object>();

export function qualifyDraftReview(data: object): void {
  qualifiedDraftReviews.add(data);
}

export function isQualifiedDraftReview(data: object): boolean {
  return qualifiedDraftReviews.has(data);
}
