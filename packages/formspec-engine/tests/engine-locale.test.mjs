/** @filedesc Integration tests: FormEngine locale/VM wiring — loadLocale, setLocale, getFieldVM, getFormVM. */
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
    description: 'A test form',
    items: [
      { key: 'name', type: 'field', dataType: 'string', label: 'Full Name', hint: 'Enter name', description: 'Your legal name' },
    ],
    ...overrides,
  };
}

/** Minimal locale document. */
function makeLocale(locale, strings, opts = {}) {
  return {
    $formspecLocale: '2.0',
    locale,
    version: '1.0.0',
    fallback: opts.fallback,
    target: { kind: 'definition', url: 'https://example.org/form' },
    strings,
  };
}

// ── loadLocale / setLocale / getActiveLocale / getAvailableLocales ──

test('loadLocale adds a locale document to the engine', () => {
  const engine = new FormEngine(minDef());
  engine.loadLocale(makeLocale('fr', { 'name.label': 'Nom complet' }));
  assert.deepEqual(engine.getAvailableLocales(), ['fr']);
});

test('setLocale changes the active locale', () => {
  const engine = new FormEngine(minDef());
  engine.loadLocale(makeLocale('fr', { 'name.label': 'Nom complet' }));
  engine.setLocale('fr');
  assert.equal(engine.getActiveLocale(), 'fr');
});

test('getActiveLocale returns empty string before any locale is set', () => {
  const engine = new FormEngine(minDef());
  assert.equal(engine.getActiveLocale(), '');
});

test('getAvailableLocales returns empty array when no locales loaded', () => {
  const engine = new FormEngine(minDef());
  assert.deepEqual(engine.getAvailableLocales(), []);
});

test('multiple loadLocale calls accumulate', () => {
  const engine = new FormEngine(minDef());
  engine.loadLocale(makeLocale('fr', { 'name.label': 'Nom' }));
  engine.loadLocale(makeLocale('es', { 'name.label': 'Nombre' }));
  const locales = engine.getAvailableLocales();
  assert.ok(locales.includes('fr'));
  assert.ok(locales.includes('es'));
  assert.equal(locales.length, 2);
});

// ── getFieldVM ──

test('getFieldVM returns a FieldViewModel for a registered field path', () => {
  const engine = new FormEngine(minDef());
  const vm = engine.getFieldVM('name');
  assert.ok(vm, 'should return a FieldViewModel');
  assert.equal(vm.templatePath, 'name');
  assert.equal(vm.instancePath, 'name');
  assert.equal(vm.itemKey, 'name');
  assert.equal(vm.dataType, 'string');
});

test('getFieldVM returns undefined for unknown path', () => {
  const engine = new FormEngine(minDef());
  assert.equal(engine.getFieldVM('nonexistent'), undefined);
});

test('getFieldVM label resolves inline definition label without locale', () => {
  const engine = new FormEngine(minDef());
  const vm = engine.getFieldVM('name');
  assert.equal(vm.label.value, 'Full Name');
});

test('getFieldVM label resolves from loaded locale', () => {
  const engine = new FormEngine(minDef());
  engine.loadLocale(makeLocale('fr', { 'name.label': 'Nom complet' }));
  engine.setLocale('fr');
  const vm = engine.getFieldVM('name');
  assert.equal(vm.label.value, 'Nom complet');
});

test('getFieldVM hint resolves from loaded locale', () => {
  const engine = new FormEngine(minDef());
  engine.loadLocale(makeLocale('fr', { 'name.hint': 'Entrez le nom' }));
  engine.setLocale('fr');
  const vm = engine.getFieldVM('name');
  assert.equal(vm.hint.value, 'Entrez le nom');
});

test('getFieldVM value reflects engine signal', () => {
  const engine = new FormEngine(minDef());
  const vm = engine.getFieldVM('name');
  // Default value is empty for string fields
  assert.equal(vm.value.value, '');
  // Set value on engine and check VM
  engine.setValue('name', 'Alice');
  assert.equal(vm.value.value, 'Alice');
});

