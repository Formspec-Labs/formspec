/** @filedesc Money arithmetic: FEL money() operations including addition, subtraction, and currency coercion */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

/**
 * Helper: create an engine with a single calculated result field.
 * Optionally provide extra items and binds for multi-field setups.
 */
function engineWithCalc(calculate, dataType = 'string', extraItems = [], extraBinds = []) {
  return new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/money-arithmetic',
    version: '1.0.0',
    title: 'Money Arithmetic',
    items: [
      ...extraItems,
      { key: 'result', type: 'field', dataType, label: 'Result' },
    ],
    binds: [
      ...extraBinds,
      { path: 'result', calculate },
    ],
  });
}

// ── money / number → money ────────────────────────────────────────────

test('money / number produces money with preserved currency', () => {
  const engine = engineWithCalc("money(100, 'USD') / 4");
  const result = engine.signals.result.value;
  assert.deepEqual(result, { amount: '25', currency: 'USD' });
});

// ── money * number → money ────────────────────────────────────────────

test('money * number produces money with preserved currency', () => {
  const engine = engineWithCalc("money(50, 'EUR') * 3");
  const result = engine.signals.result.value;
  assert.deepEqual(result, { amount: '150', currency: 'EUR' });
});

// ── number * money → money ────────────────────────────────────────────

test('number * money produces money (commutative)', () => {
  const engine = engineWithCalc("3 * money(50, 'EUR')");
  const result = engine.signals.result.value;
  assert.deepEqual(result, { amount: '150', currency: 'EUR' });
});

// ── money + money → money (same currency) ─────────────────────────────

test('money + money with same currency adds amounts', () => {
  const engine = engineWithCalc("money(100, 'USD') + money(50, 'USD')");
  const result = engine.signals.result.value;
  assert.deepEqual(result, { amount: '150', currency: 'USD' });
});

// ── money - money → money (same currency) ─────────────────────────────

test('money - money with same currency subtracts amounts', () => {
  const engine = engineWithCalc("money(100, 'USD') - money(30, 'USD')");
  const result = engine.signals.result.value;
  assert.deepEqual(result, { amount: '70', currency: 'USD' });
});

// ── money + number → money ────────────────────────────────────────────

test('money + number adds to amount, preserves currency', () => {
  const engine = engineWithCalc("money(100, 'USD') + 25");
  const result = engine.signals.result.value;
  assert.deepEqual(result, { amount: '125', currency: 'USD' });
});

// ── money - number → money ────────────────────────────────────────────

test('money - number subtracts from amount, preserves currency', () => {
  const engine = engineWithCalc("money(100, 'USD') - 25");
  const result = engine.signals.result.value;
  assert.deepEqual(result, { amount: '75', currency: 'USD' });
});

// ── money % number → money ────────────────────────────────────────────

test('money % number applies modulo to amount, preserves currency', () => {
  const engine = engineWithCalc("money(105, 'USD') % 10");
  const result = engine.signals.result.value;
  assert.deepEqual(result, { amount: '5', currency: 'USD' });
});

// ── money / money → number (unit cancellation) ───────────────────────

test('money / money with same currency yields plain number', () => {
  const engine = engineWithCalc("money(100, 'USD') / money(25, 'USD')");
  const result = engine.signals.result.value;
  assert.equal(result, 4);
});

// ── currency mismatch → null ──────────────────────────────────────────

test('money + money with different currencies returns null', () => {
  const engine = engineWithCalc("money(100, 'USD') + money(50, 'EUR')");
  assert.equal(engine.signals.result.value, null);
});

test('money - money with different currencies returns null', () => {
  const engine = engineWithCalc("money(100, 'USD') - money(50, 'EUR')");
  assert.equal(engine.signals.result.value, null);
});

test('money / money with different currencies returns null', () => {
  const engine = engineWithCalc("money(100, 'USD') / money(50, 'EUR')");
  assert.equal(engine.signals.result.value, null);
});

// ── null propagation ──────────────────────────────────────────────────

test('money op with null left operand returns null', () => {
  // null / number
  const items = [{ key: 'x', type: 'field', dataType: 'money', label: 'X' }];
  const engine = engineWithCalc('x / 4', 'money', items);
  // x is never set, so its value is null
  assert.equal(engine.signals.result.value, null);
});

test('money op with null right operand returns null', () => {
  const items = [{ key: 'x', type: 'field', dataType: 'number', label: 'X' }];
  const engine = engineWithCalc("money(100, 'USD') / x", 'money', items);
  assert.equal(engine.signals.result.value, null);
});

// ── division by zero ──────────────────────────────────────────────────

test('money / 0 returns null', () => {
  const engine = engineWithCalc("money(100, 'USD') / 0");
  assert.equal(engine.signals.result.value, null);
});

test('money % 0 returns null', () => {
  const engine = engineWithCalc("money(100, 'USD') % 0");
  assert.equal(engine.signals.result.value, null);
});

test('money / money(0) returns null', () => {
  const engine = engineWithCalc("money(100, 'USD') / money(0, 'USD')");
  assert.equal(engine.signals.result.value, null);
});

// ── field-based money arithmetic (realistic scenario) ─────────────────

test('money field divided by number field produces money result', () => {
  const items = [
    { key: 'amount', type: 'field', dataType: 'money', label: 'Amount' },
    { key: 'duration', type: 'field', dataType: 'number', label: 'Duration' },
  ];
  const engine = engineWithCalc('amount / duration', 'money', items);
  engine.setValue('amount', { amount: 100000, currency: 'USD' });
  engine.setValue('duration', 12);
  const result = engine.signals.result.value;
  assert.ok(result && typeof result === 'object');
  assert.ok(Math.abs(result.amount - 100000 / 12) < 0.001);
  assert.equal(result.currency, 'USD');
});

// ── array broadcasting with money ─────────────────────────────────────

test('money array * scalar broadcasts element-wise', () => {
  const engine = engineWithCalc("[money(10, 'USD'), money(20, 'USD')] * 2");
  assert.deepEqual(engine.signals.result.value, [
    { amount: '20', currency: 'USD' },
    { amount: '40', currency: 'USD' },
  ]);
});

test('scalar * money array broadcasts element-wise', () => {
  const engine = engineWithCalc("2 * [money(10, 'USD'), money(20, 'USD')]");
  assert.deepEqual(engine.signals.result.value, [
    { amount: '20', currency: 'USD' },
    { amount: '40', currency: 'USD' },
  ]);
});

// ── existing number arithmetic still works ────────────────────────────

test('plain number arithmetic is unaffected', () => {
  const engine = engineWithCalc('100 / 4');
  assert.equal(engine.signals.result.value, 25);
});

test('plain number addition is unaffected', () => {
  const engine = engineWithCalc('100 + 50');
  assert.equal(engine.signals.result.value, 150);
});
