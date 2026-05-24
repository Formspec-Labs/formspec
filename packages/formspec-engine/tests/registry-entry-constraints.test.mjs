/** @filedesc Registry entry constraints: property-based tests against the real formspec-common registry entries */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { FormEngine } from '../dist/index.js';

// ── Load real registry ───────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const registryPath = resolve(__dirname, '../../../registries/formspec-common.registry.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
const entries = registry.entries;

function findEntry(name) {
  const entry = entries.find(e => e.name === name);
  if (!entry) throw new Error(`Registry entry "${name}" not found`);
  return entry;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Create a FormEngine with a single field using the given extension. */
function makeEngine(extName, dataType) {
  const entry = findEntry(extName);
  return new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/registry-entry-test',
    version: '1.0.0',
    title: `Test ${extName}`,
    items: [{
      key: 'v',
      type: 'field',
      dataType,
      label: 'Value',
      extensions: { [extName]: true },
    }],
  }, undefined, [entry]);
}

function hasCode(engine, code) {
  const report = engine.getValidationReport({ profile: 'live' });
  return report.results.some(r => r.code === code);
}

function assertNoPatternOrRange(engine, label) {
  const report = engine.getValidationReport({ profile: 'live' });
  const bad = report.results.find(r =>
    ['PATTERN_MISMATCH', 'RANGE_UNDERFLOW', 'RANGE_OVERFLOW', 'MAX_LENGTH_EXCEEDED'].includes(r.code)
  );
  assert.equal(bad, undefined, `Expected no constraint error for ${label}, got ${bad?.code}: ${bad?.message}`);
}

const NUM_RUNS = 50;

// ── Pattern-based dataType entries ───────────────────────────────────

/**
 * For each pattern-based entry we test:
 *   1. Random strings matching the regex pass validation.
 *   2. Known-bad strings fail with PATTERN_MISMATCH.
 */

// ── x-formspec-email ─────────────────────────────────────────────────
test('x-formspec-email: random valid emails pass', () => {
  const engine = makeEngine('x-formspec-email', 'string');
  fc.assert(fc.property(
    fc.emailAddress(),
    (email) => {
      engine.setValue('v', email);
      return !hasCode(engine, 'PATTERN_MISMATCH');
    }
  ), { numRuns: NUM_RUNS });
});

test('x-formspec-email: random invalid strings fail', () => {
  const engine = makeEngine('x-formspec-email', 'string');
  const invalidEmails = ['plaintext', 'missing@', '@nodomain', 'spaces in@email.com', 'a@@b.com'];
  for (const bad of invalidEmails) {
    engine.setValue('v', bad);
    assert.ok(hasCode(engine, 'PATTERN_MISMATCH'), `Expected PATTERN_MISMATCH for "${bad}"`);
  }
});

test('x-formspec-email: maxLength 254 enforced', () => {
  const engine = makeEngine('x-formspec-email', 'string');
  fc.assert(fc.property(
    fc.integer({ min: 255, max: 400 }),
    (len) => {
      engine.setValue('v', 'a'.repeat(len));
      return hasCode(engine, 'MAX_LENGTH_EXCEEDED');
    }
  ), { numRuns: NUM_RUNS });
});

// ── x-formspec-phone (E.164) ────────────────────────────────────────
test('x-formspec-phone: random valid E.164 numbers pass', () => {
  const engine = makeEngine('x-formspec-phone', 'string');
  // E.164: +<country 1-3 digits><subscriber up to 12 digits>, total 2-15 digits after +
  const digit = fc.constantFrom('0','1','2','3','4','5','6','7','8','9');
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 9 }),
    fc.array(digit, { minLength: 1, maxLength: 14 }),
    (first, rest) => {
      const phone = `+${first}${rest.join('')}`;
      engine.setValue('v', phone);
      return !hasCode(engine, 'PATTERN_MISMATCH');
    }
  ), { numRuns: NUM_RUNS });
});

test('x-formspec-phone: invalid formats fail', () => {
  const engine = makeEngine('x-formspec-phone', 'string');
  const invalid = ['1234567890', '+0123456789', '+', '+ 1234', 'abc', '+1234567890123456'];
  for (const bad of invalid) {
    engine.setValue('v', bad);
    assert.ok(hasCode(engine, 'PATTERN_MISMATCH'), `Expected PATTERN_MISMATCH for "${bad}"`);
  }
});

