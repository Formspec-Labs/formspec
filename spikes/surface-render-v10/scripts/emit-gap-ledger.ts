/**
 * @filedesc Writes the gap ledger to `evidence/gap-ledger.json`.
 *
 * The ledger lives in `src/gaps.ts` because the running app renders it — the
 * measurement and the thing measured stay in one file, so a stub cannot be
 * added without the ledger noticing. This emits a machine-readable copy for the
 * report.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CORRECTED_GAPS,
  GAP_LEDGER,
  IMPLEMENTED_GAPS,
  OPEN_GAPS,
  RESOLVED_GAPS,
  SPLIT_GAPS,
  gapLedgerErrors,
} from '../src/gaps.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', 'evidence', 'gap-ledger.json');
const validationErrors = gapLedgerErrors();

if (validationErrors.length > 0) {
  throw new Error(`Gap ledger is invalid:\n- ${validationErrors.join('\n- ')}`);
}

const byHome = GAP_LEDGER.reduce<Record<string, number>>((acc, entry) => {
  acc[entry.naturalHome] = (acc[entry.naturalHome] ?? 0) + 1;
  return acc;
}, {});

const byKind = GAP_LEDGER.reduce<Record<string, number>>((acc, entry) => {
  acc[entry.kind] = (acc[entry.kind] ?? 0) + 1;
  return acc;
}, {});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  `${JSON.stringify(
    {
      title: 'surface-render-v10 gap ledger',
      description:
        'The missing pieces identified by the surface-render-v10 review, with each natural home. This is a reviewed work order, not a completeness claim. Historical entries remain and carry an explicit disposition: implemented or corrected rows require permanent evidence, split rows retain every leaf child ID as those children progress, and split never means shipped.',
      total: GAP_LEDGER.length,
      byDisposition: {
        open: OPEN_GAPS.length,
        implemented: IMPLEMENTED_GAPS.length,
        corrected: CORRECTED_GAPS.length,
        split: SPLIT_GAPS.length,
      },
      // Named, not just counted: a count can shrink for the wrong reason, and a
      // reader checking whether the work order is done needs the ids.
      openIds: OPEN_GAPS.map((entry) => entry.id),
      splitIds: SPLIT_GAPS.map((entry) => entry.id),
      // Where an entry's own prediction about its home turned out wrong. The
      // most useful rows in the ledger for anyone planning the next one.
      evidenceBackedNotWhereThePredictionSaid: RESOLVED_GAPS.filter(
        (entry) => entry.resolved?.naturalHomeHeld === false,
      ).map((entry) => entry.id),
      byNaturalHome: byHome,
      byKind,
      entries: GAP_LEDGER,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

console.log(
  `Wrote ${GAP_LEDGER.length} gap entries (${IMPLEMENTED_GAPS.length} implemented, ${CORRECTED_GAPS.length} corrected, ${SPLIT_GAPS.length} split, ${OPEN_GAPS.length} open) to ${out}`,
);
