/** @filedesc Compiler-checked assertions that matched range observations exclude denied draft/filing states. */
import type { FilingStatusObservation } from '../../dist/index.js';

const subject = { type: 'urn:period-plan', keys: { start_year: 2024, end_year: 2026 } };

const okMatched: FilingStatusObservation = {
  subjectMatch: 'matched',
  subject,
  draft: { status: 'absent' },
  filing: { status: 'none' },
};

const okExactDenied: FilingStatusObservation = {
  draft: { status: 'denied' },
  filing: { status: 'denied' },
};

// @ts-expect-error matched range observations cannot carry a denied draft status
const badDeniedDraft: FilingStatusObservation = {
  subjectMatch: 'matched',
  subject,
  draft: { status: 'denied' },
  filing: { status: 'none' },
};

// @ts-expect-error matched range observations cannot carry a denied filing status
const badDeniedFiling: FilingStatusObservation = {
  subjectMatch: 'matched',
  subject,
  draft: { status: 'absent' },
  filing: { status: 'denied' },
};

void [okMatched, okExactDenied, badDeniedDraft, badDeniedFiling];