// ── x-formspec-phone-nanp ───────────────────────────────────────────
test('x-formspec-phone-nanp: random valid NANP numbers pass', () => {
  const engine = makeEngine('x-formspec-phone-nanp', 'string');
  // (NXX) NXX-XXXX where N=2-9, X=0-9
  fc.assert(fc.property(
    fc.integer({ min: 2, max: 9 }),
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 2, max: 9 }),
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 }),
    fc.integer({ min: 0, max: 9 }),
    (a1, a2, a3, e1, e2, e3, n1, n2, n3, n4) => {
      const phone = `(${a1}${a2}${a3}) ${e1}${e2}${e3}-${n1}${n2}${n3}${n4}`;
      engine.setValue('v', phone);
      return !hasCode(engine, 'PATTERN_MISMATCH');
    }
  ), { numRuns: NUM_RUNS });
});

test('x-formspec-phone-nanp: invalid formats fail', () => {
  const engine = makeEngine('x-formspec-phone-nanp', 'string');
  const invalid = [
    '(012) 345-6789',   // area code starts with 0
    '(123) 045-6789',   // exchange starts with 0
    '(123) 145-6789',   // exchange starts with 1
    '2125551234',        // no formatting
    '(212) 555 1234',    // wrong separator
    '(212)-555-1234',    // wrong format
  ];
  for (const bad of invalid) {
    engine.setValue('v', bad);
    assert.ok(hasCode(engine, 'PATTERN_MISMATCH'), `Expected PATTERN_MISMATCH for "${bad}"`);
  }
});

// ── x-formspec-postal-code-us ───────────────────────────────────────
test('x-formspec-postal-code-us: random valid ZIP codes pass', () => {
  const engine = makeEngine('x-formspec-postal-code-us', 'string');
  const d = fc.constantFrom('0','1','2','3','4','5','6','7','8','9');
  fc.assert(fc.property(
    fc.boolean(),
    fc.array(d, { minLength: 5, maxLength: 5 }),
    fc.array(d, { minLength: 4, maxLength: 4 }),
    (usePlus4, base, plus4) => {
      const zip = usePlus4 ? `${base.join('')}-${plus4.join('')}` : base.join('');
      engine.setValue('v', zip);
      return !hasCode(engine, 'PATTERN_MISMATCH');
    }
  ), { numRuns: NUM_RUNS });
});

test('x-formspec-postal-code-us: invalid formats fail', () => {
  const engine = makeEngine('x-formspec-postal-code-us', 'string');
  const invalid = ['1234', '123456', '12345-', '12345-123', 'abcde', '12345-12345'];
  for (const bad of invalid) {
    engine.setValue('v', bad);
    assert.ok(hasCode(engine, 'PATTERN_MISMATCH'), `Expected PATTERN_MISMATCH for "${bad}"`);
  }
});

// ── x-formspec-ssn ──────────────────────────────────────────────────
test('x-formspec-ssn: random valid SSNs pass', () => {
  const engine = makeEngine('x-formspec-ssn', 'string');
  // SSN: AAA-GG-SSSS, area ≠ 000/666/9xx, group ≠ 00, serial ≠ 0000
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 665 }),    // area: 001-665
    fc.integer({ min: 1, max: 99 }),     // group: 01-99
    fc.integer({ min: 1, max: 9999 }),   // serial: 0001-9999
    (area, group, serial) => {
      const ssn = `${String(area).padStart(3, '0')}-${String(group).padStart(2, '0')}-${String(serial).padStart(4, '0')}`;
      engine.setValue('v', ssn);
      return !hasCode(engine, 'PATTERN_MISMATCH');
    }
  ), { numRuns: NUM_RUNS });
});

test('x-formspec-ssn: invalid SSNs fail', () => {
  const engine = makeEngine('x-formspec-ssn', 'string');
  const invalid = [
    '000-12-3456',  // area 000
    '666-12-3456',  // area 666
    '900-12-3456',  // area 9xx
    '123-00-3456',  // group 00
    '123-45-0000',  // serial 0000
    '12345-6789',   // wrong format
    '123456789',    // no hyphens
  ];
  for (const bad of invalid) {
    engine.setValue('v', bad);
    assert.ok(hasCode(engine, 'PATTERN_MISMATCH'), `Expected PATTERN_MISMATCH for "${bad}"`);
  }
});

