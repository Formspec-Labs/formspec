/** @filedesc Shared suite conformance: runs the shared cross-implementation conformance suite against the engine */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FormEngine } from '../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const suiteDir = path.join(repoRoot, 'tests', 'conformance', 'suite');
const realExamplesManifestPath = path.join(suiteDir, 'real-examples.manifest.json');
const originalConsoleError = console.error;

console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('Failed to load instance source')) {
    return;
  }
  originalConsoleError.apply(console, args);
};

test.after(() => {
  console.error = originalConsoleError;
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeDefinitionForEngine(definition) {
  const normalized = clone(definition);
  if (normalized.optionSets && typeof normalized.optionSets === 'object') {
    for (const [key, value] of Object.entries(normalized.optionSets)) {
      if (value && typeof value === 'object' && Array.isArray(value.options)) {
        normalized.optionSets[key] = value.options;
      }
    }
  }
  return normalized;
}

function listCasePaths() {
  return fs
    .readdirSync(suiteDir)
    .filter((name) => name.endsWith('.json') && name !== path.basename(realExamplesManifestPath))
    .sort()
    .map((name) => path.join(suiteDir, name));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resultSortKey(result) {
  if (!isPlainObject(result)) return '';
  return [
    result.path ?? '',
    result.code ?? '',
    result.severity ?? '',
    result.constraintKind ?? '',
    result.shapeId ?? '',
    result.source ?? '',
    result.sourceId ?? '',
  ].join('|');
}

function normalizeNumber(value) {
  if (Number.isNaN(value) || !Number.isFinite(value)) return String(value);
  if (Object.is(value, -0)) return 0;
  if (Number.isInteger(value)) return value;
  return Number(value.toPrecision(12));
}

function normalizeJson(value, parentKey = null) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return normalizeNumber(value);
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeJson(item, parentKey));
    if (parentKey === 'results' || parentKey === 'validationResults') {
      normalized.sort((a, b) => resultSortKey(a).localeCompare(resultSortKey(b)));
    }
    return normalized;
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (key === 'timestamp' || key === 'authored' || key === 'kind') continue;
      out[key] = normalizeJson(value[key], key);
    }
    return out;
  }
  if (value === undefined) return null;
  return value;
}

function compareFelValues(comparator, actual, expected) {
  if (comparator === 'tolerant-decimal') {
    const actualNum = typeof actual === 'number' ? actual : Number(actual);
    const expectedNum = typeof expected === 'number' ? expected : Number(expected);
    if (Number.isFinite(actualNum) && Number.isFinite(expectedNum)) {
      const diff = Math.abs(actualNum - expectedNum);
      return { ok: diff <= 1e-9, detail: `diff=${diff}` };
    }
    const ok = JSON.stringify(normalizeJson(actual)) === JSON.stringify(normalizeJson(expected));
    return { ok, detail: 'fallback-normalized-compare' };
  }

  if (comparator === 'normalized') {
    const ok = JSON.stringify(normalizeJson(actual)) === JSON.stringify(normalizeJson(expected));
    return { ok, detail: 'normalized-json-compare' };
  }

  const ok = JSON.stringify(normalizeJson(actual)) === JSON.stringify(normalizeJson(expected));
  return { ok, detail: 'exact-json-compare' };
}

function assertCaseContract(caseDoc, casePath) {
  const required = ['id', 'kind', 'expected', 'legacyCoverage'];
  for (const key of required) {
    assert.ok(caseDoc[key] !== undefined, `${path.basename(casePath)} missing required property: ${key}`);
  }

  assert.ok(typeof caseDoc.id === 'string' && caseDoc.id.length > 0, 'id must be a non-empty string');
  assert.ok(
    ['FEL_EVALUATION', 'ENGINE_PROCESSING', 'VALIDATION_REPORT', 'RESPONSE_VALIDATION'].includes(caseDoc.kind),
    `unsupported kind ${caseDoc.kind}`
  );
  assert.ok(Array.isArray(caseDoc.legacyCoverage) && caseDoc.legacyCoverage.length > 0, 'legacyCoverage must be non-empty');

  if (caseDoc.kind === 'FEL_EVALUATION') {
    assert.ok(typeof caseDoc.expression === 'string' && caseDoc.expression.length > 0, 'FEL case requires expression');
    assert.ok(['exact', 'normalized', 'tolerant-decimal'].includes(caseDoc.comparator), 'FEL case requires comparator');
    return;
  }

  assert.ok(typeof caseDoc.definitionPath === 'string' && caseDoc.definitionPath.length > 0, `${caseDoc.id} requires definitionPath`);
  assert.ok(
    (typeof caseDoc.payloadPath === 'string' && caseDoc.payloadPath.length > 0) || Object.hasOwn(caseDoc, 'inputData'),
    `${caseDoc.id} requires payloadPath or inputData`
  );
}

