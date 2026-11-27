/** @filedesc Remote options: engine fetches, exposes, and enforces normative membership for URI options and URL-backed optionSets (fs-oxsy). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

const originalFetch = globalThis.fetch;

test('fetches and enforces URI-string Item.options membership (Core §4.2.3)', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ([
      { value: 'alpha', label: 'Alpha' },
      { value: 'beta', label: 'Beta' },
    ]),
  });

  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/remote-options-uri',
    version: '1.0.0',
    status: 'active',
    title: 'Remote URI Options',
    items: [
      {
        key: 'status',
        type: 'field',
        dataType: 'choice',
        label: 'Status',
        options: 'https://api.example.org/options/status',
      },
    ],
  }, { savedResponseData: { status: 'zz' } });

  try {
    // Before fetch resolves, absent remote list emits OPTIONS_UNAVAILABLE (never silent acceptance).
    const before = engine.getValidationReport({ profile: 'on-submit' });
    assert.equal(before.valid, false);
    assert.equal(before.results.length, 1);
    assert.equal(before.results[0].code, 'OPTIONS_UNAVAILABLE');

    await engine.waitForRemoteOptions();
    assert.deepEqual(engine.getOptions('status'), [
      { value: 'alpha', label: 'Alpha' },
      { value: 'beta', label: 'Beta' },
    ]);
    assert.deepEqual(engine.getOptionsState('status'), { loading: false, error: null });

    // After fetch resolves, out-of-list value produces TYPE_MISMATCH.
    const afterInvalid = engine.getValidationReport({ profile: 'on-submit' });
    assert.equal(afterInvalid.valid, false);
    assert.equal(afterInvalid.results[0].code, 'TYPE_MISMATCH');

    // In-list value passes.
    engine.setValue('status', 'alpha');
    const afterValid = engine.getValidationReport({ profile: 'on-submit' });
    assert.equal(afterValid.valid, true);
    assert.deepEqual(engine.getResolvedOptions(), {
      optionSets: {},
      uris: { 'https://api.example.org/options/status': ['alpha', 'beta'] },
    });
  } finally {
    engine.dispose();
  }
});

test('fetches URL-backed optionSets with valueField/labelField, including Summary-only sets (Core §4.6)', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/regions')) {
      return {
        ok: true,
        json: async () => ([
          { code: 'north', name: 'North' },
          { code: 'south', name: 'South' },
        ]),
      };
    }
    return {
      ok: true,
      json: async () => ([{ value: 'summary-only', label: 'Summary Only' }]),
    };
  };

  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/remote-option-sets',
    version: '1.0.0',
    status: 'active',
    title: 'Remote Option Sets',
    optionSets: {
      regions: {
        source: 'https://api.example.org/options/regions',
        valueField: 'code',
        labelField: 'name',
      },
      summaryOnly: {
        source: 'https://api.example.org/options/summary-only',
      },
    },
    items: [
      {
        key: 'region',
        type: 'field',
        dataType: 'choice',
        label: 'Region',
        optionSet: 'regions',
      },
    ],
  }, { savedResponseData: { region: 'north' } });

  try {
    await engine.waitForRemoteOptions();
    assert.deepEqual(engine.getOptions('region'), [
      { value: 'north', label: 'North' },
      { value: 'south', label: 'South' },
    ]);
    assert.equal(engine.getValidationReport({ profile: 'on-submit' }).valid, true);
    assert.deepEqual(engine.getResolvedOptions(), {
      optionSets: {
        regions: ['north', 'south'],
        summaryOnly: ['summary-only'],
      },
      uris: {
        'https://api.example.org/options/regions': ['north', 'south'],
        'https://api.example.org/options/summary-only': ['summary-only'],
      },
    });
  } finally {
    engine.dispose();
  }
});

test('exposes fetch error and emits OPTIONS_UNAVAILABLE (never inline fallback) when URL optionSet fails', async () => {
  globalThis.fetch = async () => {
    throw new Error('network down');
  };

  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/remote-options-failure',
    version: '1.0.0',
    status: 'active',
    title: 'Remote Options Failure',
    optionSets: {
      codes: {
        source: 'https://api.example.org/options/codes',
      },
    },
    items: [
      {
        key: 'code',
        type: 'field',
        dataType: 'choice',
        label: 'Code',
        optionSet: 'codes',
        options: [{ value: 'fallback', label: 'Fallback' }],
      },
    ],
  }, { savedResponseData: { code: 'fallback' } });

  try {
    await engine.waitForRemoteOptions();
    assert.deepEqual(engine.getOptions('code'), []);
    assert.equal(engine.getOptionsState('code').loading, false);
    assert.match(engine.getOptionsState('code').error || '', /network down/);
    const report = engine.getValidationReport({ profile: 'on-submit' });
    assert.equal(report.valid, false);
    assert.equal(report.results.length, 1);
    assert.equal(report.results[0].code, 'OPTIONS_UNAVAILABLE');
  } finally {
    engine.dispose();
  }
});

test('keeps inline data and pre-supplied resolvedOptions without fetching external sources when disabled', async () => {
  const instanceUrl = 'https://api.example.org/records/review';
  const optionsUrl = 'https://api.example.org/options/review';
  const fetched = [];
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    return {
      ok: true,
      text: async () => '{"name":"Remote"}',
      json: async () => [{ value: 'remote', label: 'Remote' }],
    };
  };

  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'https://example.org/offline-review',
    version: '1.0.0',
    status: 'active',
    title: 'Offline review',
    instances: { record: { source: instanceUrl, data: { name: 'Inline' } } },
    items: [{
      key: 'status',
      type: 'field',
      dataType: 'choice',
      label: 'Status',
      options: optionsUrl,
    }],
  }, {
    loadExternalSources: false,
    savedResponseData: { status: 'preloaded' },
    resolvedOptions: {
      uris: { [optionsUrl]: [{ value: 'preloaded', label: 'Preloaded' }] },
    },
  });

  try {
    await engine.waitForInstanceSources();
    await engine.waitForRemoteOptions();

    assert.deepEqual(fetched, []);
    assert.equal(engine.getInstanceData('record', 'name'), 'Inline');
    assert.deepEqual(engine.getOptions('status'), [{ value: 'preloaded', label: 'Preloaded' }]);
    assert.equal(engine.getValidationReport({ profile: 'on-submit' }).valid, true);
  } finally {
    engine.dispose();
    globalThis.fetch = originalFetch;
  }
});

test.after(() => {
  globalThis.fetch = originalFetch;
});
