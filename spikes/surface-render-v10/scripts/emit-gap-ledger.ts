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
import { GAP_LEDGER } from '../src/gaps.ts';

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
        'Every piece of the running app the platform did not supply, with its natural home. The work order for a real Surface renderer.',
      total: GAP_LEDGER.length,
      byNaturalHome: byHome,
      byKind,
      entries: GAP_LEDGER,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

console.log(`Wrote ${GAP_LEDGER.length} gap entries to ${out}`);
