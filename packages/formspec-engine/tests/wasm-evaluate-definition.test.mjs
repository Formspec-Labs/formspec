/** @filedesc Bridge tests for wasmEvaluateDefinition context threading. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

import {
  wasmApplyMigrationsToResponseData,
  wasmCoerceFieldValue,
  wasmEvaluateDefinition,
  wasmResolveOptionSetsOnDefinition,
} from '../dist/wasm-bridge-runtime.js';
import { wasmRewriteFelForAssembly, wasmTokenizeFel } from '../dist/wasm-bridge-tools.js';

test('cardinality sources agree between WASM and FormEngine reports', () => {
  const definition = {
    $formspec: '1.0', url: 'https://example.org/cardinality-source', version: '1.0.0',
    title: 'Cardinality source',
    items: [{
      key: 'rows', type: 'group', repeatable: true, minRepeat: 2, maxRepeat: 2,
      children: [{ key: 'a', type: 'field', dataType: 'string', label: 'A' }],
    }],
  };
  for (const [rows, code] of [[[], 'MIN_REPEAT'], [[{ a: 'x' }, { a: 'y' }, { a: 'z' }], 'MAX_REPEAT']]) {
    const engine = new FormEngine(definition);
    engine.loadResponseData({ rows });
    for (const trigger of ['continuous', 'submit']) {
      const evaluated = wasmEvaluateDefinition(definition, { rows }, { trigger });
      const raw = evaluated.validations.find((result) => result.code === code);
      assert.ok(raw, `${trigger}: ${code}`);
      assert.equal(Object.hasOwn(raw, 'source'), false);
      const report = engine.getValidationReport({ profile: trigger === 'submit' ? 'on-submit' : 'live' });
      const reported = report.results.find((result) => result.code === code);
      assert.deepEqual(reported, { ...raw, $formspecValidationResult: '1.0' });
      assert.equal(Object.hasOwn(reported, 'source'), false);
      // The evaluator must accept its own source-less findings on the next cycle.
      assert.doesNotThrow(() => wasmEvaluateDefinition(definition, { rows }, {
        trigger, previousValidations: evaluated.validations,
      }));
    }
  }
});

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

test('wasmEvaluateDefinition counts empty rows from Response data for minRepeat', () => {
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

  const omitted = wasmEvaluateDefinition(definition, {});
  assert.ok(
    omitted.validations.some((v) => v.code === 'MIN_REPEAT'),
    'expected MIN_REPEAT when the Response omits the repeat',
  );

  const supplied = wasmEvaluateDefinition(definition, { rows: [{}, {}] });
  assert.equal(
    supplied.validations.filter((v) => v.code === 'MIN_REPEAT').length,
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

test('wasmApplyMigrationsToResponseData applies a core §6.7 fieldMap: preserve and a FEL expression', () => {
  const def = {
    items: [
      { key: 'name', type: 'field', dataType: 'string' },
      { key: 'nickname', type: 'field', dataType: 'string' },
    ],
    migrations: { from: { '1.0.0': { fieldMap: [
      { source: 'givenName', target: 'name', transform: 'preserve' },
      { source: 'givenName', target: 'nickname', transform: 'expression', expression: 'upper($)' },
    ] } } },
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

test('wasmTokenizeFel returns positioned tokens through the JS bridge', () => {
  const tokens = wasmTokenizeFel('if($qty >= 1, $price, 0)');

  assert.ok(tokens.length > 0);
  assert.equal(tokens[0].tokenType, 'If');
  assert.equal(tokens[0].text, 'if');
  assert.equal(typeof tokens[0].start, 'number');
  assert.equal(typeof tokens[0].end, 'number');
});

test('wasmEvaluateDefinition returns itemText only when the context requests it', () => {
  const definition = {
    $formspec: '1.0',
    url: 'http://example.org/wasm-item-text',
    version: '1.0.0',
    title: 'WASM Item text',
    items: [
      { key: 'qty', type: 'field', dataType: 'integer', label: 'Qty {{$qty}}', hint: 'Plain hint' },
    ],
  };

  assert.equal(wasmEvaluateDefinition(definition, { qty: 2 }).itemText, undefined);

  const withText = wasmEvaluateDefinition(definition, { qty: 2 }, {
    itemText: { localeStrings: { 'qty.hint': 'Indice {{$qty}}' } },
  });
  assert.deepEqual(withText.itemText, { qty: { label: 'Qty 2', hint: 'Indice 2' } });
});
