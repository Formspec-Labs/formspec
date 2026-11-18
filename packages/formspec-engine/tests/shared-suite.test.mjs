/** @filedesc Shared-suite parity guard: every conformance case through FormEngine, the WASM evaluator and a recheck of the filed bytes */
import test from 'node:test';
import { canonicalJsonBytes, parseJsonExact } from '@formspec-org/integrity-canonical';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FormEngine, createResponse, evaluateDefinition, evaluateFiled } from '../dist/index.js';
import { isJsonRecord as isPlainObject } from '../dist/json-values.js';

// The guard (tests/conformance/suite, schema schemas/conformance-suite.schema.json) runs each case through
// legs that must agree (thoughts/plans/evaluator-parity.md §2.7):
//   P        evaluate created data for a new Response, or the payload for a saved Response; for continuous cases it must equal `expected`.
//   S        evaluateFiled(def, P.data): the settled submit verdict; for submit cases it must equal
//            `expected` and be a fixpoint.
//   F        FormEngine's live report and data must equal P in the continuous trigger (every case).
//   F_submit FormEngine's submit report and getResponse(submit).data must equal S.
//   FR       evaluate(def, FormEngine's submit data) must equal S: the server's recheck of what the browser files.
//   noInvention  every evaluate call adds no key and changes no value except calculated fields, the
//            nonRelevantBehavior projection of non-relevant fields, and declared repeats absent from the input
//            projected as [] (with the group objects that enclose them).
// Known divergences are listed per case and leg in tests/conformance/parity-ledger.json: a listed leg must
// fail, an unlisted leg must pass.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const suiteDir = path.join(repoRoot, 'tests', 'conformance', 'suite');
const realExamplesManifestPath = path.join(suiteDir, 'real-examples.manifest.json');
const ledgerPath = path.join(repoRoot, 'tests', 'conformance', 'parity-ledger.json');
const RUNNER = 'ts';
const NOW = '2026-11-17T12:00:00Z';
const PROCESSING_KINDS = new Set(['ENGINE_PROCESSING', 'VALIDATION_REPORT', 'RESPONSE_VALIDATION']);

const originalConsoleError = console.error;
const originalFetch = globalThis.fetch;
// Instance sources in suite fixtures never resolve: the processor falls back to authored data (Core §4.4).
globalThis.fetch = async (url, ...options) => (
  String(url).startsWith('https://conformance.invalid/') || url === 'https://api.example.gov/responses/2024/example-grantee'
    ? { ok: false, status: 503 }
    : originalFetch(url, ...options)
);
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('Failed to load instance source')) {
    return;
  }
  originalConsoleError.apply(console, args);
};
test.after(() => {
  console.error = originalConsoleError;
  globalThis.fetch = originalFetch;
});

function readJson(filePath) {
  return parseJsonExact(fs.readFileSync(filePath, 'utf8'));
}

function clone(value) {
  return value === undefined ? undefined : parseJsonExact(JSON.stringify(value));
}

function listCasePaths() {
  return fs
    .readdirSync(suiteDir)
    .filter((name) => name.endsWith('.json') && name !== path.basename(realExamplesManifestPath))
    .sort()
    .map((name) => path.join(suiteDir, name));
}

// --- Comparison ------------------------------------------------------------------------------

function normalizeJson(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (isPlainObject(value)) {
    const out = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue;
      out[key] = normalizeJson(value[key]);
    }
    return out;
  }
  return value === undefined ? null : value;
}

const show = (value) => JSON.stringify(normalizeJson(value));
const same = (a, b) => show(a) === show(b);

test('shared-suite comparisons preserve exact decimal digits', () => {
  assert.equal(same(0.1234567890123, 0.1234567890124), false);
  const exact = parseJsonExact('0.1234567890123456789012345678');
  assert.equal(same(exact, parseJsonExact('0.1234567890123456789012345679')), false);
  assert.equal(same(exact, parseJsonExact('1.234567890123456789012345678e-1')), true);
  assert.equal(show({ exact }), '{"exact":0.1234567890123456789012345678}');
});

