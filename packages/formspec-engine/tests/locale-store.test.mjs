/** @filedesc Tests for LocaleStore — locale document management and string resolution cascade. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LocaleStore, preactReactiveRuntime } from '../dist/index.js';

const rx = preactReactiveRuntime;

/** Helper: build a minimal locale document. */
function makeLocale(locale, strings, opts = {}) {
  return {
    $formspecLocale: '2.0',
    locale,
    version: opts.version ?? '1.0.0',
    fallback: opts.fallback,
    target: {
      kind: opts.targetKind ?? 'definition',
      url: opts.targetUrl ?? 'https://example.org/form',
    },
    strings,
  };
}

// --- Load + lookup ---

test('lookupKey returns correct value after loading a locale', () => {
  const store = new LocaleStore(rx);
  store.loadLocale(makeLocale('en', { 'name.label': 'Name' }));
  store.setLocale('en');
  assert.equal(store.lookupKey('name.label'), 'Name');
});

test('lookupKey returns null for missing key', () => {
  const store = new LocaleStore(rx);
  store.loadLocale(makeLocale('en', { 'name.label': 'Name' }));
  store.setLocale('en');
  assert.equal(store.lookupKey('nonexistent.key'), null);
});

// --- Cascade: regional -> explicit fallback -> implicit ---

test('explicit fallback: key found via fallback chain', () => {
  const store = new LocaleStore(rx);
  store.loadLocale(makeLocale('fr-CA', { 'name.label': 'Nom (CA)' }, { fallback: 'fr' }));
  store.loadLocale(makeLocale('fr', { 'city.label': 'Ville' }));
  store.setLocale('fr-CA');

  // Key in fr-CA directly
  assert.equal(store.lookupKey('name.label'), 'Nom (CA)');
  // Key only in fr, found via explicit fallback
  assert.equal(store.lookupKey('city.label'), 'Ville');
});

test('implicit language fallback: strip region subtag', () => {
  const store = new LocaleStore(rx);
  // fr-CA with NO explicit fallback
  store.loadLocale(makeLocale('fr-CA', { 'name.label': 'Nom (CA)' }));
  store.loadLocale(makeLocale('fr', { 'city.label': 'Ville' }));
  store.setLocale('fr-CA');

  // Key only in fr, found via implicit language fallback
  assert.equal(store.lookupKey('city.label'), 'Ville');
});

// --- Circular fallback detection ---

test('circular fallback terminates without infinite loop', () => {
  const store = new LocaleStore(rx);
  store.loadLocale(makeLocale('fr-CA', {}, { fallback: 'fr' }));
  store.loadLocale(makeLocale('fr', {}, { fallback: 'fr-CA' }));
  store.setLocale('fr-CA');

  // Should not hang; just returns null
  assert.equal(store.lookupKey('missing.key'), null);
});

// --- BCP 47 normalization ---

test('BCP 47 normalization: FR-ca normalizes to fr-CA', () => {
  assert.equal(LocaleStore.normalizeCode('FR-ca'), 'fr-CA');
  assert.equal(LocaleStore.normalizeCode('en-us'), 'en-US');
  assert.equal(LocaleStore.normalizeCode('AR'), 'ar');
});

test('lookup works with non-normalized locale codes', () => {
  const store = new LocaleStore(rx);
  store.loadLocale(makeLocale('FR-ca', { 'name.label': 'Nom' }));
  store.setLocale('fr-CA');
  assert.equal(store.lookupKey('name.label'), 'Nom');
});

test('documents with the same locale remain isolated by target kind and URL', () => {
  const store = new LocaleStore(rx);
  store.loadLocale(makeLocale('en', { heading: 'Definition A' }));
  store.loadLocale(makeLocale('en', { heading: 'Definition B' }, {
    targetUrl: 'https://example.org/other-form',
  }));
  store.loadLocale(makeLocale('en', { heading: 'App' }, {
    targetKind: 'app',
    targetUrl: 'https://example.org/app',
  }));
  store.setLocale('en');

  expectTarget('definition', 'https://example.org/form', 'Definition A');
  expectTarget('definition', 'https://example.org/other-form', 'Definition B');
  expectTarget('app', 'https://example.org/app', 'App');

  function expectTarget(kind, url, expected) {
    store.setTarget({ kind, url });
    assert.equal(store.lookupKey('heading'), expected);
  }
});