function loadInputPayload(caseDoc) {
  let payload = Object.hasOwn(caseDoc, 'payloadPath')
    ? readJson(path.join(repoRoot, caseDoc.payloadPath))
    : clone(caseDoc.inputData);

  if (
    isPlainObject(payload) &&
    Object.hasOwn(payload, 'data') &&
    (Object.hasOwn(payload, 'definitionUrl') || Object.hasOwn(payload, 'validationResults') || Object.hasOwn(payload, 'status'))
  ) {
    payload = payload.data;
  }
  return payload;
}

function ensureRepeatCount(engine, repeatPath, desiredCount) {
  let current = engine.repeats?.[repeatPath]?.value ?? 0;
  while (current < desiredCount) {
    engine.addRepeatInstance(repeatPath);
    current = engine.repeats?.[repeatPath]?.value ?? current + 1;
  }
  while (current > desiredCount) {
    engine.removeRepeatInstance(repeatPath, current - 1);
    current = engine.repeats?.[repeatPath]?.value ?? current - 1;
  }
}

function applyPayloadWithDefinition(engine, items, payload, prefix = '') {
  if (!isPlainObject(payload)) return;

  for (const item of items || []) {
    const key = item?.key;
    if (!key || !Object.hasOwn(payload, key)) continue;

    const value = payload[key];
    const fullPath = prefix ? `${prefix}.${key}` : key;

    if (item.type === 'group') {
      if (item.repeatable) {
        const rows = Array.isArray(value) ? value : [];
        ensureRepeatCount(engine, fullPath, rows.length);
        for (let i = 0; i < rows.length; i++) {
          applyPayloadWithDefinition(engine, item.children || [], rows[i] || {}, `${fullPath}[${i}]`);
        }
      } else if (isPlainObject(value)) {
        applyPayloadWithDefinition(engine, item.children || [], value, fullPath);
      }
      continue;
    }

    const signal = engine.signals?.[fullPath];
    if (signal && !isWritableSignal(signal)) {
      continue;
    }

    try {
      engine.setValue(fullPath, value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('only a getter')) {
        continue;
      }
      throw error;
    }
  }
}

function isWritableSignal(signal) {
  if (!signal) return false;
  const proto = Object.getPrototypeOf(signal);
  if (!proto) return false;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  return Boolean(descriptor?.set);
}

function collectRegistryEntries(caseDoc) {
  const entries = [];
  for (const relPath of caseDoc.registryPaths || []) {
    const registry = readJson(path.join(repoRoot, relPath));
    if (Array.isArray(registry.entries)) entries.push(...registry.entries);
  }
  return entries;
}

function runFelCase(caseDoc) {
  const fields = Array.isArray(caseDoc.fields) ? caseDoc.fields : [];
  const fieldDefs = fields.length > 0 ? fields : [{ key: 'dummy', dataType: 'integer', value: 0 }];
  const definition = {
    $formspec: '1.0',
    url: `https://example.org/forms/shared-suite/${caseDoc.id}`,
    version: '1.0.0',
    status: 'active',
    title: 'Shared Suite FEL',
    items: fieldDefs.map((field) => ({
      key: field.key,
      type: 'field',
      dataType: field.dataType || 'string',
      label: field.key,
    })),
  };

  const engine = new FormEngine(definition);
  for (const field of fields) {
    engine.setValue(field.key, field.value);
  }

  const fn = engine.compileExpression(caseDoc.expression, '');
  return { value: fn() };
}