/** A ValidationResult without envelope markers or absent optional fields. */
function cleanResult(result) {
  const out = {};
  for (const [key, value] of Object.entries(result)) {
    if (key.startsWith('$formspec') || value === undefined || value === null) continue;
    out[key] = value;
  }
  return out;
}

const resultKey = (r) => [r.path, r.code, r.constraintKind, r.severity, r.shapeId ?? ''].join('|');
const byKey = (a, b) => resultKey(a).localeCompare(resultKey(b));

/** `{valid, counts, results, data, undeclaredDataPaths}` from a result list and a data tree. */
function outcome(validations, data, undeclaredDataPaths) {
  const results = validations.map(cleanResult).sort(byKey);
  const counts = { error: 0, warning: 0, info: 0 };
  for (const r of results) counts[r.severity] = (counts[r.severity] ?? 0) + 1;
  return { valid: counts.error === 0, counts, results, data, undeclaredDataPaths };
}

/** Mismatches between `actual` and `expected`, comparing each result only on the fields `expected` lists. */
function againstExpected(actual, expected) {
  const problems = [];
  if ('valid' in expected && actual.valid !== expected.valid) problems.push(`valid ${actual.valid}, expected ${expected.valid}`);
  if ('counts' in expected && !same(actual.counts, expected.counts)) problems.push(`counts ${show(actual.counts)}, expected ${show(expected.counts)}`);
  if ('results' in expected) {
    const wanted = expected.results.map(cleanResult).sort(byKey);
    const got = actual.results;
    const fits = (g, w) => Object.keys(w).every((k) => same(g[k], w[k]));
    const unmatched = [...got];
    const missing = [];
    for (const w of wanted) {
      const i = unmatched.findIndex((g) => fits(g, w));
      if (i === -1) missing.push(w);
      else unmatched.splice(i, 1);
    }
    problems.push(...missing.map((w) => `expected result missing ${show(w)}`));
    problems.push(...unmatched.map((g) => `unexpected result ${show(g)}`));
  }
  if ('diagnostics' in expected) {
    const clean = (diagnostics) => (diagnostics ?? [])
      .map(({ path, expression, code, shapeId }) => ({ path, expression, code, ...(shapeId ? { shapeId } : {}) }))
      .sort((a, b) => show(a).localeCompare(show(b)));
    if (!same(clean(actual.diagnostics), clean(expected.diagnostics))) {
      problems.push(`diagnostics ${show(clean(actual.diagnostics))}, expected ${show(clean(expected.diagnostics))}`);
    }
  }
  if ('data' in expected) problems.push(...dataDiff(actual.data, expected.data).map((d) => `data ${d} (actual vs expected)`));
  if ('undeclaredDataPaths' in expected
    && !same([...(actual.undeclaredDataPaths ?? [])].sort(), [...expected.undeclaredDataPaths].sort())) {
    problems.push(`undeclaredDataPaths ${show(actual.undeclaredDataPaths ?? null)}, expected ${show(expected.undeclaredDataPaths)}`);
  }
  return problems;
}

/** Results in one list and not the other, by full content. */
function resultDiff(actual, reference) {
  const a = actual.map(show);
  const b = reference.map(show);
  return [...a.filter((r) => !b.includes(r)).map((r) => `only here ${r}`), ...b.filter((r) => !a.includes(r)).map((r) => `only there ${r}`)];
}

/** Leaf paths whose values differ between two data trees. */
function dataDiff(actual, reference) {
  const a = leaves(actual ?? {});
  const b = leaves(reference ?? {});
  const out = [];
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const left = a.get(key);
    const right = b.get(key);
    if (left && right && same(left.value, right.value)) continue;
    out.push(`${concrete((left ?? right).segs)}: ${left ? show(left.value) : 'absent'} vs ${right ? show(right.value) : 'absent'}`);
  }
  return out;
}

/** Mismatches between two legs: full results and data. */
function betweenLegs(label, actual, reference, { data = true } = {}) {
  const problems = resultDiff(actual.results, reference.results).map((d) => `${label} results ${d}`);
  if (data) problems.push(...dataDiff(actual.data, reference.data).map((d) => `${label} data ${d}`));
  return problems;
}

// --- No invention --------------------------------------------------------------------------

