/** @filedesc Shared receipt reference formatting and filing status label helpers. */
import { Fragment, type ReactNode } from 'react';
import type { SurfaceStringKey, SurfaceStrings } from '@formspec-org/surface';
import type { FiledObservation } from './draft-session.js';

const FILING_STATUS_STRING_KEYS = {
  filed: 'formStatusFiled',
  returned: 'formStatusReturned',
  accepted: 'formStatusAccepted',
  'closed-without-acceptance': 'formStatusClosedWithoutAcceptance',
  reopened: 'formStatusReopened',
} as const satisfies Record<FiledObservation['status'], SurfaceStringKey>;

export function filingStatusLabel(
  status: FiledObservation['status'],
  strings: SurfaceStrings,
): string {
  return strings(FILING_STATUS_STRING_KEYS[status]);
}

/**
 * Insert zero-width `<wbr />` break opportunities after URN colons so long
 * receipt identifiers wrap at segment boundaries instead of leaving single-character
 * orphans, while preserving exact `textContent`.
 */
export function FormattedReceiptRef({ reference }: { reference: string }): ReactNode {
  const parts = reference.split(':');
  if (parts.length <= 1) return reference;
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 ? <>:<wbr /></> : null}
      {part}
    </Fragment>
  ));
}
