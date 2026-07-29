/** @filedesc Tests for FormViewModel — form-level locale-resolved reactive state. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { preactReactiveRuntime } from '../dist/reactivity/preact-runtime.js';
import { LocaleStore } from '../dist/locale.js';
import { createFormViewModel } from '../dist/form-view-model.js';

/**
 * Build a FormViewModel with sensible defaults.
 * Override any dep via the `overrides` object.
 */
function buildVM(overrides = {}) {
  const rx = preactReactiveRuntime;
  const localeStore = new LocaleStore(rx);

  const defaults = {
    rx,
    localeStore,
    getDefinitionTitle: () => 'My Form',
    getDefinitionDescription: () => 'A test form',
    getPageTitle: () => undefined,
    getPageDescription: () => undefined,
    evalFEL: () => undefined,
    getValidationCounts: () => ({ errors: 0, warnings: 0, infos: 0 }),
    getIsValid: () => true,
  };

  return {
    vm: createFormViewModel({ ...defaults, ...overrides }),
    localeStore,
    rx,
  };
}

// ── title signal ──

test('title falls back to definition title when no locale loaded', () => {
  const { vm } = buildVM({ getDefinitionTitle: () => 'Grant Application' });
  assert.equal(vm.title.value, 'Grant Application');
});

test('title resolves $form.title from locale', () => {
  const rx = preactReactiveRuntime;
  const localeStore = new LocaleStore(rx);
  localeStore.loadLocale({
    $formspecLocale: '2.0',
    locale: 'fr',
    version: '1.0',
    target: { kind: 'definition', url: 'test' },
    strings: { '$form.title': 'Demande de subvention' },
  });
  localeStore.setLocale('fr');

  const { vm } = buildVM({
    localeStore,
    getDefinitionTitle: () => 'Grant Application',
  });

  assert.equal(vm.title.value, 'Demande de subvention');
});

// ── description signal ──

test('description falls back to definition description when no locale loaded', () => {
  const { vm } = buildVM({ getDefinitionDescription: () => 'Fill out this form' });
  assert.equal(vm.description.value, 'Fill out this form');
});

test('description resolves $form.description from locale', () => {
  const rx = preactReactiveRuntime;
  const localeStore = new LocaleStore(rx);
  localeStore.loadLocale({
    $formspecLocale: '2.0',
    locale: 'fr',
    version: '1.0',
    target: { kind: 'definition', url: 'test' },
    strings: { '$form.description': 'Remplissez ce formulaire' },
  });
  localeStore.setLocale('fr');

  const { vm } = buildVM({
    localeStore,
    getDefinitionDescription: () => 'Fill out this form',
  });

  assert.equal(vm.description.value, 'Remplissez ce formulaire');
});

test('description returns empty string when no definition description and no locale', () => {
  const { vm } = buildVM({ getDefinitionDescription: () => undefined });
  assert.equal(vm.description.value, '');
});

// ── pageTitle() returns stable signal ──

test('pageTitle returns same signal identity for same pageId (memoization)', () => {
  const { vm } = buildVM();
  const sig1 = vm.pageTitle('info');
  const sig2 = vm.pageTitle('info');
  assert.equal(sig1, sig2, 'must return the same signal object');
});

test('pageTitle returns different signals for different pageIds', () => {
  const { vm } = buildVM();
  const sig1 = vm.pageTitle('info');
  const sig2 = vm.pageTitle('review');
  assert.notEqual(sig1, sig2);
});

// ── pageTitle() resolves locale ──

test('pageTitle resolves $page.<id>.title from locale', () => {
  const rx = preactReactiveRuntime;
  const localeStore = new LocaleStore(rx);
  localeStore.loadLocale({
    $formspecLocale: '2.0',
    locale: 'fr',
    version: '1.0',
    target: { kind: 'definition', url: 'test' },
    strings: { '$page.info.title': 'Informations du projet' },
  });
  localeStore.setLocale('fr');

  const { vm } = buildVM({
    localeStore,
    getPageTitle: (id) => id === 'info' ? 'Project Info' : undefined,
  });

  assert.equal(vm.pageTitle('info').value, 'Informations du projet');
});

// ── pageTitle() fallback ──

test('pageTitle falls back to theme page title when no locale key', () => {
  const { vm } = buildVM({
    getPageTitle: (id) => id === 'info' ? 'Project Info' : undefined,
  });
  assert.equal(vm.pageTitle('info').value, 'Project Info');
});

test('pageTitle falls back to empty string when no locale and no theme title', () => {
  const { vm } = buildVM({
    getPageTitle: () => undefined,
  });
  assert.equal(vm.pageTitle('missing').value, '');
});

