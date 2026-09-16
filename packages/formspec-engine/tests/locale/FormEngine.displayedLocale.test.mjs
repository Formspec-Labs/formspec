/** @filedesc FormEngine integration tests for Response.displayedLocale — the submit-time Locale pin, mirroring displayedIssuer. */
import '../setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import { FormEngine } from '../../dist/index.js';

const DEFINITION = {
  $formspec: '1.0',
  url: 'https://example.org/form',
  version: '1.0.0',
  title: 'Test Form',
  items: [
    { key: 'name', type: 'field', dataType: 'string', label: 'Full Name' },
  ],
};

/** Minimal Locale document targeting DEFINITION. `url` defaults unset (Locale §url is OPTIONAL). */
function makeLocale(locale, overrides = {}) {
  return {
    $formspecLocale: '2.0',
    locale,
    version: '1.0.0',
    target: { kind: 'definition', url: DEFINITION.url },
    strings: {},
    ...overrides,
  };
}

test('FormEngine response pins the active Locale document at submit', () => {
  const engine = new FormEngine(DEFINITION);
  engine.loadLocale(makeLocale('en', { url: 'https://example.org/locales/en.json' }));
  engine.loadLocale(makeLocale('es', { url: 'https://example.org/locales/es.json' }));
  engine.setLocale('es');

  const response = engine.getResponse();

  assert.deepEqual(response.displayedLocale, {
    url: 'https://example.org/locales/es.json',
    version: '1.0.0',
    locale: 'es',
  });
});

test('FormEngine omits displayedLocale when no Locale document was loaded', () => {
  const engine = new FormEngine(DEFINITION);
  const response = engine.getResponse();
  assert.equal(response.displayedLocale, undefined);
});

test('FormEngine pins the document actually resolved for the active tag, not the raw requested tag', () => {
  const engine = new FormEngine(DEFINITION);
  // Only 'es' is loaded; 'es-MX' resolves to it through BCP 47 implicit (region-stripping) fallback.
  engine.loadLocale(makeLocale('es', { url: 'https://example.org/locales/es.json', version: '2.0.0' }));
  engine.setLocale('es-MX');

  const response = engine.getResponse();

  assert.deepEqual(response.displayedLocale, {
    url: 'https://example.org/locales/es.json',
    version: '2.0.0',
    locale: 'es',
  });
});

test('FormEngine omits displayedLocale when the active document carries no url of its own', () => {
  const engine = new FormEngine(DEFINITION);
  engine.loadLocale(makeLocale('es')); // no url — Locale §url is OPTIONAL, unlike Issuer's REQUIRED url
  engine.setLocale('es');

  const response = engine.getResponse();

  assert.equal(response.displayedLocale, undefined);
});

test('displayedLocale enters the signed-payload JCS preimage — the digest changes with it', () => {
  // Pin `now` so `authored` is identical across both engines; the only permitted variable is displayedLocale.
  const options = { now: '2026-01-01T00:00:00Z' };
  const engineEs = new FormEngine(DEFINITION, options);
  engineEs.loadLocale(makeLocale('en', { url: 'https://example.org/locales/en.json' }));
  engineEs.loadLocale(makeLocale('es', { url: 'https://example.org/locales/es.json' }));
  engineEs.setLocale('es');
  const responseEs = engineEs.getResponse({ id: 'resp-1' });

  const engineEn = new FormEngine(DEFINITION, options);
  engineEn.loadLocale(makeLocale('en', { url: 'https://example.org/locales/en.json' }));
  engineEn.loadLocale(makeLocale('es', { url: 'https://example.org/locales/es.json' }));
  engineEn.setLocale('en');
  const responseEn = engineEn.getResponse({ id: 'resp-1' });

  assert.notDeepEqual(responseEs.displayedLocale, responseEn.displayedLocale, 'sanity: the two responses actually differ in displayedLocale');
  assert.deepEqual(
    { ...responseEs, displayedLocale: undefined },
    { ...responseEn, displayedLocale: undefined },
    'sanity: displayedLocale is the only difference between the two responses',
  );

  // specs/core/spec.md §Signed Response Payload: strip `authoredSignatures` (the only omitted
  // field) before JCS canonicalization; every other top-level field, including displayedLocale,
  // is part of response_without_authoredSignatures.
  const digestOf = (response) => {
    const { authoredSignatures: _omitted, ...withoutAuthoredSignatures } = response;
    return createHash('sha256').update(canonicalize(withoutAuthoredSignatures)).digest('hex');
  };

  assert.notEqual(digestOf(responseEs), digestOf(responseEn));
});