function itemIndex(definition) {
  const items = new Map();
  const walk = (list, prefix) => {
    for (const item of list ?? []) {
      const p = prefix ? `${prefix}.${item.key}` : item.key;
      items.set(p, item);
      walk(item.children, p);
    }
  };
  walk(definition.items, '');
  const binds = Array.isArray(definition.binds)
    ? definition.binds
    : Object.entries(definition.binds ?? {}).map(([p, b]) => ({ path: p, ...b }));
  const calculated = new Set(binds.filter((b) => b.calculate !== undefined)
    .map((b) => b.path.replace(/\[(\*|\d+)\]/g, '')));
  return { items, calculated };
}

function leaves(value, segs = [], out = new Map()) {
  if (segs.length === 0 && (Array.isArray(value) || isPlainObject(value)) && Object.keys(value).length === 0) {
    return out;
  }
  if (Array.isArray(value) && value.length > 0) {
    value.forEach((v, i) => leaves(v, [...segs, i], out));
  } else if (isPlainObject(value) && Object.keys(value).length > 0) {
    for (const [k, v] of Object.entries(value)) leaves(v, [...segs, k], out);
  } else {
    out.set(JSON.stringify(segs), { segs, value });
  }
  return out;
}

const template = (segs) => segs.filter((s) => typeof s === 'string').join('.');
/** `rows[0].name`; a key that itself contains `.` or `[` (a flat key, not a path) is shown quoted. */
const concrete = (segs) => segs.reduce((acc, s) => {
  if (typeof s === 'number') return `${acc}[${s}]`;
  const key = /[.[\]]/.test(s) ? JSON.stringify(s) : s;
  return acc ? `${acc}.${key}` : key;
}, '') || '(root)';

/** Rebuild refuses at an authored slot. A cycle finding can accompany evaluated data. */
function isDefinitionRefusal({ constraintKind, path }) {
  return constraintKind === 'definition' && path?.startsWith('$.');
}

/** Ways `evaluate` changed `input` into `output` that the processing cycle does not permit. */
function inventions(definition, input, output) {
  if (output.refused) {
    return same(output.data, {}) ? [] : [`refusal data ${show(output.data)}, expected {}`];
  }
  const { items, calculated } = itemIndex(definition);
  const nonRelevant = new Set(output.nonRelevant ?? []);
  const owningField = (segs) => {
    for (let i = segs.length; i > 0; i -= 1) {
      const t = template(segs.slice(0, i));
      if (items.get(t)?.type === 'field') return t;
    }
    return null;
  };
  const underNonRelevant = (segs) => {
    for (let i = segs.length; i > 0; i -= 1) if (nonRelevant.has(concrete(segs.slice(0, i)))) return true;
    return false;
  };
  const before = leaves(input ?? {});
  const after = leaves(output.data ?? {});
  const reaches = (map, segs) => [...map.values()]
    .some((leaf) => leaf.segs.length >= segs.length && same(leaf.segs.slice(0, segs.length), segs));
  // A calculated value may appear or change, but only in rows the input already has: a calculated child
  // must not hide a row evaluate invented (minRepeat padding, seedFrom).
  const calculatedInExistingRows = (segs) => calculated.has(owningField(segs))
    && segs.every((s, i) => typeof s !== 'number' || reaches(before, segs.slice(0, i + 1)));
  const problems = [];
  for (const [key, { segs, value }] of after) {
    const prior = before.get(key);
    if (prior && same(prior.value, value)) continue;
    if (calculatedInExistingRows(segs)) continue;
    // Under a non-relevant node only the nonRelevantBehavior projection is permitted: null (empty) or removal.
    if (underNonRelevant(segs) && value === null) continue;
    const projectedRepeat = !prior && Array.isArray(value) && value.length === 0
      && items.get(template(segs))?.repeatable === true;
    const emptied = !prior && (Array.isArray(value) || isPlainObject(value)) && Object.keys(value).length === 0
      && [...before.values()].some((leaf) => leaf.segs.length > segs.length && same(leaf.segs.slice(0, segs.length), segs));
    if (projectedRepeat || emptied) continue;
    problems.push(prior ? `changed ${concrete(segs)}: ${show(prior.value)} -> ${show(value)}` : `added ${concrete(segs)} = ${show(value)}`);
  }
  for (const [key, { segs, value }] of before) {
    if (after.has(key) || calculatedInExistingRows(segs) || underNonRelevant(segs)) continue;
    const grown = (Array.isArray(value) || isPlainObject(value))
      && [...after.values()].some((leaf) => leaf.segs.length > segs.length && same(leaf.segs.slice(0, segs.length), segs));
    if (grown) continue;
    problems.push(`removed ${concrete(segs)} = ${show(value)}`);
  }
  return problems;
}

