/** @filedesc Shared conformance assertions, exact decimal comparison, no-invention oracle, and ledger judgment. */
import { isJsonRecord as isPlainObject, isRawJson } from '../dist/json-values.js';

const DECIMAL_RE = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * Parse a JSON number, wrapped `JSON.rawJSON` decimal, or (when `allowString`) decimal string
 * into `{ coef: BigInt, scale: number }` representing `coef * 10^(-scale)` with `scale >= 0`.
 */
export function parseExactDecimal(value, { allowString = false } = {}) {
  let text;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    text = String(value);
  } else if (isRawJson(value)) {
    text = value.rawJSON;
  } else if (allowString && typeof value === 'string') {
    text = value.trim();
  } else {
    return null;
  }
  const match = DECIMAL_RE.exec(text);
  if (!match) return null;
  const sign = match[1] === '-' ? -1n : 1n;
  const intPart = match[2] ?? '';
  const fracPart = match[3] ?? match[4] ?? '';
  const exp = match[5] ? Number.parseInt(match[5], 10) : 0;
  if (!Number.isSafeInteger(exp)) return null;
  const digits = `${intPart}${fracPart}`;
  if (!digits.length) return null;
  let coef = BigInt(digits) * sign;
  let scale = fracPart.length - exp;
  if (scale < 0) {
    coef *= 10n ** BigInt(-scale);
    scale = 0;
  }
  if (coef === 0n) scale = 0;
  return { coef, scale };
}

function alignDecimals(a, b) {
  const scale = Math.max(a.scale, b.scale);
  const left = a.coef * (10n ** BigInt(scale - a.scale));
  const right = b.coef * (10n ** BigInt(scale - b.scale));
  return [left, right, scale];
}

export function decimalEqual(a, b) {
  const [left, right] = alignDecimals(a, b);
  return left === right;
}

export function decimalWithinTolerance(a, b, epsilon) {
  const scale = Math.max(a.scale, b.scale, epsilon.scale);
  const left = a.coef * (10n ** BigInt(scale - a.scale));
  const right = b.coef * (10n ** BigInt(scale - b.scale));
  const eps = epsilon.coef * (10n ** BigInt(scale - epsilon.scale));
  if (eps < 0n) return false;
  const diff = left >= right ? left - right : right - left;
  return diff <= eps;
}

