/** @filedesc FEL date functions: empty-string and null inputs to date(), today(), and date arithmetic */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../../dist/index.js';
import { wasmEvalFEL } from '../../dist/wasm-bridge-runtime.js';

function evalFel(expr) {
  return wasmEvalFEL(expr);
}

function engineWithCalc(calculate, dataType = 'string') {
  return new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Date Empty Null Test',
    items: [{ key: 'result', type: 'field', dataType, label: 'Result' }],
    binds: [{ path: 'result', calculate }]
  });
}

// A2: date("") throws instead of returning null

test('date("") returns null directly from WASM evaluation (does not throw)', () => {
  // This is the core regression: date("") should return null, not throw.
  assert.doesNotThrow(() => {
    const result = evalFel('date("")');
    assert.equal(result, null);
  });
});

test('date("") evaluated via WASM returns null', () => {
  const result = evalFel('date("")');
  assert.equal(result, null);
});

test('date(null) still returns null', () => {
  const result = evalFel('date(null)');
  assert.equal(result, null);
});

test('date("2025-05-20") still returns the date string', () => {
  const result = evalFel("date('2025-05-20')");
  assert.equal(result, '2025-05-20');
});

test('date("") via FormEngine calculate returns null without throwing', () => {
  assert.doesNotThrow(() => {
    const e = engineWithCalc('date("")', 'date');
    assert.equal(e.signals.result.value, null);
  });
});

test('date($dob) returns null when dob field is empty string', () => {
  // This is the actual smoke test scenario: dob is "" during reactive init
  // before instance pre-pop resolves. date("") must return null, not throw.
  const e = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Age Calc Test',
    items: [
      { key: 'dob', type: 'field', dataType: 'date', label: 'DOB' },
      { key: 'dobParsed', type: 'field', dataType: 'string', label: 'DOB Parsed' }
    ],
    binds: [
      { path: 'dobParsed', calculate: "date($dob)" }
    ]
  });
  // dob is not set (undefined/null), so date(null) should return null
  assert.equal(e.signals.dobParsed.value, null);

  // When dob is explicitly set to empty string, date("") should also return null
  e.setValue('dob', '');
  assert.equal(e.signals.dobParsed.value, null);
});