test('explicit and implicit fallback never consult another target', () => {
  const store = new LocaleStore(rx);
  store.loadLocale(makeLocale('fr-CA', {}, { fallback: 'fr' }));
  store.loadLocale(makeLocale('fr', { heading: 'Wrong target' }, {
    targetUrl: 'https://example.org/other-form',
  }));
  store.setTarget({ kind: 'definition', url: 'https://example.org/form' });
  store.setLocale('fr-CA');

  assert.equal(store.lookupKey('heading'), null);
});

// --- setLocale changes active locale ---

test('setLocale changes activeLocale signal', () => {
  const store = new LocaleStore(rx);
  assert.equal(store.activeLocale.value, '');
  store.setLocale('en');
  assert.equal(store.activeLocale.value, 'en');
  store.setLocale('fr-CA');
  assert.equal(store.activeLocale.value, 'fr-CA');
});

// --- Version signal ---

test('version bumps on setLocale', () => {
  const store = new LocaleStore(rx);
  const v0 = store.version.value;
  store.setLocale('en');
  assert.ok(store.version.value > v0, 'version should bump after setLocale');
});

test('version bumps on loading a replacement for the active locale', () => {
  const store = new LocaleStore(rx);
  store.loadLocale(makeLocale('en', { 'name.label': 'Name' }));
  store.setLocale('en');
  const v1 = store.version.value;

  // Load a new version for the active locale
  store.loadLocale(makeLocale('en', { 'name.label': 'Full Name' }, { version: '2.0.0' }));
  assert.ok(store.version.value > v1, 'version should bump when active locale is reloaded');
  assert.equal(store.lookupKey('name.label'), 'Full Name');
});

test('version bumps when loading a non-active locale (cascade can change)', () => {
  const store = new LocaleStore(rx);
  store.setLocale('en');
  const v1 = store.version.value;

  store.loadLocale(makeLocale('fr', { 'name.label': 'Nom' }));
  assert.ok(store.version.value > v1, 'version should bump for non-active locale loads');
});

// --- lookupKeyWithMeta ---

test('lookupKeyWithMeta returns regional source for direct hit', () => {
  const store = new LocaleStore(rx);
  store.loadLocale(makeLocale('fr-CA', { 'name.label': 'Nom (CA)' }, { fallback: 'fr' }));
  store.loadLocale(makeLocale('fr', { 'city.label': 'Ville' }));
  store.setLocale('fr-CA');

  const result = store.lookupKeyWithMeta('name.label');
  assert.equal(result.value, 'Nom (CA)');
  assert.equal(result.source, 'regional');
  assert.equal(result.localeCode, 'fr-CA');
});

test('lookupKeyWithMeta returns only canonical Need anchors for the selected string', () => {
  const store = new LocaleStore(rx);
  store.loadLocale({
    ...makeLocale('fr', { 'name.label': 'Nom' }),
    stringGeneration: {
      'name.label': {
        anchors: [
          'need:localized-name@2',
          'not-a-need-anchor',
          'need:localized-name@2',
        ],
      },
    },
  });
  store.setLocale('fr');

  const result = store.lookupKeyWithMeta('name.label');
  assert.deepEqual(result.needAnchors, ['need:localized-name@2']);
});

test('lookupKeyWithMeta returns fallback source for explicit fallback hit', () => {
  const store = new LocaleStore(rx);
  store.loadLocale(makeLocale('fr-CA', { 'name.label': 'Nom (CA)' }, { fallback: 'fr' }));
  store.loadLocale(makeLocale('fr', { 'city.label': 'Ville' }));
  store.setLocale('fr-CA');

  const result = store.lookupKeyWithMeta('city.label');
  assert.equal(result.value, 'Ville');
  assert.equal(result.source, 'fallback');
  assert.equal(result.localeCode, 'fr');
});

