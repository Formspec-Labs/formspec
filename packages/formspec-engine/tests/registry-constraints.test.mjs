/** @filedesc Registry constraints: extension fields with registry entries enforce pattern and length constraints */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

/**
 * Registry extension constraints: when a field declares an extension
 * (e.g. `"x-formspec-email": true`) and matching registry entries are
 * provided, the engine should enforce the registry's constraints
 * (pattern, maxLength) at the validation level.
 */

const emailRegistryEntry = {
  name: 'x-formspec-email',
  category: 'dataType',
  version: '1.0.0',
  status: 'stable',
  description: 'Email address with RFC 5322 validation.',
  compatibility: { formspecVersion: '>=1.0.0 <2.0.0' },
  baseType: 'string',
  constraints: {
    pattern: '^[a-zA-Z0-9.!#$%&\'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$',
    maxLength: 254,
  },
  metadata: {
    inputMode: 'email',
    autocomplete: 'email',
    displayName: 'Email address',
  },
};

function createEmailEngine(registryEntries) {
  return new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/registry-test',
    version: '1.0.0',
    title: 'Registry Constraint Test',
    items: [
      {
        key: 'email',
        type: 'field',
        dataType: 'string',
        label: 'Email',
        extensions: { 'x-formspec-email': true },
      },
    ],
  }, undefined, registryEntries);
}

test('registry pattern constraint rejects invalid email', () => {
  const engine = createEmailEngine([emailRegistryEntry]);
  engine.setValue('email', 'not-an-email');

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'PATTERN_MISMATCH');
  assert.ok(err, 'Expected PATTERN_MISMATCH error for invalid email');
  assert.equal(err.path, 'email');
});

test('registry PATTERN_MISMATCH uses displayName in message', () => {
  const engine = createEmailEngine([emailRegistryEntry]);
  engine.setValue('email', 'bad');

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'PATTERN_MISMATCH');
  assert.ok(err, 'Expected PATTERN_MISMATCH error');
  assert.ok(err.message.includes('Email address'), `Message should include displayName, got: "${err.message}"`);
  assert.ok(!err.message.includes('Pattern mismatch'), 'Message should not be generic "Pattern mismatch"');
});

test('registry pattern constraint accepts valid email', () => {
  const engine = createEmailEngine([emailRegistryEntry]);
  engine.setValue('email', 'user@example.com');

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'PATTERN_MISMATCH');
  assert.equal(err, undefined, 'Should not have pattern error for valid email');
});

test('registry pattern constraint is null-propagating (empty value = no error)', () => {
  const engine = createEmailEngine([emailRegistryEntry]);
  // leave email empty (null)

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'PATTERN_MISMATCH');
  assert.equal(err, undefined, 'Empty optional field should not trigger pattern error');
});

test('registry maxLength constraint rejects too-long value', () => {
  const engine = createEmailEngine([emailRegistryEntry]);
  engine.setValue('email', 'a'.repeat(255));

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'MAX_LENGTH_EXCEEDED');
  assert.ok(err, 'Expected MAX_LENGTH_EXCEEDED error');
  assert.equal(err.path, 'email');
});

test('registry maxLength constraint accepts value at limit', () => {
  const engine = createEmailEngine([emailRegistryEntry]);
  // 254 chars is exactly at the limit
  const localPart = 'a'.repeat(63);
  const domain = 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.com';
  const email = localPart + '@' + domain;
  // Just use a string that's exactly 254 chars for maxLength test
  engine.setValue('email', 'x'.repeat(254));

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'MAX_LENGTH_EXCEEDED');
  assert.equal(err, undefined, 'Value at maxLength limit should be accepted');
});

test('disabled extension (false) does not enforce constraints', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/registry-test',
    version: '1.0.0',
    title: 'Disabled Extension Test',
    items: [
      {
        key: 'email',
        type: 'field',
        dataType: 'string',
        label: 'Email',
        extensions: { 'x-formspec-email': false },
      },
    ],
  }, undefined, [emailRegistryEntry]);

  engine.setValue('email', 'not-an-email');
  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'PATTERN_MISMATCH');
  assert.equal(err, undefined, 'Disabled extension should not enforce constraints');
});

test('no registry entries = UNRESOLVED_EXTENSION error', () => {
  const engine = createEmailEngine(undefined);
  engine.setValue('email', 'user@example.com');

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'UNRESOLVED_EXTENSION');
  assert.ok(err, 'Extension declared without matching registry entry should produce UNRESOLVED_EXTENSION');
  assert.equal(err.path, 'email');
  assert.equal(err.severity, 'error');
});

