/** @filedesc Shared-suite parity guard: every conformance case through FormEngine, the WASM evaluator and a recheck of the filed bytes */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import {
  legViolations,
  loadSuite,
  readJson,
  runCase,
  same,
  show,
  validateLedger,
} from '../conformance/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const suiteDir = path.join(repoRoot, 'tests', 'conformance', 'suite');
const realExamplesManifestPath = path.join(suiteDir, 'real-examples.manifest.json');
const ledgerPath = path.join(repoRoot, 'tests', 'conformance', 'parity-ledger.json');
const RUNNER = 'ts';

test('shared-suite comparisons preserve exact decimal digits', () => {
  assert.equal(same(0.1234567890123, 0.1234567890124), false);
  const exact = parseJsonExact('0.1234567890123456789012345678');
  assert.equal(same(exact, parseJsonExact('0.1234567890123456789012345679')), false);
  assert.equal(same(exact, parseJsonExact('1.234567890123456789012345678e-1')), true);
  assert.equal(show({ exact }), '{"exact":0.1234567890123456789012345678}');
});

const CASES = loadSuite(suiteDir, repoRoot);
const LEDGER = readJson(ledgerPath);
// Set PARITY_LEDGER_OBSERVED to a file path to record every failing leg's exact problem lines, for
// writing ledger entries from a real run. It never changes a test's verdict.
const OBSERVED = {};
test.after(() => {
  if (process.env.PARITY_LEDGER_OBSERVED) {
    fs.writeFileSync(process.env.PARITY_LEDGER_OBSERVED, `${JSON.stringify(OBSERVED, null, 2)}\n`);
  }
});

test('shared-suite real examples manifest references existing case files', () => {
  const manifest = readJson(realExamplesManifestPath);
  assert.ok(Array.isArray(manifest.caseFiles) && manifest.caseFiles.length > 0);
  for (const relName of manifest.caseFiles) {
    assert.ok(fs.existsSync(path.join(suiteDir, relName)), `missing manifest case file: ${relName}`);
  }
  for (const { file, doc } of CASES) {
    if (typeof doc.definitionPath === 'string' && doc.definitionPath.startsWith('examples/')) {
      assert.ok(manifest.caseFiles.includes(file), `${file} uses examples/ and must be listed in real-examples.manifest.json`);
    }
  }
});

test('shared-suite case ids are unique and every case cites its spec sections', () => {
  const seen = new Set();
  for (const { file, doc } of CASES) {
    assert.ok(typeof doc.id === 'string' && doc.id.length > 0, `${file}: id`);
    assert.ok(!seen.has(doc.id), `duplicate shared-suite case id: ${doc.id}`);
    seen.add(doc.id);
    assert.ok(Array.isArray(doc.specRefs) && doc.specRefs.length > 0, `${file}: specRefs`);
  }
});

test('parity ledger entries name an existing case, a runner, a ticket and a reason', () => {
  const ids = new Set(CASES.map(({ doc }) => doc.id));
  validateLedger(LEDGER, ids, { ticketPattern: /^fs-[a-z0-9]{4}$/ });
});

for (const { file, doc } of CASES) {
  test(`shared suite: ${file}`, async () => {
    const legs = await runCase(doc, repoRoot);
    for (const [leg, problems] of legs) {
      if (problems.length > 0) (OBSERVED[doc.id] ??= {})[leg] = problems;
    }
    const listed = LEDGER.entries?.[doc.id]?.[RUNNER] ?? {};
    const violations = legViolations(legs, listed, RUNNER);
    assert.deepEqual(violations, [], `${doc.id} (${RUNNER}; specRefs: ${doc.specRefs.join('; ')})\n  ${violations.join('\n  ')}`);
  });
}
