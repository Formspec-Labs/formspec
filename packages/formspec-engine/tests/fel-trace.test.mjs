/** @filedesc FEL trace bridge — wasmEvalFELWithTrace round-trips Rust TraceStep shape to TS. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { wasmEvalFELWithTrace } from '../dist/wasm-bridge-runtime.js';

test('trace: $a + $b emits two FieldResolved + one BinaryOp', () => {
  const result = wasmEvalFELWithTrace('$a + $b', { a: 3, b: 4 });
  assert.equal(result.value, 7);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.trace.length, 3, `got trace ${JSON.stringify(result.trace)}`);

  assert.equal(result.trace[0].kind, 'FieldResolved');
  assert.equal(result.trace[0].path, 'a');
  assert.equal(result.trace[0].value, 3);

  assert.equal(result.trace[1].kind, 'FieldResolved');
  assert.equal(result.trace[1].path, 'b');
  assert.equal(result.trace[1].value, 4);

  assert.equal(result.trace[2].kind, 'BinaryOp');
  assert.equal(result.trace[2].op, '+');
  assert.equal(result.trace[2].lhs, 3);
  assert.equal(result.trace[2].rhs, 4);
  assert.equal(result.trace[2].result, 7);
});

test('trace: if($x > 0, ..., ...) records IfBranch with selected branch', () => {
  const result = wasmEvalFELWithTrace("if($x > 0, 'pos', 'neg')", { x: 5 });
  assert.equal(result.value, 'pos');
  const ifStep = result.trace.find((s) => s.kind === 'IfBranch');
  assert.ok(ifStep, `expected IfBranch, got ${JSON.stringify(result.trace)}`);
  assert.equal(ifStep.branch_taken, 'then');
  assert.equal(ifStep.condition_value, true);
});

test('trace: false and $undef short-circuits and skips undefined ref', () => {
  const result = wasmEvalFELWithTrace('false and $undefined', {});
  const short = result.trace.find((s) => s.kind === 'ShortCircuit' && s.op === 'and');
  assert.ok(short, `expected ShortCircuit, got ${JSON.stringify(result.trace)}`);
  const rightResolved = result.trace.find(
    (s) => s.kind === 'FieldResolved' && s.path === 'undefined',
  );
  assert.equal(rightResolved, undefined, 'right side must not resolve');
});

test('trace: parse error throws', () => {
  assert.throws(() => wasmEvalFELWithTrace('1 +', {}));
});
