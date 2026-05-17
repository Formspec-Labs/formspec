/** @filedesc Kitchen-sink runtime: holistic e2e fixture exercising all engine features end-to-end */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FormEngine, assembleDefinitionSync } from '../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const kitchenSinkDefinitionPath = path.join(
  repoRoot,
  'tests',
  'e2e',
  'fixtures',
  'kitchen-sink-holistic',
  'definition.v1.json'
);

const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;

globalThis.fetch = async (...args) => {
  const input = args[0];
  const url = typeof input === 'string' ? input : (input?.url || '');
  if (url.includes('example.org/rates') || url.startsWith('mock://')) {
    return { ok: false, status: 503, json: async () => ({}) };
  }
  return originalFetch(...args);
};

console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('Failed to load instance source')) {
    return;
  }
  originalConsoleError.apply(console, args);
};

test.after(() => {
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
});

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeDefinitionForEngine(definition) {
  const normalized = JSON.parse(JSON.stringify(definition));
  if (normalized.optionSets && typeof normalized.optionSets === 'object') {
    for (const [key, value] of Object.entries(normalized.optionSets)) {
      if (value && typeof value === 'object' && Array.isArray(value.options)) {
        normalized.optionSets[key] = value.options;
      }
    }
  }
  return normalized;
}

function createKitchenSinkEngine() {
  const definition = normalizeDefinitionForEngine(loadJson(kitchenSinkDefinitionPath));
  return new FormEngine(definition, { runtimeContext: { now: '2026-02-24T12:00:00.000Z' } });
}

function populateKitchenSinkMixedData(engine) {
  engine.setValue('fullName', '  Shelley Agent  ');
  engine.setValue('notes', 'alpha    beta    gamma');
  engine.setValue('website', 'http://invalid.example');
  engine.setValue('profileMode', 'advanced');
  engine.setValue('contactMethod', 'sms');
  engine.setValue('tags', ['priority', 'followup']);
  engine.setValue('startDate', '2026-01-01');
  engine.setValue('endDate', '2026-01-15');
  engine.setValue('visitTime', '09:30');
  engine.setValue('visitDateTime', '2026-01-16T10:00');
  engine.setValue('budget', 300);
  engine.setValue('lineItems[0].lineName', 'Laptop');
  engine.setValue('lineItems[0].lineQty', 2);
  engine.setValue('lineItems[0].linePrice', 100);
  engine.addRepeatInstance('lineItems');
  engine.setValue('lineItems[1].lineName', 'Monitor');
  engine.setValue('lineItems[1].lineQty', 1);
  engine.setValue('lineItems[1].linePrice', 50);
  engine.setValue('vipEnabled', true);
  engine.setValue('vipCode', 'VIP-007');
  engine.setValue('salary__amount', 1234.56);
  engine.setValue('salary__currency', 'USD');
  engine.setValue('upload', {
    url: 'https://example.org/files/doc.pdf',
    contentType: 'application/pdf',
    size: 2048,
  });
  engine.setValue('website', 'https://valid.example');
}

function canonicalizeResponse(response) {
  const normalized = JSON.parse(JSON.stringify(response));
  delete normalized.authored;
  if (Array.isArray(normalized.validationResults)) {
    for (const result of normalized.validationResults) {

    }
    normalized.validationResults.sort((a, b) => {
      const left = `${a.path}|${a.code}|${a.severity}|${a.constraintKind}|${a.shapeId}|${a.source}|${a.sourceId}`;
      const right = `${b.path}|${b.code}|${b.severity}|${b.constraintKind}|${b.shapeId}|${b.source}|${b.sourceId}`;
      return left.localeCompare(right);
    });
  }
  return normalized;
}

test('kitchen-sink runtime: identity pinning', () => {
  const engine = createKitchenSinkEngine();
  assert.equal(engine.definition.url, 'https://example.org/forms/kitchen-sink-holistic');
  assert.equal(engine.definition.version, '1.0.0');
});

