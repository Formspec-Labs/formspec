/** @filedesc Definition schema acceptance: shared JSON fixtures are valid and load without engine errors */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FormEngine } from '../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const fixturePaths = [
  'tests/fixtures/fixture-microgrant-screener.json',
  'tests/fixtures/fixture-household-benefits-renewal.json',
  'tests/fixtures/fixture-clinical-adverse-event.json',
  'tests/fixtures/fixture-vendor-conflict-disclosure.json',
  'tests/fixtures/fixture-multi-state-tax-filing.json',
];

function loadSharedFixture(relativePath) {
  const definition = JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
  if (definition.instances) {
    for (const instance of Object.values(definition.instances)) {
      if (instance && typeof instance === 'object') {
        delete instance.source;
      }
    }
  }
  return definition;
}

for (const fixturePath of fixturePaths) {
  test(`schema-valid definition fixture loads without processor setup errors: ${path.basename(fixturePath)}`, () => {
    const definition = loadSharedFixture(fixturePath);
    const engine = new FormEngine(definition);
    const report = engine.getValidationReport({ profile: 'live' });

    assert.equal(engine.definition.url, definition.url);
    assert.ok(Object.keys(engine.signals).length > 0);
    assert.ok(Array.isArray(report.results));
  });
}
