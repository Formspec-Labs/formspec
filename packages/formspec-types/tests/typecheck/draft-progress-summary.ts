import type { DraftProgressSummary } from '../../src/index.js';

export const counts = { total: 2, filled: 1, toFix: 0, toCheck: 1 };
export const summary = {
  status: 'current', form: { ...counts, ready: null }, sections: { contact: counts },
} satisfies DraftProgressSummary;
