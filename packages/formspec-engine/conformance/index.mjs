/** @filedesc Public conformance runner library for external and in-repo Formspec suites. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { initFormspecEngine } from '../dist/init-formspec-engine.js';
import { legViolations, validateLedger } from './assert-observation.mjs';
import { loadSuite, readJson } from './load-suite.mjs';
import { runCaseDetailed } from './run-case.mjs';

export {
  againstExpected,
  betweenLegs,
  byKey,
  cleanResult,
  compareFelValues,
  compareValue,
  concrete,
  dataDiff,
  decimalEqual,
  decimalWithinTolerance,
  inventions,
  isDefinitionRefusal,
  itemIndex,
  leaves,
  legViolations,
  matchesResultFilter,
  normalizeJson,
  outcome,
  parseConcretePath,
  parseExactDecimal,
  resolveDataPath,
  resultDiff,
  resultKey,
  same,
  show,
  template,
  validateLedger,
} from './assert-observation.mjs';
export { clone, expandSuiteDocument, loadSuite, readJson } from './load-suite.mjs';
export { DEFAULT_NOW, PROCESSING_KINDS, loadInputPayload, runCase, runCaseDetailed } from './run-case.mjs';
export { applyMutation, enumerateMutations, normalizeTemplatePath } from './mutations.mjs';
export {
  analyzeScopedDependenciesRust,
  analyzeScopedDependenciesWasm,
  buildCaseQueries,
  caseDependencies,
  caseReadScopes,
  mutationOverlapsScope,
} from './mutation-selection.mjs';
export { runMutationCoverage } from './rule-mutation.mjs';

function runNativeBatch(nativeBin, root, items) {
  const stdout = execFileSync(nativeBin, ['--root', root, '--batch'], {
    input: JSON.stringify(items),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return parseJsonExact(stdout);
}

/**
 * Run a conformance suite through FormEngine + WASM (and optionally the native Rust adapter),
 * judging every leg against an optional parity ledger in one pass.
 */
export async function runSuite({
  suite,
  root = '.',
  ledger = { entries: {} },
  native,
  definitionOverride,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const entries = loadSuite(suite, resolvedRoot);
  const ledgerDoc = typeof ledger === 'string'
    ? readJson(path.resolve(resolvedRoot, ledger))
    : (ledger ?? { entries: {} });
  const caseIds = new Set(entries.map(({ doc }) => doc.id));
  validateLedger(ledgerDoc, caseIds);

  await initFormspecEngine();

  const observed = { ts: {} };
  const tsResults = [];
  const nativeInputs = [];
  const tsLegsSeen = new Set();

  for (const { file, doc } of entries) {
    const { legs, filedData } = await runCaseDetailed(doc, resolvedRoot, { definitionOverride });
    const listed = ledgerDoc.entries?.[doc.id]?.ts ?? {};
    const violations = legViolations(legs, listed, 'ts');
    for (const [leg, problems] of legs) {
      tsLegsSeen.add(leg);
      if (problems.length > 0) (observed.ts[doc.id] ??= {})[leg] = problems;
    }
    tsResults.push({
      id: doc.id,
      file,
      kind: doc.kind,
      ts: {
        ok: violations.length === 0,
        legs: Object.fromEntries(legs),
        violations,
      },
    });
    if (native) {
      nativeInputs.push({
        doc,
        ...(filedData !== undefined && doc.operations ? { filedData } : {}),
        ...(definitionOverride !== undefined ? { definitionOverride } : {}),
      });
    }
  }

  const runners = ['ts'];
  const legsCovered = { ts: [...tsLegsSeen].sort() };

  if (native) {
    runners.push('rust');
    observed.rust = {};
    const rustLegsSeen = new Set();
    const nativeBatch = runNativeBatch(native, resolvedRoot, nativeInputs);
    const byId = new Map(nativeBatch.map((entry) => [entry.id, entry.legs]));
    for (const item of tsResults) {
      const rustLegsObj = byId.get(item.id) ?? {};
      const rustLegs = new Map(Object.entries(rustLegsObj));
      for (const [leg, problems] of rustLegs) {
        rustLegsSeen.add(leg);
        if (problems.length > 0) (observed.rust[item.id] ??= {})[leg] = problems;
      }
      const listed = ledgerDoc.entries?.[item.id]?.rust ?? {};
      const violations = legViolations(rustLegs, listed, 'rust');
      item.rust = {
        ok: violations.length === 0,
        legs: rustLegsObj,
        violations,
      };
    }
    legsCovered.rust = [...rustLegsSeen].sort();
  }

  const cases = tsResults.map((item) => ({
    ...item,
    ok: item.ts.ok && (item.rust ? item.rust.ok : true),
  }));
  const failedCases = cases.filter((c) => !c.ok).length;
  return {
    ok: failedCases === 0,
    runners,
    legsCovered,
    totalCases: cases.length,
    passedCases: cases.length - failedCases,
    failedCases,
    cases,
    observed,
  };
}
