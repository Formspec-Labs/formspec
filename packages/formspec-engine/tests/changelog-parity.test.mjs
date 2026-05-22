/** @filedesc Package parity for changelog generation through the tools export. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateChangelog } from '../dist/tools-exports.js';

const oldDefinition = {
  $formspec: '1.0',
  url: 'https://example.gov/forms/changelog-parity',
  version: '1.0.0',
  status: 'active',
  title: 'Changelog parity',
  items: [{ key: 'name', type: 'field', label: 'Name', dataType: 'string' }],
};

const newDefinition = {
  ...oldDefinition,
  version: '1.1.0',
  items: [
    ...oldDefinition.items,
    { key: 'email', type: 'field', label: 'Email', dataType: 'string' },
  ],
};

test('generateChangelog returns the schema-detectable changelog envelope', () => {
  const changelog = generateChangelog(oldDefinition, newDefinition, oldDefinition.url);

  assert.equal(changelog.$formspecChangelog, '1.0');
  assert.equal(changelog.definitionUrl, oldDefinition.url);
  assert.equal(changelog.fromVersion, oldDefinition.version);
  assert.equal(changelog.toVersion, newDefinition.version);
  assert.match(changelog.semverImpact, /^(major|minor|patch)$/);
  assert.ok(Array.isArray(changelog.changes));
  assert.ok(changelog.changes.length > 0);
});