// --- Runs -----------------------------------------------------------------------------------

function loadInputPayload(caseDoc) {
  let payload = Object.hasOwn(caseDoc, 'payloadPath')
    ? readJson(path.join(repoRoot, caseDoc.payloadPath))
    : clone(caseDoc.inputData);
  if (isPlainObject(payload) && Object.hasOwn(payload, 'data')
    && (Object.hasOwn(payload, 'definitionUrl') || Object.hasOwn(payload, 'validationResults') || Object.hasOwn(payload, 'status'))) {
    payload = payload.data;
  }
  return isPlainObject(payload) ? payload : {};
}

function registryDocuments(caseDoc) {
  return (caseDoc.registryPaths ?? []).map((relPath) => readJson(path.join(repoRoot, relPath)));
}

/** A FormEngine session: `new` creates a Response over the payload as host prefill; `saved` resumes it. */
async function openEngine(caseDoc, definition, payload) {
  const registryEntries = registryDocuments(caseDoc).flatMap((doc) => doc.entries ?? []);
  const options = { registryEntries, responseSubject: caseDoc.subject, runtimeContext: { now: NOW } };
  const engine = caseDoc.origin === 'new'
    ? new FormEngine(clone(definition), { ...options, responseData: clone(payload) })
    : new FormEngine(clone(definition), { ...options, savedResponseData: clone(payload) });
  if (caseDoc.skipScreener && typeof engine.skipScreener === 'function') {
    engine.skipScreener();
  }
  await engine.waitForInstanceSources();
  for (const step of caseDoc.operations ?? []) {
    if (step.op === 'setValue') engine.setValue(step.path, step.value);
    else if (step.op === 'addRow') engine.addRepeatInstance(step.path);
    else if (step.op === 'removeRow') engine.removeRepeatInstance(step.path, step.index);
  }
  return engine;
}

function engineOutcome(engine, profile) {
  const report = engine.getValidationReport({ profile });
  const response = engine.getResponse({ profile });
  return { ...outcome(report.results, response.data), response };
}

