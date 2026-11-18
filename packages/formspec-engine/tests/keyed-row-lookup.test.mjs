/** @filedesc Keyed row lookup through the browser runtime and authoring tools. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { evalFELWithTrace } from '../dist/fel/fel-api-runtime.js';
import { rewriteFELReferences } from '../dist/fel/fel-api-tools.js';
import { wasmExtractDependencies } from '../dist/wasm-bridge-tools.js';
import { FormEngine, evaluateDefinition } from '../dist/index.js';

const suite = new URL('../../../tests/conformance/suite/', import.meta.url);
const readCase = (name) => JSON.parse(readFileSync(new URL(name, suite), 'utf8'));
const subjectDefinition = readCase('fixtures/fel-keyed-row-subject.definition.json');
const subject = { id: 'filing-unit', type: 'urn:example:agency', keys: { id: 'A' } };

for (const name of ['unique', 'missing', 'duplicate', 'unavailable']) {
  const scenario = readCase(`fel-keyed-row-${name}.json`);
  test(`subject-keyed row lookup: ${name}`, () => {
    const { rows } = scenario.inputData;
    const instance = rows ? { rows } : null;
    const batch = evaluateDefinition(subjectDefinition, {}, {
      subjectType: subject.type, subjectKeys: subject.keys, instances: { agencies: instance },
    });
    assert.equal(batch.values.name ?? null, scenario.expected.value);

    const definition = structuredClone(subjectDefinition);
    definition.instances.agencies.data = instance;
    const engine = new FormEngine(definition, { responseSubject: subject });
    assert.equal(engine.signals.name.value, scenario.expected.value);
    engine.dispose();
  });
}

test('keyed row lookup reports duplicate keys and records field paths through WASM', () => {
  const { expression, inputData } = readCase('fel-keyed-row-duplicate.json');
  const evaluation = evalFELWithTrace(expression, inputData);
  assert.equal(evaluation.value, null);
  assert.deepEqual(evaluation.diagnostics.map(({ code }) => code), ['FEL_AMBIGUOUS_ROW_LOOKUP']);

  const dependencies = wasmExtractDependencies(expression);
  assert.deepEqual(dependencies.fields.sort(), ['rows', 'rows[*].id', 'rows[*].name', 'selection']);
  assert.deepEqual(wasmExtractDependencies(subjectDefinition.binds[0].calculate).instanceRefs, ['agencies']);
});

test('the Studio rewrite callback receives the keyed row paths through WASM', () => {
  const { expression } = readCase('fel-keyed-row-unique.json');
  const changes = { rows: 'lines', selection: 'key', 'rows[*].id': 'lines[*].code', 'rows[*].name': 'lines[*].label' };
  const rewritten = rewriteFELReferences(expression, {
    rewriteFieldPath: (path) => changes[path] ?? path,
  });
  assert.equal(rewritten, '$lines[code = $key].label');
});
