/** @filedesc Unanswered booleans remain distinct from an explicit false answer. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormEngine } from '../dist/engine-render-entry.js';

const definition = initial => ({
  $formspec: '1.0', url: 'urn:test:boolean-initialization', version: '1.0.0',
  title: 'Boolean initialization',
  items: [{ type: 'field', key: 'answer', dataType: 'boolean', label: 'Answer', ...initial }],
  binds: [{ path: 'answer', required: 'true' }],
});

test('an unanswered required boolean remains null until explicitly answered', () => {
  const engine = createFormEngine(definition());
  try {
    assert.equal(engine.signals.answer.value, null);
    assert.ok(engine.getValidationReport({ profile: 'on-submit' }).counts.error > 0);
    engine.setValue('answer', false);
    assert.equal(engine.signals.answer.value, false);
    assert.equal(engine.getValidationReport({ profile: 'on-submit' }).counts.error, 0);
    assert.equal(engine.getResponse({ profile: 'off' }).data.answer, false);
    engine.setValue('answer', null);
    assert.equal(engine.signals.answer.value, null);
    assert.ok(engine.getValidationReport({ profile: 'on-submit' }).counts.error > 0);
  } finally { engine.dispose(); }
});

for (const mode of ['authored', 'constructor', 'public load']) {
  test(`an explicit false from ${mode} remains an answered value`, () => {
    const engine = createFormEngine(definition(mode === 'authored' ? { initialValue: false } : {}),
      mode === 'constructor' ? { responseData: { answer: false } } : {});
    try {
      if (mode === 'public load') engine.loadResponseData({ answer: false });
      assert.equal(engine.signals.answer.value, false);
      assert.equal(engine.getValidationReport({ profile: 'on-submit' }).counts.error, 0);
    } finally { engine.dispose(); }
  });
}
