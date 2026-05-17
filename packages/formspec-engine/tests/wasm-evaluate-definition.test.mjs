/** @filedesc Bridge tests for wasmEvaluateDefinition context threading. */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  wasmApplyMigrationsToResponseData,
  wasmCoerceFieldValue,
  wasmEvaluateDefinition,
  wasmPrepareFelExpression,
  wasmResolveOptionSetsOnDefinition,
} from '../dist/wasm-bridge-runtime.js';
import { wasmRewriteFelForAssembly, wasmTokenizeFEL } from '../dist/wasm-bridge-tools.js';

test('wasmEvaluateDefinition forwards previousValidations to the batch evaluator', () => {
  const definition = {
    $formspec: '1.0',
    url: 'http://example.org/wasm-eval',
    version: '1.0.0',
    title: 'WASM Eval',
    items: [
      { key: 'age', type: 'field', dataType: 'decimal', label: 'Age' },
      { key: 'ageStatus', type: 'field', dataType: 'string', label: 'Status' },
    ],
    binds: [
      { path: 'age', constraint: '$age >= 0', required: 'true' },
      { path: 'ageStatus', calculate: "if(valid($age), 'ok', 'invalid')" },
    ],
  };

  const first = wasmEvaluateDefinition(definition, {});
  const second = wasmEvaluateDefinition(definition, {}, {
    previousValidations: first.validations,
  });

  assert.equal(second.values.ageStatus, 'invalid');
});

test('wasmEvaluateDefinition uses repeatCounts for minRepeat when flat values are sparse', () => {
  const definition = {
    $formspec: '1.0',
    url: 'http://example.org/wasm-repeat',
    version: '1.0.0',
    title: 'Repeat counts',
    items: [
      {
        key: 'rows',
        type: 'group',
        repeatable: true,
        minRepeat: 2,
        children: [
          { key: 'a', type: 'field', dataType: 'string', label: 'A' },
        ],
      },
    ],
  };

  const withoutCounts = wasmEvaluateDefinition(definition, {});
  assert.ok(
    withoutCounts.validations.some((v) => v.code === 'MIN_REPEAT'),
    'expected MIN_REPEAT when repeatCounts omitted and data empty',
  );

  const withCounts = wasmEvaluateDefinition(definition, {}, { repeatCounts: { rows: 2 } });
  assert.equal(
    withCounts.validations.filter((v) => v.code === 'MIN_REPEAT').length,
    0,
  );
});

test('wasmEvaluateDefinition returns shapeId and context for failing shape validations', () => {
  const definition = {
    $formspec: '1.0',
    url: 'http://example.org/wasm-shape-context',
    version: '1.0.0',
    title: 'WASM Shape Context',
    items: [
      { key: 'budget', type: 'field', dataType: 'decimal', label: 'Budget' },
      { key: 'spent', type: 'field', dataType: 'decimal', label: 'Spent' },
    ],
    shapes: [{
      id: 'budget-check',
      targets: ['spent'],
      constraint: '$spent <= $budget',
      constraintMessage: 'Over budget',
      context: {
        remaining: '$budget - $spent',
        overBy: '$spent - $budget',
      },
    }],
  };

  const result = wasmEvaluateDefinition(definition, {
    budget: 100,
    spent: 150,
  });
  const validation = result.validations.find((entry) => entry.shapeId === 'budget-check');

  assert.ok(validation);
  assert.deepEqual(validation.context, {
    remaining: -50,
    overBy: 50,
  });
});

test('wasmResolveOptionSetsOnDefinition inlines options from optionSets', () => {
  const def = {
    items: [
      { key: 'c', type: 'field', dataType: 'choice', label: 'C', optionSet: 'os' },
    ],
    optionSets: {
      os: [{ value: 'a', label: 'A' }],
    },
  };
  const out = JSON.parse(wasmResolveOptionSetsOnDefinition(JSON.stringify(def)));
  assert.equal(out.items[0].options.length, 1);
  assert.equal(out.items[0].options[0].value, 'a');
});

test('wasmApplyMigrationsToResponseData runs rename and FEL transform', () => {
  const def = {
    migrations: [
      {
        fromVersion: '1.0.0',
        changes: [
          { type: 'rename', from: 'givenName', to: 'name' },
          { type: 'transform', path: 'nickname', expression: 'upper(name)' },
        ],
      },
    ],
  };
  const data = { givenName: 'alice', nickname: 'legacy' };
  const out = JSON.parse(
    wasmApplyMigrationsToResponseData(
      JSON.stringify(def),
      JSON.stringify(data),
      '1.0.0',
      '2020-01-01T00:00:00Z',
    ),
  );
  assert.equal(out.name, 'alice');
  assert.equal(out.nickname, 'ALICE');
});

test('wasmRewriteFelForAssembly rewrites fragment root and prefixes imported keys', () => {
  const map = JSON.stringify({
    fragmentRootKey: 'budget',
    hostGroupKey: 'projectBudget',
    importedKeys: ['budget', 'amount'],
    keyPrefix: 'proj_',
  });
  assert.equal(wasmRewriteFelForAssembly('$budget.amount', map), '$projectBudget.proj_amount');
});

test('wasmCoerceFieldValue matches engine coercion for decimal + precision', () => {
  const item = JSON.stringify({ dataType: 'decimal' });
  const bind = JSON.stringify({ precision: 2 });
  const definition = JSON.stringify({});
  const value = JSON.stringify('3.14159');
  const out = JSON.parse(wasmCoerceFieldValue(item, bind, definition, value));
  assert.equal(out, 3.14);
});

test('wasmPrepareFelExpression matches repeat-alias normalization', () => {
  const out = wasmPrepareFelExpression(
    JSON.stringify({
      expression: 'rows.score + $rows.score',
      valuesByPath: { 'rows[0].score': 1, 'rows[1].score': 2 },
    }),
  );
  assert.equal(out, '$rows[*].score + $rows[*].score');
});

test('wasmPrepareFelExpression does not splice repeat alias after a dot', () => {
  const out = wasmPrepareFelExpression(
    JSON.stringify({
      expression: 'x.rows.score',
      valuesByPath: { 'rows[0].score': 1, 'rows[1].score': 2 },
    }),
  );
  assert.equal(out, 'x.rows.score');
});

test('wasmTokenizeFEL returns positioned tokens through the JS bridge', () => {
  const tokens = wasmTokenizeFEL('if($qty >= 1, $price, 0)');

  assert.ok(tokens.length > 0);
  assert.equal(tokens[0].tokenType, 'If');
  assert.equal(tokens[0].text, 'if');
  assert.equal(typeof tokens[0].start, 'number');
  assert.equal(typeof tokens[0].end, 'number');
});