// ── x-formspec-ein ──────────────────────────────────────────────────
test('x-formspec-ein: random valid EINs pass', () => {
  const engine = makeEngine('x-formspec-ein', 'string');
  const d = fc.constantFrom('0','1','2','3','4','5','6','7','8','9');
  fc.assert(fc.property(
    fc.array(d, { minLength: 2, maxLength: 2 }),
    fc.array(d, { minLength: 7, maxLength: 7 }),
    (prefix, suffix) => {
      engine.setValue('v', `${prefix.join('')}-${suffix.join('')}`);
      return !hasCode(engine, 'PATTERN_MISMATCH');
    }
  ), { numRuns: NUM_RUNS });
});

test('x-formspec-ein: invalid formats fail', () => {
  const engine = makeEngine('x-formspec-ein', 'string');
  const invalid = ['12-34567890', '1-2345678', '123456789', 'AB-CDEFGHI', '12_3456789'];
  for (const bad of invalid) {
    engine.setValue('v', bad);
    assert.ok(hasCode(engine, 'PATTERN_MISMATCH'), `Expected PATTERN_MISMATCH for "${bad}"`);
  }
});

// ── x-formspec-credit-card ──────────────────────────────────────────
test('x-formspec-credit-card: random valid card numbers pass pattern', () => {
  const engine = makeEngine('x-formspec-credit-card', 'string');
  fc.assert(fc.property(
    fc.integer({ min: 13, max: 19 }),
    (len) => {
      const digits = Array.from({ length: len }, () => String(Math.floor(Math.random() * 10))).join('');
      engine.setValue('v', digits);
      return !hasCode(engine, 'PATTERN_MISMATCH');
    }
  ), { numRuns: NUM_RUNS });
});

test('x-formspec-credit-card: invalid formats fail', () => {
  const engine = makeEngine('x-formspec-credit-card', 'string');
  const invalid = [
    '1234',             // too short
    '12345678901234567890', // too long (20 digits)
    '1234-5678-9012',   // has hyphens
    '1234 5678 9012',   // has spaces
    'abcdefghijklm',    // letters
  ];
  for (const bad of invalid) {
    engine.setValue('v', bad);
    assert.ok(hasCode(engine, 'PATTERN_MISMATCH'), `Expected PATTERN_MISMATCH for "${bad}"`);
  }
});

// ── x-formspec-color-hex ────────────────────────────────────────────
test('x-formspec-color-hex: random valid hex colors pass', () => {
  const engine = makeEngine('x-formspec-color-hex', 'string');
  const hexChar = fc.constantFrom(...'0123456789abcdefABCDEF'.split(''));
  fc.assert(fc.property(
    fc.boolean(),
    fc.array(hexChar, { minLength: 3, maxLength: 3 }),
    fc.array(hexChar, { minLength: 6, maxLength: 6 }),
    (short, hex3, hex6) => {
      const color = short ? `#${hex3.join('')}` : `#${hex6.join('')}`;
      engine.setValue('v', color);
      return !hasCode(engine, 'PATTERN_MISMATCH');
    }
  ), { numRuns: NUM_RUNS });
});

test('x-formspec-color-hex: invalid formats fail', () => {
  const engine = makeEngine('x-formspec-color-hex', 'string');
  const invalid = ['FF0000', '#GG0000', '#12', '#12345', '#1234567', 'red'];
  for (const bad of invalid) {
    engine.setValue('v', bad);
    assert.ok(hasCode(engine, 'PATTERN_MISMATCH'), `Expected PATTERN_MISMATCH for "${bad}"`);
  }
});

// ── x-formspec-slug ─────────────────────────────────────────────────
test('x-formspec-slug: random valid slugs pass', () => {
  const engine = makeEngine('x-formspec-slug', 'string');
  const slugChar = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''));
  const slugInner = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split(''));
  fc.assert(fc.property(
    slugChar,
    fc.array(slugInner, { minLength: 0, maxLength: 30 }),
    fc.oneof(slugChar, fc.constant('')),
    (first, mid, last) => {
      const slug = mid.length === 0 ? first : `${first}${mid.join('')}${last || first}`;
      if (slug.length > 128) return true; // skip, over maxLength
      engine.setValue('v', slug);
      return !hasCode(engine, 'PATTERN_MISMATCH');
    }
  ), { numRuns: NUM_RUNS });
});

test('x-formspec-slug: invalid slugs fail', () => {
  const engine = makeEngine('x-formspec-slug', 'string');
  const invalid = ['-start', 'end-', 'UPPER', 'has spaces', 'special!char', 'under_score'];
  for (const bad of invalid) {
    engine.setValue('v', bad);
    assert.ok(hasCode(engine, 'PATTERN_MISMATCH'), `Expected PATTERN_MISMATCH for "${bad}"`);
  }
});

