/** @filedesc Remote options must trigger re-evaluation so validation transitions from OPTIONS_UNAVAILABLE to normative membership. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

const originalFetch = globalThis.fetch;

test('validation report changes after remote options resolve', async () => {
  let evaluateCallCount = 0;

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ([
      { value: 'alpha', label: 'Alpha' },
      { value: 'beta', label: 'Beta' },
    ]),
  });

  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/remote-reeval',
    version: '1.0.0',
    status: 'active',
    title: 'Remote Re-eval',
    items: [
      {
        key: 'status',
        type: 'field',
        dataType: 'choice',
        label: 'Status',
        options: 'https://api.example.org/options/status',
      },
    ],
  }, { savedResponseData: { status: 'alpha' } });

  try {
    assert.equal(engine.getValidationReport({ profile: 'live' }).results[0]?.code, 'OPTIONS_UNAVAILABLE');

    const originalEvaluate = engine._evaluate.bind(engine);
    engine._evaluate = function (...args) {
      evaluateCallCount++;
      return originalEvaluate(...args);
    };

    const countBefore = evaluateCallCount;
    await engine.waitForRemoteOptions();

    assert.ok(
      evaluateCallCount > countBefore,
      `_evaluate() must be called after remote options resolve (calls before: ${countBefore}, after: ${evaluateCallCount})`,
    );
    assert.equal(engine.getValidationReport({ profile: 'live' }).valid, true);
  } finally {
    engine.dispose();
    globalThis.fetch = originalFetch;
  }
});