function runProcessingArtifacts(caseDoc) {
  const definition = normalizeDefinitionForEngine(readJson(path.join(repoRoot, caseDoc.definitionPath)));
  const registryEntries = collectRegistryEntries(caseDoc);
  const engine = new FormEngine(definition, { registryEntries });

  if (caseDoc.skipScreener && typeof engine.skipScreener === 'function') {
    engine.skipScreener();
  }

  const payload = loadInputPayload(caseDoc);
  applyPayloadWithDefinition(engine, definition.items || [], payload || {});

  const mode = caseDoc.mode || 'submit';
  const report = engine.getValidationReport({ mode });
  const response = engine.getResponse({ mode });
  return { report, response };
}

function runCase(caseDoc) {
  if (caseDoc.kind === 'FEL_EVALUATION') {
    return runFelCase(caseDoc);
  }

  const { report, response } = runProcessingArtifacts(caseDoc);

  if (caseDoc.kind === 'ENGINE_PROCESSING') {
    return {
      valid: report.valid,
      counts: report.counts,
      results: report.results,
      data: response.data,
    };
  }

  if (caseDoc.kind === 'VALIDATION_REPORT') {
    return {
      valid: report.valid,
      counts: report.counts,
      results: report.results,
    };
  }

  if (caseDoc.kind === 'RESPONSE_VALIDATION') {
    const responseArtifact = {
      validationResults: response.validationResults,
    };
    if (caseDoc.compareResponseData) {
      responseArtifact.data = response.data;
    }
    return {
      report: {
        valid: report.valid,
        counts: report.counts,
        results: report.results,
      },
      response: responseArtifact,
    };
  }

  throw new Error(`Unsupported case kind: ${caseDoc.kind}`);
}

const CASE_PATHS = listCasePaths();

test('shared-suite real examples manifest references existing case files', () => {
  const manifest = readJson(realExamplesManifestPath);
  assert.ok(Array.isArray(manifest.caseFiles) && manifest.caseFiles.length > 0);
  for (const relName of manifest.caseFiles) {
    const casePath = path.join(suiteDir, relName);
    assert.ok(fs.existsSync(casePath), `missing manifest case file: ${relName}`);
  }
});

test('shared-suite case ids are unique', () => {
  const seen = new Set();
  for (const casePath of CASE_PATHS) {
    const caseDoc = readJson(casePath);
    assertCaseContract(caseDoc, casePath);
    assert.ok(!seen.has(caseDoc.id), `duplicate shared-suite case id: ${caseDoc.id}`);
    seen.add(caseDoc.id);
  }
});

for (const casePath of CASE_PATHS) {
  test(`shared suite: ${path.basename(casePath)}`, () => {
    const caseDoc = readJson(casePath);
    assertCaseContract(caseDoc, casePath);

    const manifest = readJson(realExamplesManifestPath);
    const listedExamples = new Set(manifest.caseFiles || []);
    if (typeof caseDoc.definitionPath === 'string' && caseDoc.definitionPath.startsWith('examples/')) {
      assert.ok(
        listedExamples.has(path.basename(casePath)),
        `${path.basename(casePath)} uses examples/ and must be listed in real-examples.manifest.json`
      );
    }

    const actual = runCase(caseDoc);

    if (caseDoc.kind === 'FEL_EVALUATION') {
      const actualValue = actual?.value;
      const expectedValue = caseDoc?.expected?.value;
      const compared = compareFelValues(caseDoc.comparator, actualValue, expectedValue);
      assert.ok(
        compared.ok,
        [
          `shared suite FEL mismatch for ${caseDoc.id} (${caseDoc.kind})`,
          `comparator: ${caseDoc.comparator} (${compared.detail})`,
          `legacyCoverage: ${JSON.stringify(caseDoc.legacyCoverage, null, 2)}`,
          `actual: ${JSON.stringify(normalizeJson(actual), null, 2)}`,
          `expected: ${JSON.stringify(normalizeJson(caseDoc.expected), null, 2)}`,
        ].join('\n')
      );
      return;
    }

    const normalizedActual = normalizeJson(actual);
    const normalizedExpected = normalizeJson(caseDoc.expected);
    assert.deepEqual(
      normalizedActual,
      normalizedExpected,
      [
        `shared suite mismatch for ${caseDoc.id} (${caseDoc.kind})`,
        `legacyCoverage: ${JSON.stringify(caseDoc.legacyCoverage, null, 2)}`,
        `actual: ${JSON.stringify(normalizedActual, null, 2)}`,
        `expected: ${JSON.stringify(normalizedExpected, null, 2)}`,
      ].join('\n')
    );
  });
}