async function runProcessingCase(caseDoc, legs) {
  const definition = readJson(path.join(repoRoot, caseDoc.definitionPath));
  const documents = registryDocuments(caseDoc);
  const payload = loadInputPayload(caseDoc);
  const expected = caseDoc.kind === 'RESPONSE_VALIDATION'
    ? { ...caseDoc.expected.report, ...(caseDoc.compareResponseData ? { data: caseDoc.expected.response.data } : {}) }
    : caseDoc.expected;
  const submit = caseDoc.mode === 'submit';
  // A Rebuild refusal has no evaluated data. FormEngine still holds the person's draft inputs.
  const compareDraftData = !expected.results?.some(isDefinitionRefusal);
  const inventionProblems = [];
  const subjectContext = caseDoc.subject
    ? { subjectType: caseDoc.subject.type ?? null, subjectKeys: caseDoc.subject.keys }
    : {};
  // The session loads registry and subject inputs. The server legs still omit those inputs
  // (fs-20e3 and fs-hrx7).
  const options = (server) => server
    ? { nowIso: NOW }
    : { nowIso: NOW, registryDocuments: documents, ...subjectContext };
  const evaluate = (label, data, trigger, { server = false } = {}) => {
    const context = { ...options(server), trigger };
    const raw = evaluateDefinition(clone(definition), clone(data), context);
    for (const p of inventions(definition, data, raw)) inventionProblems.push(`${label}: ${p}`);
    return { ...outcome(raw.validations, raw.data, raw.undeclaredDataPaths), diagnostics: raw.diagnostics };
  };
  const settle = (data, { server = true } = {}) => {
    const raw = evaluateFiled(clone(definition), clone(data), options(server));
    const verdict = { ...outcome(raw.validations, raw.data, raw.undeclaredDataPaths), diagnostics: raw.diagnostics };
    const again = evaluate(server ? 'S(fixpoint)' : 'P(fixpoint)', verdict.data, 'submit', { server });
    return { verdict, problems: [...againstExpected(verdict, expected), ...betweenLegs('fixpoint', again, verdict)] };
  };
  const checkSubmitLegs = (data) => {
    const server = settle(data);
    legs.set('S', server.problems);
    if (!caseDoc.subject) return server.verdict;
    const session = settle(data, { server: false });
    legs.set('P', session.problems);
    return session.verdict;
  };
  const roundTrip = (data) => dataDiff(evaluate('P(round trip)', data, 'continuous').data, data)
    .map((d) => `round trip of expected.data ${d}`);

  const engine = await openEngine(caseDoc, definition, payload);
  const engineLive = () => {
    const live = engineOutcome(engine, 'live');
    if ('diagnostics' in expected) {
      live.diagnostics = engine.getDiagnosticsSnapshot().evaluationDiagnostics;
    }
    return live;
  };
  // The server lacks subject inputs here. Preserve that known difference while
  // checking the same refusal in the browser's on-demand report and Response.
  const refusal = expected.results?.find(({ path }) => path.startsWith('#subject'));
  if (refusal && caseDoc.subject) {
    assert.equal(caseDoc.expectedCandidate, undefined, 'a refused subject cannot produce a filing');
    const snapshot = engine.getResponseSnapshot({ profile: 'on-demand' });
    assert.deepEqual(snapshot.response.validationResults, snapshot.validationReport.results);
    const demand = outcome(snapshot.validationReport.results, snapshot.response.data);
    const problems = againstExpected(demand, expected);
    assert.deepEqual(problems, [], 'on-demand FormEngine subject refusal');
    checkSubmitLegs(payload);
    engine.dispose();
    legs.set('noInvention', inventionProblems);
    return;
  }
  if (caseDoc.operations) {
    // The session that produced the filed record runs here; `expected` is the state after the last step.
    const liveSession = engineLive();
    const liveFromFiled = evaluate('P(FormEngine live data)', liveSession.data, 'continuous');
    const liveProblems = betweenLegs('FormEngine live vs P', liveSession, liveFromFiled);
    if (submit) {
      checkSubmitLegs(expected.data);
      legs.set('F', liveProblems);
      legs.set('F_submit', againstExpected(engineOutcome(engine, 'on-submit'), expected));
    } else {
      legs.set('P', [...againstExpected(evaluate('P(expected.data)', expected.data, 'continuous'), expected),
        ...roundTrip(expected.data)]);
      legs.set('F', [...againstExpected(liveSession, expected), ...liveProblems]);
    }
    const filed = engineOutcome(engine, submit ? 'on-submit' : 'live').data;
    legs.set('FR', againstExpected(evaluate('FR', filed, submit ? 'submit' : 'continuous', { server: true }), expected));
  } else {
    // Fixture URL sources fail, so use their authored fallback on the session leg.
    const sessionInput = caseDoc.origin === 'new'
      ? createResponse(definition, payload, { nowIso: NOW, ...subjectContext }).data
      : payload;
    const live = evaluate('P(continuous)', sessionInput, 'continuous');
    if (!submit) {
      legs.set('P', [...againstExpected(live, expected), ...('data' in expected ? roundTrip(expected.data) : [])]);
    }
    const engineResult = engineLive();
    const liveProblems = betweenLegs('FormEngine live vs P', engineResult, live, { data: compareDraftData });
    if (!submit && 'diagnostics' in expected) {
      liveProblems.push(...againstExpected(engineResult, { diagnostics: expected.diagnostics }));
    }
    if (!compareDraftData) {
      liveProblems.push(...dataDiff(engine.getDraftSnapshot().data, payload).map((p) => `retained draft data ${p}`));
    }
    legs.set('F', liveProblems);
    if (submit) {
      const inSession = evaluate('P(submit)', sessionInput, 'submit');
      const reference = checkSubmitLegs(inSession.data);
      const session = engineOutcome(engine, 'on-submit');
      const fSubmit = betweenLegs(caseDoc.subject ? 'FormEngine submit vs P' : 'FormEngine submit vs S',
        session, reference, { data: compareDraftData });
      if (caseDoc.kind === 'RESPONSE_VALIDATION') {
        const filedResults = outcome(session.response.validationResults ?? [], session.data);
        fSubmit.push(...againstExpected(filedResults, { results: caseDoc.expected.response.validationResults ?? [] })
          .map((p) => `Response.validationResults ${p}`));
      }
      legs.set('F_submit', fSubmit);
      const filed = evaluate('FR', session.data, 'submit', { server: true });
      legs.set('FR', betweenLegs(`recheck of FormEngine submit data vs ${caseDoc.subject ? 'P' : 'S'}`, filed, reference));
    }
  }
  if (caseDoc.expectedCandidate) {
    const candidate = engine.getResponse({ profile: 'on-submit' });
    assert.deepEqual(canonicalJsonBytes(candidate), canonicalJsonBytes(caseDoc.expectedCandidate),
      'complete filed Response differs from the fixture');
  }
  engine.dispose?.();
  legs.set('noInvention', inventionProblems);
}

