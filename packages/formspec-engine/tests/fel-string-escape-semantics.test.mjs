/**
 * FEL string literal escape sequences
 *
 * The FEL lexer accepts backslash escapes in string literals (pattern: /("([^"\\]|\\.)*")/).
 * The interpreter must process those escapes when producing the runtime string value:
 *   \\  → \
 *   \"  → "
 *   \'  → '
 *   \n  → newline
 *   \t  → tab
 *
 * Historically the interpreter stripped only the surrounding quotes and returned
 * the raw image, so \\ was passed through as two characters rather than one.
 * This caused matches($email, "^[^@]+@[^@]+\\.[^@]+$") to build a RegExp where
 * \\. means "backslash then any char" instead of the intended "escaped dot".
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

function engineWithConstraint(constraint) {
  return new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/fel-escape',
    version: '1.0.0',
    title: 'Escape Test',
    items: [{ key: 'email', type: 'field', dataType: 'string', label: 'Email' }],
    binds: [{ path: 'email', constraint, constraintMessage: 'Invalid' }],
  });
}

function engineWithCalc(calculate) {
  return new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/fel-escape-calc',
    version: '1.0.0',
    title: 'Escape Calc Test',
    items: [{ key: 'result', type: 'field', dataType: 'string', label: 'Result' }],
    binds: [{ path: 'result', calculate }],
  });
}

function getConstraintError(engine, path) {
  const report = engine.getValidationReport({ profile: 'live' });
  return report.results.find(r => r.path === path && r.constraintKind === 'constraint');
}

// ── matches() with \\ escape (the core bug) ──────────────────────────────

test('matches() — \\\\. in FEL string literal matches a literal dot', () => {
  // FEL string: "^[^@]+@[^@]+\\.[^@]+$"
  // After escape processing: ^[^@]+@[^@]+\.[^@]+$  (regex: escaped dot)
  // alice@example.com should pass (has one literal dot in domain)
  const engine = engineWithConstraint('matches($email, "^[^@]+@[^@]+\\\\.[^@]+$")');
  engine.setValue('email', 'alice@example.com');
  const err = getConstraintError(engine, 'email');
  assert.equal(err, undefined, 'alice@example.com should satisfy the email regex');
});

test('matches() — \\\\. rejects value without a dot in domain', () => {
  const engine = engineWithConstraint('matches($email, "^[^@]+@[^@]+\\\\.[^@]+$")');
  engine.setValue('email', 'alice@nodotdomain');
  const err = getConstraintError(engine, 'email');
  assert.ok(err, 'alice@nodotdomain should fail the email regex (no dot)');
});

test('matches() — single-quoted string with \\\\. works the same', () => {
  const engine = engineWithConstraint("matches($email, '^[^@]+@[^@]+\\\\.[^@]+$')");
  engine.setValue('email', 'bob@sub.example.org');
  const err = getConstraintError(engine, 'email');
  assert.equal(err, undefined, 'bob@sub.example.org should pass');
});

// ── General string escape sequences ──────────────────────────────────────

test('\\\\ in FEL string literal produces a single backslash', () => {
  const engine = engineWithCalc('"a\\\\b"');
  assert.equal(engine.signals.result.value, 'a\\b');
});

test('\\"  in FEL double-quoted string produces a double-quote character', () => {
  const engine = engineWithCalc('"say \\"hi\\""');
  assert.equal(engine.signals.result.value, 'say "hi"');
});

test("\\' in FEL single-quoted string produces a single-quote character", () => {
  const engine = engineWithCalc("'it\\'s'");
  assert.equal(engine.signals.result.value, "it's");
});

test('\\n in FEL string literal produces a newline', () => {
  const engine = engineWithCalc('"line1\\nline2"');
  assert.equal(engine.signals.result.value, 'line1\nline2');
});

test('\\t in FEL string literal produces a tab', () => {
  const engine = engineWithCalc('"col1\\tcol2"');
  assert.equal(engine.signals.result.value, 'col1\tcol2');
});