test('x-formspec-slug: maxLength 128 enforced', () => {
  const engine = makeEngine('x-formspec-slug', 'string');
  engine.setValue('v', 'a'.repeat(129));
  assert.ok(hasCode(engine, 'MAX_LENGTH_EXCEEDED'), 'Expected MAX_LENGTH_EXCEEDED for 129-char slug');
});

// ── x-formspec-ipv4 ─────────────────────────────────────────────────
test('x-formspec-ipv4: random valid IPv4 addresses pass', () => {
  const engine = makeEngine('x-formspec-ipv4', 'string');
  fc.assert(fc.property(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    (a, b, c, d) => {
      engine.setValue('v', `${a}.${b}.${c}.${d}`);
      return !hasCode(engine, 'PATTERN_MISMATCH');
    }
  ), { numRuns: NUM_RUNS });
});

test('x-formspec-ipv4: invalid addresses fail', () => {
  const engine = makeEngine('x-formspec-ipv4', 'string');
  const invalid = ['256.1.1.1', '1.2.3', '1.2.3.4.5', 'abc.def.ghi.jkl', '1.2.3.999'];
  for (const bad of invalid) {
    engine.setValue('v', bad);
    assert.ok(hasCode(engine, 'PATTERN_MISMATCH'), `Expected PATTERN_MISMATCH for "${bad}"`);
  }
});

// ── x-formspec-url ─────────────────────────────────────────────────
test('x-formspec-url: random valid HTTPS URLs pass', () => {
  const engine = makeEngine('x-formspec-url', 'string');
  const alphaNum = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''));
  const alpha = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split(''));
  fc.assert(fc.property(
    // domain label: 1-10 alnum chars
    fc.array(alphaNum, { minLength: 1, maxLength: 10 }).map(a => a.join('')),
    // TLD: 2-6 alpha chars
    fc.array(alpha, { minLength: 2, maxLength: 6 }).map(a => a.join('')),
    // optional port
    fc.option(fc.integer({ min: 1, max: 65535 })),
    // optional path
    fc.option(fc.array(alphaNum, { minLength: 1, maxLength: 8 }).map(a => '/' + a.join(''))),
    (label, tld, port, path) => {
      let url = `https://${label}.${tld}`;
      if (port !== null) url += `:${port}`;
      if (path !== null) url += path;
      engine.setValue('v', url);
      return !hasCode(engine, 'PATTERN_MISMATCH');
    }
  ), { numRuns: NUM_RUNS });
});

test('x-formspec-url: invalid URLs fail', () => {
  const engine = makeEngine('x-formspec-url', 'string');
  const invalid = [
    'http://example.com',            // http, not https
    'ftp://example.com',             // wrong scheme
    'example.com',                   // no scheme
    'https://',                      // no domain
    'https://-invalid.com',          // label starts with hyphen
    'https://example.com/path here', // space in path
    'not-a-url',                     // plain text
  ];
  for (const bad of invalid) {
    engine.setValue('v', bad);
    assert.ok(hasCode(engine, 'PATTERN_MISMATCH'), `Expected PATTERN_MISMATCH for "${bad}"`);
  }
});

test('x-formspec-url: maxLength 2048 enforced', () => {
  const engine = makeEngine('x-formspec-url', 'string');
  // Build a valid-looking URL that exceeds 2048 chars
  const longPath = '/' + 'a'.repeat(2040);
  engine.setValue('v', `https://example.com${longPath}`);
  assert.ok(hasCode(engine, 'MAX_LENGTH_EXCEEDED'), 'Expected MAX_LENGTH_EXCEEDED for >2048-char URL');
});

// ── Range-based dataType entries ─────────────────────────────────────

// ── x-formspec-percentage ───────────────────────────────────────────
test('x-formspec-percentage: random values 0-100 pass', () => {
  const engine = makeEngine('x-formspec-percentage', 'decimal');
  fc.assert(fc.property(
    fc.double({ min: 0, max: 100, noNaN: true }),
    (val) => {
      engine.setValue('v', val);
      return !hasCode(engine, 'RANGE_UNDERFLOW') && !hasCode(engine, 'RANGE_OVERFLOW');
    }
  ), { numRuns: NUM_RUNS });
});

