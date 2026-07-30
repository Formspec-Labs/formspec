/** @filedesc Inert DOM review metadata for canonical Need anchors. */

import { mergeNeedAnchors } from '@formspec-org/surface';

export type NeedTraceAttributes = {
  'data-need-anchors'?: string;
  'data-need-ids'?: string;
};

const NEED_ANCHOR = /^need:([a-zA-Z][a-zA-Z0-9_-]*)@[1-9][0-9]*$/;
const NEED_ID = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export function needTraceAttributes(
  ...groups: readonly (readonly string[] | undefined)[]
): NeedTraceAttributes {
  const anchors = mergeNeedAnchors(...groups);
  if (anchors.length === 0) return {};
  const ids = anchors.flatMap((anchor) => {
    const match = NEED_ANCHOR.exec(anchor);
    return match?.[1] ? [match[1]] : [];
  });
  return {
    'data-need-anchors': anchors.join(' '),
    'data-need-ids': [...new Set(ids)].join(' '),
  };
}

/**
 * Trace direct, deliberately unpinned `needRefs[].id` citations.
 *
 * This does not emit `data-need-anchors`: a Need id alone carries no revision,
 * and inventing one would turn review metadata into false provenance.
 */
export function needIdTraceAttributes(
  ids: readonly string[],
): NeedTraceAttributes {
  const directIds = [...new Set(ids.filter((id) => NEED_ID.test(id)))];
  return directIds.length === 0
    ? {}
    : { 'data-need-ids': directIds.join(' ') };
}
