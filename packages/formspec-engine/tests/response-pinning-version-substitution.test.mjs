/** @filedesc Response pinning and version substitution: response records the exact definition version without substitution */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

function makeDefinition(version, requiredKey) {
  return {
    $formspec: '1.0',
    url: 'https://example.org/forms/pinned-intake',
    version,
    title: `Pinned Intake ${version}`,
    items: [
      { key: requiredKey, type: 'field', dataType: 'string', label: requiredKey }
    ],
    binds: [
      { path: requiredKey, required: true }
    ]
  };
}

test('response pinning resolves the exact definition version instead of substituting another version', () => {
  const v1 = makeDefinition('1.0.0', 'legacyField');
  const v2 = makeDefinition('2.0.0', 'renamedField');
  const engine = new FormEngine(v1);

  engine.setValue('legacyField', 'present');
  const response = engine.getResponse({ profile: 'on-submit' });

  const resolved = FormEngine.resolvePinnedDefinition(response, [v2, v1]);
  assert.equal(resolved.version, '1.0.0');
  assert.equal(resolved.items[0].key, 'legacyField');
});

test('response pinning errors when the pinned version is unavailable instead of silently substituting', () => {
  const v1 = makeDefinition('1.0.0', 'legacyField');
  const v2 = makeDefinition('2.0.0', 'renamedField');

  assert.throws(
    () =>
      FormEngine.resolvePinnedDefinition(
        {
          definitionUrl: 'https://example.org/forms/pinned-intake',
          definitionVersion: '3.0.0'
        },
        [v1, v2]
      ),
    /available versions: 1\.0\.0, 2\.0\.0/
  );
});
