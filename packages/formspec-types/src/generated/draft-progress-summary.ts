/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * This interface was referenced by `DraftProgressSummary`'s JSON-Schema
 * via the `definition` "count".
 */
export type DraftProgressCount = number;
/**
 * Null when validation was unavailable for this snapshot.
 *
 * This interface was referenced by `DraftProgressSummary`'s JSON-Schema
 * via the `definition` "findingCount".
 */
export type DraftProgressFindingCount = DraftProgressCount | null;

/**
 * Advisory progress for one committed draft, grouped by authored section ID.
 */
export interface DraftProgressSummary {
  status: 'current';
  form: DraftProgressCounts & {
    ready: boolean | null;
  };
  sections: {
    [k: string]: DraftProgressCounts;
  };
}
/**
 * This interface was referenced by `DraftProgressSummary`'s JSON-Schema
 * via the `definition` "counts".
 */
export interface DraftProgressCounts {
  total: DraftProgressCount;
  filled: DraftProgressCount;
  toFix: DraftProgressFindingCount;
  toCheck: DraftProgressFindingCount;
}