test('kitchen-sink runtime: initial hydration', () => {
  const engine = createKitchenSinkEngine();
  assert.equal(engine.signals.fullName?.value, '  Alice Example  ');
  assert.equal(engine.signals.budget?.value, 0);
});

test('kitchen-sink runtime: mixed-type data entry', () => {
  const engine = createKitchenSinkEngine();
  populateKitchenSinkMixedData(engine);
  assert.equal(engine.signals.grandTotal?.value, 250);
  assert.equal(engine.signals.vipCode?.value, 'VIP-007');
});

test('kitchen-sink runtime: shape and bind validation contract', () => {
  const engine = createKitchenSinkEngine();
  populateKitchenSinkMixedData(engine);

  const continuous = engine.getValidationReport({ mode: 'continuous' });
  const submit = engine.getValidationReport({ mode: 'submit' });
  const demand = engine.evaluateShape('demand_name_present');

  assert.ok(continuous.counts.warning >= 1);
  assert.ok(continuous.counts.info >= 1);
  assert.ok(continuous.results.some((result) => result.constraintKind === 'shape'));
  assert.equal(
    submit.results.some((result) => String(result.message || '').includes('Grand total must be positive')),
    false
  );
  assert.ok(Array.isArray(demand));
});

test('kitchen-sink runtime: non-relevant behavior in submit response', () => {
  const engine = createKitchenSinkEngine();
  populateKitchenSinkMixedData(engine);
  engine.setValue('profileMode', 'basic');

  const response = engine.getResponse({ mode: 'submit' });
  assert.equal(response.data.contactMethod, undefined);
  assert.ok(response.data.tags);
  assert.equal(response.data.hiddenMirror, null);
});

test('kitchen-sink runtime: response and validation-report contract', () => {
  const engine = createKitchenSinkEngine();
  populateKitchenSinkMixedData(engine);
  const response = engine.getResponse({ mode: 'submit' });

  assert.equal(response.definitionUrl, 'https://example.org/forms/kitchen-sink-holistic');
  assert.equal(response.definitionVersion, '1.0.0');
  assert.ok(['completed', 'in-progress'].includes(response.status));
  assert.equal(response.data.fullName, 'Shelley Agent');
  assert.equal(response.data.notes, 'alpha beta gamma');
  assert.deepEqual(response.data.upload, {
    url: 'https://example.org/files/doc.pdf',
    contentType: 'application/pdf',
    size: 2048,
  });
  assert.equal(response.data.lineItems.length, 2);
  assert.equal(response.data.grandTotal, 250);

  const errorCount = response.validationResults.filter((result) => result.severity === 'error').length;
  if (response.status === 'completed') {
    assert.equal(errorCount, 0);
  } else {
    assert.ok(errorCount > 0);
  }
});

test('kitchen-sink runtime: assembly remains available', () => {
  const imported = {
    $formspec: '1.0',
    url: 'https://example.org/forms/fragment',
    version: '1.0.0',
    status: 'active',
    title: 'Fragment',
    items: [{ key: 'income', type: 'field', dataType: 'decimal', label: 'Income' }],
  };

  const host = {
    $formspec: '1.0',
    url: 'https://example.org/forms/host',
    version: '1.0.0',
    status: 'active',
    title: 'Host',
    items: [
      {
        key: 'financial',
        type: 'group',
        label: 'Financial',
        $ref: 'https://example.org/forms/fragment|1.0.0',
        keyPrefix: 'loan_',
      },
    ],
  };

  const assembled = assembleDefinitionSync(host, (url) => {
    if (url === 'https://example.org/forms/fragment') return imported;
    throw new Error(`Unexpected resolver URL: ${url}`);
  });

  assert.equal(assembled.definition.items[0].children?.[0]?.key, 'loan_income');
});

test('kitchen-sink runtime: deterministic canonicalized responses', () => {
  const engine = createKitchenSinkEngine();
  populateKitchenSinkMixedData(engine);

  const responseA = engine.getResponse({ mode: 'submit' });
  const responseB = engine.getResponse({ mode: 'submit' });
  assert.deepEqual(canonicalizeResponse(responseA), canonicalizeResponse(responseB));
});