test('UNRESOLVED_EXTENSION reports extension name in message', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/registry-test',
    version: '1.0.0',
    title: 'Unresolved Test',
    items: [{
      key: 'val',
      type: 'field',
      dataType: 'string',
      label: 'Val',
      extensions: { 'x-acme-widget': true },
    }],
  });

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'UNRESOLVED_EXTENSION');
  assert.ok(err, 'Unknown extension should produce UNRESOLVED_EXTENSION');
  assert.ok(err.message.includes('x-acme-widget'), 'Message should name the unresolved extension');
});

test('disabled extension (false) does not produce UNRESOLVED_EXTENSION', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/registry-test',
    version: '1.0.0',
    title: 'Disabled Ext Test',
    items: [{
      key: 'val',
      type: 'field',
      dataType: 'string',
      label: 'Val',
      extensions: { 'x-acme-widget': false },
    }],
  });

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'UNRESOLVED_EXTENSION');
  assert.equal(err, undefined, 'Disabled extension should not trigger UNRESOLVED_EXTENSION');
});

// ── Numeric range constraints (minimum / maximum) ────────────────────

const percentageRegistryEntry = {
  name: 'x-formspec-percentage',
  category: 'dataType',
  version: '1.0.0',
  status: 'stable',
  description: 'Percentage value (0-100).',
  compatibility: { formspecVersion: '>=1.0.0 <2.0.0' },
  baseType: 'decimal',
  constraints: {
    minimum: 0,
    maximum: 100,
  },
  metadata: {
    suffix: '%',
    precision: 2,
    displayName: 'Percentage',
  },
};

function createPercentageEngine(registryEntries) {
  return new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/registry-range-test',
    version: '1.0.0',
    title: 'Registry Range Test',
    items: [
      {
        key: 'rate',
        type: 'field',
        dataType: 'decimal',
        label: 'Rate',
        extensions: { 'x-formspec-percentage': true },
      },
    ],
  }, undefined, registryEntries);
}

test('registry minimum constraint rejects value below minimum', () => {
  const engine = createPercentageEngine([percentageRegistryEntry]);
  engine.setValue('rate', -5);

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'RANGE_UNDERFLOW');
  assert.ok(err, 'Expected RANGE_UNDERFLOW error for value below minimum');
  assert.equal(err.path, 'rate');
});

test('registry maximum constraint rejects value above maximum', () => {
  const engine = createPercentageEngine([percentageRegistryEntry]);
  engine.setValue('rate', 150);

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'RANGE_OVERFLOW');
  assert.ok(err, 'Expected RANGE_OVERFLOW error for value above maximum');
  assert.equal(err.path, 'rate');
});

test('registry range constraints accept value within range', () => {
  const engine = createPercentageEngine([percentageRegistryEntry]);
  engine.setValue('rate', 50);

  const report = engine.getValidationReport({ profile: 'live' });
  const rangeErr = report.results.find(r => r.code === 'RANGE_UNDERFLOW' || r.code === 'RANGE_OVERFLOW');
  assert.equal(rangeErr, undefined, 'Value within range should not trigger range errors');
});

test('registry range constraints accept boundary values', () => {
  const engine = createPercentageEngine([percentageRegistryEntry]);
  engine.setValue('rate', 0);

  let report = engine.getValidationReport({ profile: 'live' });
  let err = report.results.find(r => r.code === 'RANGE_UNDERFLOW' || r.code === 'RANGE_OVERFLOW');
  assert.equal(err, undefined, 'Value at minimum boundary should be accepted');

  engine.setValue('rate', 100);
  report = engine.getValidationReport({ profile: 'live' });
  err = report.results.find(r => r.code === 'RANGE_UNDERFLOW' || r.code === 'RANGE_OVERFLOW');
  assert.equal(err, undefined, 'Value at maximum boundary should be accepted');
});

test('registry range constraints are null-propagating', () => {
  const engine = createPercentageEngine([percentageRegistryEntry]);
  // leave null

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'RANGE_UNDERFLOW' || r.code === 'RANGE_OVERFLOW');
  assert.equal(err, undefined, 'Empty optional field should not trigger range errors');
});

// ── §7.3 Compatibility check ─────────────────────────────────────────

test('compatible extension produces no EXTENSION_COMPATIBILITY_MISMATCH', () => {
  // emailRegistryEntry has compatibility.formspecVersion: ">=1.0.0 <2.0.0"
  // definition has $formspec: "1.0" — should be compatible
  const engine = createEmailEngine([emailRegistryEntry]);

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'EXTENSION_COMPATIBILITY_MISMATCH');
  assert.equal(err, undefined, 'Compatible extension should not trigger compatibility warning');
});

