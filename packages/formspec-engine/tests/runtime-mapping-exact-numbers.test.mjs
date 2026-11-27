/** @filedesc Exact lexical numeric preservation across RuntimeMappingEngine JSON, CSV, and XML outputs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import {
  RuntimeMappingEngine,
  initFormspecEngine,
  initFormspecEngineTools,
  jsonNumberText,
} from '../dist/index.js';

await initFormspecEngine();
await initFormspecEngineTools();

const HIGH_PREC_DEC = '1.000000000000000000009';
const UNSAFE_INT = '9007199254740993';
const NEG_UNSAFE_INT = '-9007199254740993';
const OVER_U64_INT = '18446744073709551616';

function sampleSource() {
  const parsed = parseJsonExact(
    `{"d":${HIGH_PREC_DEC},"big":${UNSAFE_INT},"negBig":${NEG_UNSAFE_INT},"huge":${OVER_U64_INT},"ordinary":42.5,"decStr":"${HIGH_PREC_DEC}","zero":0,"blank":"","nil":null}`,
  );
  parsed.trailing = JSON.rawJSON('12.50');
  parsed.zeroDec = JSON.rawJSON('0.00');
  return parsed;
}

const baseRules = [
  { sourcePath: 'd', targetPath: 'd', transform: 'preserve' },
  { sourcePath: 'big', targetPath: 'big', transform: 'preserve' },
  { sourcePath: 'negBig', targetPath: 'negBig', transform: 'preserve' },
  { sourcePath: 'huge', targetPath: 'huge', transform: 'preserve' },
  { sourcePath: 'trailing', targetPath: 'trailing', transform: 'preserve' },
  { sourcePath: 'zeroDec', targetPath: 'zeroDec', transform: 'preserve' },
  { sourcePath: 'ordinary', targetPath: 'ordinary', transform: 'preserve' },
  { sourcePath: 'decStr', targetPath: 'decStr', transform: 'preserve' },
  { sourcePath: 'zero', targetPath: 'zero', transform: 'preserve' },
  { sourcePath: 'blank', targetPath: 'blank', transform: 'preserve' },
  { sourcePath: 'nil', targetPath: 'nil', transform: 'preserve' },
];

test('JSON preserve keeps high-precision decimal, unsafe integers, lexical trailing zeros, zero, and blanks', () => {
  const mapper = new RuntimeMappingEngine({
    adapters: { json: { sortKeys: true, nullHandling: 'omit' } },
    rules: baseRules,
  });
  const result = mapper.forward(sampleSource());
  assert.deepEqual(result.diagnostics, []);
  assert.equal(jsonNumberText(result.output.d), HIGH_PREC_DEC);
  assert.equal(jsonNumberText(result.output.big), UNSAFE_INT);
  assert.equal(jsonNumberText(result.output.negBig), NEG_UNSAFE_INT);
  assert.equal(jsonNumberText(result.output.huge), OVER_U64_INT);
  assert.equal(jsonNumberText(result.output.trailing), '12.50');
  assert.equal(jsonNumberText(result.output.zeroDec), '0.00');
  assert.equal(result.output.ordinary, 42.5);
  assert.equal(result.output.decStr, HIGH_PREC_DEC);
  assert.equal(result.output.zero, 0);
  assert.equal(result.output.blank, '');
  assert.equal('nil' in result.output, false);

  const wire = JSON.stringify(result.output);
  assert.ok(wire.includes(`"d":${HIGH_PREC_DEC}`), wire);
  assert.ok(wire.includes(`"big":${UNSAFE_INT}`), wire);
  assert.ok(wire.includes(`"negBig":${NEG_UNSAFE_INT}`), wire);
  assert.ok(wire.includes(`"huge":${OVER_U64_INT}`), wire);
  assert.ok(wire.includes('"trailing":12.50'), wire);
  assert.ok(wire.includes('"zeroDec":0.00'), wire);
  assert.ok(wire.includes(`"decStr":"${HIGH_PREC_DEC}"`), wire);
});

test('CSV preserve retains exact numeric columns, unsafe integers, zero, and blank cells', () => {
  const mapper = new RuntimeMappingEngine({
    adapters: { csv: { lineEnding: 'lf' } },
    rules: baseRules,
  });
  const result = mapper.forward(sampleSource());
  assert.deepEqual(result.diagnostics, []);
  const [headerLine, valueLine] = result.output.split('\n');
  const headers = headerLine.split(',');
  const values = valueLine.split(',');
  const byCol = Object.fromEntries(headers.map((h, idx) => [h, values[idx]]));

  assert.equal(byCol.d, HIGH_PREC_DEC);
  assert.equal(byCol.big, UNSAFE_INT);
  assert.equal(byCol.negBig, NEG_UNSAFE_INT);
  assert.equal(byCol.huge, OVER_U64_INT);
  assert.equal(byCol.trailing, '12.50');
  assert.equal(byCol.zeroDec, '0.00');
  assert.equal(byCol.ordinary, '42.5');
  assert.equal(byCol.decStr, HIGH_PREC_DEC);
  assert.equal(byCol.zero, '0');
  assert.equal(byCol.blank, '');
  assert.equal(byCol.nil, '');
});

test('XML preserve emits flat exact numeric text and attributes without nested rawJSON elements', () => {
  const mapper = new RuntimeMappingEngine({
    adapters: { xml: { rootElement: 'record', declaration: false, indent: 0 } },
    rules: [
      ...baseRules,
      { sourcePath: 'big', targetPath: 'meta.@seq', transform: 'preserve' },
      { sourcePath: 'd', targetPath: 'meta.rate', transform: 'preserve' },
    ],
  });
  const result = mapper.forward(sampleSource());
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.output.includes('<rawJSON>'), false, result.output);
  assert.ok(result.output.includes(`<d>${HIGH_PREC_DEC}</d>`), result.output);
  assert.ok(result.output.includes(`<big>${UNSAFE_INT}</big>`), result.output);
  assert.ok(result.output.includes(`<negBig>${NEG_UNSAFE_INT}</negBig>`), result.output);
  assert.ok(result.output.includes(`<huge>${OVER_U64_INT}</huge>`), result.output);
  assert.ok(result.output.includes('<trailing>12.50</trailing>'), result.output);
  assert.ok(result.output.includes('<zeroDec>0.00</zeroDec>'), result.output);
  assert.ok(result.output.includes('<ordinary>42.5</ordinary>'), result.output);
  assert.ok(result.output.includes(`<decStr>${HIGH_PREC_DEC}</decStr>`), result.output);
  assert.ok(result.output.includes('<zero>0</zero>'), result.output);
  assert.ok(result.output.includes('<blank></blank>'), result.output);
  assert.ok(result.output.includes('<nil></nil>'), result.output);
  assert.ok(result.output.includes(`<meta seq="${UNSAFE_INT}"><rate>${HIGH_PREC_DEC}</rate></meta>`), result.output);
});

test('repeat rows preserve exact decimals, unsafe integers, zero, and blanks in JSON and XML', () => {
  const rowsSource = parseJsonExact(
    `{"rows":[{"d":${HIGH_PREC_DEC},"big":${UNSAFE_INT},"z":0,"blank":""},{"d":0.3333333333333333333333333333,"big":${OVER_U64_INT},"z":0,"blank":null}]}`,
  );
  const rules = [{
    sourcePath: 'rows',
    targetPath: 'entries',
    transform: 'preserve',
    array: {
      mode: 'each',
      rules: [
        { sourcePath: 'd', targetPath: 'd', transform: 'preserve' },
        { sourcePath: 'big', targetPath: 'big', transform: 'preserve' },
        { sourcePath: 'z', targetPath: 'z', transform: 'preserve' },
        { sourcePath: 'blank', targetPath: 'blank', transform: 'preserve' },
      ],
    },
  }];

  const jsonResult = new RuntimeMappingEngine({ rules }).forward(rowsSource);
  assert.deepEqual(jsonResult.diagnostics, []);
  assert.equal(jsonNumberText(jsonResult.output.entries[0].d), HIGH_PREC_DEC);
  assert.equal(jsonNumberText(jsonResult.output.entries[0].big), UNSAFE_INT);
  assert.equal(jsonResult.output.entries[0].z, 0);
  assert.equal(jsonResult.output.entries[0].blank, '');
  assert.equal(jsonNumberText(jsonResult.output.entries[1].d), '0.3333333333333333333333333333');
  assert.equal(jsonNumberText(jsonResult.output.entries[1].big), OVER_U64_INT);
  assert.equal(jsonResult.output.entries[1].blank, null);

  const xmlResult = new RuntimeMappingEngine({
    adapters: { xml: { rootElement: 'report', declaration: false, indent: 0 } },
    rules,
  }).forward(rowsSource);
  assert.deepEqual(xmlResult.diagnostics, []);
  assert.equal(xmlResult.output.includes('[object Object]'), false, xmlResult.output);
  assert.equal(xmlResult.output.includes('<rawJSON>'), false, xmlResult.output);
  assert.ok(
    xmlResult.output.includes(
      `<entries><d>${HIGH_PREC_DEC}</d><big>${UNSAFE_INT}</big><z>0</z><blank></blank></entries>`,
    ),
    xmlResult.output,
  );
  assert.ok(
    xmlResult.output.includes(
      `<entries><d>0.3333333333333333333333333333</d><big>${OVER_U64_INT}</big><z>0</z><blank></blank></entries>`,
    ),
    xmlResult.output,
  );
});

test('reverse, autoMap, sourceSchema, and conditional preserve rules maintain exact precision without clobbering constants', () => {
  const src = parseJsonExact(`{"d":${HIGH_PREC_DEC},"big":${UNSAFE_INT},"flag":true}`);

  // Reverse direction
  const bidirectional = new RuntimeMappingEngine({
    rules: [
      { sourcePath: 'in.d', targetPath: 'd', transform: 'preserve', bidirectional: true },
      { sourcePath: 'in.big', targetPath: 'big', transform: 'preserve', bidirectional: true },
    ],
  });
  const rev = bidirectional.reverse(src);
  assert.equal(jsonNumberText(rev.output.in.d), HIGH_PREC_DEC);
  assert.equal(jsonNumberText(rev.output.in.big), UNSAFE_INT);

  // autoMap
  const auto = new RuntimeMappingEngine({ autoMap: true, rules: [] }).forward(src);
  assert.equal(jsonNumberText(auto.output.d), HIGH_PREC_DEC);
  assert.equal(jsonNumberText(auto.output.big), UNSAFE_INT);

  // External sourceSchema (tools WASM path)
  const schemaDoc = {
    $formspecMapping: '1.0',
    version: '1.0.0',
    sourceSchema: {
      url: 'urn:example:exact-source',
      version: '1.0.0',
      schema: {
        type: 'object',
        required: ['d', 'big'],
        properties: { d: { type: 'number' }, big: { type: 'integer' }, flag: { type: 'boolean' } },
      },
    },
    targetSchema: { format: 'json' },
    rules: [
      { sourcePath: 'd', targetPath: 'd', transform: 'preserve' },
      { sourcePath: 'big', targetPath: 'big', transform: 'preserve' },
    ],
  };
  const schemaRes = new RuntimeMappingEngine(schemaDoc).forward(src);
  assert.deepEqual(schemaRes.diagnostics, []);
  assert.equal(jsonNumberText(schemaRes.output.d), HIGH_PREC_DEC);
  assert.equal(jsonNumberText(schemaRes.output.big), UNSAFE_INT);

  // Conditional preserve referencing the exact number + false condition must not overwrite a constant 1
  const conditional = new RuntimeMappingEngine({
    rules: [
      { sourcePath: 'd', targetPath: 'kept', transform: 'preserve', condition: '@source.d > 0' },
      { targetPath: 'constOne', transform: 'constant', expression: '1', priority: 10 },
      { sourcePath: 'd', targetPath: 'constOne', transform: 'preserve', condition: '@source.d < 0', priority: 5 },
    ],
  }).forward(src);
  assert.equal(jsonNumberText(conditional.output.kept), HIGH_PREC_DEC);
  assert.equal(conditional.output.constOne, 1);
  assert.equal(JSON.stringify(conditional.output.constOne), '1');
});
