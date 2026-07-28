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
import { GAP_LEDGER, OPEN_GAPS, RESOLVED_GAPS } from '../src/gaps.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', 'evidence', 'gap-ledger.json');

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
        'Every piece of the running app the platform did not supply, with its natural home. The work order for a real Surface renderer. Closed entries KEEP their row and carry a `resolved` block — a ledger that deletes what it fixed loses the history that makes the rest of it credible.',
      total: GAP_LEDGER.length,
      open: GAP_LEDGER.filter((entry) => entry.resolved === undefined).length,
      resolved: GAP_LEDGER.filter((entry) => entry.resolved !== undefined).length,
      // Named, not just counted: a count can shrink for the wrong reason, and a
      // reader checking whether the work order is done needs the ids.
      openIds: OPEN_GAPS.map((entry) => entry.id),
      // Where an entry's own prediction about its home turned out wrong. The
      // most useful rows in the ledger for anyone planning the next one.
      resolvedNotWhereThePredictionSaid: RESOLVED_GAPS.filter(
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
  `Wrote ${GAP_LEDGER.length} gap entries (${RESOLVED_GAPS.length} shipped, ${OPEN_GAPS.length} open) to ${out}`,
);