test('incompatible extension produces EXTENSION_COMPATIBILITY_MISMATCH warning', () => {
  const incompatibleEntry = {
    ...emailRegistryEntry,
    compatibility: { formspecVersion: '>=2.0.0 <3.0.0' },
  };
  const engine = createEmailEngine([incompatibleEntry]);

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'EXTENSION_COMPATIBILITY_MISMATCH');
  assert.ok(err, 'Expected EXTENSION_COMPATIBILITY_MISMATCH for incompatible entry');
  assert.equal(err.severity, 'warning');
  assert.equal(err.path, 'email');
});

test('EXTENSION_COMPATIBILITY_MISMATCH message includes extension and version info', () => {
  const incompatibleEntry = {
    ...emailRegistryEntry,
    compatibility: { formspecVersion: '>=2.0.0 <3.0.0' },
  };
  const engine = createEmailEngine([incompatibleEntry]);

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'EXTENSION_COMPATIBILITY_MISMATCH');
  assert.ok(err);
  assert.ok(err.message.includes('x-formspec-email'), 'Message should name the extension');
  assert.ok(err.message.includes('>=2.0.0'), 'Message should include the required version range');
});

test('missing compatibility field does not produce warning', () => {
  const { compatibility, ...noCompatEntry } = emailRegistryEntry;
  const engine = createEmailEngine([noCompatEntry]);

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'EXTENSION_COMPATIBILITY_MISMATCH');
  assert.equal(err, undefined, 'Missing compatibility should not crash or warn');
});

// ── §7.4 Status enforcement ──────────────────────────────────────────

test('retired extension produces EXTENSION_RETIRED warning', () => {
  const retiredEntry = { ...emailRegistryEntry, status: 'retired' };
  const engine = createEmailEngine([retiredEntry]);

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'EXTENSION_RETIRED');
  assert.ok(err, 'Expected EXTENSION_RETIRED warning');
  assert.equal(err.severity, 'warning');
  assert.equal(err.path, 'email');
});

test('retired extension message includes extension name', () => {
  const retiredEntry = { ...emailRegistryEntry, status: 'retired' };
  const engine = createEmailEngine([retiredEntry]);

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'EXTENSION_RETIRED');
  assert.ok(err);
  assert.ok(err.message.includes('x-formspec-email'), 'Message should name the retired extension');
});

test('deprecated extension produces EXTENSION_DEPRECATED info', () => {
  const deprecatedEntry = {
    ...emailRegistryEntry,
    status: 'deprecated',
    deprecationNotice: 'Use x-formspec-email-v2 instead',
  };
  const engine = createEmailEngine([deprecatedEntry]);

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'EXTENSION_DEPRECATED');
  assert.ok(err, 'Expected EXTENSION_DEPRECATED info');
  assert.equal(err.severity, 'info');
  assert.equal(err.path, 'email');
});

test('deprecated extension message includes deprecationNotice', () => {
  const deprecatedEntry = {
    ...emailRegistryEntry,
    status: 'deprecated',
    deprecationNotice: 'Use x-formspec-email-v2 instead',
  };
  const engine = createEmailEngine([deprecatedEntry]);

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'EXTENSION_DEPRECATED');
  assert.ok(err);
  assert.ok(err.message.includes('Use x-formspec-email-v2 instead'), 'Message should include deprecation notice');
});

test('stable extension produces no status warnings', () => {
  const engine = createEmailEngine([emailRegistryEntry]); // status: 'stable'
  const report = engine.getValidationReport({ profile: 'live' });
  const statusErr = report.results.find(r =>
    r.code === 'EXTENSION_RETIRED' || r.code === 'EXTENSION_DEPRECATED'
  );
  assert.equal(statusErr, undefined, 'Stable extension should not trigger status warnings');
});

test('draft extension produces no status warnings', () => {
  const draftEntry = { ...emailRegistryEntry, status: 'draft' };
  const engine = createEmailEngine([draftEntry]);

  const report = engine.getValidationReport({ profile: 'live' });
  const statusErr = report.results.find(r =>
    r.code === 'EXTENSION_RETIRED' || r.code === 'EXTENSION_DEPRECATED'
  );
  assert.equal(statusErr, undefined, 'Draft extension should not trigger status warnings');
});

// ── Group extension checks ───────────────────────────────────────────

test('UNRESOLVED_EXTENSION fires on groups, not just fields', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/group-ext-test',
    version: '1.0.0',
    title: 'Group Extension Test',
    items: [{
      key: 'myGroup',
      type: 'group',
      label: 'My Group',
      extensions: { 'x-acme-group-meta': true },
      children: [
        { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
      ],
    }],
  });

  const report = engine.getValidationReport({ profile: 'live' });
  const err = report.results.find(r => r.code === 'UNRESOLVED_EXTENSION' && r.path === 'myGroup');
  assert.ok(err, 'UNRESOLVED_EXTENSION should fire on group items');
  assert.ok(err.message.includes('x-acme-group-meta'));
});
