/** @filedesc Integration tests: FEL locale functions — locale(), runtimeMeta(), pluralCategory() through FormEngine. */
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

/** Minimal definition with one field. */
function minDef(overrides = {}) {
  return {
    $formspec: '1.0',
    url: 'https://example.org/form',
    version: '1.0.0',
    title: 'Test Form',
    items: [
      { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
    ],
    ...overrides,
  };
}

// ── locale() ──────────────────────────────────────────────────────

test('locale() returns null when no locale is set', () => {
  const engine = new FormEngine(minDef());
  const fn = engine.compileExpression('locale()');
  assert.equal(fn(), null);
});

test('locale() returns the active locale code after setRuntimeContext', () => {
  const engine = new FormEngine(minDef());
  engine.setRuntimeContext({ locale: 'fr-CA' });
  const fn = engine.compileExpression('locale()');
  assert.equal(fn(), 'fr-CA');
});

test('locale() updates when locale changes via setRuntimeContext', () => {
  const engine = new FormEngine(minDef());
  engine.setRuntimeContext({ locale: 'en' });
  const fn = engine.compileExpression('locale()');
  assert.equal(fn(), 'en');

  engine.setRuntimeContext({ locale: 'fr' });
  assert.equal(fn(), 'fr');
});

test('locale() can be used in conditional expressions', () => {
  const engine = new FormEngine(minDef());
  engine.setRuntimeContext({ locale: 'fr' });
  const fn = engine.compileExpression("if(locale() = 'fr', 'Oui', 'Yes')");
  assert.equal(fn(), 'Oui');
});

test('subject() reads the same response keys during live, submit, and ad-hoc evaluation', () => {
  const type = 'urn:example:subject:agency-year';
  const definition = minDef({
    subject: { type, keys: { ffy: { dataType: 'integer' }, uei: { dataType: 'string' } } },
    items: [
      { key: 'uei', type: 'field', dataType: 'string' },
      { key: 'year', type: 'field', dataType: 'integer' },
    ],
    binds: [{ path: 'year', calculate: "subject('ffy')" }],
  });
  const subject = { id: 'filing-unit', type, keys: { uei: '00123', ffy: 2026 } };
  const engine = new FormEngine(definition, {
    responseSubject: subject,
    responseData: { uei: 'editable' },
    runtimeContext: { meta: { uei: 'metadata' } },
  });
  subject.keys.uei = 'mutated by caller';
  assert.equal(engine.signals.year.value, 2026);
  assert.equal(engine.compileExpression("subject('uei')")(), '00123');
  assert.equal(engine.compileExpression("subject('missing')")(), null);
  assert.equal(engine.compileExpression("runtimeMeta('uei')")(), 'metadata');
  const response = engine.getResponse({ profile: 'on-submit' });
  assert.equal(response.status, 'completed');
  assert.deepEqual(response.data, { uei: 'editable', year: 2026 });
  assert.deepEqual(response.subject, { id: 'filing-unit', type, keys: { uei: '00123', ffy: 2026 } });
});

test('subject() round-trips the largest I-JSON integer', () => {
  const type = 'urn:example:subject:sequence';
  const definition = minDef({
    subject: { type, keys: { serial: { dataType: 'integer' } } },
    items: [{ key: 'sequence', type: 'field', dataType: 'integer' }],
    binds: [{ path: 'sequence', calculate: "subject('serial')" }],
  });
  const keys = { serial: Number.MAX_SAFE_INTEGER };
  const engine = new FormEngine(definition, { responseSubject: { id: 'filing-unit', type, keys } });
  assert.equal(engine.compileExpression("subject('serial')")(), 9007199254740991);
  const response = engine.getResponse();
  assert.equal(response.data.sequence, 9007199254740991);
  assert.equal(response.subject.keys.serial, 9007199254740991);
});

test('getResponse() requires filing-unit identity before evaluation', () => {
  const type = 'urn:example:subject:agency';
  const definition = minDef({ subject: { type, keys: { uei: { dataType: 'string' } } } });
  const subject = { id: 'filing-unit', type, keys: { uei: '00123' } };
  const unbound = new FormEngine(definition);
  assert.equal(unbound.compileExpression("subject('uei')")(), null);
  assert.throws(() => unbound.getResponse({ subject }), /responseSubject/);

  const bound = new FormEngine(definition, { responseSubject: subject });
  assert.throws(() => bound.getResponse({ subject: { id: 'different' } }), /responseSubject/);
  assert.deepEqual(bound.getResponse().subject, subject);
});

test('FormEngine reports invalid filing-unit identity', async (t) => {
  const type = 'urn:example:subject:agency-year';
  const definition = minDef({ subject: { type, keys: { ffy: { dataType: 'integer' }, uei: { dataType: 'string' } } } });
  const cases = [
    ['undeclared subject keys', minDef(), { type, keys: { uei: 'A' } }, /#subjectKeys\.uei/],
    ['wrong key type', definition, { type, keys: { ffy: '2026', uei: 'A' } }, /#subjectKeys\.ffy: Subject key must be an integer/],
    ['wrong subject type', definition, { type: 'urn:example:other', keys: { ffy: 2026 } }, /#subjectType/],
    ['missing key', definition, { type, keys: { ffy: 2026 } }, /#subjectKeys\.uei: Declared subject key is missing/],
    ['extra key', definition, { type, keys: { extra: 'B', ffy: 2026, uei: 'A' } }, /#subjectKeys\.extra/],
    ['invalid key name', definition, { type, keys: { ffy: 2026, 'not a key': 'B', uei: 'A' } }, /#subjectKeys\.not a key: Invalid subject key name/],
    ['two invalid keys', definition, { type, keys: { uei: false, ffy: null } }, /#subjectKeys\.ffy: Subject key must be an integer/],
    ['integer above the I-JSON range', definition, { type, keys: { ffy: JSON.rawJSON('9007199254740993'), uei: 'A' } }, /#subjectKeys\.ffy: Integer subject key must be in the I-JSON range/],
    ['integer below the I-JSON range', definition, { type, keys: { ffy: -9007199254740992, uei: 'A' } }, /#subjectKeys\.ffy: Integer subject key must be in the I-JSON range/],
    ['missing subject type and keys', definition, {}, /#subjectType/],
    ['missing key set', definition, { type }, /#subjectKeys: Subject must supply a keys object/],
  ];
  for (const [name, form, subject, message] of cases) {
    await t.test(name, () => {
      // The old constructor exception kept the refusal out of the validation report.
      const engine = new FormEngine(form, { responseSubject: { id: 'filing-unit', ...subject } });
      const report = engine.getValidationReport();
      assert.equal(report.valid, false);
      assert.equal(report.results.length, 1);
      assert.equal(report.results[0].code, 'TYPE_MISMATCH');
      assert.match(`${report.results[0].path}: ${report.results[0].message}`, message);
      engine.dispose();
    });
  }
});

test('FormEngine accepts an explicit singleton and an unkeyed host entity', () => {
  const type = 'urn:example:subject:singleton';
  const subject = { id: 'filing-unit', type, keys: {} };
  const singleton = new FormEngine(minDef({ subject: { type, keys: {} } }), { responseSubject: subject });
  assert.deepEqual(singleton.getResponse().subject, subject);
  assert.equal(singleton.compileExpression("subject('uei')")(), null);

  const hostEntity = { id: 'host-entity', type: 'Grant' };
  assert.deepEqual(new FormEngine(minDef()).getResponse({ subject: hostEntity }).subject, hostEntity);
});

test('FormEngine refusal prevents instance and remote option loads', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async () => {
    calls.push('remote options');
    return { ok: true, json: async () => [] };
  });
  const definition = minDef({
    instances: { sourceData: { source: 'formspec-fn:fixture' } },
    binds: [{ path: 'name', remoteOptions: 'https://example.org/options' }],
  });

  // The refusal is available in reports. It still prevents both source loads.
  const engine = new FormEngine(definition, {
    responseSubject: { id: 'filing-unit', keys: { uei: 'A' } },
    instanceSourceResolver: () => {
      calls.push('instance source');
      return { status: 'loaded', value: {} };
    },
  });
  assert.equal(engine.getValidationReport().results[0].path, '#subjectKeys.uei');
  await engine.waitForInstanceSources();
  assert.deepEqual(calls, []);
  engine.dispose();
});

// ── runtimeMeta(key) ──────────────────────────────────────────────

test('runtimeMeta() returns null for missing key', () => {
  const engine = new FormEngine(minDef());
  const fn = engine.compileExpression("runtimeMeta('missing')");
  assert.equal(fn(), null);
});

test('runtimeMeta() returns string value from meta bag', () => {
  const engine = new FormEngine(minDef(), { runtimeContext: { meta: { gender: 'feminine' } } });
  const fn = engine.compileExpression("runtimeMeta('gender')");
  assert.equal(fn(), 'feminine');
});

test('runtimeMeta() returns number value from meta bag', () => {
  const engine = new FormEngine(minDef(), { runtimeContext: { meta: { retries: 3 } } });
  const fn = engine.compileExpression("runtimeMeta('retries')");
  assert.equal(fn(), 3);
});

test('runtimeMeta() returns boolean value from meta bag', () => {
  const engine = new FormEngine(minDef(), { runtimeContext: { meta: { isAdmin: true } } });
  const fn = engine.compileExpression("runtimeMeta('isAdmin')");
  assert.equal(fn(), true);
});

test('runtimeMeta() updates when meta changes via setRuntimeContext', () => {
  const engine = new FormEngine(minDef(), { runtimeContext: { meta: { role: 'user' } } });
  const fn = engine.compileExpression("runtimeMeta('role')");
  assert.equal(fn(), 'user');

  engine.setRuntimeContext({ meta: { role: 'admin' } });
  assert.equal(fn(), 'admin');
});

test('runtimeMeta() with null key returns null (null propagation)', () => {
  const engine = new FormEngine(minDef());
  const fn = engine.compileExpression('runtimeMeta(null)');
  assert.equal(fn(), null);
});

test('runtimeMeta() enables gender agreement pattern', () => {
  const engine = new FormEngine(minDef(), { runtimeContext: { meta: { gender: 'feminine' } } });
  const fn = engine.compileExpression(
    "if(runtimeMeta('gender') = 'feminine', 'inscrite', 'inscrit')",
  );
  assert.equal(fn(), 'inscrite');
});

// ── pluralCategory(count, locale?) ────────────────────────────────

test('pluralCategory() with explicit locale: English one', () => {
  const engine = new FormEngine(minDef());
  const fn = engine.compileExpression("pluralCategory(1, 'en')");
  assert.equal(fn(), 'one');
});

test('pluralCategory() with explicit locale: English other', () => {
  const engine = new FormEngine(minDef());
  const fn = engine.compileExpression("pluralCategory(5, 'en')");
  assert.equal(fn(), 'other');
});

test('pluralCategory() with implicit locale from runtime context', () => {
  const engine = new FormEngine(minDef(), { runtimeContext: { locale: 'en' } });
  const fn = engine.compileExpression('pluralCategory(1)');
  assert.equal(fn(), 'one');
});

test('pluralCategory() Arabic: zero', () => {
  const engine = new FormEngine(minDef());
  const fn = engine.compileExpression("pluralCategory(0, 'ar')");
  assert.equal(fn(), 'zero');
});

test('pluralCategory() Arabic: two', () => {
  const engine = new FormEngine(minDef());
  const fn = engine.compileExpression("pluralCategory(2, 'ar')");
  assert.equal(fn(), 'two');
});

test('pluralCategory() Arabic: few (3-10)', () => {
  const engine = new FormEngine(minDef());
  const fn = engine.compileExpression("pluralCategory(5, 'ar')");
  assert.equal(fn(), 'few');
});

test('pluralCategory() Arabic: many (11-99)', () => {
  const engine = new FormEngine(minDef());
  const fn = engine.compileExpression("pluralCategory(15, 'ar')");
  assert.equal(fn(), 'many');
});

test('pluralCategory() Polish: few (2-4)', () => {
  const engine = new FormEngine(minDef());
  const fn = engine.compileExpression("pluralCategory(2, 'pl')");
  assert.equal(fn(), 'few');
});

test('pluralCategory() Polish: many (0, 5-21)', () => {
  const engine = new FormEngine(minDef());
  const fn0 = engine.compileExpression("pluralCategory(0, 'pl')");
  const fn5 = engine.compileExpression("pluralCategory(5, 'pl')");
  assert.equal(fn0(), 'many');
  assert.equal(fn5(), 'many');
});

test('pluralCategory() French: one includes 0', () => {
  const engine = new FormEngine(minDef());
  const fn = engine.compileExpression("pluralCategory(0, 'fr')");
  assert.equal(fn(), 'one');
});

test('pluralCategory() returns null without locale', () => {
  // No locale set in runtime context, no explicit locale arg
  const engine = new FormEngine(minDef());
  const fn = engine.compileExpression('pluralCategory(1)');
  assert.equal(fn(), null);
});

test('pluralCategory() null propagation on null count', () => {
  const engine = new FormEngine(minDef());
  const fn = engine.compileExpression("pluralCategory(null, 'en')");
  assert.equal(fn(), null);
});

test('pluralCategory() with field value as count', () => {
  const engine = new FormEngine(minDef({
    items: [
      { key: 'count', type: 'field', dataType: 'integer', label: 'Count', initialValue: 5 },
    ],
  }), { runtimeContext: { locale: 'en' } });
  const fn = engine.compileExpression('pluralCategory($count)');
  assert.equal(fn(), 'other');

  engine.setValue('count', 1);
  assert.equal(fn(), 'one');
});

// ── BCP 47 locale tag (full tag, not language-only) ───────────────

test('pluralCategory() uses full tag where region matches language rules (en-US)', () => {
  const engine = new FormEngine(minDef());
  const fn = engine.compileExpression("pluralCategory(1, 'en-US')");
  assert.equal(fn(), 'one');
});

test('pluralCategory() uses full tag for region-specific CLDR (fr-CA 0 is other, bare fr is one)', () => {
  const engine = new FormEngine(minDef());
  const frCa = engine.compileExpression("pluralCategory(0, 'fr-CA')");
  assert.equal(frCa(), 'other');
  const fr = engine.compileExpression("pluralCategory(0, 'fr')");
  assert.equal(fr(), 'one');
});
