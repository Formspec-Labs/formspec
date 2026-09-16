/**
 * Writable Instances — Grant Application Coverage
 *
 * Migrated from tests/e2e/playwright/integration/writable-instances.spec.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';
import {
  createGrantEngine,
  addRepeatInstance,
} from './helpers/grant-app.mjs';

// Suppress expected console.error from instance source fetch failures
// (grant-app helper stubs fetch, but inline tests also create engines with source URLs)
const _consoleError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('Failed to load instance source')) return;
  _consoleError.apply(console, args);
};

test('writable instance (scratchPad) value can be set and read', () => {
  const engine = createGrantEngine();

  engine.setInstanceValue('scratchPad', 'budgetNotes', 'Test note');

  assert.equal(engine.instanceData?.scratchPad?.budgetNotes, 'Test note');
});

test('writable instance set increments instanceVersion', () => {
  const engine = createGrantEngine();
  const before = engine.instanceVersion.value;

  engine.setInstanceValue('scratchPad', 'budgetNotes', 'Updated');

  assert.ok(engine.instanceVersion.value > before);
});

test('writable instance initial data is loaded from definition', () => {
  const engine = createGrantEngine();
  const data = engine.instanceData?.scratchPad;

  assert.ok(data);
  assert.equal(data.lastSavedTotal, 0);
  assert.equal(data.budgetNotes, '');
});

test('writable instance allows setting nested path', () => {
  const engine = createGrantEngine();

  engine.setInstanceValue('scratchPad', 'budgetNotes', 'First note');
  assert.equal(engine.instanceData?.scratchPad?.budgetNotes, 'First note');

  engine.setInstanceValue('scratchPad', 'budgetNotes', 'Updated note');
  assert.equal(engine.instanceData?.scratchPad?.budgetNotes, 'Updated note');
});

test('readonly instance (agencyData) rejects writes', () => {
  const engine = createGrantEngine();

  assert.throws(
    () => engine.setInstanceValue('agencyData', 'maxAward', 999999),
    /readonly/
  );
});

test('readonly instance data is not modified after rejected write', () => {
  const engine = createGrantEngine();

  try {
    engine.setInstanceValue('agencyData', 'maxAward', 999999);
  } catch {
    // expected
  }

  assert.equal(engine.instanceData?.agencyData?.maxAward, 500000);
});

test('writable instance rejects values that violate schema types', () => {
  const engine = createGrantEngine();

  assert.throws(
    () => engine.setInstanceValue('scratchPad', 'lastSavedTotal', 'not-a-number'),
    /schema mismatch/
  );
});

test('source instance (priorYearData) loads fallback data when fetch fails', () => {
  const engine = createGrantEngine();
  const data = engine.instanceData?.priorYearData;

  assert.ok(data);
  assert.equal(data.priorAwardAmount, 250000);
  assert.equal(data.performanceRating, 'satisfactory');
});

test('source instance with static: true is marked in definition', () => {
  const engine = createGrantEngine();
  assert.equal(engine.definition.instances.priorYearData.static, true);
});

test('calculate bind writes grand total to scratchPad.lastSavedTotal', () => {
  const engine = createGrantEngine();

  addRepeatInstance(engine, 'budget.lineItems');
  engine.setValue('budget.lineItems[0].unitCost', 100);
  engine.setValue('budget.lineItems[0].quantity', 5);

  assert.equal(engine.instanceData?.scratchPad?.lastSavedTotal, 500);
});

test('FEL instance() function reads from writable instance', () => {
  const engine = createGrantEngine();

  engine.setInstanceValue('scratchPad', 'budgetNotes', 'FEL-test-value');
  const fn = engine.compileExpression("instance('scratchPad', 'budgetNotes')");

  assert.equal(fn(), 'FEL-test-value');
});

test('writing to unknown instance throws error', () => {
  const engine = createGrantEngine();

  assert.throws(
    () => engine.setInstanceValue('nonexistent', 'foo', 'bar'),
    /Unknown instance/
  );
});

test('source instance uses static cache and fallback data', () => {
  FormEngine.instanceSourceCache.clear();

  const def = {
    $formspec: '1.0',
    url: 'https://test.example/form',
    version: '1.0.0',
    status: 'active',
    title: 'Test',
    name: 'test',
    instances: {
      cached: {
        source: 'https://api.example.gov/static-data',
        static: true,
        data: { value: 'fallback' },
      },
    },
    items: [],
    binds: [],
  };

  const engine = new FormEngine(def);

  assert.equal(engine.getInstanceData('cached', 'value'), 'fallback');
});

test('a relative instance source resolves against the page base, like any relative reference', async () => {
  // A Definition served under /forms/v2/ names its record as `./data/claimant.json`; the engine fetches it
  // from the page's base URL, so the same document works at any host and path.
  const realFetch = globalThis.fetch;
  const hadDocument = 'document' in globalThis;
  const fetched = [];
  globalThis.document = { baseURI: 'https://agency.example/forms/v2/index.html' };
  globalThis.fetch = async (url) => { fetched.push(String(url)); return { ok: true, json: async () => ({ employers: ['ACME'] }) }; };
  try {
    const engine = new FormEngine({
      $formspec: '1.0', url: 'https://test.example/form', version: '1.0.0', status: 'active', title: 'Test', name: 'test',
      instances: { claimant: { source: './data/claimant.json' } },
      items: [], binds: [],
    });
    await engine.waitForInstanceSources();
    assert.deepEqual(fetched, ['https://agency.example/forms/v2/data/claimant.json']);
    assert.deepEqual(engine.getInstanceData('claimant', 'employers'), ['ACME']);
  } finally {
    globalThis.fetch = realFetch;
    if (hadDocument) { /* leave a real document alone */ } else delete globalThis.document;
  }
});

