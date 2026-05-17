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
  }), { locale: 'en' });
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
