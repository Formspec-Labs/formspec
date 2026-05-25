/** @filedesc Engine introspection API: relevance reasons, derivation traces, and downstream impact */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

function makeDefinition() {
  return {
    $formspec: '1.0',
    url: 'http://example.org/introspection',
    version: '1.0.0',
    title: 'Introspection Fixture',
    items: [
      { key: 'hasIncome', type: 'field', dataType: 'boolean', label: 'Has income' },
      { key: 'income', type: 'field', dataType: 'decimal', label: 'Income' },
      { key: 'fee', type: 'field', dataType: 'decimal', label: 'Fee' },
      { key: 'review', type: 'display', label: 'Review note' },
    ],
    binds: [
      { path: 'income', relevant: '$hasIncome = true' },
      { path: 'fee', calculate: '$income * 0.1' },
      { path: 'review', relevant: '$fee > 10' },
    ],
  };
}

test('whyRelevant returns the governing relevance expression and dependencies', () => {
  const engine = new FormEngine(makeDefinition());

  engine.setValue('hasIncome', false);
  const hidden = engine.whyRelevant('income');
  assert.deepEqual(hidden, {
    bindId: 'income',
    expression: '$hasIncome = true',
    dependsOn: ['hasIncome'],
    evaluatedAs: false,
  });

  engine.setValue('hasIncome', true);
  const visible = engine.whyRelevant('income');
  assert.equal(visible.evaluatedAs, true);
});

test('getDerivationTree returns traced FEL steps for calculated fields', () => {
  const engine = new FormEngine(makeDefinition());

  engine.setValue('hasIncome', true);
  engine.setValue('income', 200);

  const trace = engine.getDerivationTree('fee');
  assert.ok(trace.length > 0, 'expected a non-empty derivation trace');
  assert.ok(trace.some((step) => step.kind === 'FieldResolved' && step.path === 'income'));
  assert.deepEqual(engine.getDerivationTree('hasIncome'), []);
});

test('getDownstreamImpact returns transitive dependent paths', () => {
  const engine = new FormEngine(makeDefinition());

  assert.deepEqual(engine.getDownstreamImpact('income'), ['fee', 'review']);
  assert.deepEqual(engine.getDownstreamImpact('hasIncome'), ['fee', 'income', 'review']);
});
