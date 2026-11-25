/** @filedesc Synthetic Definition mutation operators, grouped scoped dependency selection, and coverage runner tests. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  analyzeScopedDependenciesRust,
  analyzeScopedDependenciesWasm,
  buildCaseQueries,
  caseDependencies,
} from '../conformance/mutation-selection.mjs';
import { enumerateMutations, applyMutation } from '../conformance/mutations.mjs';
import { runMutationCoverage } from '../conformance/rule-mutation.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function findNativeBinary() {
  const candidates = [
    process.env.FORMSPEC_CONFORMANCE_NATIVE,
    process.env.CARGO_TARGET_DIR && path.join(process.env.CARGO_TARGET_DIR, 'debug', 'examples', 'conformance-case'),
    path.join(repoRoot, 'target', 'debug', 'examples', 'conformance-case'),
  ].filter(Boolean);
  return candidates.find((candidate) => fsSync.existsSync(candidate));
}

const definition = {
  nonRelevantBehavior: 'keep',
  items: [{ type: 'group', key: 'rows', repeatable: true, minRepeat: 1,
    children: [{ type: 'field', key: 'when', dataType: 'date' }] },
    { type: 'field', key: 'color', dataType: 'choice', options: [{ value: 'blue' }] }],
  optionSets: { 'a/b': { options: [{ value: 'red' }, { value: 'blue' }] } },
  shapes: [{ id: 'check', target: 'color', constraint: 'false', activeWhen: 'true' }],
  binds: [{ path: 'color', constraint: 'false', required: 'true', calculate: '"blue"',
    relevant: 'false', readonly: 'true', whitespace: 'trim', nonRelevantBehavior: 'keep' }],
};

test('every authored rule produces an isolated single edit with a unique selectable name', () => {
  const original = structuredClone(definition);
  const mutations = enumerateMutations(definition);
  assert.equal(mutations.length, 15);
  assert.equal(new Set(mutations.map((m) => m.id)).size, mutations.length);
  const named = (id) => mutations.find((m) => m.id === id);
  assert.deepEqual(applyMutation(definition, named('/optionSets/a~1b/options/0')).optionSets['a/b'].options,
    [{ value: 'blue' }]);
  assert.equal(applyMutation(definition, named('/items/0/children/0/dataType')).items[0].children[0].dataType, 'string');
  assert.equal(applyMutation(definition, named('/nonRelevantBehavior')).nonRelevantBehavior, 'remove');
  for (const mutation of mutations) {
    assert.notDeepEqual(applyMutation(definition, mutation), definition);
  }
  assert.deepEqual(definition, original);
});

test('equivalence needs a proof that holds in the evaluation context', () => {
  const shape = { id: 'guard', target: 'color', activeWhen: 'false', constraint: 'false' };
  const form = { ...definition, shapes: [shape] };
  const reason = () => enumerateMutations(form).find((m) => m.id === '/shapes/0/activeWhen').equivalent;
  assert.match(reason(), /relevan/i);
  form.shapes.push({ id: 'other', target: '#', not: 'guard' });
  assert.equal(reason(), undefined);
  shape.activeWhen = 'true';
  assert.match(reason(), /true/);
});

test('removing an optional boolean guard can activate a Shape on a relevant field', async () => {
  const { FormEngine, initFormspecEngine } = await import('@formspec-org/engine');
  await initFormspecEngine();
  const form = {
    $formspec: '1.0', url: 'urn:example:optional-guard', version: '1.0.0',
    status: 'active', title: 'Optional guard',
    items: [
      { type: 'field', key: 'enabled', dataType: 'boolean', label: 'Enabled' },
      { type: 'field', key: 'note', dataType: 'string', label: 'Note' },
    ],
    binds: [{ path: 'note', relevant: '$enabled' }],
    shapes: [{ id: 's', target: 'note', activeWhen: '$enabled', constraint: 'false', message: 'Check the note' }],
  };
  const fires = (def) => {
    const engine = new FormEngine(def, { savedResponseData: { note: 'Example' } });
    try {
      return engine.getValidationReport({ profile: 'live' }).results.some((result) => result.shapeId === 's');
    } finally {
      engine.dispose();
    }
  };
  const guard = enumerateMutations(form).find((m) => m.id === '/shapes/0/activeWhen');
  assert.equal(fires(form), false);
  assert.equal(fires(applyMutation(form, guard)), true);
  // Null means visible for `relevant` and inactive for `activeWhen`, even with identical expressions.
  assert.equal(guard.equivalent, undefined);
});

test('a later bind can override permanently false relevance', () => {
  const form = { ...definition, binds: [{ path: 'color', relevant: 'false' }],
    shapes: [{ id: 's', target: 'color', activeWhen: 'false', constraint: 'false' }] };
  const guard = () => enumerateMutations(form).find((m) => m.id === '/shapes/0/activeWhen').equivalent;
  assert.match(guard(), /relevan/i);
  form.binds.push({ path: 'color', relevant: 'true' });
  assert.equal(guard(), undefined);
  form.shapes[0] = { id: 'composed', target: 'color', constraint: ' true ', and: ['false'] };
  assert.equal(enumerateMutations(form).find((m) => m.id === '/shapes/0/constraint').equivalent, undefined);
});

test('named edits reject missing paths, duplicate names and inherited members', () => {
  const edit = { id: 'red-only', path: ['optionSets', 'a/b', 'options', 1] };
  const mutations = enumerateMutations(definition, [edit]);
  assert.deepEqual(applyMutation(definition, mutations.at(-1)).optionSets['a/b'].options, [{ value: 'red' }]);
  assert.throws(() => enumerateMutations(definition, [edit, edit]), /duplicate/i);
  assert.throws(() => enumerateMutations(definition, [{ ...edit, path: ['toString'] }]), /path/i);
});

test('edits preserve exact JSON numbers across untouched and replaced branches', () => {
  const token = JSON.rawJSON('0.123456789012345678901');
  const original = { items: [{ key: 'number', initialValue: token }], title: 'demo' };
  const updated = applyMutation(original, { path: ['items', 0, 'key'], value: 'changed' });
  assert.equal(JSON.stringify(updated.items[0].initialValue), token.rawJSON);
  assert.equal(original.items[0].key, 'number');
});

test('selects transitive field reads, scopes bounded targets, and retains broad or cyclic cases', () => {
  const field = (key) => ({ key, type: 'field', dataType: 'integer' });
  const form = { items: ['a', 'b', 'c'].map(field), binds: [{ path: 'b', calculate: '$a' }] };
  const reads = (expr) => new Map([['$a', ['a']], ['$b', ['b']]]).get(expr);
  const cases = [
    { kind: 'FEL_EVALUATION', expression: '$b', site: '' },
    // Bounded `dataAt` scopes to `c` only; whole-form `valid` and opaque expressions remain unbounded (`null`).
    { kind: 'ENGINE_PROCESSING', expected: { dataAt: [{ path: 'c', value: 0 }] } },
    { kind: 'ENGINE_PROCESSING', expected: { valid: true } },
    { kind: 'FEL_EVALUATION', expression: 'opaque()', site: '' },
  ];
  const deps = caseDependencies(form, cases, reads);
  assert.deepEqual([...deps[0]].sort(), ['a', 'b']);
  assert.deepEqual([...deps[1]].sort(), ['c']);
  assert.deepEqual(deps.slice(2), [null, null]);
  form.binds.push({ path: 'a', calculate: '$b' });
  assert.deepEqual(caseDependencies(form, cases, reads), [null, null, null, null]);
});

test('URI option sources remain external and do not become inline option edits', () => {
  const form = { items: [{ key: 'network', type: 'field', dataType: 'choice', options: 'https://example.invalid/colors' }] };
  assert.deepEqual(enumerateMutations(form), []);
});

test('worker and serial runs use the public runner verdict in memory; baseline errors cannot earn kills', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'mutation-test-'));
  try {
    const form = {
      $formspec: '1.0', url: 'urn:example:mutations', version: '1', title: 'Example', status: 'active',
      items: [{ key: 'note', type: 'field', dataType: 'string', label: 'Note' }],
      binds: [{ path: 'note', required: 'true' }],
      shapes: [{ id: 'no-op', target: 'note', message: 'Example', constraint: 'true' }],
    };
    const formPath = path.join(root, 'form.json');
    await fs.writeFile(formPath, JSON.stringify(form));
    const doc = {
      id: 'blank', kind: 'ENGINE_PROCESSING', definitionPath: 'form.json', origin: 'saved',
      mode: 'continuous', specRefs: ['Core §4.3'], inputData: {}, expected: { present: [{ code: 'REQUIRED' }] },
    };
    const options = {
      root, suite: doc, definitionPath: 'form.json',
      named: [{ id: 'label', path: ['items', 0, 'label'], value: 'New label' }],
    };
    const serial = await runMutationCoverage({ ...options, workers: 1 });
    assert.deepEqual(serial.summary, { noticed: 1, survived: 1, equivalent: 1 });
    assert.deepEqual(serial.runners, ['ts']);
    assert.ok(serial.legsCovered.ts.includes('P'));
    assert.ok(serial.legsCovered.ts.includes('F'));
    assert.equal(serial.results.find((r) => r.status === 'noticed').caseId, 'blank');
    assert.deepEqual(await runMutationCoverage({ ...options, workers: 2 }), serial);
    const only = await runMutationCoverage({ ...options, only: ['label'] });
    assert.deepEqual(only.results.map((result) => result.id), ['label']);
    await assert.rejects(runMutationCoverage({ ...options, only: ['typo'] }), /unknown mutant/i);
    doc.expected = { absent: [{ code: 'REQUIRED' }] };
    await assert.rejects(runMutationCoverage(options), /baseline.*blank/is);
    assert.deepEqual(JSON.parse(await fs.readFile(formPath, 'utf8')), form);
  } finally {
    await fs.rm(root, { force: true, recursive: true });
  }
});

test('CLI selection and exhaustive execution agree on a transitive FEL read', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'mutation-selection-'));
  try {
    const def = {
      $formspec: '1.0', url: 'urn:example:derived', version: '1.0', status: 'active', title: 'Derived',
      items: ['a', 'b', 'c'].map((key) => ({ key, type: 'field', dataType: 'integer', label: key })),
      binds: [{ path: 'a', calculate: '2' }, { path: 'b', calculate: '$a + 1' }],
    };
    const suite = {
      defaults: {
        kind: 'FEL_EVALUATION', origin: 'saved',
        definitionPath: 'form.json', inputData: { a: 1, c: 4 }, specRefs: ['Core §4.3'],
      },
      cases: [
        { id: 'unrelated', site: '', comparator: 'exact', expression: '$c', expected: { value: 4 } },
        { id: 'derived', site: '', comparator: 'exact', expression: '$b', expected: { value: 3 } },
      ],
    };
    await fs.writeFile(path.join(root, 'suite.json'), JSON.stringify(suite));
    await fs.writeFile(path.join(root, 'form.json'), JSON.stringify(def));
    const cli = fileURLToPath(new URL('../conformance/rule-mutation.mjs', import.meta.url));
    const args = [cli, '--root', root, '--suite', 'suite.json', '--definition', 'form.json',
      '--workers', '1', '--only', '/binds/0/calculate'];
    const run = (extra) => JSON.parse(execFileSync(process.execPath, [...args, ...extra], { encoding: 'utf8' })).results[0];
    const optimized = run([]);
    const exhaustive = run(['--exhaustive']);
    assert.equal(optimized.caseId, 'derived');
    assert.equal(optimized.casesRun, 1);
    assert.deepEqual(exhaustive, { ...optimized, casesRun: 2 });
  } finally {
    await fs.rm(root, { force: true, recursive: true });
  }
});

function buildLargeGroupedFixture(groupCount) {
  const items = [];
  const binds = [];
  const shapes = [];
  const variables = [];
  const optionSets = {};
  const cases = [];

  for (let g = 0; g < groupCount; g += 1) {
    const name = `g${g}`;
    const setName = `set${g}`;
    optionSets[setName] = {
      options: [
        { value: `opt_${g}_a`, label: `A ${g}` },
        { value: `opt_${g}_b`, label: `B ${g}` },
      ],
    };
    variables.push({ name: 'mult', scope: name, expression: `${g + 2}` });
    items.push({
      key: name,
      type: 'group',
      label: `Group ${g}`,
      children: [
        { key: 'active', type: 'field', dataType: 'boolean', label: 'Active' },
        { key: 'code', type: 'field', dataType: 'choice', label: 'Code', optionSet: setName },
        { key: 'asOf', type: 'field', dataType: 'date', label: 'As Of' },
        {
          key: 'rows',
          type: 'group',
          label: 'Rows',
          repeatable: true,
          minRepeat: 1,
          children: [
            { key: 'qty', type: 'field', dataType: 'integer', label: 'Qty' },
            { key: 'lineTotal', type: 'field', dataType: 'integer', label: 'Line Total' },
          ],
        },
        { key: 'subtotal', type: 'field', dataType: 'integer', label: 'Subtotal' },
        { key: 'note', type: 'field', dataType: 'string', label: 'Note' },
      ],
    });
    binds.push(
      { path: name, relevant: `$${name}.active` },
      { path: `${name}.rows[*].lineTotal`, calculate: '$qty * @mult' },
      { path: `${name}.subtotal`, calculate: `sum($${name}.rows[*].lineTotal)` },
      { path: `${name}.note`, required: `$${name}.subtotal > 0`, constraint: 'length($) <= 20' },
    );
    shapes.push({
      id: `${name}-cap`,
      target: `${name}.subtotal`,
      activeWhen: `$${name}.active`,
      constraint: `$ <= ${(g + 2) * 10}`,
      severity: 'error',
      message: `Group ${g} cap exceeded`,
    });

    const mult = g + 2;
    cases.push(
      {
        id: `${name}.fel-subtotal`,
        kind: 'FEL_EVALUATION',
        origin: 'saved',
        site: name,
        comparator: 'exact',
        expression: '$subtotal',
        inputData: { [name]: { active: true, rows: [{ qty: 3 }, { qty: 2 }] } },
        expected: { value: 5 * mult },
      },
      {
        id: `${name}.proc-rules`,
        kind: 'ENGINE_PROCESSING',
        origin: 'saved',
        mode: 'continuous',
        inputData: {
          [name]: {
            active: true,
            code: `opt_${g}_a`,
            asOf: 'not-a-date',
            rows: [{ qty: 12 }],
            note: '',
          },
        },
        expected: {
          present: [
            { path: `${name}.note`, code: 'REQUIRED', count: 1 },
            { path: `${name}.asOf`, code: 'TYPE_MISMATCH', count: 1 },
            { path: `${name}.subtotal`, shapeId: `${name}-cap`, count: 1 },
          ],
          absent: [
            { path: `${name}.code`, code: 'CONSTRAINT_FAILED' },
          ],
          dataAt: [
            { path: `${name}.subtotal`, value: 12 * mult },
          ],
          states: {
            [name]: { relevant: true },
            [`${name}.note`]: { required: true },
          },
        },
      },
    );
  }

  const def = {
    $formspec: '1.0',
    url: 'urn:example:large-grouped-synthetic',
    version: '1.0.0',
    status: 'active',
    title: 'Large Grouped Synthetic Form',
    variables,
    optionSets,
    items,
    binds,
    shapes,
  };
  const suite = {
    defaults: {
      definitionPath: 'grouped.json',
      specRefs: ['Core §4.3', 'Core §5.6'],
    },
    cases,
  };
  return { def, suite };
}

test('large synthetic grouped suite: selected vs exhaustive agree on every first witness with far fewer evaluations', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'mutation-grouped-'));
  try {
    const { def, suite } = buildLargeGroupedFixture(10);
    await fs.writeFile(path.join(root, 'grouped.json'), JSON.stringify(def));
    await fs.writeFile(path.join(root, 'suite.json'), JSON.stringify(suite));

    const selected1 = await runMutationCoverage({
      root,
      suite: 'suite.json',
      definitionPath: 'grouped.json',
      workers: 1,
      exhaustive: false,
    });
    const selected2 = await runMutationCoverage({
      root,
      suite: 'suite.json',
      definitionPath: 'grouped.json',
      workers: 2,
      exhaustive: false,
    });
    const exhaustive = await runMutationCoverage({
      root,
      suite: 'suite.json',
      definitionPath: 'grouped.json',
      workers: 2,
      exhaustive: true,
    });

    // Worker determinism: workers=1 and workers=2 must produce identical reports.
    assert.deepEqual(selected2, selected1);

    // Every single mutant must match status, first witness caseId, and reason between selected & exhaustive.
    const stripCounts = (report) => report.results.map(({ id, status, caseId, reason }) => ({
      id, status, caseId, reason,
    }));
    assert.deepEqual(stripCounts(selected1), stripCounts(exhaustive));
    assert.deepEqual(selected1.summary, exhaustive.summary);
    assert.ok(selected1.summary.noticed >= 30, `expected >=30 noticed mutants, got ${selected1.summary.noticed}`);

    // Grouped scoped selection must dramatically cut evaluations (< 25% of exhaustive).
    assert.ok(
      selected1.totalEvaluations < exhaustive.totalEvaluations * 0.25,
      `expected selected evaluations (${selected1.totalEvaluations}) < 25% of exhaustive (${exhaustive.totalEvaluations})`,
    );

    // Verify native Rust `--deps` analyzer agrees with WASM scoped selection when built.
    const nativeBin = findNativeBinary();
    if (nativeBin) {
      const queries = buildCaseQueries(suite.cases.map((c) => ({ ...suite.defaults, ...c })));
      const rustScopes = analyzeScopedDependenciesRust(def, queries, nativeBin);
      const wasmScopes = analyzeScopedDependenciesWasm(def, queries);
      assert.equal(rustScopes.length, wasmScopes.length);
      for (let i = 0; i < rustScopes.length; i += 1) {
        assert.deepEqual([...rustScopes[i].itemPaths].sort(), [...wasmScopes[i].itemPaths].sort(), `itemPaths[${i}]`);
        assert.deepEqual([...rustScopes[i].shapes].sort(), [...wasmScopes[i].shapes].sort(), `shapes[${i}]`);
        assert.deepEqual([...rustScopes[i].optionSets].sort(), [...wasmScopes[i].optionSets].sort(), `optionSets[${i}]`);
        assert.deepEqual([...rustScopes[i].variables].sort(), [...wasmScopes[i].variables].sort(), `variables[${i}]`);
      }

      // Exercise the unified `formspec-conformance mutate` CLI with `--native` on a subset via `--only`.
      const unifiedCli = path.join(repoRoot, 'packages', 'formspec-engine', 'conformance', 'cli.mjs');
      const cliOut = JSON.parse(execFileSync(process.execPath, [
        unifiedCli, 'mutate',
        '--root', root,
        '--suite', 'suite.json',
        '--definition', 'grouped.json',
        '--workers', '1',
        '--only', '/binds/1/calculate',
        '--only', '/shapes/0/constraint',
        '--native', nativeBin,
      ], { encoding: 'utf8' }));
      assert.deepEqual(cliOut.runners, ['ts', 'rust']);
      assert.equal(cliOut.selectionMode, 'rust-scoped');
      assert.ok(cliOut.legsCovered.ts.length > 0);
      assert.ok(cliOut.legsCovered.rust.length > 0);
      assert.deepEqual(cliOut.summary, { noticed: 2, survived: 0, equivalent: 0 });
    }
  } finally {
    await fs.rm(root, { force: true, recursive: true });
  }
});
