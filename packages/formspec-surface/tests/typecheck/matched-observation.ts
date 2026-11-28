/** @filedesc Compiler-checked assertions that matched range observations exclude denied draft/filing states. */
import type { FormStatusObservation } from '../../dist/index.js';

const subject = { type: 'urn:period-plan', keys: { start_year: 2024, end_year: 2026 } };

const okMatched: FormStatusObservation = {
  subjectMatch: 'matched',
  subject,
  draft: { status: 'absent' },
  filing: { status: 'none' },
};

const okExactDenied: FormStatusObservation = {
  draft: { status: 'denied' },
  filing: { status: 'denied' },
};

// @ts-expect-error matched range observations cannot carry a denied draft status
const badDeniedDraft: FormStatusObservation = {
  subjectMatch: 'matched',
  subject,
  draft: { status: 'denied' },
  filing: { status: 'none' },
};

// @ts-expect-error matched range observations cannot carry a denied filing status
const badDeniedFiling: FormStatusObservation = {
  subjectMatch: 'matched',
  subject,
  draft: { status: 'absent' },
  filing: { status: 'denied' },
};

void [okMatched, okExactDenied, badDeniedDraft, badDeniedFiling];