test('getFieldVM setValue writes through to engine', () => {
  const engine = new FormEngine(minDef());
  const vm = engine.getFieldVM('name');
  vm.setValue('Bob');
  assert.equal(engine.signals.name.value, 'Bob');
});

// ── getFormVM ──

test('getFormVM returns a FormViewModel', () => {
  const engine = new FormEngine(minDef());
  const formVM = engine.getFormVM();
  assert.ok(formVM, 'should return a FormViewModel');
});

test('getFormVM title resolves from definition without locale', () => {
  const engine = new FormEngine(minDef());
  const formVM = engine.getFormVM();
  assert.equal(formVM.title.value, 'Test Form');
});

test('getFormVM title resolves from loaded locale', () => {
  const engine = new FormEngine(minDef());
  engine.loadLocale(makeLocale('fr', { '$form.title': 'Formulaire de test' }));
  engine.setLocale('fr');
  const formVM = engine.getFormVM();
  assert.equal(formVM.title.value, 'Formulaire de test');
});

test('getFormVM description resolves from definition', () => {
  const engine = new FormEngine(minDef());
  const formVM = engine.getFormVM();
  assert.equal(formVM.description.value, 'A test form');
});

test('getFormVM isValid reflects current validation state', () => {
  const engine = new FormEngine(minDef({
    items: [
      { key: 'req', type: 'field', dataType: 'string', label: 'Required', required: true },
    ],
  }));
  const formVM = engine.getFormVM();
  // Required field with no value should be invalid
  assert.equal(formVM.isValid.value, false);
});

// ── setLabelContext flows through to FieldViewModel ──

test('setLabelContext updates FieldViewModel label via context labels', () => {
  const engine = new FormEngine(minDef({
    items: [
      {
        key: 'name',
        type: 'field',
        dataType: 'string',
        label: 'Full Name',
        labels: { short: 'Name' },
      },
    ],
  }));
  const vm = engine.getFieldVM('name');
  assert.equal(vm.label.value, 'Full Name');

  engine.setLabelContext('short');
  assert.equal(vm.label.value, 'Name');
});

// ── setRuntimeContext with locale ──

test('setRuntimeContext with locale property sets the active locale', () => {
  const engine = new FormEngine(minDef());
  engine.loadLocale(makeLocale('es', { 'name.label': 'Nombre completo' }));
  engine.setRuntimeContext({ locale: 'es' });
  assert.equal(engine.getActiveLocale(), 'es');
});

// ── Nested field VMs ──

test('getFieldVM works for nested group fields', () => {
  const engine = new FormEngine(minDef({
    items: [
      {
        key: 'address',
        type: 'group',
        label: 'Address',
        children: [
          { key: 'city', type: 'field', dataType: 'string', label: 'City' },
        ],
      },
    ],
  }));
  const vm = engine.getFieldVM('address.city');
  assert.ok(vm, 'should return VM for nested field');
  assert.equal(vm.label.value, 'City');
  assert.equal(vm.templatePath, 'address.city');
});

// ── Locale §3.1: item strings are keyed by Item `key`, not by dotted path ──

/** Every item-scoped Locale key family (§3.1.1–§3.1.4), addressed by bare Item key. */
const itemKeyedStrings = {
  'city.label': 'Ville',
  'city.label@short': 'Ville (court)',
  'city.hint': 'Nom de la ville',
  'city.description': 'Ville de résidence',
  'city.requiredMessage': 'La ville est obligatoire',
  'zip.constraintMessage': 'Code postal invalide',
  'country.errors.REQUIRED': 'Le pays est obligatoire',
  'country.options.us.label': 'États-Unis',
};

