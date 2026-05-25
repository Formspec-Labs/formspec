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

function makeNestedRelevanceDefinition() {
  return {
    $formspec: '1.0',
    url: 'http://example.org/introspection-nested',
    version: '1.0.0',
    title: 'Nested Relevance Fixture',
    items: [
      { key: 'hasHousehold', type: 'field', dataType: 'boolean', label: 'Has household' },
      {
        key: 'household',
        type: 'group',
        label: 'Household',
        children: [
          { key: 'memberName', type: 'field', dataType: 'string', label: 'Member name' },
        ],
      },
    ],
    binds: [
      { path: 'household', relevant: '$hasHousehold = true' },
      { path: 'household.memberName', relevant: 'true' },
    ],
  };
}

function makeVariableFeeDefinition() {
  return {
    $formspec: '1.0',
    url: 'http://example.org/introspection-variable-fee',
    version: '1.0.0',
    title: 'Variable Fee Fixture',
    items: [
      { key: 'income', type: 'field', dataType: 'decimal', label: 'Income' },
      { key: 'fee', type: 'field', dataType: 'decimal', label: 'Fee' },
      { key: 'review', type: 'display', label: 'Review note' },
    ],
    variables: [
      { name: 'taxableIncome', expression: '$income' },
    ],
    binds: [
      { path: 'fee', calculate: '@taxableIncome * 0.1' },
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

test('whyRelevant reports parent hidden reason for nested relevance', () => {
  const engine = new FormEngine(makeNestedRelevanceDefinition());

  engine.setValue('hasHousehold', false);
  const hidden = engine.whyRelevant('household.memberName');

  assert.deepEqual(hidden, {
    bindId: 'household',
    expression: '$hasHousehold = true',
    dependsOn: ['hasHousehold'],
    evaluatedAs: false,
  });
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

test('getDerivationTree traces variable-derived calculated fields with full context', () => {
  const engine = new FormEngine(makeVariableFeeDefinition());

  engine.setValue('income', 200);

  assert.equal(engine.signals.fee.value, 20);
  const trace = engine.getDerivationTree('fee');
  const multiply = trace.find((step) => step.kind === 'BinaryOp' && step.op === '*');
  assert.ok(multiply, `expected multiply trace, got ${JSON.stringify(trace)}`);
  assert.equal(multiply.lhs, 200);
  assert.equal(multiply.rhs, 0.1);
  assert.equal(multiply.result, 20);
});

test('getDownstreamImpact returns transitive dependent paths', () => {
  const engine = new FormEngine(makeDefinition());

  assert.deepEqual(engine.getDownstreamImpact('income'), ['fee', 'review']);
  assert.deepEqual(engine.getDownstreamImpact('hasIncome'), ['fee', 'income', 'review']);
});

test('getDownstreamImpact follows definition variables used by calculated fields', () => {
  const engine = new FormEngine(makeVariableFeeDefinition());

  assert.deepEqual(engine.getDownstreamImpact('income'), ['fee', 'review']);
});
