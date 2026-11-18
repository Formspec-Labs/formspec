/** @filedesc Exact JSON number serialization and re-evaluation across public engine APIs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonExact, canonicalJsonBytes } from '@formspec-org/integrity-canonical';
import { FormEngine, evaluateDefinition, parseJsonNumber, planServiceRequest } from '../dist/index.js';
import { interpolateMessage } from '../dist/interpolate-message.js';

const third = '0.3333333333333333333333333333';
const definition = {
  $formspec: '1.0', url: 'urn:test:exact-decimal-json', version: '1.0.0',
  items: [
    { key: 'input', type: 'field', dataType: 'decimal' },
    { key: 'ratio', type: 'field', dataType: 'decimal' },
  ],
  binds: [{ path: 'ratio', calculate: '$input / 3', constraint: '$ > 0' }],
};

test('calculated decimal serializes as an exact JSON number in both APIs', () => {
  const batch = evaluateDefinition(definition, { input: 1 });
  assert.equal(JSON.stringify(batch.data.ratio), third);
  assert.deepEqual(batch.validations, []);
  const engine = new FormEngine(definition);
  engine.setValue('input', 1);
  const response = engine.getResponse({ profile: 'on-submit' });
  assert.equal(JSON.stringify(response.data.ratio), third);
  assert.equal(response.status, 'completed');
});

test('exact numeric input survives reload and arithmetic with stable canonical bytes', () => {
  const data = parseJsonExact(`{"input":${third}}`);
  const def = { ...definition, binds: [{ path: 'ratio', calculate: '$input * 3' }] };
  const result = evaluateDefinition(def, data);
  assert.equal(JSON.stringify(result.data.input), third);
  assert.equal(JSON.stringify(result.data.ratio), '0.9999999999999999999999999999');
  const reloaded = parseJsonExact(JSON.stringify(result.data));
  assert.deepEqual(canonicalJsonBytes(evaluateDefinition(def, reloaded).data), canonicalJsonBytes(result.data));
});

test('numeric-looking strings and objects never acquire numeric authority', () => {
  for (const input of [third, { $type: 'number', value: third }, { rawJSON: third },
    { '$serde_json::private::Number': third }]) {
    const result = evaluateDefinition({ ...definition, binds: [] }, { input });
    assert.ok(result.validations.some(v => v.path === 'input' && v.code === 'TYPE_MISMATCH'));
    assert.deepEqual(result.data.input, input);
  }
});

test('initial values and inline instances preserve exact numbers through definition setup', () => {
  const exact = parseJsonExact(third);
  const engine = new FormEngine({ ...definition,
    items: [{ ...definition.items[0], initialValue: exact }, definition.items[1]],
    instances: { source: { data: { n: exact, large: parseJsonExact('18446744073709551616') }, schema: { n: 'decimal', large: 'integer' } } },
    binds: [{ path: 'ratio', calculate: "instance('source', 'n')" }],
  });
  assert.equal(JSON.stringify(engine.getResponse().data.input), third);
  assert.equal(JSON.stringify(engine.getResponse().data.ratio), third);
  assert.equal(JSON.stringify(engine.compileExpression('$input')()), third);
  assert.equal(JSON.stringify(engine.getInstanceData('source', 'large')), '18446744073709551616');
  engine.setValue('input', third);
  assert.equal(JSON.stringify(engine.getResponse().data.input), third);
  engine.dispose();
});

test('host and HTTP instance readers retain exact numbers and validate their schema', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(`{"n":${third}}`);
    for (const custom of [false, true]) {
      const engine = new FormEngine({ ...definition,
        instances: { source: { source: 'https://example.org/exact', schema: { n: 'decimal' } } },
        binds: [{ path: 'ratio', calculate: "instance('source', 'n')" }],
      }, custom ? { instanceSourceResolver: () => ({ status: 'loaded', value: parseJsonExact(`{"n":${third}}`) }) } : {});
      assert.deepEqual((await engine.waitForInstanceSources()).source, { status: 'loaded' });
      assert.equal(JSON.stringify(engine.getResponse().data.ratio), third);
      engine.dispose();
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('extension identity and template interpolation retain all decimal digits', () => {
  const engine = new FormEngine({ ...definition, binds: [{ path: 'ratio', calculate: 'identity($input)' }] }, {
    extensionFunctions: { identity: { implementation: value => value, minArgs: 1, maxArgs: 1 } },
  });
  engine.setValue('input', third);
  assert.equal(JSON.stringify(engine.getResponse().data.ratio), third);
  assert.equal(engine.compileExpression('string(identity($input))')(), third);
  assert.deepEqual(interpolateMessage('Value: {{$input}}', () => parseJsonExact(third)), {
    text: `Value: ${third}`, warnings: [],
  });
  engine.dispose();
});

test('extension results retain the explicit money and date host protocol', () => {
  const engine = new FormEngine(definition, { extensionFunctions: {
    payment: { implementation: () => ({ $type: 'money', amount: third, currency: 'USD' }) },
    dateValue: { implementation: () => ({ $type: 'date', value: '2026-01-01' }) },
    paymentIdentity: { implementation: value => ({ $type: 'money', ...value }), minArgs: 1, maxArgs: 1 },
  } });
  assert.equal(JSON.stringify(engine.compileExpression('moneyAmount(payment())')()), third);
  assert.equal(engine.compileExpression('dateValue() = @2026-01-01')(), true);
  assert.equal(JSON.stringify(engine.compileExpression(`moneyAmount(paymentIdentity(money(${third}, 'USD')))` )()), third);
  engine.dispose();
});

test('hidden external errors do not block completion and revealed errors do', () => {
  const engine = new FormEngine({ ...definition,
    items: [{ key: 'show', type: 'field', dataType: 'boolean', initialValue: false }, ...definition.items],
    binds: [{ path: 'input', relevant: '$show' }],
  });
  engine.injectExternalValidation([{ path: 'input', severity: 'error', code: 'EXT', message: 'External' }]);
  assert.equal(engine.getValidationReport().valid, true);
  assert.equal(engine.getResponse({ profile: 'on-submit' }).status, 'completed');
  engine.setValue('show', true);
  assert.equal(engine.getValidationReport().valid, false);
  assert.equal(engine.getResponse({ profile: 'on-submit' }).status, 'in-progress');
  engine.dispose();
});

test('repeat display calculations stay out of response data at every path', () => {
  const engine = new FormEngine({ ...definition, items: [{ key: 'rows', type: 'group', repeatable: true, minRepeat: 1,
    children: [{ key: 'n', type: 'field', dataType: 'decimal', initialValue: 1 }, { key: 'label', type: 'display' }] }],
    binds: [{ path: 'rows[*].label', calculate: '$n / 3' }],
  });
  assert.equal(JSON.stringify(engine.signals['rows[0].label'].value), third);
  assert.deepEqual(engine.getResponse().data, { rows: [{ n: 1 }] });
  engine.dispose();
});

test('numeric controls use decimal steps and clamps without changing nearby digits', async () => {
  const { stepJsonNumber, clampJsonNumber, jsonValueText } = await import('../dist/index.js');
  const value = parseJsonExact(third);
  const next = stepJsonNumber(value, parseJsonExact('1e-28'), 1);
  assert.equal(JSON.stringify(next), '0.3333333333333333333333333334');
  assert.equal(stepJsonNumber(value, parseJsonExact('1e-28'), 1, undefined, value), undefined);
  assert.equal(JSON.stringify(clampJsonNumber(third, 0, 1)), third);
  assert.equal(jsonValueText(value), third);
  assert.equal(stepJsonNumber('1e-100', 1, 1), undefined);
  assert.equal(stepJsonNumber('invalid', 1, 1), undefined);
});

test('numeric entry normalizes spelling without rounding and money retains its schema string', () => {
  for (const [input, expected] of [['000.3333333333333333333333333333', third], ['+.5', '0.5'], ['-0002.', '-2'], ['001e-28', '1e-28']]) {
    assert.equal(JSON.stringify(parseJsonNumber(input)), expected);
  }
  const engine = new FormEngine({ ...definition, formPresentation: { defaultCurrency: 'USD' }, items: [{ key: 'amount', type: 'field', dataType: 'money',
    initialValue: parseJsonExact(third) }], binds: [] });
  assert.deepEqual(engine.getResponse().data.amount, { amount: third, currency: 'USD' });
  engine.dispose();
});

test('response snapshot evaluates data and validation with one advancing clock reading', () => {
  let calls = 0;
  const engine = new FormEngine({ ...definition,
    items: [{ key: 'stamp', type: 'field', dataType: 'dateTime' }],
    binds: [{ path: 'stamp', calculate: 'now()', constraint: '$ = now()' }],
  }, { runtimeContext: { now: () => new Date(Date.UTC(2026, 10, 6, 0, 0, calls++)) } });
  const before = calls;
  const snapshot = engine.getResponseSnapshot({ profile: 'on-submit' });
  assert.equal(calls, before + 1);
  assert.equal(snapshot.response.data.stamp.replace(/(?:\.000)?Z$/, ''), snapshot.response.authored.replace(/(?:\.000)?Z$/, ''));
  assert.equal(snapshot.validationReport.timestamp, snapshot.response.authored);
  assert.equal(snapshot.validationReport.valid, true);
  assert.equal(snapshot.response.status, 'completed');
  engine.dispose();
});

test('service request scalar bindings preserve exact digits and reject object lookalikes', () => {
  const request = { id: 'decimal', adapter: 'http-json', request: { method: 'POST', pathTemplate: '/values/{value}',
    pathBindings: { value: { from: 'input', path: 'value' } },
    queryBindings: { value: { from: 'input', path: 'value' } },
    headerBindings: { 'x-value': { from: 'input', path: 'value' } },
  } };
  const planned = planServiceRequest(request, { input: { value: parseJsonExact(third) } });
  assert.equal(decodeURIComponent(planned.path), `/values/${third}?value=${third}`);
  assert.equal(planned.headers['x-value'], third);
  assert.throws(() => planServiceRequest(request, { input: { value: { rawJSON: third } } }), /scalar/);
});

test('migrations preserve and calculate exact numeric fields', async () => {
  const { migrateResponseData } = await import('../dist/engine/response-assembly.js');
  const def = { ...definition, migrations: { from: { '0.9.0': { fieldMap: [
    { source: 'old', target: 'input', transform: 'preserve' },
    { source: 'old', target: 'ratio', transform: 'expression', expression: '$ * 3' },
  ] } } } };
  const output = migrateResponseData(def, parseJsonExact(`{"old":${third}}`), '0.9.0', { nowIso: '2026-11-06T00:00:00Z' });
  assert.equal(JSON.stringify(output.input), third);
  assert.equal(JSON.stringify(output.ratio), '0.9999999999999999999999999999');
});

test('unsupported precision is rejected explicitly at batch and reactive entry points', () => {
  for (const token of ['1e-100', '1e100', '0.123456789012345678901234567891']) {
    const input = parseJsonExact(token);
    // The shared evaluator now carries the range error in a refused result.
    const result = evaluateDefinition(definition, { input });
    assert.equal(result.refused, true);
    assert.equal(result.validations[0].code, 'TYPE_MISMATCH');
    assert.match(result.validations[0].message, /precision or range/);
    const engine = new FormEngine(definition);
    engine.setValue('input', input);
    const report = engine.getValidationReport({ profile: 'on-demand' });
    assert.equal(report.valid, false);
    assert.match(report.results[0].message, /precision or range/);
    engine.dispose();
  }
});
