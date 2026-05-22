/** @filedesc Tests for Issuer LangMap resolution cascade. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLangValue } from '../../dist/issuer/LangMap.js';

test('resolveLangValue returns plain string as-is', () => {
  assert.equal(resolveLangValue('X', 'fr', 'en'), 'X');
});

test('resolveLangValue exact match wins', () => {
  assert.equal(resolveLangValue({ en: 'A', fr: 'B' }, 'fr', 'en'), 'B');
});

test('resolveLangValue falls back from regional tag to base tag', () => {
  assert.equal(resolveLangValue({ en: 'A' }, 'en-US', 'en'), 'A');
});

test('resolveLangValue falls back to defaultLanguage', () => {
  assert.equal(resolveLangValue({ en: 'A', es: 'B' }, 'fr', 'en'), 'A');
});

test('resolveLangValue falls back to first key as last resort', () => {
  assert.equal(resolveLangValue({ zz: 'Z' }, 'fr', 'en'), 'Z');
});

test('resolveLangValue returns undefined for empty map', () => {
  assert.equal(resolveLangValue({}, 'fr', 'en'), undefined);
});
