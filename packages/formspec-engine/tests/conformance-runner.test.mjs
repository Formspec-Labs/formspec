/** @filedesc Conformance runner library and CLI tests (fs-6iof): external suites, partial checks, wrapped decimals, operations, and native handoff. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import {
  againstExpected,
  compareValue,
  loadSuite,
  runCase,
  runCaseDetailed,
  runSuite,
  same,
} from '../conformance/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const cliPath = path.resolve(__dirname, '..', 'conformance', 'cli.mjs');

function findNativeBinary() {
  const candidates = [
    process.env.FORMSPEC_CONFORMANCE_NATIVE,
    process.env.CARGO_TARGET_DIR && path.join(process.env.CARGO_TARGET_DIR, 'debug', 'examples', 'conformance-case'),
    path.join(repoRoot, 'target', 'debug', 'examples', 'conformance-case'),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(tmpdir(), prefix));
}

test('exact and tolerance comparisons preserve wrapped decimals through digit 28', () => {
  const a = parseJsonExact('0.1234567890123456789012345678');
  const b = parseJsonExact('0.1234567890123456789012345679');
  const sci = parseJsonExact('1.234567890123456789012345678e-1');

  assert.equal(same(a, b), false);
  assert.equal(same(a, sci), true);
  assert.equal(compareValue(a, b, { comparator: 'exact' }), false);
  assert.equal(compareValue(a, sci, { comparator: 'exact' }), true);
  assert.equal(compareValue(a, '0.1234567890123456789012345678', { comparator: 'exact-decimal' }), true);
  assert.equal(compareValue(a, '0.1234567890123456789012345679', { comparator: 'exact-decimal' }), false);

  // Difference is 1e-28: passes at epsilon 1e-27 and 1e-28, fails at 1e-29.
  assert.equal(compareValue(a, b, { comparator: 'tolerance', epsilon: '1e-27' }), true);
  assert.equal(compareValue(a, b, { comparator: 'tolerance', epsilon: '0.0000000000000000000000000001' }), true);
  assert.equal(compareValue(a, b, { comparator: 'tolerance', epsilon: '1e-29' }), false);

  // Wrapped decimals inside `againstExpected` `dataAt`:
  const actual = { valid: true, counts: { error: 0, warning: 0, info: 0 }, results: [], data: { rate: a } };
  assert.deepEqual(againstExpected(actual, {
    dataAt: [
      { path: 'rate', value: sci, comparator: 'exact' },
      { path: 'rate', value: b, comparator: 'tolerance', epsilon: '1e-28' },
    ],
  }), []);
  const mismatch = againstExpected(actual, {
    dataAt: [{ path: 'rate', value: b, comparator: 'tolerance', epsilon: '1e-29' }],
  });
  assert.equal(mismatch.length, 1);
  assert.match(mismatch[0], /dataAt rate:/);
});

test('external suite with shared defaults, instances, subject, now, partial checks, and states', async () => {
  const root = makeTempDir('conformance-external-');
  try {
    const definition = {
      $formspec: '1.0',
      url: 'urn:example:external-suite',
      version: '1.0.0',
      status: 'active',
      title: 'External Suite Form',
      subject: {
        type: 'urn:example:unit',
        keys: { cycle: { dataType: 'integer' } },
      },
      instances: {
        prior: {
          data: { factor: 1, limit: 10 },
        },
      },
      items: [
        { key: 'asOf', type: 'field', dataType: 'date', label: 'As Of' },
        { key: 'cycleVal', type: 'field', dataType: 'integer', label: 'Cycle' },
        { key: 'base', type: 'field', dataType: 'decimal', label: 'Base' },
        { key: 'scaled', type: 'field', dataType: 'decimal', label: 'Scaled' },
        {
          key: 'details',
          type: 'group',
          label: 'Details',
          children: [
            { key: 'note', type: 'field', dataType: 'string', label: 'Note' },
            { key: 'locked', type: 'field', dataType: 'string', label: 'Locked' },
          ],
        },
      ],
      binds: [
        { path: 'asOf', calculate: 'today()' },
        { path: 'cycleVal', calculate: 'subject("cycle")' },
        { path: 'scaled', calculate: '$base * @instance("prior").factor' },
        { path: 'details', relevant: '$base > 0' },
        { path: 'details.note', required: '$scaled > @instance("prior").limit' },
        { path: 'details.locked', readonly: 'true' },
      ],
      shapes: [
        {
          id: 'over-limit',
          target: 'scaled',
          constraint: '$ <= @instance("prior").limit',
          severity: 'warning',
          message: 'Scaled value exceeds prior limit',
        },
      ],
    };
    fs.writeFileSync(path.join(root, 'form.json'), JSON.stringify(definition, null, 2));

    const suiteDoc = {
      description: 'External suite with defaults and partial assertions',
      defaults: {
        kind: 'ENGINE_PROCESSING',
        definitionPath: 'form.json',
        origin: 'saved',
        mode: 'continuous',
        now: '2026-04-15T09:30:00Z',
        subject: { type: 'urn:example:unit', keys: { cycle: 7 } },
        instances: { prior: { factor: 3, limit: 25 } },
        specRefs: ['Core §4.3', 'Core §4.4'],
      },
      cases: [
        {
          id: 'active-warning-and-states',
          inputData: { base: 10, details: { note: '' } },
          expected: {
            present: [
              { path: 'details.note', code: 'REQUIRED', severity: 'error', count: 1 },
              { pathPrefix: 'details', code: 'REQUIRED', count: 1 },
              { path: 'scaled', shapeId: 'over-limit', severity: 'warning', constraintKind: 'shape', count: 1 },
            ],
            absent: [
              { path: 'base', code: 'REQUIRED' },
            ],
            dataAt: [
              { path: 'asOf', value: '2026-04-15' },
              { path: 'cycleVal', value: 7 },
              { path: 'scaled', value: 30, comparator: 'tolerance', epsilon: '0.001' },
            ],
            states: {
              details: { relevant: true },
              'details.note': { relevant: true, required: true, readonly: false },
              'details.locked': { relevant: true, required: false, readonly: true },
            },
          },
        },
        {
          id: 'hidden-group-override-instance',
          instances: { prior: { factor: 2, limit: 50 } },
          inputData: { base: 0 },
          expected: {
            valid: true,
            absent: [
              { pathPrefix: 'details' },
              { shapeId: 'over-limit' },
            ],
            dataAt: [
              { path: 'scaled', value: 0 },
              { path: 'details.note', absent: true },
            ],
            states: {
              details: { relevant: false },
              'details.note': { relevant: false, required: false },
            },
          },
        },
      ],
    };
    fs.writeFileSync(path.join(root, 'suite.json'), JSON.stringify(suiteDoc, null, 2));

    const loaded = loadSuite('suite.json', root);
    assert.equal(loaded.length, 2);

    const report = await runSuite({ suite: 'suite.json', root });
    assert.equal(report.ok, true, JSON.stringify(report.cases, null, 2));
    assert.deepEqual(report.runners, ['ts']);
    assert.equal(report.totalCases, 2);
    assert.equal(report.passedCases, 2);

    // Exercise the packaged CLI (`run --suite --root --out [--native]`).
    const outPath = path.join(root, 'report.json');
    const nativeBin = findNativeBinary();
    const cliArgs = [cliPath, 'run', '--root', root, '--suite', 'suite.json', '--out', outPath];
    if (nativeBin) cliArgs.push('--native', nativeBin);
    const stdout = execFileSync(process.execPath, cliArgs, { encoding: 'utf8' });
    const cliReport = parseJsonExact(stdout);
    assert.equal(cliReport.ok, true, stdout);
    assert.deepEqual(parseJsonExact(fs.readFileSync(outPath, 'utf8')), cliReport);
    if (nativeBin) {
      assert.deepEqual(cliReport.runners, ['ts', 'rust']);
      assert.ok(cliReport.legsCovered.rust.includes('P'));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('operations support origin new createResponse, deliverInstance (late source), and resume', async () => {
  const root = makeTempDir('conformance-ops-');
  try {
    const definition = {
      $formspec: '1.0',
      url: 'urn:example:ops-suite',
      version: '1.0.0',
      status: 'active',
      title: 'Session Operations Form',
      instances: {
        late: {
          source: 'https://conformance.invalid/late.json',
          data: { greeting: 'fallback', bonus: 1 },
        },
      },
      items: [
        { key: 'title', type: 'field', dataType: 'string', label: 'Title', initialValue: 'Default Title' },
        { key: 'fromSource', type: 'field', dataType: 'string', label: 'From Source', initialValue: "=@instance('late').greeting" },
        { key: 'bonus', type: 'field', dataType: 'integer', label: 'Bonus' },
        { key: 'showExtra', type: 'field', dataType: 'boolean', label: 'Show Extra', initialValue: false },
        { key: 'extra', type: 'field', dataType: 'string', label: 'Extra' },
      ],
      binds: [
        { path: 'bonus', calculate: "@instance('late').bonus" },
        { path: 'extra', relevant: '$showExtra' },
      ],
    };
    fs.writeFileSync(path.join(root, 'form.json'), JSON.stringify(definition, null, 2));

    const suite = {
      defaults: {
        kind: 'ENGINE_PROCESSING',
        definitionPath: 'form.json',
        mode: 'continuous',
        specRefs: ['Core §4.2.2.1 creation and pending source', 'Core §4.4 late instance delivery'],
      },
      cases: [
        {
          id: 'late-delivery-then-resume',
          origin: 'new',
          inputData: {},
          operations: [
            { op: 'deliverInstance', name: 'late', value: { greeting: 'arrived', bonus: 9 } },
            { op: 'setValue', path: 'title', value: '' },
            { op: 'setValue', path: 'showExtra', value: true },
            { op: 'setValue', path: 'extra', value: 'kept-in-draft' },
            { op: 'setValue', path: 'showExtra', value: false },
            { op: 'resume' },
            { op: 'setValue', path: 'showExtra', value: true },
          ],
          expected: {
            valid: true,
            dataAt: [
              // Creation default is NOT re-applied after `resume` even though `title` was cleared.
              { path: 'title', value: '' },
              // Late source delivered before creation settled populated `fromSource` and calculated `bonus`.
              { path: 'fromSource', value: 'arrived' },
              { path: 'bonus', value: 9 },
              // Hidden draft answer survived `resume` via `getDraftSnapshot` -> `draftSnapshot`.
              { path: 'extra', value: 'kept-in-draft' },
            ],
          },
        },
      ],
    };
    fs.writeFileSync(path.join(root, 'suite.json'), JSON.stringify(suite, null, 2));

    const nativeBin = findNativeBinary();
    const report = await runSuite({ suite: 'suite.json', root, native: nativeBin });
    assert.equal(report.ok, true, JSON.stringify(report.cases, null, 2));
    if (nativeBin) {
      assert.deepEqual(report.runners, ['ts', 'rust']);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('in-memory definitionOverride replaces disk fixture without modifying files', async () => {
  const root = makeTempDir('conformance-override-');
  try {
    const diskDef = {
      $formspec: '1.0',
      url: 'urn:example:override',
      version: '1.0.0',
      status: 'active',
      title: 'Override',
      items: [{ key: 'note', type: 'field', dataType: 'string', label: 'Note' }],
      binds: [{ path: 'note', required: 'true' }],
    };
    const defPath = path.join(root, 'form.json');
    fs.writeFileSync(defPath, JSON.stringify(diskDef));

    const doc = {
      id: 'req-check',
      kind: 'ENGINE_PROCESSING',
      definitionPath: 'form.json',
      origin: 'saved',
      mode: 'continuous',
      specRefs: ['Core §4.3'],
      inputData: {},
      expected: { present: [{ path: 'note', code: 'REQUIRED', count: 1 }] },
    };

    const baselineLegs = await runCase(doc, root);
    assert.deepEqual(baselineLegs.get('P'), []);
    assert.deepEqual(baselineLegs.get('F'), []);

    // Mutate in memory (remove `required`): runner notices failure while disk file stays untouched.
    const mutatedDef = { ...diskDef, binds: [{ path: 'note' }] };
    const { legs } = await runCaseDetailed(doc, root, { definitionOverride: mutatedDef });
    assert.ok(legs.get('P').length > 0, 'expected in-memory override to fail P leg');
    assert.deepEqual(JSON.parse(fs.readFileSync(defPath, 'utf8')), diskDef);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('preserves expectedCandidate canonical JSON mismatch detection and refused-subject checks', async () => {
  const keyCasePath = path.join(repoRoot, 'tests', 'conformance', 'suite', 'parity-subject-keys.json');
  const keyCase = parseJsonExact(fs.readFileSync(keyCasePath, 'utf8'));
  const tampered = {
    ...keyCase,
    expectedCandidate: {
      ...keyCase.expectedCandidate,
      data: { ...keyCase.expectedCandidate.data, label: 'tampered' },
    },
  };
  const legs = await runCase(tampered, repoRoot);
  assert.ok(
    (legs.get('F_submit') ?? []).some((p) => p.includes('complete filed Response differs')),
    `expected canonical candidate mismatch on F_submit, got: ${JSON.stringify(Object.fromEntries(legs))}`,
  );
});