function compareFelValues(comparator, actual, expected) {
  if (comparator === 'tolerant-decimal') {
    const a = typeof actual === 'number' ? actual : Number(actual);
    const e = typeof expected === 'number' ? expected : Number(expected);
    if (Number.isFinite(a) && Number.isFinite(e)) return Math.abs(a - e) <= 1e-9;
  }
  return same(actual, expected);
}

async function runFelCase(caseDoc, legs) {
  let value;
  if (caseDoc.definitionPath) {
    const definition = readJson(path.join(repoRoot, caseDoc.definitionPath));
    const engine = await openEngine(caseDoc, definition, clone(caseDoc.inputData));
    value = engine.compileExpression(caseDoc.expression, caseDoc.site)();
    engine.dispose?.();
  } else {
    const fields = Array.isArray(caseDoc.fields) ? caseDoc.fields : [];
    const fieldDefs = fields.length > 0 ? fields : [{ key: 'dummy', dataType: 'integer', value: 0 }];
    const definition = {
      $formspec: '1.0',
      url: `https://example.org/forms/shared-suite/${caseDoc.id}`,
      version: '1.0.0',
      status: 'active',
      title: 'Shared Suite FEL',
      items: fieldDefs.map((f) => ({ key: f.key, type: 'field', dataType: f.dataType || 'string', label: f.key })),
    };
    const engine = new FormEngine(definition, { runtimeContext: { now: NOW } });
    for (const f of fields) engine.setValue(f.key, f.value);
    value = engine.compileExpression(caseDoc.expression, '')();
    engine.dispose?.();
  }
  legs.set('value', compareFelValues(caseDoc.comparator, value, caseDoc.expected.value)
    ? [] : [`value ${show(value)}, expected ${show(caseDoc.expected.value)} (${caseDoc.comparator})`]);
}

/**
 * Core §4.2.1 Item text through the engine's Item signals: `label`, `hint`, `description`, plus the
 * per-context resolutions (`labels` / `hints` / `descriptions`, Locale §3.1.2) the case lists.
 */