test('x-formspec-percentage: values below 0 fail', () => {
  const engine = makeEngine('x-formspec-percentage', 'decimal');
  fc.assert(fc.property(
    fc.double({ min: -1e6, max: -0.001, noNaN: true }),
    (val) => {
      engine.setValue('v', val);
      return hasCode(engine, 'RANGE_UNDERFLOW');
    }
  ), { numRuns: NUM_RUNS });
});

test('x-formspec-percentage: values above 100 fail', () => {
  const engine = makeEngine('x-formspec-percentage', 'decimal');
  fc.assert(fc.property(
    fc.double({ min: 100.001, max: 1e6, noNaN: true }),
    (val) => {
      engine.setValue('v', val);
      return hasCode(engine, 'RANGE_OVERFLOW');
    }
  ), { numRuns: NUM_RUNS });
});

// ── x-formspec-currency-usd ─────────────────────────────────────────
test('x-formspec-currency-usd: random non-negative values pass', () => {
  const engine = makeEngine('x-formspec-currency-usd', 'decimal');
  fc.assert(fc.property(
    fc.double({ min: 0, max: 1e9, noNaN: true }),
    (val) => {
      engine.setValue('v', val);
      return !hasCode(engine, 'RANGE_UNDERFLOW');
    }
  ), { numRuns: NUM_RUNS });
});

test('x-formspec-currency-usd: negative values fail', () => {
  const engine = makeEngine('x-formspec-currency-usd', 'decimal');
  fc.assert(fc.property(
    fc.double({ min: -1e9, max: -0.001, noNaN: true }),
    (val) => {
      engine.setValue('v', val);
      return hasCode(engine, 'RANGE_UNDERFLOW');
    }
  ), { numRuns: NUM_RUNS });
});

// ── Constraint entry: x-formspec-luhn ────────────────────────────────
// The luhn entry is category "constraint" — not enforced via field
// constraints, but we can verify the registry loads it properly and
// the engine silently ignores it (no crash) when declared on a field.
test('x-formspec-luhn: engine does not crash with luhn extension declared', () => {
  const entry = findEntry('x-formspec-luhn');
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/luhn-test',
    version: '1.0.0',
    title: 'Luhn Test',
    items: [{
      key: 'card',
      type: 'field',
      dataType: 'string',
      label: 'Card',
      extensions: { 'x-formspec-luhn': true },
    }],
  }, undefined, [entry]);

  // Should not throw — constraint entries have no pattern/range to enforce
  engine.setValue('card', '4111111111111111');
  const report = engine.getValidationReport({ profile: 'live' });
  assert.ok(report, 'Validation report should be returned without error');
});

// ── Function entries: x-formspec-age, x-formspec-mask ────────────────
// These are FEL function extensions — not enforced via field constraints.
// Verify the engine handles them gracefully when declared.
test('x-formspec-age: engine does not crash with age extension declared', () => {
  const entry = findEntry('x-formspec-age');
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/age-test',
    version: '1.0.0',
    title: 'Age Test',
    items: [{
      key: 'dob',
      type: 'field',
      dataType: 'date',
      label: 'Date of Birth',
      extensions: { 'x-formspec-age': true },
    }],
  }, undefined, [entry]);

  engine.setValue('dob', '1990-01-15');
  const report = engine.getValidationReport({ profile: 'live' });
  assert.ok(report, 'Validation report should be returned without error');
});

test('x-formspec-mask: engine does not crash with mask extension declared', () => {
  const entry = findEntry('x-formspec-mask');
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/mask-test',
    version: '1.0.0',
    title: 'Mask Test',
    items: [{
      key: 'acct',
      type: 'field',
      dataType: 'string',
      label: 'Account',
      extensions: { 'x-formspec-mask': true },
    }],
  }, undefined, [entry]);

  engine.setValue('acct', '123456789');
  const report = engine.getValidationReport({ profile: 'live' });
  assert.ok(report, 'Validation report should be returned without error');
});

// ── Module entry: x-formspec-common ──────────────────────────────────
// Per ADR 0150 §4.1: `namespace` was renamed to `module` (greenfield, no
// alias); `members[]` was renamed to `contributes[]`.
test('x-formspec-common module lists all entries via contributes[]', () => {
  const mod = findEntry('x-formspec-common');
  const nonModuleEntries = entries.filter(e => e.category !== 'module');

  for (const entry of nonModuleEntries) {
    assert.ok(
      mod.contributes.includes(entry.name),
      `Module missing contribution "${entry.name}"`
    );
  }
  assert.equal(mod.contributes.length, nonModuleEntries.length,
    'Module contributes count should match non-module entry count');
});
