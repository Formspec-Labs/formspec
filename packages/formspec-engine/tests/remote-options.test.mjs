/** @filedesc Remote options: engine fetches and exposes option lists for choice fields with remoteOptions config */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

const originalFetch = globalThis.fetch;

test('should fetch and expose remote options for bound choice fields', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ([
      { value: 'alpha', label: 'Alpha' },
      { value: 'beta', label: 'Beta' },
    ]),
  });

  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/remote-options',
    version: '1.0.0',
    title: 'Remote Options',
    items: [
      { key: 'status', type: 'field', dataType: 'choice', label: 'Status' },
    ],
    binds: [
      { path: 'status', remoteOptions: 'https://api.example.org/options/status' },
    ],
  });

  await engine.waitForRemoteOptions();
  assert.deepEqual(engine.getOptions('status'), [
    { value: 'alpha', label: 'Alpha' },
    { value: 'beta', label: 'Beta' },
  ]);
  assert.deepEqual(engine.getOptionsState('status'), { loading: false, error: null });
});

test('should preserve fallback options and expose error state when remote options fetch fails', async () => {
  globalThis.fetch = async () => {
    throw new Error('network down');
  };

  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/remote-options-failure',
    version: '1.0.0',
    title: 'Remote Options Failure',
    items: [
      {
        key: 'status',
        type: 'field',
        dataType: 'choice',
        label: 'Status',
        options: [{ value: 'fallback', label: 'Fallback' }],
      },
    ],
    binds: [
      { path: 'status', remoteOptions: 'https://api.example.org/options/status' },
    ],
  });

  await engine.waitForRemoteOptions();
  assert.deepEqual(engine.getOptions('status'), [{ value: 'fallback', label: 'Fallback' }]);
  assert.equal(engine.getOptionsState('status').loading, false);
  assert.match(engine.getOptionsState('status').error || '', /network down/);
});

test('keeps inline data and options without fetching external sources when disabled', async () => {
  const instanceUrl = 'https://api.example.org/records/review';
  const optionsUrl = 'https://api.example.org/options/review';
  const fetched = [];
  globalThis.fetch = async url => {
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
    title: 'Offline review',
    instances: { record: { source: instanceUrl, data: { name: 'Inline' } } },
    items: [{
      key: 'status',
      type: 'field',
      dataType: 'choice',
      label: 'Status',
      options: [{ value: 'inline', label: 'Inline' }],
    }],
    binds: [{ path: 'status', remoteOptions: optionsUrl }],
  }, { loadExternalSources: false });

  try {
    await engine.waitForInstanceSources();
    await engine.waitForRemoteOptions();

    assert.deepEqual(fetched, []);
    assert.equal(engine.getInstanceData('record', 'name'), 'Inline');
    assert.deepEqual(engine.getOptions('status'), [{ value: 'inline', label: 'Inline' }]);
  } finally {
    engine.dispose();
    globalThis.fetch = originalFetch;
  }
});

test.after(() => {
  globalThis.fetch = originalFetch;
});
