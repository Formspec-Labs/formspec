/** @filedesc Measure which authored Definition rules an external conformance suite notices. */
import { execFileSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Worker, parentPort, workerData } from 'node:worker_threads';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { initFormspecEngine, initFormspecEngineTools } from '../dist/init-formspec-engine.js';
import { legViolations, validateLedger } from './assert-observation.mjs';
import { loadSuite, readJson } from './load-suite.mjs';
import { runCaseDetailed } from './run-case.mjs';
import { applyMutation, enumerateMutations } from './mutations.mjs';
import { caseReadScopes, mutationOverlapsScope } from './mutation-selection.mjs';

async function init() {
  await initFormspecEngine();
  await initFormspecEngineTools();
}

function serializeScope(scope) {
  if (!scope) return null;
  return {
    itemPaths: [...scope.itemPaths],
    shapes: [...scope.shapes],
    optionSets: [...scope.optionSets],
    variables: [...scope.variables],
    includeNrb: scope.includeNrb,
  };
}

function deserializeScope(raw) {
  if (!raw) return null;
  return {
    itemPaths: new Set(raw.itemPaths),
    shapes: new Set(raw.shapes),
    optionSets: new Set(raw.optionSets),
    variables: new Set(raw.variables),
    includeNrb: Boolean(raw.includeNrb),
  };
}