test('a relative instance source with no page to resolve against is left to its fallback', async () => {
  const realFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return { ok: true, json: async () => ({}) }; };
  try {
    const engine = new FormEngine({
      $formspec: '1.0', url: 'https://test.example/form', version: '1.0.0', status: 'active', title: 'Test', name: 'test',
      instances: { claimant: { source: './data/claimant.json', data: { employers: [] } } },
      items: [], binds: [],
    });
    await engine.waitForInstanceSources();
    assert.equal(fetches, 0);
    assert.deepEqual(engine.getInstanceData('claimant', 'employers'), []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('calculate bind targeting readonly instance throws at init', () => {
  const def = {
    $formspec: '1.0',
    url: 'https://test.example/form',
    version: '1.0.0',
    status: 'active',
    title: 'Test',
    name: 'test',
    instances: {
      readonlyInst: {
        readonly: true,
        data: { x: 1 },
      },
    },
    items: [
      { type: 'field', key: 'f1', dataType: 'integer' },
    ],
    binds: [
      { path: 'instances.readonlyInst.x', calculate: '$f1' },
    ],
  };

  assert.throws(() => new FormEngine(def), /readonly/);
});

test('non-fetchable source (formspec-fn:) does not call fetch or log errors', async () => {
  const errors = [];
  const origError = console.error;
  console.error = (...args) => errors.push(args);

  const origFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; return { ok: false, status: 404, json: async () => ({}) }; };

  try {
    const def = {
      $formspec: '1.0',
      url: 'https://test.example/form',
      version: '1.0.0',
      status: 'active',
      title: 'Test',
      name: 'test',
      instances: {
        rates: {
          source: 'formspec-fn:lookupRates',
          readonly: true,
          data: { usd: 1.0 },
        },
      },
      items: [],
      binds: [],
    };

    const engine = new FormEngine(def);
    await engine.waitForInstanceSources();

    // Host-provided source: fetch must NOT be called
    assert.equal(fetchCalled, false, 'fetch should not be called for formspec-fn: sources');
    // No console.error from the engine
    const instanceErrors = errors.filter(a => typeof a[0] === 'string' && a[0].includes('instance source'));
    assert.equal(instanceErrors.length, 0, 'no instance source errors should be logged');
    // Fallback data from definition is still available
    assert.equal(engine.getInstanceData('rates', 'usd'), 1.0);
  } finally {
    globalThis.fetch = origFetch;
    console.error = origError;
  }
});

test('absolute-path source (/) triggers fetch', async () => {
  const origFetch = globalThis.fetch;
  let fetchedUrl = null;
  globalThis.fetch = async (url) => {
    fetchedUrl = url;
    return { ok: true, json: async () => ({ val: 42 }) };
  };

  try {
    const def = {
      $formspec: '1.0',
      url: 'https://test.example/form',
      version: '1.0.0',
      status: 'active',
      title: 'Test',
      name: 'test',
      instances: {
        data: {
          source: '/examples/data.json',
          readonly: true,
        },
      },
      items: [],
      binds: [],
    };

    const engine = new FormEngine(def);
    await engine.waitForInstanceSources();

    assert.equal(fetchedUrl, '/examples/data.json');
    assert.equal(engine.getInstanceData('data', 'val'), 42);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('https source triggers fetch', async () => {
  const origFetch = globalThis.fetch;
  let fetchedUrl = null;
  globalThis.fetch = async (url) => {
    fetchedUrl = url;
    return { ok: true, json: async () => ({ val: 99 }) };
  };

  try {
    const def = {
      $formspec: '1.0',
      url: 'https://test.example/form',
      version: '1.0.0',
      status: 'active',
      title: 'Test',
      name: 'test',
      instances: {
        remote: {
          source: 'https://api.example.com/data',
          readonly: true,
        },
      },
      items: [],
      binds: [],
    };

    const engine = new FormEngine(def);
    await engine.waitForInstanceSources();

    assert.equal(fetchedUrl, 'https://api.example.com/data');
    assert.equal(engine.getInstanceData('remote', 'val'), 99);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('writable instance calculate bind updates on field change', async () => {
  const def = {
    $formspec: '1.0',
    url: 'https://test.example/form',
    version: '1.0.0',
    status: 'active',
    title: 'Test',
    name: 'test',
    instances: {
      pad: {
        readonly: false,
        data: { total: 0 },
        schema: { total: 'decimal' },
      },
    },
    items: [
      { type: 'field', key: 'amount', dataType: 'decimal' },
    ],
    binds: [
      { path: 'instances.pad.total', calculate: '$amount * 2' },
    ],
  };

  const engine = new FormEngine(def);
  engine.setValue('amount', 25);

  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(engine.getInstanceData('pad', 'total'), 50);
});
