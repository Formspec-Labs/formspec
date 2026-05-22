/** @filedesc Extension preservation and ignore semantics: unknown x- extensions are preserved and do not affect engine behavior */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

function baseDefinition() {
  return {
    $formspec: '1.0',
    url: 'https://example.org/extensions',
    version: '1.0.0',
    status: 'active',
    title: 'Extensions',
    items: [
      { type: 'field', key: 'name', dataType: 'string', label: 'Name' },
    ],
    binds: [
      { path: 'name', required: 'true' },
    ],
    shapes: [
      {
        id: 'name-shape',
        target: '#',
        severity: 'warning',
        message: 'Short names need review',
        constraint: 'length($name) >= 3',
      },
    ],
  };
}

function definitionWithExtensions() {
  const definition = structuredClone(baseDefinition());
  definition.extensions = { 'x-root': { source: 'unit-test' } };
  definition.items[0].extensions = { 'x-item': { widgetHint: 'ignore-me' } };
  definition.binds[0].extensions = { 'x-bind': { requiredPolicy: 'do-not-care' } };
  definition.shapes[0].extensions = { 'x-shape': { reviewQueue: 'manual' } };
  return definition;
}

test('unknown extensions do not change core engine behavior', () => {
  const plain = new FormEngine(baseDefinition());
  const extended = new FormEngine(definitionWithExtensions());

  const plainMissing = plain.getValidationReport({ profile: 'on-submit' });
  const extendedMissing = extended.getValidationReport({ profile: 'on-submit' });

  plain.setValue('name', 'Al');
  extended.setValue('name', 'Al');

  const plainPresent = plain.getValidationReport({ profile: 'on-submit' });
  const extendedPresent = extended.getValidationReport({ profile: 'on-submit' });

  // Filter out UNRESOLVED_EXTENSION errors — those are expected when no registry
  // is loaded. The point of this test is that core validation (required, constraint,
  // shape) behaves identically regardless of unknown extensions.
  const coreOnly = (results) =>
    results.filter((r) => r.code !== 'UNRESOLVED_EXTENSION');

  assert.deepEqual(coreOnly(extendedMissing.results), coreOnly(plainMissing.results));
  assert.deepEqual(coreOnly(extendedPresent.results), coreOnly(plainPresent.results));

  // Extended definition should emit UNRESOLVED_EXTENSION for unresolved item extensions
  const unresolvedCodes = extendedMissing.results.filter(
    (r) => r.code === 'UNRESOLVED_EXTENSION'
  );
  assert.ok(unresolvedCodes.length > 0, 'expected UNRESOLVED_EXTENSION errors for unknown extensions');
});

test('unknown extensions are preserved on the loaded definition object', () => {
  const engine = new FormEngine(definitionWithExtensions());

  assert.deepEqual(engine.definition.extensions, { 'x-root': { source: 'unit-test' } });
  assert.deepEqual(engine.definition.items[0].extensions, { 'x-item': { widgetHint: 'ignore-me' } });
  assert.deepEqual(engine.definition.binds[0].extensions, { 'x-bind': { requiredPolicy: 'do-not-care' } });
  assert.deepEqual(engine.definition.shapes[0].extensions, { 'x-shape': { reviewQueue: 'manual' } });
});