function runNativeBatch(nativeBin, root, items) {
  const stdout = execFileSync(nativeBin, ['--root', root, '--batch'], {
    input: JSON.stringify(items),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return parseJsonExact(stdout);
}

async function evaluateCase(doc, root, ledger, definitionOverride, nativeBin) {
  const { legs, filedData } = await runCaseDetailed(doc, root, { definitionOverride });
  const tsViolations = legViolations(legs, ledger.entries?.[doc.id]?.ts ?? {}, 'ts');
  const violations = [...tsViolations];
  const tsLegs = [...legs.keys()];
  let rustLegs = [];
  if (nativeBin && violations.length === 0) {
    const [nativeEntry] = runNativeBatch(nativeBin, root, [{
      doc,
      ...(filedData !== undefined && doc.operations ? { filedData } : {}),
      ...(definitionOverride !== undefined ? { definitionOverride } : {}),
    }]);
    const rustLegMap = new Map(Object.entries(nativeEntry?.legs ?? {}));
    rustLegs = [...rustLegMap.keys()];
    violations.push(...legViolations(rustLegMap, ledger.entries?.[doc.id]?.rust ?? {}, 'rust')
      .map((v) => `[rust] ${v}`));
  }
  return { violations, tsLegs, rustLegs };
}

async function runShard({ definition, cases, scopes, root, ledger, native }, mutations) {
  const readScopes = scopes.map(deserializeScope);
  const results = [];
  for (const mutation of mutations) {
    const result = { id: mutation.id, status: 'survived', casesRun: 0 };
    if (mutation.equivalent) {
      result.status = 'equivalent';
      result.reason = mutation.equivalent;
    } else {
      let mutatedDefinition;
      for (const [i, doc] of cases.entries()) {
        if (!mutationOverlapsScope(mutation, readScopes[i])) continue;
        // Apply mutant strictly in memory — zero disk rewrites of fixture files.
        mutatedDefinition ??= applyMutation(definition, mutation);
        result.casesRun += 1;
        const { violations } = await evaluateCase(doc, root, ledger, mutatedDefinition, native);
        if (violations.length > 0) {
          Object.assign(result, { status: 'noticed', caseId: doc.id, problems: violations });
          break;
        }
      }
    }
    results.push(result);
  }
  return results;
}

/**
 * Measure Definition rule-mutation coverage through the public `fs-6iof` conformance runner
 * using in-memory `Definition` overrides and conservative scoped dependency selection.
 */
export async function runMutationCoverage({
  suite,
  definitionPath,
  root = '.',
  ledger = { entries: {} },
  named = [],
  only = [],
  workers = Math.min(4, availableParallelism()),
  exhaustive = false,
  native,
}) {
  if (!Number.isSafeInteger(workers) || workers < 1) {
    throw new Error('workers must be a positive integer');
  }
  root = path.resolve(root);
  const file = path.resolve(root, definitionPath);
  const entries = loadSuite(suite, root);
  if (typeof ledger === 'string') ledger = readJson(path.resolve(root, ledger));
  validateLedger(ledger, new Set(entries.map(({ doc }) => doc.id)));
  const cases = entries
    .map(({ doc }) => doc)
    .filter((doc) => doc.definitionPath && path.resolve(root, doc.definitionPath) === file);
  if (!cases.length) throw new Error('No suite case uses ' + definitionPath);

  const definition = readJson(file);
  const catalog = enumerateMutations(definition, named);
  const ids = new Set(catalog.map((m) => m.id));
  for (const id of only) {
    if (!ids.has(id)) throw new Error('Unknown mutant: ' + id);
  }
  const selected = new Set(only);
  const mutations = selected.size ? catalog.filter((m) => selected.has(m.id)) : catalog;

  await init();

  const tsLegsSeen = new Set();
  const rustLegsSeen = new Set();
  const baselineNativeInputs = [];
  for (const doc of cases) {
    const { legs, filedData } = await runCaseDetailed(doc, root, { definitionOverride: definition });
    for (const leg of legs.keys()) tsLegsSeen.add(leg);
    const problems = legViolations(legs, ledger.entries?.[doc.id]?.ts ?? {}, 'ts');
    if (problems.length) {
      throw new Error('Baseline failed for ' + doc.id + '\n' + problems.join('\n'));
    }
    if (native) {
      baselineNativeInputs.push({
        doc,
        ...(filedData !== undefined && doc.operations ? { filedData } : {}),
        definitionOverride: definition,
      });
    }
  }
  if (native) {
    const nativeBaseline = runNativeBatch(native, root, baselineNativeInputs);
    for (const entry of nativeBaseline) {
      const legMap = new Map(Object.entries(entry.legs ?? {}));
      for (const leg of legMap.keys()) rustLegsSeen.add(leg);
      const problems = legViolations(legMap, ledger.entries?.[entry.id]?.rust ?? {}, 'rust');
      if (problems.length) {
        throw new Error('Native baseline failed for ' + entry.id + '\n' + problems.join('\n'));
      }
    }
  }

  const scopes = exhaustive
    ? cases.map(() => null)
    : caseReadScopes(definition, cases, { ledger, native }).map(serializeScope);

  const context = { definition, root, cases, scopes, ledger, native: native ?? null };
  const count = Math.min(workers, mutations.length);
  const threads = [];
  let results;
  try {
    if (count <= 1) {
      results = await runShard(context, mutations);
    } else {
      // Exact JSON serialization preserves `JSON.rawJSON` decimal tokens across worker threads.
      const serialized = JSON.stringify(context);
      const shards = Array.from({ length: count }, () => []);
      mutations.forEach((mutation, index) => shards[index % count].push(mutation));
      const workerExecArgv = process.execArgv.filter((arg, idx, arr) => (
        !arg.startsWith('--input-type') && arr[idx - 1] !== '--input-type'
      ));
      const outputs = await Promise.all(shards.map((shard) => {
        const worker = new Worker(new URL(import.meta.url), {
          execArgv: workerExecArgv,
          workerData: {
            module: import.meta.url,
            serialized,
            shard: JSON.stringify(shard),
          },
        });
        threads.push(worker);
        return new Promise((resolve, reject) => {
          worker.once('message', resolve);
          worker.once('error', reject);
          worker.once('exit', (code) => reject(new Error('Mutation worker exited before returning results: ' + code)));
        });
      }));
      const byId = new Map(outputs.flat().map((result) => [result.id, result]));
      results = mutations.map((m) => byId.get(m.id));
    }
  } finally {
    await Promise.all(threads.map((worker) => worker.terminate()));
  }

  const summary = { noticed: 0, survived: 0, equivalent: 0 };
  let totalEvaluations = 0;
  for (const result of results) {
    summary[result.status] += 1;
    totalEvaluations += result.casesRun;
  }
  const runners = native ? ['ts', 'rust'] : ['ts'];
  const legsCovered = native
    ? { ts: [...tsLegsSeen].sort(), rust: [...rustLegsSeen].sort() }
    : { ts: [...tsLegsSeen].sort() };

  return {
    runner: native ? 'ts+rust' : 'ts',
    runners,
    legsCovered,
    selectionMode: exhaustive ? 'exhaustive' : (native ? 'rust-scoped' : 'scoped'),
    cases: cases.length,
    totalEvaluations,
    summary,
    results,
  };
}

export async function runMutationCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      suite: { type: 'string' },
      definition: { type: 'string' },
      root: { type: 'string', default: '.' },
      only: { type: 'string', multiple: true },
      named: { type: 'string' },
      ledger: { type: 'string' },
      workers: { type: 'string' },
      exhaustive: { type: 'boolean' },
      native: { type: 'string' },
    },
  });
  if (!values.suite || !values.definition) {
    throw new Error('Expected --suite FILE_OR_DIR --definition FILE');
  }
  const report = await runMutationCoverage({
    ...values,
    definitionPath: values.definition,
    workers: values.workers === undefined ? undefined : Number(values.workers),
    named: values.named && readJson(path.resolve(values.root, values.named)),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (workerData?.module === import.meta.url) {
  await init();
  parentPort.postMessage(await runShard(
    parseJsonExact(workerData.serialized),
    parseJsonExact(workerData.shard),
  ));
} else if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runMutationCli(process.argv.slice(2));
}