/** Fields exercising label, hint, description, context label, options, and each message family. */
function localizedChildren() {
  return [
    { key: 'city', type: 'field', dataType: 'string', label: 'City', hint: 'City name', description: 'Home city', labels: { short: 'City (short)' } },
    { key: 'zip', type: 'field', dataType: 'integer', label: 'ZIP' },
    { key: 'country', type: 'field', dataType: 'choice', label: 'Country', options: [{ value: 'us', label: 'United States' }] },
  ];
}

function loadItemKeyedLocale(engine) {
  engine.loadLocale(makeLocale('fr', itemKeyedStrings));
  engine.setLocale('fr');
}

function assertItemKeyedPresentationApplies(engine, prefix) {
  loadItemKeyedLocale(engine);
  const city = engine.getFieldVM(`${prefix}city`);
  assert.equal(city.label.value, 'Ville');
  assert.equal(city.hint.value, 'Nom de la ville');
  assert.equal(city.description.value, 'Ville de résidence');
  engine.setLabelContext('short');
  assert.equal(city.label.value, 'Ville (court)');
  engine.setLabelContext(null);
  assert.equal(engine.getFieldVM(`${prefix}country`).options.value[0].label, 'États-Unis');
}

function assertItemKeyedMessagesApply(engine, prefix) {
  loadItemKeyedLocale(engine);
  assert.equal(engine.getFieldVM(`${prefix}city`).firstError.value, 'La ville est obligatoire');
  assert.equal(engine.getFieldVM(`${prefix}country`).firstError.value, 'Le pays est obligatoire');
  engine.setValue(`${prefix}zip`, 0);
  assert.equal(engine.getFieldVM(`${prefix}zip`).firstError.value, 'Code postal invalide');
}

function groupEngine() {
  return new FormEngine(minDef({
    items: [{ key: 'address', type: 'group', label: 'Address', children: localizedChildren() }],
    binds: [
      { path: 'address.city', required: 'true' },
      { path: 'address.zip', constraint: '$ > 0' },
      { path: 'address.country', required: 'true' },
    ],
  }));
}

function repeatEngine() {
  return new FormEngine(minDef({
    items: [{ key: 'addresses', type: 'group', label: 'Addresses', repeatable: true, minRepeat: 1, children: localizedChildren() }],
    binds: [
      { path: 'addresses[*].city', required: 'true' },
      { path: 'addresses[*].zip', constraint: '$ > 0' },
      { path: 'addresses[*].country', required: 'true' },
    ],
  }));
}

test('Locale item-key presentation strings apply to fields nested in a group', () => {
  assertItemKeyedPresentationApplies(groupEngine(), 'address.');
});

test('Locale item-key validation messages apply to fields nested in a group', () => {
  assertItemKeyedMessagesApply(groupEngine(), 'address.');
});

test('Locale item-key presentation strings apply to fields inside a repeatable group', () => {
  assertItemKeyedPresentationApplies(repeatEngine(), 'addresses[0].');
});

test('Locale item-key validation messages apply to fields inside a repeatable group', () => {
  assertItemKeyedMessagesApply(repeatEngine(), 'addresses[0].');
});

test('Locale full dotted-path keys do not address nested items', () => {
  const engine = new FormEngine(minDef({
    items: [{ key: 'address', type: 'group', label: 'Address', children: localizedChildren() }],
  }));
  engine.loadLocale(makeLocale('fr', { 'address.city.label': 'Ville' }));
  engine.setLocale('fr');
  assert.equal(engine.getFieldVM('address.city').label.value, 'City');
});

// ── Edge cases: FEL interpolation in locale strings ──

test('getFieldVM label interpolates FEL expressions in locale strings', () => {
  const engine = new FormEngine(minDef({
    items: [
      { key: 'count', type: 'field', dataType: 'integer', label: 'Count', initialValue: 3 },
      { key: 'desc', type: 'field', dataType: 'string', label: 'Description' },
    ],
  }));
  engine.loadLocale(makeLocale('en', {
    'desc.label': 'Items ({{$count}})',
  }));
  engine.setLocale('en');
  const vm = engine.getFieldVM('desc');
  // FEL should resolve $count to the current value
  assert.equal(vm.label.value, 'Items (3)');
});