// ── pageDescription() ──

test('pageDescription returns same signal identity for same pageId (memoization)', () => {
  const { vm } = buildVM();
  const sig1 = vm.pageDescription('info');
  const sig2 = vm.pageDescription('info');
  assert.equal(sig1, sig2);
});

test('pageDescription resolves $page.<id>.description from locale', () => {
  const rx = preactReactiveRuntime;
  const localeStore = new LocaleStore(rx);
  localeStore.loadLocale({
    $formspecLocale: '2.0',
    locale: 'fr',
    version: '1.0',
    target: { kind: 'definition', url: 'test' },
    strings: { '$page.info.description': 'Entrez les details' },
  });
  localeStore.setLocale('fr');

  const { vm } = buildVM({
    localeStore,
    getPageDescription: (id) => id === 'info' ? 'Enter details' : undefined,
  });

  assert.equal(vm.pageDescription('info').value, 'Entrez les details');
});

test('pageDescription falls back to theme page description', () => {
  const { vm } = buildVM({
    getPageDescription: (id) => id === 'info' ? 'Enter details' : undefined,
  });
  assert.equal(vm.pageDescription('info').value, 'Enter details');
});

// ── isValid signal ──

test('isValid reflects getIsValid callback', () => {
  let valid = true;
  const rx = preactReactiveRuntime;
  // We need a signal that the computed can track
  const validSignal = rx.signal(true);

  const { vm } = buildVM({
    rx,
    getIsValid: () => validSignal.value,
  });

  assert.equal(vm.isValid.value, true);
  validSignal.value = false;
  assert.equal(vm.isValid.value, false);
});

// ── validationSummary signal ──

test('validationSummary reflects getValidationCounts callback', () => {
  const rx = preactReactiveRuntime;
  const countsSignal = rx.signal({ errors: 0, warnings: 0, infos: 0 });

  const { vm } = buildVM({
    rx,
    getValidationCounts: () => countsSignal.value,
  });

  assert.deepEqual(vm.validationSummary.value, { errors: 0, warnings: 0, infos: 0 });
  countsSignal.value = { errors: 2, warnings: 1, infos: 0 };
  assert.deepEqual(vm.validationSummary.value, { errors: 2, warnings: 1, infos: 0 });
});

// ── FEL interpolation in title ──

test('title interpolates {{expr}} using evalFEL', () => {
  const rx = preactReactiveRuntime;
  const localeStore = new LocaleStore(rx);
  localeStore.loadLocale({
    $formspecLocale: '2.0',
    locale: 'en',
    version: '1.0',
    target: { kind: 'definition', url: 'test' },
    strings: { '$form.title': 'Total: {{$count}}' },
  });
  localeStore.setLocale('en');

  const countSignal = rx.signal(5);

  const { vm } = buildVM({
    rx,
    localeStore,
    getDefinitionTitle: () => 'Totals',
    evalFEL: (expr) => {
      if (expr === '$count') return countSignal.value;
      return undefined;
    },
  });

  assert.equal(vm.title.value, 'Total: 5');

  // Reactive: changing the signal should update the title
  countSignal.value = 12;
  assert.equal(vm.title.value, 'Total: 12');
});

test('title interpolates {{expr}} in definition fallback too', () => {
  const rx = preactReactiveRuntime;
  const countSignal = rx.signal(3);

  const { vm } = buildVM({
    rx,
    getDefinitionTitle: () => 'Items: {{$count}}',
    evalFEL: (expr) => {
      if (expr === '$count') return countSignal.value;
      return undefined;
    },
  });

  assert.equal(vm.title.value, 'Items: 3');
});

// ── locale reactivity ──

test('title re-resolves when locale changes', () => {
  const rx = preactReactiveRuntime;
  const localeStore = new LocaleStore(rx);
  localeStore.loadLocale({
    $formspecLocale: '2.0',
    locale: 'en',
    version: '1.0',
    target: { kind: 'definition', url: 'test' },
    strings: { '$form.title': 'English Title' },
  });
  localeStore.loadLocale({
    $formspecLocale: '2.0',
    locale: 'fr',
    version: '1.0',
    target: { kind: 'definition', url: 'test' },
    strings: { '$form.title': 'Titre Francais' },
  });
  localeStore.setLocale('en');

  const { vm } = buildVM({
    localeStore,
    getDefinitionTitle: () => 'Default',
  });

  assert.equal(vm.title.value, 'English Title');

  localeStore.setLocale('fr');
  assert.equal(vm.title.value, 'Titre Francais');
});