test('lookupKeyWithMeta returns implicit source for language fallback', () => {
  const store = new LocaleStore(rx);
  // No explicit fallback
  store.loadLocale(makeLocale('fr-CA', { 'name.label': 'Nom (CA)' }));
  store.loadLocale(makeLocale('fr', { 'city.label': 'Ville' }));
  store.setLocale('fr-CA');

  const result = store.lookupKeyWithMeta('city.label');
  assert.equal(result.value, 'Ville');
  assert.equal(result.source, 'implicit');
  assert.equal(result.localeCode, 'fr');
});

test('lookupKeyWithMeta returns null source for missing key', () => {
  const store = new LocaleStore(rx);
  store.loadLocale(makeLocale('en', {}));
  store.setLocale('en');

  const result = store.lookupKeyWithMeta('nonexistent');
  assert.equal(result.value, null);
  assert.equal(result.source, null);
});

// --- Direction signal ---

test('direction returns rtl for Arabic locale in auto mode', () => {
  const store = new LocaleStore(rx, 'auto');
  store.setLocale('ar');
  assert.equal(store.direction.value, 'rtl');
});

test('direction returns rtl for Arabic regional variant in auto mode', () => {
  const store = new LocaleStore(rx, 'auto');
  store.setLocale('ar-EG');
  assert.equal(store.direction.value, 'rtl');
});

test('direction returns ltr for French in auto mode', () => {
  const store = new LocaleStore(rx, 'auto');
  store.setLocale('fr');
  assert.equal(store.direction.value, 'ltr');
});

test('direction returns explicit override when directionMode is ltr', () => {
  const store = new LocaleStore(rx, 'ltr');
  store.setLocale('ar');
  assert.equal(store.direction.value, 'ltr');
});

test('direction returns explicit override when directionMode is rtl', () => {
  const store = new LocaleStore(rx, 'rtl');
  store.setLocale('en');
  assert.equal(store.direction.value, 'rtl');
});

test('direction defaults to ltr when no directionMode specified', () => {
  const store = new LocaleStore(rx);
  store.setLocale('ar');
  // Default is 'ltr', not 'auto'
  assert.equal(store.direction.value, 'ltr');
});

test('setDirectionMode updates direction reactively', () => {
  const store = new LocaleStore(rx, 'ltr');
  store.setLocale('ar');
  assert.equal(store.direction.value, 'ltr');

  store.setDirectionMode('auto');
  assert.equal(store.direction.value, 'rtl');
});

// --- getAvailableLocales ---

test('getAvailableLocales returns empty when none loaded', () => {
  const store = new LocaleStore(rx);
  assert.deepEqual(store.getAvailableLocales(), []);
});

test('getAvailableLocales returns codes of all loaded documents', () => {
  const store = new LocaleStore(rx);
  store.loadLocale(makeLocale('en', {}));
  store.loadLocale(makeLocale('fr-CA', {}));
  store.loadLocale(makeLocale('ar', {}));

  const locales = store.getAvailableLocales();
  assert.equal(locales.length, 3);
  assert.ok(locales.includes('en'));
  assert.ok(locales.includes('fr-CA'));
  assert.ok(locales.includes('ar'));
});

// --- Hot reload ---

test('hot reload: new document for active locale updates lookups', () => {
  const store = new LocaleStore(rx);
  store.loadLocale(makeLocale('en', { 'name.label': 'Name', 'old.key': 'Old' }));
  store.setLocale('en');
  assert.equal(store.lookupKey('name.label'), 'Name');
  assert.equal(store.lookupKey('old.key'), 'Old');

  const v1 = store.version.value;
  // Hot reload with updated strings (old.key removed, name.label changed)
  store.loadLocale(makeLocale('en', { 'name.label': 'Full Name' }, { version: '2.0.0' }));

  assert.ok(store.version.value > v1, 'version bumps on hot reload');
  assert.equal(store.lookupKey('name.label'), 'Full Name');
  assert.equal(store.lookupKey('old.key'), null, 'removed key should return null');
});

// --- Edge: no active locale ---

test('lookupKey returns null when no active locale is set', () => {
  const store = new LocaleStore(rx);
  store.loadLocale(makeLocale('en', { 'name.label': 'Name' }));
  // Never called setLocale
  assert.equal(store.lookupKey('name.label'), null);
});