test('getFieldVM preserves literal interpolation on FEL parse/eval failure', () => {
  const engine = new FormEngine(minDef({
    items: [
      { key: 'desc', type: 'field', dataType: 'string', label: 'Description' },
    ],
  }));
  engine.loadLocale(makeLocale('en', {
    'desc.label': 'Broken {{!!!bad}} literal',
  }));
  engine.setLocale('en');
  const vm = engine.getFieldVM('desc');
  assert.equal(vm.label.value, 'Broken {{!!!bad}} literal');
});

test('getFormVM preserves literal interpolation on FEL parse/eval failure', () => {
  const engine = new FormEngine(minDef({ title: 'Fallback Title' }));
  engine.loadLocale(makeLocale('en', {
    '$form.title': 'Form {{!!!bad}} title',
  }));
  engine.setLocale('en');
  const formVM = engine.getFormVM();
  assert.equal(formVM.title.value, 'Form {{!!!bad}} title');
});

test('loading fallback locale after active locale re-evaluates localized label', () => {
  const engine = new FormEngine(minDef());
  engine.loadLocale(makeLocale('fr-CA', {}, { fallback: 'fr' }));
  engine.setLocale('fr-CA');
  const vm = engine.getFieldVM('name');
  assert.equal(vm.label.value, 'Full Name');

  // Load fallback document after VM exists; label should update reactively.
  engine.loadLocale(makeLocale('fr', { 'name.label': 'Nom' }));
  assert.equal(vm.label.value, 'Nom');
});

// ── Edge cases: Repeat group field VMs ──

