/** @filedesc Host FEL extension functions (Core §3.12): engine registration reaches every Rust evaluation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine, evaluateDefinition, wasmEvaluateScreenerDocument } from '../dist/index.js';

function definition() {
  return {
    $formspec: '1.0',
    url: 'urn:test:engine-extensions',
    version: '1.0.0',
    title: 'Extensions',
    items: [
      { key: 'qty', type: 'field', dataType: 'integer', label: 'Qty' },
      { key: 'total', type: 'field', dataType: 'integer', label: 'Total' },
    ],
    binds: [
      { path: 'total', calculate: 'double($qty)' },
      { path: 'qty', constraint: 'double($qty) < 10' },
    ],
  };
}

const double = { implementation: (n) => n * 2, minArgs: 1, maxArgs: 1 };

test('extension functions passed at construction evaluate calculates, constraints, and ad-hoc reads', () => {
  const engine = new FormEngine(definition(), { extensionFunctions: { double } });
  engine.setValue('qty', 3);

  assert.equal(engine.signals.total.value, 6);
  assert.deepEqual(engine.getValidationReport().results, []);
  assert.equal(engine.compileExpression('double($qty) + 1')(), 7);

  engine.setValue('qty', 7);
  assert.deepEqual(
    engine.getValidationReport().results.map((r) => r.code),
    ['CONSTRAINT_FAILED'],
  );
});

test('registerExtensionFunction re-evaluates; unregistered calls stay definition errors', () => {
  const engine = new FormEngine(definition());
  engine.setValue('qty', 3);
  assert.deepEqual(
    engine.getValidationReport().results.map((r) => r.code),
    ['UNDEFINED_FUNCTION', 'UNDEFINED_FUNCTION'],
  );

  engine.registerExtensionFunction('double', double);
  assert.equal(engine.signals.total.value, 6);
  assert.deepEqual(engine.getValidationReport().results, []);
});

test('registerExtensionFunction rejects FEL built-in names (Core §3.12 rule 1)', () => {
  const engine = new FormEngine(definition());
  assert.throws(() => engine.registerExtensionFunction('sum', double), /sum/);
});

test('a throwing implementation yields null plus an author diagnostic (Core §3.12)', () => {
  const engine = new FormEngine(definition(), {
    extensionFunctions: {
      double: {
        implementation: () => {
          throw new Error('boom');
        },
      },
    },
  });
  engine.setValue('qty', 3);

  assert.equal(engine.signals.total.value, null);
  const snapshot = engine.getDiagnosticsSnapshot();
  assert.deepEqual(snapshot.validation.counts, { error: 0, warning: 0, info: 0 });
  assert.ok(
    snapshot.evaluationDiagnostics.some((d) => d.path === 'qty' && /boom/.test(d.message)),
    JSON.stringify(snapshot.evaluationDiagnostics),
  );
});

test('a standalone Screener Document routes on host extension functions (Core §3.12)', () => {
  const screener = {
    $formspecScreener: '1.0',
    url: 'urn:test:screener-extensions',
    version: '1.0.0',
    title: 'Extensions Screener',
    items: [{ key: 'headcount', type: 'field', dataType: 'integer', label: 'Headcount' }],
    evaluation: [
      {
        id: 'routing',
        strategy: 'first-match',
        routes: [
          { condition: 'double($headcount) > 10', target: 'urn:forms:large|1.0.0', label: 'Large' },
          { condition: 'true', target: 'urn:forms:small|1.0.0', label: 'Small' },
        ],
      },
    ],
  };
  const answers = { headcount: 6 };
  // The `FelExtensionHost` shape Rust calls: arity lookup plus JSON-in/JSON-out invoke.
  const host = {
    arity: (name) => (name === 'double' ? { minArgs: 1, maxArgs: 1 } : undefined),
    invoke: (name, argsJson) => JSON.stringify(double.implementation(...JSON.parse(argsJson))),
  };

  const withHost = wasmEvaluateScreenerDocument(screener, answers, undefined, host);
  assert.equal(withHost.phases[0].matched[0].target, 'urn:forms:large|1.0.0');
  assert.deepEqual(withHost.phases[0].warnings, []);

  // Without a host the call is a definition error: the route is eliminated and the phase warns.
  const withoutHost = wasmEvaluateScreenerDocument(screener, answers);
  assert.equal(withoutHost.phases[0].matched[0].target, 'urn:forms:small|1.0.0');
  assert.deepEqual(withoutHost.phases[0].warnings, ['fel-expression-error']);
});

test('extension signatures refuse before any Definition expression executes', () => {
  let calls = 0;
  const def = definition();
  def.items[0].initialValue = '=recordCall()';
  const extensionFunctions = {
    double: { minArgs: 2, maxArgs: 2, implementation: () => { calls++; return 0; } },
    recordCall: { minArgs: 0, maxArgs: 0, implementation: () => { calls++; return 3; } },
  };
  const host = { arity: name => extensionFunctions[name], invoke: () => { calls++; return '3'; } };
  const batch = evaluateDefinition(def, {}, undefined, host);
  const engine = new FormEngine(def, { extensionFunctions });
  assert.equal(batch.refused, true);
  for (const findings of [batch.validations, engine.getValidationReport().results]) {
    assert.deepEqual(findings.map(({ path, code }) => [path, code]), [
      ['$.binds[0].calculate', 'ARITY_MISMATCH'],
      ['$.binds[1].constraint', 'ARITY_MISMATCH'],
    ]);
  }
  assert.equal(calls, 0);
  engine.dispose();
});

test('late extension registration retries creation for a new Response', () => {
  const def = definition();
  def.items[0].initialValue = '=double(2)';
  const engine = new FormEngine(def);
  const resumed = new FormEngine(def, { savedResponseData: {} });
  assert.equal(engine.getValidationReport().valid, false);
  assert.equal(engine.signals.qty.value, null);
  engine.registerExtensionFunction('double', double);
  resumed.registerExtensionFunction('double', double);
  assert.deepEqual(engine.getResponse().data, { qty: 4, total: 8 });
  assert.equal(resumed.signals.qty.value, null);
  engine.dispose();
  resumed.dispose();
});
