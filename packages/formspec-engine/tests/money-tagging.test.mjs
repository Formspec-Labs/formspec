import test from 'node:test';
import assert from 'node:assert/strict';

import { FormEngine, initFormspecEngine } from '../dist/index.js';

test('compileExpression uses field dataType to tag money context values', async () => {
  await initFormspecEngine();
  const definition = {
    $formspec: '1.0',
    url: 'https://example.org/forms/money-tagging',
    version: '1.0.0',
    status: 'active',
    title: 'Money tagging',
    items: [
      { key: 'requested', type: 'field', dataType: 'money', label: 'Requested' },
    ],
  };

  const engine = new FormEngine(definition);
  engine.setValue('requested', { amount: 1250, currency: 'USD' });

  const evalAmount = engine.compileExpression('moneyAmount($requested)', 'requested');
  assert.equal(evalAmount(), 1250);
});
