/** @filedesc Tests for locale {{expr}} interpolation (spec §3.3.1). */

import test from 'node:test';
import assert from 'node:assert/strict';
import { interpolateMessage } from '../dist/interpolate-message.js';
import { wasmEvalFELWithContextEnvelope } from '../dist/wasm-bridge-runtime.js';

// --- Basic interpolation ---

test('interpolates a single expression', () => {
  const { text, warnings } = interpolateMessage('Hello {{name}}', (expr) => {
    assert.equal(expr, 'name');
    return 'World';
  });
  assert.equal(text, 'Hello World');
  assert.equal(warnings.length, 0);
});

test('passes through plain text unchanged', () => {
  const { text, warnings } = interpolateMessage('plain text', () => {
    throw new Error('should not be called');
  });
  assert.equal(text, 'plain text');
  assert.equal(warnings.length, 0);
});

test('interpolates multiple expressions', () => {
  const vals = { a: 'foo', b: 'bar' };
  const { text } = interpolateMessage('{{a}} and {{b}}', (expr) => vals[expr]);
  assert.equal(text, 'foo and bar');
});

test('interpolates adjacent expressions', () => {
  const vals = { a: 'X', b: 'Y' };
  const { text } = interpolateMessage('{{a}}{{b}}', (expr) => vals[expr]);
  assert.equal(text, 'XY');
});

// --- Escape (Rule 1): {{{{ → literal {{ ---

test('escape: {{{{ produces literal {{', () => {
  // Spec §3.3.1 only defines {{{{ escape (not }}}}), so }}}} stays as-is
  const { text } = interpolateMessage('Use {{{{expr}}}} syntax', () => 'REPLACED');
  assert.equal(text, 'Use {{expr}}}} syntax');
});

test('escape: standalone {{{{ without closing', () => {
  const { text } = interpolateMessage('literal {{{{ here', () => {
    throw new Error('should not be called');
  });
  assert.equal(text, 'literal {{ here');
});

// --- Coercion (Rule 3) ---

test('coercion: null → empty string when expression binds $ or @', () => {
  const { text } = interpolateMessage('val={{$x}}', () => null);
  assert.equal(text, 'val=');
});

test('coercion: undefined → empty string when expression binds $', () => {
  const { text } = interpolateMessage('val={{$x}}', () => undefined);
  assert.equal(text, 'val=');
});

test('locale §3.3.1 rule 3a: null without $/@ preserves non-static literal', () => {
  const { text } = interpolateMessage('x {{!!!bad}} y', () => null);
  assert.equal(text, 'x {{!!!bad}} y');
});

test('locale §3.3.1: null for static literal still becomes empty', () => {
  const { text } = interpolateMessage('v={{null}}', () => null);
  assert.equal(text, 'v=');
});

test('coercion: true → "true"', () => {
  const { text } = interpolateMessage('{{x}}', () => true);
  assert.equal(text, 'true');
});

test('coercion: false → "false"', () => {
  const { text } = interpolateMessage('{{x}}', () => false);
  assert.equal(text, 'false');
});

test('coercion: integer → string', () => {
  const { text } = interpolateMessage('count={{x}}', () => 42);
  assert.equal(text, 'count=42');
});

test('coercion: float → string', () => {
  const { text } = interpolateMessage('pi={{x}}', () => 3.14);
  assert.equal(text, 'pi=3.14');
});

// --- Error recovery (Rule 2): failed eval → literal preserved + warning ---

test('error recovery: evaluator throw preserves literal and emits warning', () => {
  const { text, warnings } = interpolateMessage('hi {{badExpr}} there', () => {
    throw new Error('eval failed');
  });
  assert.equal(text, 'hi {{badExpr}} there');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].expression, 'badExpr');
  assert.equal(warnings[0].error, 'eval failed');
});

test('error recovery: one expression fails, others succeed', () => {
  const { text, warnings } = interpolateMessage('{{ok}} {{bad}}', (expr) => {
    if (expr === 'bad') throw new Error('nope');
    return 'good';
  });
  assert.equal(text, 'good {{bad}}');
  assert.equal(warnings.length, 1);
});

// --- Non-recursive (Rule 5): replacement text not re-scanned ---

test('non-recursive: replacement containing {{ is not re-evaluated', () => {
  const { text } = interpolateMessage('{{x}}', () => '{{nested}}');
  assert.equal(text, '{{nested}}');
});

// --- Edge cases ---

test('empty template string', () => {
  const { text } = interpolateMessage('', () => {
    throw new Error('should not be called');
  });
  assert.equal(text, '');
});

test('empty expression {{}} calls evaluator with empty string', () => {
  let called = false;
  const { text, warnings } = interpolateMessage('a{{}}b', (expr) => {
    called = true;
    assert.equal(expr, '');
    return 'X';
  });
  assert.equal(called, true);
  assert.equal(text, 'aXb');
  assert.equal(warnings.length, 0);
});

test('expression with whitespace is preserved (not trimmed)', () => {
  let captured;
  interpolateMessage('{{ name }}', (expr) => {
    captured = expr;
    return 'val';
  });
  assert.equal(captured, ' name ');
});

test('unmatched {{ with no closing }} is left as-is', () => {
  const { text } = interpolateMessage('open {{ but no close', () => {
    throw new Error('should not be called');
  });
  assert.equal(text, 'open {{ but no close');
});

test('single } inside expression: {{a}b}} extracts correctly', () => {
  // {{a}b}} should match "a}b" as the expression (greedy inner })
  let captured;
  const { text } = interpolateMessage('{{a}b}}', (expr) => {
    captured = expr;
    return 'R';
  });
  assert.equal(captured, 'a}b');
  assert.equal(text, 'R');
});

// --- Rule 2: error-severity diagnostics (in-band on WASM eval envelope) ---

test('rule 2: WASM error diagnostics preserve literal even with $ sigil', () => {
  // $amount + "text" → type error diagnostic (number + string), result is null
  // Because there are error diagnostics, rule 2 should preserve the literal
  // even though the expression contains $
  const { text, warnings } = interpolateMessage(
    'Total: {{$amount + "text"}}',
    (expr) => wasmEvalFELWithContextEnvelope(expr, { fields: { amount: 42 } }),
  );
  assert.equal(text, 'Total: {{$amount + "text"}}');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].error, /diagnostics/i);
});

test('rule 2: WASM eval without diagnostics proceeds normally', () => {
  // Normal evaluation: no diagnostics, value is 42
  const { text, warnings } = interpolateMessage(
    'Total: {{$amount}}',
    (expr) => wasmEvalFELWithContextEnvelope(expr, { fields: { amount: 42 } }),
  );
  assert.equal(text, 'Total: 42');
  assert.equal(warnings.length, 0);
});