async function runItemTextCase(caseDoc, legs) {
  const definition = readJson(path.join(repoRoot, caseDoc.definitionPath));
  const engine = new FormEngine(clone(definition), { runtimeContext: { now: NOW }, savedResponseData: loadInputPayload(caseDoc) });
  if (caseDoc.localePath) {
    const locale = readJson(path.join(repoRoot, caseDoc.localePath));
    engine.loadLocale(locale);
    engine.setLocale(locale.locale);
  }
  const readers = {
    label: (p) => engine.getItemLabelSignal(p).value,
    hint: (p) => engine.getItemHintSignal(p)?.value,
    description: (p) => engine.getItemDescriptionSignal(p)?.value,
  };
  const contextKey = { label: 'labels', hint: 'hints', description: 'descriptions' };
  const actual = {};
  for (const [itemPath, wanted] of Object.entries(caseDoc.expected)) {
    const resolved = {};
    for (const [property, read] of Object.entries(readers)) {
      const value = read(itemPath);
      if (value !== null && value !== undefined) resolved[property] = value;
      const contexts = wanted[contextKey[property]];
      if (!contexts) continue;
      resolved[contextKey[property]] = {};
      for (const context of Object.keys(contexts)) {
        engine.setLabelContext(context);
        resolved[contextKey[property]][context] = read(itemPath);
      }
      engine.setLabelContext(null);
    }
    actual[itemPath] = resolved;
  }
  engine.dispose?.();
  legs.set('text', same(actual, caseDoc.expected) ? [] : [`text ${show(actual)}, expected ${show(caseDoc.expected)}`]);
}

async function runCase(caseDoc) {
  const legs = new Map();
  if (caseDoc.kind === 'FEL_EVALUATION') await runFelCase(caseDoc, legs);
  else if (caseDoc.kind === 'ITEM_TEXT') await runItemTextCase(caseDoc, legs);
  else if (PROCESSING_KINDS.has(caseDoc.kind)) await runProcessingCase(caseDoc, legs);
  else throw new Error(`Unsupported case kind: ${caseDoc.kind}`);
  return legs;
}

// --- Tests ----------------------------------------------------------------------------------

const CASE_PATHS = listCasePaths();
const CASES = CASE_PATHS.map((p) => ({ file: path.basename(p), doc: readJson(p) }));
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
  for (const [caseId, runners] of Object.entries(LEDGER.entries ?? {})) {
    assert.ok(ids.has(caseId), `parity-ledger.json lists unknown case ${caseId}`);
    for (const [runner, legs] of Object.entries(runners)) {
      assert.ok(['ts', 'rust'].includes(runner), `${caseId}: unknown runner ${runner}`);
      for (const [leg, entry] of Object.entries(legs)) {
        assert.ok(/^fs-[a-z0-9]{4}$/.test(entry.ticket ?? ''), `${caseId} ${runner} ${leg}: ticket`);
        assert.ok(typeof entry.why === 'string' && entry.why.length > 0, `${caseId} ${runner} ${leg}: why`);
        assert.ok(Array.isArray(entry.problems) && entry.problems.length > 0, `${caseId} ${runner} ${leg}: problems`);
      }
    }
  }
});

for (const { file, doc } of CASES) {
  test(`shared suite: ${file}`, async () => {
    const legs = await runCase(doc);
    const listed = LEDGER.entries?.[doc.id]?.[RUNNER] ?? {};
    const violations = [];
    for (const leg of Object.keys(listed)) {
      if (!legs.has(leg)) violations.push(`parity-ledger.json lists ${RUNNER} leg ${leg}, which this runner does not run`);
    }
    for (const [leg, problems] of legs) {
      if (problems.length > 0) (OBSERVED[doc.id] ??= {})[leg] = problems;
      const entry = listed[leg];
      if (entry && problems.length === 0) {
        violations.push(`leg ${leg} now passes; delete its parity-ledger.json entry (${entry.ticket})`);
      } else if (entry) {
        // A listed leg must fail with exactly its recorded problems: any new difference fails CI.
        const recorded = entry.problems ?? [];
        const added = problems.filter((p) => !recorded.includes(p));
        const gone = recorded.filter((p) => !problems.includes(p));
        if (!same([...problems].sort(), [...recorded].sort())) {
          violations.push(`leg ${leg} fails differently from its parity-ledger.json entry (${entry.ticket}):\n`
            + `    new: ${added.join('\n    new: ')}\n    gone: ${gone.join('\n    gone: ')}`);
        }
      } else if (problems.length > 0) {
        violations.push(`leg ${leg} fails:\n    ${problems.join('\n    ')}`);
      }
    }
    assert.deepEqual(violations, [], `${doc.id} (${RUNNER}; specRefs: ${doc.specRefs.join('; ')})\n  ${violations.join('\n  ')}`);
  });
}
