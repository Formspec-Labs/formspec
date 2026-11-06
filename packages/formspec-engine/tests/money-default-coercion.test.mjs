/** @filedesc Money default coercion: bind defaults for money fields retain schema-compliant decimal strings. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

test('money bind defaults are preserved as decimal string amounts when a field becomes relevant', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/money-defaults',
    version: '1.0.0',
    title: 'Money Defaults',
    formPresentation: {
      defaultCurrency: 'USD',
    },
    items: [
      { key: 'show', type: 'field', dataType: 'boolean', label: 'Show', initialValue: false },
      { key: 'amount', type: 'field', dataType: 'money', label: 'Amount' },
    ],
    binds: [
      { path: 'amount', relevant: 'show == true', default: { amount: '0', currency: 'USD' } },
    ],
  });

  assert.equal(engine.signals.amount.value, null);

  engine.setValue('show', true);
  assert.deepEqual(engine.signals.amount.value, { amount: '0', currency: 'USD' });
  assert.equal(typeof engine.signals.amount.value.amount, 'string');

  engine.setValue('amount', { amount: 25, currency: 'USD' });
  engine.setValue('show', false);
  engine.setValue('amount', null);
  engine.setValue('show', true);

  assert.deepEqual(engine.signals.amount.value, { amount: '0', currency: 'USD' });
  assert.equal(typeof engine.signals.amount.value.amount, 'string');
});