export function normalizeJson(value) {
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

export const show = (value) => JSON.stringify(normalizeJson(value));

/**
 * Structural JSON equality with exact arbitrary-precision decimal comparison for numbers
 * (including wrapped `JSON.rawJSON` decimal tokens).
 */
export function same(a, b) {
  const normA = a instanceof Date ? a.toISOString() : (a === undefined ? null : a);
  const normB = b instanceof Date ? b.toISOString() : (b === undefined ? null : b);
  const decA = parseExactDecimal(normA);
  const decB = parseExactDecimal(normB);
  if (decA !== null || decB !== null) {
    return decA !== null && decB !== null && decimalEqual(decA, decB);
  }
  if (typeof normA === 'number' || typeof normB === 'number') {
    return String(normA) === String(normB);
  }
  if (Array.isArray(normA) || Array.isArray(normB)) {
    return Array.isArray(normA) && Array.isArray(normB)
      && normA.length === normB.length
      && normA.every((item, index) => same(item, normB[index]));
  }
  if (isPlainObject(normA) || isPlainObject(normB)) {
    if (!isPlainObject(normA) || !isPlainObject(normB)) return false;
    const keysA = Object.keys(normA).filter((k) => normA[k] !== undefined).sort();
    const keysB = Object.keys(normB).filter((k) => normB[k] !== undefined).sort();
    return keysA.length === keysB.length
      && keysA.every((key, index) => key === keysB[index] && same(normA[key], normB[key]));
  }
  return Object.is(normA, normB);
}

/**
 * Compare two values with `exact`, `exact-decimal`, `tolerance` (explicit `epsilon`),
 * or `tolerant-decimal` (default `1e-9` epsilon), preserving exact precision on wrapped decimals.
 */
export function compareValue(actual, expected, { comparator = 'exact', epsilon } = {}) {
  if (comparator === 'exact' || comparator === 'normalized') {
    return same(actual, expected);
  }
  if (comparator === 'exact-decimal') {
    const a = parseExactDecimal(actual, { allowString: true });
    const e = parseExactDecimal(expected, { allowString: true });
    return a !== null && e !== null && decimalEqual(a, e);
  }
  if (comparator === 'tolerance' || comparator === 'tolerant-decimal') {
    const eps = parseExactDecimal(epsilon ?? '1e-9', { allowString: true });
    const a = parseExactDecimal(actual, { allowString: true });
    const e = parseExactDecimal(expected, { allowString: true });
    if (a !== null && e !== null && eps !== null) {
      return decimalWithinTolerance(a, e, eps);
    }
    return comparator === 'tolerant-decimal' ? same(actual, expected) : false;
  }
  throw new Error(`Unsupported comparator: ${comparator}`);
}

export function compareFelValues(comparator, actual, expected) {
  return compareValue(actual, expected, { comparator });
}

/** A ValidationResult without envelope markers or absent optional fields. */
export function cleanResult(result) {
  const out = {};
  for (const [key, value] of Object.entries(result)) {
    if (key.startsWith('$formspec') || value === undefined || value === null) continue;
    out[key] = value;
  }
  return out;
}

export const resultKey = (r) => [r.path, r.code, r.constraintKind, r.severity, r.shapeId ?? ''].join('|');
export const byKey = (a, b) => resultKey(a).localeCompare(resultKey(b));

/** `{valid, counts, results, data, undeclaredDataPaths, states}` from a result list and data tree. */
export function outcome(validations, data, undeclaredDataPaths, states) {
  const results = validations.map(cleanResult).sort(byKey);
  const counts = { error: 0, warning: 0, info: 0 };
  for (const r of results) counts[r.severity] = (counts[r.severity] ?? 0) + 1;
  return { valid: counts.error === 0, counts, results, data, undeclaredDataPaths, states };
}

/** Parse a concrete path like `rows[0].tags[1]` into object-key / array-index segments. */
export function parseConcretePath(pathExpr) {
  const segs = [];
  let i = 0;
  while (i < pathExpr.length) {
    if (pathExpr[i] === '.') {
      i += 1;
      continue;
    }
    if (pathExpr[i] === '[') {
      const close = pathExpr.indexOf(']', i + 1);
      if (close === -1) throw new Error(`Malformed dataAt path: ${pathExpr}`);
      const raw = pathExpr.slice(i + 1, close);
      if (!/^\d+$/.test(raw)) throw new Error(`Expected non-negative integer index in path: ${pathExpr}`);
      segs.push(Number.parseInt(raw, 10));
      i = close + 1;
      continue;
    }
    let end = i;
    while (end < pathExpr.length && pathExpr[end] !== '.' && pathExpr[end] !== '[') end += 1;
    segs.push(pathExpr.slice(i, end));
    i = end;
  }
  return segs;
}

/** Resolve a concrete path in a Response data tree, distinguishing absent from null. */
export function resolveDataPath(data, pathExpr) {
  const segs = parseConcretePath(pathExpr);
  let node = data;
  for (const seg of segs) {
    if (typeof seg === 'number') {
      if (!Array.isArray(node) || seg < 0 || seg >= node.length) return { found: false };
      node = node[seg];
    } else {
      if (!isPlainObject(node) || !Object.hasOwn(node, seg)) return { found: false };
      node = node[seg];
    }
  }
  return { found: true, value: node };
}

function matchesPathPrefix(actualPath, prefix) {
  if (typeof actualPath !== 'string') return false;
  if (prefix.endsWith('.') || prefix.endsWith('[')) return actualPath.startsWith(prefix);
  return actualPath === prefix
    || actualPath.startsWith(`${prefix}.`)
    || actualPath.startsWith(`${prefix}[`);
}

export function matchesResultFilter(result, filter) {
  for (const [key, expectedValue] of Object.entries(filter)) {
    if (key === 'count') continue;
    if (key === 'pathPrefix') {
      if (!matchesPathPrefix(result.path, expectedValue)) return false;
    } else if (!same(result[key], expectedValue)) {
      return false;
    }
  }
  return true;
}

/** Mismatches between `actual` and `expected`, supporting full and partial expectations. */
export function againstExpected(actual, expected) {
  const problems = [];
  if ('valid' in expected && actual.valid !== expected.valid) {
    problems.push(`valid ${actual.valid}, expected ${expected.valid}`);
  }
  if ('counts' in expected && !same(actual.counts, expected.counts)) {
    problems.push(`counts ${show(actual.counts)}, expected ${show(expected.counts)}`);
  }
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
  if ('data' in expected) {
    problems.push(...dataDiff(actual.data, expected.data).map((d) => `data ${d} (actual vs expected)`));
  }
  if ('undeclaredDataPaths' in expected
    && !same([...(actual.undeclaredDataPaths ?? [])].sort(), [...expected.undeclaredDataPaths].sort())) {
    problems.push(`undeclaredDataPaths ${show(actual.undeclaredDataPaths ?? null)}, expected ${show(expected.undeclaredDataPaths)}`);
  }
  if ('present' in expected) {
    for (const matcher of expected.present) {
      const { count, ...filter } = matcher;
      const matched = actual.results.filter((r) => matchesResultFilter(r, filter)).length;
      if (count !== undefined) {
        if (matched !== count) {
          problems.push(`present ${show(filter)}: count ${matched}, expected ${count}`);
        }
      } else if (matched === 0) {
        problems.push(`present ${show(filter)}: missing`);
      }
    }
  }
  if ('absent' in expected) {
    for (const filter of expected.absent) {
      const matched = actual.results.filter((r) => matchesResultFilter(r, filter)).length;
      if (matched > 0) {
        problems.push(`absent ${show(filter)}: found ${matched}`);
      }
    }
  }
  if ('dataAt' in expected) {
    for (const check of expected.dataAt) {
      const resolved = resolveDataPath(actual.data ?? {}, check.path);
      if (check.absent === true) {
        if (resolved.found) {
          problems.push(`dataAt ${check.path}: ${show(resolved.value)}, expected absent`);
        }
        continue;
      }
      if (!resolved.found) {
        problems.push(`dataAt ${check.path}: absent, expected ${show(check.value)}`);
        continue;
      }
      const comparator = check.comparator ?? 'exact';
      if (!compareValue(resolved.value, check.value, { comparator, epsilon: check.epsilon })) {
        const suffix = comparator !== 'exact'
          ? ` (${comparator}${check.epsilon !== undefined ? ` epsilon=${check.epsilon}` : ''})`
          : '';
        problems.push(`dataAt ${check.path}: ${show(resolved.value)}, expected ${show(check.value)}${suffix}`);
      }
    }
  }
  if ('states' in expected) {
    const states = actual.states ?? {};
    for (const [itemPath, wanted] of Object.entries(expected.states)) {
      const got = states[itemPath];
      if (!got) {
        problems.push(`state ${itemPath}: absent`);
        continue;
      }
      for (const prop of ['relevant', 'required', 'readonly']) {
        if (prop in wanted && got[prop] !== wanted[prop]) {
          problems.push(`state ${itemPath}.${prop} ${got[prop]}, expected ${wanted[prop]}`);
        }
      }
    }
  }
  return problems;
}

/** Results in one list and not the other, by full content. */
export function resultDiff(actual, reference) {
  const a = actual.map(show);
  const b = reference.map(show);
  return [...a.filter((r) => !b.includes(r)).map((r) => `only here ${r}`), ...b.filter((r) => !a.includes(r)).map((r) => `only there ${r}`)];
}

/** Leaf paths whose values differ between two data trees. */
export function dataDiff(actual, reference) {
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
export function betweenLegs(label, actual, reference, { data = true } = {}) {
  const problems = resultDiff(actual.results, reference.results).map((d) => `${label} results ${d}`);
  if (data) problems.push(...dataDiff(actual.data, reference.data).map((d) => `${label} data ${d}`));
  return problems;
}

// --- No invention --------------------------------------------------------------------------

export function itemIndex(definition) {
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

export function leaves(value, segs = [], out = new Map()) {
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

export const template = (segs) => segs.filter((s) => typeof s === 'string').join('.');
/** `rows[0].name`; a key that itself contains `.` or `[` (a flat key, not a path) is shown quoted. */
export const concrete = (segs) => segs.reduce((acc, s) => {
  if (typeof s === 'number') return `${acc}[${s}]`;
  const key = /[.[\]]/.test(s) ? JSON.stringify(s) : s;
  return acc ? `${acc}.${key}` : key;
}, '') || '(root)';

/** Rebuild refuses at an authored slot. A cycle finding can accompany evaluated data. */
export function isDefinitionRefusal({ constraintKind, path }) {
  return constraintKind === 'definition' && path?.startsWith('$.');
}

/** Ways `evaluate` changed `input` into `output` that the processing cycle does not permit. */
export function inventions(definition, input, output) {
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
  const calculatedInExistingRows = (segs) => calculated.has(owningField(segs))
    && segs.every((s, i) => typeof s !== 'number' || reaches(before, segs.slice(0, i + 1)));
  const problems = [];
  for (const [key, { segs, value }] of after) {
    const prior = before.get(key);
    if (prior && same(prior.value, value)) continue;
    if (calculatedInExistingRows(segs)) continue;
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

// --- Ledger judgment -----------------------------------------------------------------------

export function validateLedger(ledger, caseIds, { ticketPattern } = {}) {
  if (!ledger || typeof ledger !== 'object') {
    throw new Error('Parity ledger must be a JSON object');
  }
  const entries = ledger.entries ?? {};
  if (!isPlainObject(entries)) {
    throw new Error('Parity ledger entries must be an object');
  }
  for (const [caseId, runners] of Object.entries(entries)) {
    if (caseIds && !caseIds.has(caseId)) {
      throw new Error(`parity-ledger.json lists unknown case ${caseId}`);
    }
    if (!isPlainObject(runners)) {
      throw new Error(`${caseId}: ledger runner map must be an object`);
    }
    for (const [runner, legs] of Object.entries(runners)) {
      if (!['ts', 'rust'].includes(runner)) {
        throw new Error(`${caseId}: unknown runner ${runner}`);
      }
      if (!isPlainObject(legs)) {
        throw new Error(`${caseId} ${runner}: ledger legs map must be an object`);
      }
      for (const [leg, entry] of Object.entries(legs)) {
        if (typeof entry?.ticket !== 'string' || entry.ticket.length === 0) {
          throw new Error(`${caseId} ${runner} ${leg}: missing ticket`);
        }
        if (ticketPattern && !ticketPattern.test(entry.ticket)) {
          throw new Error(`${caseId} ${runner} ${leg}: ticket ${entry.ticket} does not match ${ticketPattern}`);
        }
        if (typeof entry.why !== 'string' || entry.why.length === 0) {
          throw new Error(`${caseId} ${runner} ${leg}: missing why`);
        }
        if (!Array.isArray(entry.problems) || entry.problems.length === 0) {
          throw new Error(`${caseId} ${runner} ${leg}: problems must be a non-empty array`);
        }
      }
    }
  }
}

/** Judge observed `legs` (Map or plain object) against a case's ledger entries for `runner`. */
export function legViolations(legs, listed = {}, runner = 'ts') {
  const legEntries = legs instanceof Map ? [...legs.entries()] : Object.entries(legs);
  const legMap = legs instanceof Map ? legs : new Map(legEntries);
  const violations = [];
  for (const leg of Object.keys(listed)) {
    if (!legMap.has(leg)) {
      violations.push(`parity-ledger.json lists ${runner} leg ${leg}, which this runner does not run`);
    }
  }
  for (const [leg, problems] of legEntries) {
    const entry = listed[leg];
    if (entry && problems.length === 0) {
      violations.push(`leg ${leg} now passes; delete its parity-ledger.json entry (${entry.ticket})`);
    } else if (entry) {
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
  return violations;
}