test('getFieldVM returns VMs for repeat group instances', () => {
  const engine = new FormEngine(minDef({
    items: [
      {
        key: 'contacts',
        type: 'group',
        label: 'Contacts',
        repeatable: true,
        minRepeat: 2,
        children: [
          { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
        ],
      },
    ],
  }));
  const vm0 = engine.getFieldVM('contacts[0].email');
  const vm1 = engine.getFieldVM('contacts[1].email');
  assert.ok(vm0, 'should have VM for first repeat instance');
  assert.ok(vm1, 'should have VM for second repeat instance');
  assert.equal(vm0.instancePath, 'contacts[0].email');
  assert.equal(vm1.instancePath, 'contacts[1].email');
  // Both should share the same template path
  assert.equal(vm0.templatePath, 'contacts.email');
  assert.equal(vm1.templatePath, 'contacts.email');
});

test('getFieldVM errors are scoped to each repeat instance', () => {
  const engine = new FormEngine(minDef({
    items: [
      {
        key: 'contacts',
        type: 'group',
        label: 'Contacts',
        repeatable: true,
        minRepeat: 2,
        children: [
          { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
        ],
      },
    ],
    binds: [{ path: 'contacts[*].email', required: 'true' }],
  }));
  engine.setValue('contacts[1].email', 'a@example.org');
  const [row0, row1] = [engine.getFieldVM('contacts[0].email'), engine.getFieldVM('contacts[1].email')];
  assert.deepEqual(row0.errors.value.map((e) => e.code), ['REQUIRED']);
  assert.deepEqual(row1.errors.value, []);
});

test('getFieldVM returns undefined for removed repeat instance path', () => {
  const engine = new FormEngine(minDef({
    items: [
      {
        key: 'contacts',
        type: 'group',
        label: 'Contacts',
        repeatable: true,
        minRepeat: 2,
        children: [
          { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
        ],
      },
    ],
  }));

  assert.ok(engine.getFieldVM('contacts[1].email'));
  engine.removeRepeatInstance('contacts', 0);

  // After removing index 0 from 2 rows, only contacts[0] should exist.
  assert.equal(engine.getFieldVM('contacts[1].email'), undefined);
  assert.ok(engine.getFieldVM('contacts[0].email'));
});

// ── Edge cases: FieldVM required/visible/readonly reflect engine signals ──

test('getFieldVM required reflects bind required expression', () => {
  const engine = new FormEngine(minDef({
    items: [
      { key: 'name', type: 'field', dataType: 'string', label: 'Name', required: true },
    ],
  }));
  const vm = engine.getFieldVM('name');
  assert.equal(vm.required.value, true);
});

test('getFieldVM visible reflects bind relevant expression', () => {
  const engine = new FormEngine(minDef({
    items: [
      { key: 'toggle', type: 'field', dataType: 'boolean', label: 'Toggle' },
      { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
    ],
    binds: [
      { path: 'name', relevant: '$toggle = true' },
    ],
  }));
  const vm = engine.getFieldVM('name');
  // toggle is false/null initially, so name should be irrelevant
  assert.equal(vm.visible.value, false);
  engine.setValue('toggle', true);
  assert.equal(vm.visible.value, true);
});

// ── Edge cases: FieldVM options locale resolution ──

test('getFieldVM options resolve inline labels without locale', () => {
  const engine = new FormEngine(minDef({
    items: [
      {
        key: 'color',
        type: 'field',
        dataType: 'string',
        label: 'Color',
        options: [
          { value: 'r', label: 'Red' },
          { value: 'g', label: 'Green' },
        ],
      },
    ],
  }));
  const vm = engine.getFieldVM('color');
  const opts = vm.options.value;
  assert.equal(opts.length, 2);
  assert.equal(opts[0].value, 'r');
  assert.equal(opts[0].label, 'Red');
  assert.equal(opts[1].label, 'Green');
});

test('getFieldVM options resolve from locale when available', () => {
  const engine = new FormEngine(minDef({
    items: [
      {
        key: 'color',
        type: 'field',
        dataType: 'string',
        label: 'Color',
        options: [
          { value: 'r', label: 'Red' },
          { value: 'g', label: 'Green' },
        ],
      },
    ],
  }));
  engine.loadLocale(makeLocale('fr', {
    'color.options.r.label': 'Rouge',
    'color.options.g.label': 'Vert',
  }));
  engine.setLocale('fr');
  const vm = engine.getFieldVM('color');
  const opts = vm.options.value;
  assert.equal(opts[0].label, 'Rouge');
  assert.equal(opts[1].label, 'Vert');
});

// ── Edge cases: FormVM validationSummary ──

test('getFormVM validationSummary reflects current error counts', () => {
  const engine = new FormEngine(minDef({
    items: [
      { key: 'req1', type: 'field', dataType: 'string', label: 'R1', required: true },
      { key: 'req2', type: 'field', dataType: 'string', label: 'R2', required: true },
    ],
  }));
  const formVM = engine.getFormVM();
  const summary = formVM.validationSummary.value;
  assert.equal(summary.errors, 2);
});

// ── Edge cases: locale fallback cascade through engine ──

test('locale fallback cascade works through engine loadLocale', () => {
  const engine = new FormEngine(minDef());
  engine.loadLocale(makeLocale('fr', { 'name.label': 'Nom' }));
  engine.loadLocale(makeLocale('fr-CA', {}, { fallback: 'fr' }));
  engine.setLocale('fr-CA');
  const vm = engine.getFieldVM('name');
  // fr-CA falls back to fr
  assert.equal(vm.label.value, 'Nom');
});

// ── Edge cases: FieldVM id generation ──

test('getFieldVM id is generated from path', () => {
  const engine = new FormEngine(minDef({
    items: [
      {
        key: 'address',
        type: 'group',
        label: 'Address',
        children: [
          { key: 'zip', type: 'field', dataType: 'string', label: 'ZIP' },
        ],
      },
    ],
  }));
  const vm = engine.getFieldVM('address.zip');
  assert.equal(vm.id, 'field-address-zip');
});
