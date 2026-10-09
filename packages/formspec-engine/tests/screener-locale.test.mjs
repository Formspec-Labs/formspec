/** @filedesc Screener-owned Locale admission, fallback and native interpolation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { initFormspecEngine } from '../dist/index.js';
import { createScreenerLocaleResolver, screenerOptionLocaleKey } from '../dist/engine-render-entry.js';
await initFormspecEngine();
const document = { $formspecScreener: '1.0', url: 'urn:test:screener', version: '1.0.0',
  items: [{ key: 'eligible', type: 'field', dataType: 'boolean', label: 'Eligible' },
    { key: 'choice', type: 'field', dataType: 'choice', options: [{ value: 'a.b', label: 'A' }] }] };
const locale = (code, strings, extra = {}) => ({ $formspecLocale: '2.1', version: '1.0.0', locale: code,
  target: { kind: 'screener', url: document.url, compatibleVersions: '1.0.0' }, strings, ...extra });
const admit = (localeDocuments, activeLocale = 'es-US') => createScreenerLocaleResolver({ document, localeDocuments, activeLocale, chromeKeys: ['screener.yes'] });
test('Screener fallback stays within the exact target and admits escaped static option values', () => {
  const key = screenerOptionLocaleKey('choice', 'a.b');
  const result = admit([locale('es', { 'eligible.label': 'Elegible', [key]: 'Opción' }),
    locale('es-US', {}, { fallback: 'es' }), locale('es-US', { 'eligible.label': 'Wrong' }, { target: { kind: 'definition', url: document.url } })]);
  assert.equal(result.status, 'ready');
  assert.equal(result.resolver.lookup('eligible.label'), 'Elegible');
  assert.equal(result.resolver.lookup(key), 'Opción');
});
test('native interpolation preserves false and supports item bind scope', () => {
  const result = admit([locale('es-US', { 'eligible.label': 'Value {{$eligible}}', 'eligible.requiredMessage': 'Bare {{$}}' })]);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.resolver.text('eligible.label', '', { eligible: false }, 'eligible'), { text: 'Value false', warnings: [] });
  assert.deepEqual(result.resolver.text('eligible.requiredMessage', '', { eligible: false }, 'eligible', true), { text: 'Bare false', warnings: [] });
});
test('native interpolation retains unresolved expressions and named warnings', () => {
  const result = admit([locale('es-US', { 'eligible.label': 'Value {{unknownFunction()}}' })]);
  const rendered = result.resolver.text('eligible.label', '', {}, 'eligible');
  assert.equal(rendered.text, 'Value {{unknownFunction()}}'); assert.ok(rendered.warnings.length);
});
test('ambiguous normalized locale tuples, behavior keys and unsupported dialects refuse', () => {
  assert.equal(admit([locale('es-US', {}), locale('ES-us', {})]).reason, 'screener-locale-duplicate');
  assert.equal(admit([locale('es-US', { 'eligible.calculate': 'false' })]).reason, 'screener-locale-key');
  assert.equal(admit([locale('es-US', {}, { $formspecLocale: '2.0' })]).reason, 'screener-locale-dialect');
});
